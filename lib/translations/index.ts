import { heCore } from "./he-core"
import { hePages } from "./he-pages"
import { enCore } from "./en-core"
import { enPages } from "./en-pages"
import type { Locale } from "./types"
import { SUPPORTED_LOCALES } from "./types"

export type { Locale }
export { SUPPORTED_LOCALES }

/**
 * מילון מלא. התרגומים מפוצלים לקבצים: *-core (כניסה, ניווט, אפליקציה), *-pages (מסכים).
 * עבור טעינה עצלה אמיתית של הצ׳אנק בעתיד — לעבור ל-import() דינמי + מנוי ברמת useTranslations.
 */
export const translations = {
  he: { ...heCore, pages: hePages },
  en: { ...enCore, pages: enPages },
} as const

function getNested(obj: object, path: string): string | undefined {
  const keys = path.split(".")
  let current: unknown = obj
  for (const key of keys) {
    if (current && typeof current === "object" && key in current) {
      current = (current as Record<string, unknown>)[key]
    } else {
      return undefined
    }
  }
  return typeof current === "string" ? current : undefined
}

export function getTranslation(locale: Locale, key: string): string {
  const dict = translations[locale] as Record<string, unknown>
  const value = getNested(dict, key)
  if (value) return value
  const fallback = getNested(translations.he as Record<string, unknown>, key)
  return fallback ?? key
}
