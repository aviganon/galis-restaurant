"use client"

import { useEffect } from "react"
import { initClientErrorReporting } from "@/lib/error-report"

/** מאתחל עטיפת דיווח שגיאות בדפדפן (פעם אחת). */
export function ErrorReportingInit() {
  useEffect(() => {
    initClientErrorReporting()
  }, [])
  return null
}
