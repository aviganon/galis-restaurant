/**
 * lib/inbound-email.ts
 * Types + helpers for inbound email per-restaurant.
 * Each restaurant gets a unique token → inbound+{token}@{INBOUND_DOMAIN}
 */

export const INBOUND_DOMAIN =
  process.env.NEXT_PUBLIC_INBOUND_DOMAIN ?? "mail.galis.app"

/** Generate a cryptographically-random token (20 chars, URL-safe base32) */
export function generateInboundToken(): string {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789"
  const array = new Uint8Array(20)
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(array)
  } else {
    for (let i = 0; i < array.length; i++) array[i] = Math.floor(Math.random() * 256)
  }
  return Array.from(array)
    .map((b) => chars[b % chars.length])
    .join("")
}

/** Build the full inbound email address for a restaurant */
export function buildInboundAddress(token: string): string {
  return `inbound+${token}@${INBOUND_DOMAIN}`
}

/** Firestore path: restaurants/{rid}/appState/inboundSettings */
export interface InboundSettings {
  inboundEmailToken: string
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
