"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useSyncExternalStore,
  type ReactNode,
} from "react"
import { type Locale, SUPPORTED_LOCALES } from "@/lib/translations"

export type { Locale }

const STORAGE_KEY = "restaurant-pro-locale"
const RTL_LOCALES: Locale[] = ["he"]

interface LanguageContextValue {
  locale: Locale
  setLocale: (locale: Locale) => void
  dir: "rtl" | "ltr"
  supportedLocales: Locale[]
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

/** מאזינים לעדכון שפה (אותו טאב) */
const localeListeners = new Set<() => void>()

function subscribeLocale(onStoreChange: () => void) {
  localeListeners.add(onStoreChange)
  return () => localeListeners.delete(onStoreChange)
}

function emitLocaleChange() {
  localeListeners.forEach((l) => l())
}

function readLocaleFromStorage(): Locale {
  if (typeof window === "undefined") return "he"
  const stored = localStorage.getItem(STORAGE_KEY) as Locale | null
  if (stored && SUPPORTED_LOCALES.includes(stored)) return stored
  return "he"
}

function getServerLocaleSnapshot(): Locale {
  return "he"
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const locale = useSyncExternalStore(subscribeLocale, readLocaleFromStorage, getServerLocaleSnapshot)

  const setLocale = useCallback((next: Locale) => {
    localStorage.setItem(STORAGE_KEY, next)
    emitLocaleChange()
  }, [])

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) emitLocaleChange()
    }
    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [])

  useEffect(() => {
    const dir = RTL_LOCALES.includes(locale) ? "rtl" : "ltr"
    document.documentElement.dir = dir
    document.documentElement.lang = locale
  }, [locale])

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
