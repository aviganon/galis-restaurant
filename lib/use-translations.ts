"use client"

import { useLanguage } from "@/contexts/language-context"
import { getTranslation, type Locale } from "@/lib/translations"

export function useTranslations() {
  const { locale } = useLanguage()

  return (key: string) => getTranslation(locale as Locale, key)
}
