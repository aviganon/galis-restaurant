/**
 * נקודת הרחבה לדיווח שגיאות (Sentry וכו') — ללא תלות כבדה בברירת מחדל.
 * קוראים ל-init פעם אחת בצד לקוח.
 */

let clientConsolePatched = false

export function initClientErrorReporting(): void {
  if (typeof window === "undefined" || clientConsolePatched) return
  clientConsolePatched = true
  const orig = console.error.bind(console)
  console.error = (...args: unknown[]) => {
    orig(...args)
    // Future: Sentry.captureException / breadcrumbs לפי args
  }
}

export function reportError(message: string, error?: unknown): void {
  if (error !== undefined) {
    console.error(message, error)
  } else {
    console.error(message)
  }
}
