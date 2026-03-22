/**
 * functions/src/inbound-webhook.ts
 * Cloud Function (HTTPS) – receives inbound email webhook from Mailgun/SendGrid.
 *
 * Mailgun POST fields: recipient, sender, subject, attachment-1, attachment-2...
 * SendGrid POST fields: to, from, subject, attachment1, attachment2...
 */

import * as functions from "firebase-functions"
import * as admin from "firebase-admin"
import * as Busboy from "busboy"
import { IncomingMessage } from "http"

if (!admin.apps.length) admin.initializeApp()

const db = admin.firestore()
const storage = admin.storage()

const WEBHOOK_SECRET = process.env.INBOUND_WEBHOOK_SECRET ?? ""

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
  const snap = await db
    .doc(`restaurants/${restaurantId}/appState/inboundSettings`)
    .get()
  if (!snap.exists) return true
  const data = snap.data() as { inboundAllowedSenderEmails?: string[] }
  const list = data.inboundAllowedSenderEmails ?? []
  if (!list.length) return true
  return list.map((e) => e.toLowerCase().trim()).includes(fromEmail.toLowerCase().trim())
}

export const inboundWebhook = functions
  .region("europe-west1")
  .https.onRequest(async (req, res) => {
    const secret = req.query.secret ?? req.headers["x-webhook-secret"]
    if (WEBHOOK_SECRET && secret !== WEBHOOK_SECRET) {
      functions.logger.warn("inboundWebhook: unauthorized")
      res.status(401).send("Unauthorized")
      return
    }

    if (req.method !== "POST") { res.status(405).send("Method Not Allowed"); return }

    try {
      const { fields, files } = await parseMultipart(req as unknown as IncomingMessage)

      const recipient = (fields.recipient ?? fields.To ?? fields.to ?? "").toLowerCase()
      const fromEmail = (fields.sender ?? fields.from ?? "").toLowerCase()
      const subject = fields.subject ?? fields.Subject ?? "(no subject)"

      const token = extractToken(recipient)
      if (!token) { res.status(200).send("ok"); return }

      const restaurantId = await lookupRestaurantId(token)
      if (!restaurantId) { res.status(200).send("ok"); return }

      const allowed = await isSenderAllowed(restaurantId, fromEmail)
      if (!allowed) { res.status(200).send("ok"); return }

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

function parseMultipart(req: IncomingMessage): Promise<ParsedForm> {
  return new Promise((resolve, reject) => {
    const busboy = Busboy({ headers: req.headers as Record<string, string> })
    const fields: Record<string, string> = {}
    const files: Record<string, { filename: string; mimetype: string; buffer: Buffer }> = {}

    busboy.on("field", (name, val) => { fields[name] = val })
    busboy.on("file", (name, stream, info) => {
      const chunks: Buffer[] = []
      stream.on("data", (chunk: Buffer) => chunks.push(chunk))
      stream.on("end", () => {
        files[name] = { filename: info.filename, mimetype: info.mimeType, buffer: Buffer.concat(chunks) }
      })
    })
    busboy.on("finish", () => resolve({ fields, files }))
    busboy.on("error", reject)
    ;(req as NodeJS.ReadableStream).pipe(busboy)
  })
}
