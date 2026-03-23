/**
 * lib/inbound-email.ts
 * Types + helpers for inbound email per-restaurant.
 * Each restaurant gets a unique token → inbound+{token}@{INBOUND_DOMAIN}
 */

import { doc, getDoc } from "firebase/firestore"
import type { Firestore } from "firebase/firestore"

export const INBOUND_DOMAIN =
  process.env.NEXT_PUBLIC_INBOUND_DOMAIN ?? "mail.galis.app"

/**
 * אורך טוקן חדש (תווים). 10 תווים באלפבית של 32 ≈ 1e15 צירופים — מספיק, והכתובת קצרה יותר להעתקה.
 * טוקנים ישנים (20 תווים) נשארים תקפים.
 */
export const INBOUND_TOKEN_LENGTH = 10

/** Generate a random token (URL-safe lowercase + digits, no ambiguous chars) */
export function generateInboundToken(): string {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789"
  const array = new Uint8Array(INBOUND_TOKEN_LENGTH)
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(array)
  } else {
    for (let i = 0; i < array.length; i++) array[i] = Math.floor(Math.random() * 256)
  }
  return Array.from(array)
    .map((b) => chars[b % chars.length])
    .join("")
}

/**
 * יוצר טוקן שלא קיים כבר ב־`inboundEmailLookup/{token}` (מניעת התנגשות נדירה).
 */
export async function generateUniqueInboundToken(
  db: Firestore,
  maxAttempts = 30
): Promise<string> {
  for (let i = 0; i < maxAttempts; i++) {
    const t = generateInboundToken()
    const snap = await getDoc(doc(db, "inboundEmailLookup", t))
    if (!snap.exists()) return t
  }
  throw new Error("לא ניתן ליצור כתובת ייבוא ייחודית — נסה שוב")
}

const RAND_CHARS = "abcdefghjkmnpqrstuvwxyz23456789"

function randomSuffix(len: number): string {
  const a = new Uint8Array(len)
  if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(a)
  else for (let i = 0; i < len; i++) a[i] = Math.floor(Math.random() * 256)
  return Array.from(a)
    .map((b) => RAND_CHARS[b % RAND_CHARS.length])
    .join("")
}

/**
 * הופך שם מסעדה לחלק מקומי בטוח למייל (אותיות קטנות, מספרים, מקף).
 * שמות בעברית בלבד — נופלים ל־rest- + מזהה מקוצר מה־restaurantId.
 */
export function slugifyInboundLocalPart(name: string, restaurantId: string): string {
  const raw = (name || "")
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 28)
  if (raw.length >= 3) return raw
  const idPart = restaurantId.replace(/[^a-z0-9]+/gi, "").toLowerCase()
  const tail = idPart.slice(-10) || randomSuffix(6)
  return `rest-${tail}`.slice(0, 32)
}

/**
 * כתובת קריאה לפי שם: `inbound+{slug}@...` — אותו מסלול Firestore כמו טוקן אקראי.
 * אם השם תפוס על ידי מסעדה אחרת — מוסיפים סיומת אקראית קצרה.
 */
export async function generateUniqueInboundSlug(
  db: Firestore,
  restaurantId: string,
  restaurantName: string,
  maxAttempts = 40
): Promise<string> {
  const base = slugifyInboundLocalPart(restaurantName, restaurantId)
  for (let i = 0; i < maxAttempts; i++) {
    const slug = i === 0 ? base : `${base}-${randomSuffix(4)}`
    if (slug.length > 64) continue
    const snap = await getDoc(doc(db, "inboundEmailLookup", slug))
    if (!snap.exists()) return slug
    const owner = (snap.data() as { restaurantId?: string } | undefined)?.restaurantId
    if (owner === restaurantId) return slug
  }
  throw new Error("לא ניתן ליצור כתובת לפי שם — נסה שוב או כתובת אקראית")
}

/** Build the full inbound email address for a restaurant */
export function buildInboundAddress(token: string): string {
  return `inbound+${token}@${INBOUND_DOMAIN}`
}

/** נירמול הזנה ידנית למזהה בטוח (אותיות קטנות, מספרים, מקף) */
export function normalizeInboundCustomSlug(raw: string): string {
  return (raw || "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
}

export function validateInboundSlugFormat(slug: string): { ok: true } | { ok: false; message: string } {
  const s = slug.trim()
  if (s.length < 3) {
    return { ok: false, message: "לפחות 3 תווים (אנגלית, מספרים או מקף)" }
  }
  if (s.length > 64) {
    return { ok: false, message: "עד 64 תווים" }
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s)) {
    return { ok: false, message: "רק אותיות באנגלית, מספרים ומקף (ללא רווחים)" }
  }
  return { ok: true }
}

export type InboundSlugAvailability = "available" | "same-restaurant" | "taken"

/** בדיקה מול Firestore: פנוי / כבר של המסעדה הזו / תפוס על ידי אחרת */
export async function checkInboundSlugAvailability(
  db: Firestore,
  slug: string,
  restaurantId: string
): Promise<InboundSlugAvailability> {
  const snap = await getDoc(doc(db, "inboundEmailLookup", slug))
  if (!snap.exists()) return "available"
  const owner = (snap.data() as { restaurantId?: string } | undefined)?.restaurantId
  if (owner === restaurantId) return "same-restaurant"
  return "taken"
}

/** Firestore path: restaurants/{rid}/appState/inboundSettings */
export interface InboundSettings {
  inboundEmailToken: string
  /** איך נוצר המזהה — לתצוגה בלבד */
  inboundAddressKind?: "slug" | "random" | "custom"
  inboundAllowedSenderEmails?: string[]   // empty = allow all
  inboundCreatedAt?: string               // ISO timestamp
}

/** Firestore path: inboundEmailLookup/{token}  →  { restaurantId } */
export interface InboundLookup {
  restaurantId: string
}

/** Job record written by the Cloud Function after receiving a message */
export interface InboundJob {
  restaurantId: string
  fromEmail: string
  subject: string
  attachmentPaths: string[]   // Storage paths
  receivedAt: string          // ISO timestamp
  status: "pending" | "processing" | "done" | "error"
  errorMessage?: string
}
