"use client"

import { doc, getDoc, setDoc, deleteDoc } from "firebase/firestore"
import { firebaseBearerHeaders } from "@/lib/api-auth-client"
import { db } from "./firebase"

const ANTHROPIC_CONFIG_PATH = { collection: "config", docId: "anthropic" }
const STORAGE_KEY = "_anthropicApiKey"

let cachedKey: string | null = null

export async function getClaudeApiKey(): Promise<string | null> {
  if (typeof window === "undefined") return null
  if (cachedKey) return cachedKey
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      cachedKey = stored
      return stored
    }
    const docRef = doc(db, ANTHROPIC_CONFIG_PATH.collection, ANTHROPIC_CONFIG_PATH.docId)
    const snap = await getDoc(docRef)
    const key = snap.exists() ? (snap.data()?.key as string) : null
    if (key) {
      cachedKey = key
      localStorage.setItem(STORAGE_KEY, key)
    }
    return key
  } catch {
    return null
  }
}

export async function setClaudeApiKey(key: string | null): Promise<void> {
  cachedKey = key
  if (typeof window !== "undefined") {
    if (key) localStorage.setItem(STORAGE_KEY, key)
    else localStorage.removeItem(STORAGE_KEY)
  }
  try {
    const docRef = doc(db, ANTHROPIC_CONFIG_PATH.collection, ANTHROPIC_CONFIG_PATH.docId)
    if (key) {
      await setDoc(docRef, { key, updatedAt: new Date().toISOString() }, { merge: true })
    } else {
      await deleteDoc(docRef)
    }
  } catch {
    // ignore
  }
}

export async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const result = e.target?.result as string
      resolve(result?.split(",")[1] ?? "")
    }
    reader.onerror = () => reject(new Error("שגיאה בקריאת הקובץ"))
    reader.readAsDataURL(file)
  })
}

export type ClaudeContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
  | { type: "document"; source: { type: "base64"; media_type: string; data: string } }

export interface ClaudeMessage {
  role: "user" | "assistant"
  content: ClaudeContentBlock[]
}

const API_TIMEOUT_MS = 90_000

async function callDirect(key: string, payload: Parameters<typeof callClaude>[0]) {
  const ctrl = new AbortController()
  const timeoutId = setTimeout(() => ctrl.abort(), API_TIMEOUT_MS)
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    signal: ctrl.signal,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: payload.model ?? "claude-sonnet-4-20250514",
      max_tokens: payload.max_tokens ?? 8000,
      system: payload.system,
      messages: payload.messages,
    }),
  })
  clearTimeout(timeoutId)
  if (!resp.ok) {
    let errMsg = "שגיאת API: " + resp.status
    try {
      const j = await resp.json()
      errMsg += " — " + (j.error?.message ?? JSON.stringify(j))
    } catch {
      //
    }
    throw new Error(errMsg)
  }
  return resp.json()
}

export async function callClaude(payload: {
  model?: string
  max_tokens?: number
  system: string
  messages: ClaudeMessage[]
}): Promise<{ content: Array<{ text?: string }> }> {
  const ctrl = new AbortController()
  const timeoutId = setTimeout(() => ctrl.abort(), API_TIMEOUT_MS)

  try {
    const resp = await fetch("/api/claude", {
      signal: ctrl.signal,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(await firebaseBearerHeaders()),
      },
      body: JSON.stringify(payload),
    })
    clearTimeout(timeoutId)
    if (resp.ok) return resp.json()
    const errData = await resp.json().catch(() => ({}))
    const errMsg = (errData.error as string) || `שגיאה ${resp.status}`
    if (resp.status === 503) throw new Error(errMsg)
  } catch (e) {
    clearTimeout(timeoutId)
    if ((e as Error)?.name === "AbortError") throw new Error("הבקשה ארכה יותר מדי — נסה שוב")
    if ((e as Error)?.message?.includes("מפתח")) throw e
  }

  const key = await getClaudeApiKey()
  if (!key) throw new Error("מפתח API של Claude לא הוגדר — הגדר אותו בהגדרות או הוסף ANTHROPIC_API_KEY ל-.env.local")
  return callDirect(key, payload)
}

/** בדיקת חיבור — שולח הודעה קצרה ל-API */
export async function testClaudeConnection(): Promise<{ ok: boolean; message?: string }> {
  try {
    const key = await getClaudeApiKey()
    if (!key) return { ok: false, message: "מפתח API לא הוגדר" }
    await callClaude({
      model: "claude-sonnet-4-20250514",
      max_tokens: 50,
      system: "You are a helpful assistant. Reply briefly.",
      messages: [{ role: "user", content: [{ type: "text", text: "Say hello in one word." }] }],
    })
    return { ok: true }
  } catch (e) {
    return { ok: false, message: (e as Error).message }
  }
}
