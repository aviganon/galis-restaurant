"use client"

import { getAuth } from "firebase/auth"

/** כותרת Authorization ל-API routes שמאמתים עם Firebase Admin */
export async function firebaseBearerHeaders(): Promise<Record<string, string>> {
  const u = getAuth().currentUser
  if (!u) return {}
  const token = await u.getIdToken()
  return { Authorization: `Bearer ${token}` }
}
