/**
 * דיווח שגיאות בצד לקוח — Sentry כשמוגדר DSN, אחרת קונסולה.
 */
import * as Sentry from "@sentry/react"

let clientConsolePatched = false
let sentryInitialized = false

export function initClientErrorReporting(): void {
  if (typeof window === "undefined") return

  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim()
  if (dsn && !sentryInitialized) {
    sentryInitialized = true
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV,
      tracesSampleRate: 0.08,
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 0,
    })
  }

  if (clientConsolePatched) return
  clientConsolePatched = true
  const orig = console.error.bind(console)
  console.error = (...args: unknown[]) => {
    orig(...args)
    if (sentryInitialized) {
      const err = args.find((a): a is Error => a instanceof Error)
      if (err) Sentry.captureException(err)
    }
  }
}

export function reportError(message: string, error?: unknown): void {
  if (error !== undefined) {
    console.error(message, error)
    if (sentryInitialized) {
      if (error instanceof Error) {
        Sentry.captureException(error, { extra: { message } })
      } else {
        Sentry.captureMessage(`${message} ${String(error)}`, { level: "error" })
      }
    }
  } else {
    console.error(message)
    if (sentryInitialized) Sentry.captureMessage(message, { level: "error" })
  }
}
