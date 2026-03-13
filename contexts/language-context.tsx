"use client"

import { createContext, useContext, useEffect, useState, ReactNode } from "react"
import { type Locale, SUPPORTED_LOCALES } from "@/lib/translations"

export type { Locale }

const STORAGE_KEY = "restaurant-pro-locale"
const RTL_LOCALES: Locale[] = ["he"] // עברית, ערבית (ar) וכו'

interface LanguageContextValue {
  locale: Locale
  setLocale: (locale: Locale) => void
  dir: "rtl" | "ltr"
  supportedLocales: Locale[]
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

function getInitialLocale(): Locale {
  if (typeof window === "undefined") return "he"
  const stored = localStorage.getItem(STORAGE_KEY) as Locale | null
  if (stored && SUPPORTED_LOCALES.includes(stored)) return stored
  return "he"
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("he")
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setLocaleState(getInitialLocale())
    setMounted(true)
  }, [])

  const setLocale = (next: Locale) => {
    setLocaleState(next)
    localStorage.setItem(STORAGE_KEY, next)
  }

  useEffect(() => {
    if (!mounted) return
    const dir = RTL_LOCALES.includes(locale) ? "rtl" : "ltr"
    document.documentElement.dir = dir
    document.documentElement.lang = locale
  }, [locale, mounted])

  return (
    <LanguageContext.Provider
      value={{
        locale,
        setLocale,
        dir: RTL_LOCALES.includes(locale) ? "rtl" : "ltr",
        supportedLocales: SUPPORTED_LOCALES,
      }}
    >
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  const ctx = useContext(LanguageContext)
  return (
    ctx ?? {
      locale: "he" as Locale,
      setLocale: () => {},
      dir: "rtl" as const,
      supportedLocales: SUPPORTED_LOCALES,
    }
  )
}
