"use client"

import { createContext, useContext, useEffect, useState, ReactNode } from "react"

export type Locale = "he" | "en"

const STORAGE_KEY = "restaurant-pro-locale"

interface LanguageContextValue {
  locale: Locale
  setLocale: (locale: Locale) => void
  dir: "rtl" | "ltr"
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

function getInitialLocale(): Locale {
  if (typeof window === "undefined") return "he"
  const stored = localStorage.getItem(STORAGE_KEY) as Locale | null
  return stored === "en" ? "en" : "he"
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
    const dir = locale === "he" ? "rtl" : "ltr"
    const lang = locale === "he" ? "he" : "en"
    document.documentElement.dir = dir
    document.documentElement.lang = lang
  }, [locale, mounted])

  return (
    <LanguageContext.Provider value={{ locale, setLocale, dir: locale === "he" ? "rtl" : "ltr" }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  const ctx = useContext(LanguageContext)
  return ctx ?? { locale: "he" as Locale, setLocale: () => {}, dir: "rtl" as const }
}
