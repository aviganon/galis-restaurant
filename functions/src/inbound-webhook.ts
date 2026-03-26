/**
 * functions/src/inbound-webhook.ts
 * Cloud Function (HTTPS) – receives inbound email webhook from Mailgun/SendGrid.
 */

import Busboy from "busboy"
const createBusboy = Busboy as unknown as (config: { headers: Record<string, string> }) => {
  on(event: "field", handler: (name: string, val: string) => void): void
  on(event: "file",  handler: (name: string, stream: NodeJS.ReadableStream, info: { filename: string; mimeType: string }) => void): void
  on(event: "finish" | "error", handler: (...args: unknown[]) => void): void
}

import * as functions from "firebase-functions"
import * as admin from "firebase-admin"
import { IncomingMessage } from "http"

if (!admin.apps.length) admin.initializeApp()

const db = admin.firestore()
const storage = admin.storage()

const WEBHOOK_SECRET = process.env.INBOUND_WEBHOOK_SECRET ?? ""

/** מזהה אחרי inbound+ — טוקן אקראי או slug לפי שם מסעדה (אותו lookup ב־inboundEmailLookup) */
function extractToken(recipient: string): string | null {
  const match = recipient.match(/inbound\+([^@]+)@/)
  return match ? match[1] : null
}

async function lookupRestaurantId(token: string): Promise<string | null> {
  const snap = await db.doc(`inboundEmailLookup/${token}`).get()
  if (!snap.exists) return null
  return (snap.data() as { restaurantId: string }).restaurantId ?? null
}

async function isSenderAllowed(restaurantId: string, fromEmail: string): Promise<boolean> {
  const snap = await db.doc(`restaurants/${restaurantId}/appState/inboundSettings`).get()
  if (!snap.exists) return true
  const data = snap.data() as { inboundAllowedSenderEmails?: string[] }
  const list = data.inboundAllowedSenderEmails ?? []
  if (!list.length) return true
  return list.map((e) => e.toLowerCase().trim()).includes(fromEmail.toLowerCase().trim())
}

export const inboundWebhook = functions
  .region("europe-west1")
  .https.onRequest(async (req, res) => {
    functions.logger.info("inboundWebhook request", {
      method: req.method,
      headers: req.headers,
      hasBody: req.body != null,
      bodyType: typeof req.body,
      bodyPreview:
        typeof req.body === "string"
          ? req.body.slice(0, 500)
          : req.body && typeof req.body === "object"
            ? JSON.stringify(req.body).slice(0, 500)
            : null,
    })
    const secret = req.query.secret ?? req.headers["x-webhook-secret"]
    if (WEBHOOK_SECRET && secret !== WEBHOOK_SECRET) {
      res.status(401).send("Unauthorized")
      return
    }
    if (req.method !== "POST") { res.status(405).send("Method Not Allowed"); return }

    try {
      const { fields, files } = await parseMultipart(req as unknown as IncomingMessage)

      const recipient = (fields["recipient"] ?? fields["To"] ?? fields["to"] ?? "").toLowerCase()
      const fromEmail = (fields["sender"] ?? fields["from"] ?? "").toLowerCase()
      const subject   = fields["subject"] ?? fields["Subject"] ?? "(no subject)"

      const token = extractToken(recipient)
      if (!token) { res.status(200).send("ok"); return }

      const restaurantId = await lookupRestaurantId(token)
      if (!restaurantId) { res.status(200).send("ok"); return }

      if (!(await isSenderAllowed(restaurantId, fromEmail))) { res.status(200).send("ok"); return }

      const timestamp = Date.now()
      const attachmentPaths: string[] = []

      for (const [fieldName, file] of Object.entries(files)) {
        if (!/^attachment/.test(fieldName)) continue
        const safeName = file.filename.replace(/[^a-zA-Z0-9._-]/g, "_")
        const storagePath = `inbound/${restaurantId}/${timestamp}_${safeName}`
        await storage.bucket().file(storagePath).save(file.buffer, { contentType: file.mimetype })
        attachmentPaths.push(storagePath)
      }

      if (!attachmentPaths.length) { res.status(200).send("ok"); return }

      await db.collection("inboundJobs").add({
        restaurantId, fromEmail, subject, attachmentPaths,
        receivedAt: new Date().toISOString(),
        status: "pending",
      })

      res.status(200).send("ok")
    } catch (err) {
      functions.logger.error("inboundWebhook error", err)
      res.status(500).send("Internal error")
    }
  })

interface ParsedForm {
  fields: Record<string, string>
  files: Record<string, { filename: string; mimetype: string; buffer: Buffer }>
}

type IncomingMessageWithRawBody = IncomingMessage & {
  rawBody?: Buffer
  headers: Record<string, string | string[] | undefined>
}

function parseMultipart(req: IncomingMessageWithRawBody): Promise<ParsedForm> {
  return new Promise((resolve, reject) => {
    const contentType = String(req.headers["content-type"] ?? "")
    if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
      reject(new Error(`Unsupported content-type: ${contentType || "(missing)"}`))
      return
    }

    const normalizedHeaders: Record<string, string> = {}
    for (const [k, v] of Object.entries(req.headers)) {
      if (typeof v === "string") normalizedHeaders[k] = v
      else if (Array.isArray(v)) normalizedHeaders[k] = v.join(", ")
    }

    const bb = createBusboy({ headers: normalizedHeaders })
    const fields: Record<string, string> = {}
    const files: Record<string, { filename: string; mimetype: string; buffer: Buffer }> = {}
    let pendingFiles = 0
    let finished = false
    let settled = false

    const done = (err?: Error) => {
      if (settled) return
      if (err) {
        settled = true
        reject(err)
        return
      }
      if (finished && pendingFiles === 0) {
        settled = true
        resolve({ fields, files })
      }
    }

    bb.on("field", (name: string, val: string) => { fields[name] = val })
    bb.on("file",  (name: string, stream: NodeJS.ReadableStream, info: { filename: string; mimeType: string }) => {
      pendingFiles++
      const chunks: Buffer[] = []
      stream.on("data", (chunk: Buffer) => chunks.push(chunk))
      stream.on("end",  () => {
        files[name] = { filename: info.filename, mimetype: info.mimeType, buffer: Buffer.concat(chunks) }
        pendingFiles--
        done()
      })
      stream.on("error", (e: Error) => done(e))
    })
    bb.on("finish", () => {
      finished = true
      done()
    })
    bb.on("error", (...args: unknown[]) => done((args[0] as Error) ?? new Error("busboy error")))

    try {
      if (req.rawBody && Buffer.isBuffer(req.rawBody) && req.rawBody.length > 0) {
        ;(bb as unknown as { end: (buf: Buffer) => void }).end(req.rawBody)
      } else {
        ;(req as NodeJS.ReadableStream).pipe(bb as unknown as NodeJS.WritableStream)
      }
    } catch (e) {
      done(e as Error)
    }
  })
}
