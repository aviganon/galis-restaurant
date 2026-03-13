"use client"

import { useTransition } from "react"
import { useLanguage } from "@/contexts/language-context"
import { Button } from "@/components/ui/button"
import { Languages } from "lucide-react"
import { cn } from "@/lib/utils"

interface LanguageSwitcherProps {
  /** light = רקע בהיר (מסך כניסה), dark = רקע כהה (ניווט) */
  variant?: "light" | "dark"
}

export function LanguageSwitcher({ variant = "dark" }: LanguageSwitcherProps) {
  const { locale, setLocale } = useLanguage()
  const [, startTransition] = useTransition()

  const handleSwitch = () => {
    startTransition(() => {
      setLocale(locale === "he" ? "en" : "he")
    })
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleSwitch}
      className={cn(
        "gap-1.5",
        variant === "dark"
          ? "text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10"
          : "text-muted-foreground hover:text-foreground hover:bg-muted"
      )}
      title={locale === "he" ? "Switch to English" : "החלף לעברית"}
    >
      <Languages className="w-4 h-4" />
      <span className="text-sm font-medium">{locale === "he" ? "EN" : "עב"}</span>
    </Button>
  )
}
