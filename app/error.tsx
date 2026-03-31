"use client"

import { useEffect } from "react"
import { reportError } from "@/lib/error-report"
import { Button } from "@/components/ui/button"

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    reportError("GlobalError boundary", error)
  }, [error])

  return (
    <div className="min-h-[min(70dvh,560px)] flex flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-xl font-semibold">אירעה שגיאה</h1>
      <p className="text-sm text-muted-foreground max-w-md">
        נסה לרענן את הדף או לחזור לדף הבית. אם הבעיה נמשכת, פנה לתמיכה.
      </p>
      {error.digest ? (
        <p className="text-xs text-muted-foreground font-mono" dir="ltr">
          {error.digest}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2 justify-center">
        <Button type="button" onClick={() => reset()}>
          נסה שוב
        </Button>
        <Button type="button" variant="outline" onClick={() => (window.location.href = "/")}>
          דף הבית
        </Button>
      </div>
    </div>
  )
}
