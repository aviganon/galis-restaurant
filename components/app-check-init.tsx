"use client"

import { useEffect } from "react"
import { initAppCheckIfConfigured } from "@/lib/firebase"

/** אתחול Firebase App Check בדפדפן (אופציונלי — תלוי במפתח reCAPTCHA). */
export function AppCheckInit() {
  useEffect(() => {
    initAppCheckIfConfigured()
  }, [])
  return null
}
