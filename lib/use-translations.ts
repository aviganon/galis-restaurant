"use client"

import { useCallback } from "react"
import { useLanguage } from "@/contexts/language-context"
import { getTranslation, type Locale } from "@/lib/translations"

export function useTranslations() {
  const { locale } = useLanguage()

  // חייב להיות יציב בין רינדורים (רק משתנה כש-locale משתנה) — אחרת useCallback/useEffect
  // שתלויים ב-t ירוצו בכל רינדור (למשל loadSystemOwnerData בלופ טעינה אינסופי).
  return useCallback(
    (key: string) => getTranslation(locale as Locale, key),
    [locale]
  )
}
