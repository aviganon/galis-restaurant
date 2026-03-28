"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { Check, Circle, ListChecks, CircleDot } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"
import type { OnboardingHintsState } from "@/contexts/app-context"

const STORAGE_PREFIX = "kamershalor-manager-guide-dismissed-"

type ManagerOnboardingChecklistProps = {
  restaurantId: string | null
  hints: OnboardingHintsState | undefined
  /** מנהל או משתמש מוגבל — לא בעלים/בעל מערכת */
  showForRole: boolean
  setCurrentPage?: (page: string) => void
  currentPage: string
}

type ChecklistStep = {
  id: string
  title: string
  body: string
  /** סטטוס אוטומטי מהמערכת */
  status: "done" | "todo" | "later"
  actionLabel?: string
  navigateTo?: string
}

export function ManagerOnboardingChecklist({
  restaurantId,
  hints,
  showForRole,
  setCurrentPage,
  currentPage,
}: ManagerOnboardingChecklistProps) {
  const [open, setOpen] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (!restaurantId) {
      setDismissed(false)
      return
    }
    try {
      setDismissed(localStorage.getItem(STORAGE_PREFIX + restaurantId) === "1")
    } catch {
      setDismissed(false)
    }
  }, [restaurantId])

  const handleDismiss = useCallback(() => {
    if (!restaurantId) return
    try {
      localStorage.setItem(STORAGE_PREFIX + restaurantId, "1")
    } catch {
      /* ignore */
    }
    setDismissed(true)
    setOpen(false)
  }, [restaurantId])

  const handleResetDismiss = useCallback(() => {
    if (!restaurantId) return
    try {
      localStorage.removeItem(STORAGE_PREFIX + restaurantId)
    } catch {
      /* ignore */
    }
    setDismissed(false)
    toast.success("התזכורות הוחזרו — יוצג הדגשה כשחסר מידע")
  }, [restaurantId])

  const loading = hints?.loading !== false
  const needsIngredients = hints?.needsIngredients ?? false
  const needsSuppliers = hints?.needsSuppliers ?? false
  const hasGap = needsIngredients || needsSuppliers

  const steps: ChecklistStep[] = [
    {
      id: "suppliers",
      title: "ספקים",
      body: "צור ספק חדש (גם בלי רכיבים) או העלה חשבונית — כך תוכל לשייך מחירים ולנהל הזמנות.",
      status: needsSuppliers ? "todo" : "done",
      actionLabel: "פתח ספקים",
      navigateTo: "suppliers",
    },
    {
      id: "ingredients",
      title: "רכיבים",
      body: "הוסף רכיבים ידנית, מקטלוג, או מייבוא חשבונית. בלי רכיבים לא תראה עלויות אמיתיות במתכונים.",
      status: needsIngredients ? "todo" : "done",
      actionLabel: "פתח רכיבים",
      navigateTo: "ingredients",
    },
    {
      id: "recipes",
      title: "מתכונים ומנות",
      body: "הגדר מנות בעץ המוצר — רכיבים, כמויות ומחיר מכירה. אפשר גם ייבוא מתפריט או תמונה.",
      status: "later",
      actionLabel: currentPage === "calc" ? undefined : "עבור לעץ מוצר",
      navigateTo: currentPage === "calc" ? undefined : "calc",
    },
    {
      id: "inventory",
      title: "מלאי",
      body: "אחרי שיש רכיבים — עדכן מלאי ומינימום מלאי בלשונית המלאי או מחשבונית עם כמויות.",
      status: "later",
      actionLabel: "פתח מלאי",
      navigateTo: "inventory",
    },
  ]

  if (!showForRole || !restaurantId || loading) return null

  const go = (page: string) => {
    setCurrentPage?.(page)
    setOpen(false)
  }

  return (
    <>
      <Button
        type="button"
        variant={hasGap && !dismissed ? "default" : "outline"}
        size="sm"
        className={cn(
          "fixed z-[45] shadow-lg gap-2 rounded-full border-primary/30",
          "bottom-[max(1rem,env(safe-area-inset-bottom))] start-4",
          "max-lg:bottom-[max(5.5rem,env(safe-area-inset-bottom))]",
          hasGap && !dismissed && "ring-2 ring-amber-400/80 ring-offset-2 ring-offset-background",
        )}
        title="מדריך מנהל — צ'ק־ליסט"
        aria-label="מדריך מנהל — צ'ק־ליסט"
        onClick={() => setOpen(true)}
      >
        <ListChecks className="h-4 w-4 shrink-0" />
        <span className="max-sm:sr-only">תחילת עבודה</span>
        {hasGap && <span className="sm:hidden text-xs font-semibold">מדריך</span>}
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="max-h-[min(88dvh,640px)] overflow-y-auto rounded-t-2xl" dir="rtl">
          <SheetHeader className="text-right space-y-2 pb-2">
            <SheetTitle className="flex items-center gap-2 text-lg">
              <ListChecks className="h-5 w-5 text-primary shrink-0" />
              מדריך למנהל חדש
            </SheetTitle>
            <SheetDescription className="text-sm text-muted-foreground text-right leading-relaxed">
              רשימה קצרה לסדר פעולות ראשונות במסעדה. סמנו את השלבים לפי מה שכבר בוצע — הספקים והרכיבים מתעדכנים אוטומטית מהמערכת.
            </SheetDescription>
          </SheetHeader>

          <ol className="mt-4 space-y-3 pe-1">
            {steps.map((step, idx) => (
              <li
                key={step.id}
                className={cn(
                  "rounded-xl border p-3 text-right transition-colors",
                  step.status === "done" && "border-emerald-500/35 bg-emerald-500/5",
                  step.status === "todo" && "border-amber-500/40 bg-amber-500/5",
                  step.status === "later" && "border-border bg-muted/20",
                )}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 shrink-0 text-primary">
                    {step.status === "done" && <Check className="h-5 w-5 text-emerald-600" aria-hidden />}
                    {step.status === "todo" && <Circle className="h-5 w-5 text-amber-600" aria-hidden />}
                    {step.status === "later" && <CircleDot className="h-5 w-5 text-muted-foreground" aria-hidden />}
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="font-semibold text-sm">
                      {idx + 1}. {step.title}
                      {step.status === "later" && (
                        <span className="me-2 text-xs font-normal text-muted-foreground">— אחרי שסיימתם את הספקים והרכיבים</span>
                      )}
                      {step.id === "suppliers" && needsSuppliers && (
                        <span className="me-2 text-xs font-normal text-amber-700 dark:text-amber-400">— מומלץ להתחיל כאן</span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground leading-relaxed">{step.body}</p>
                    {step.navigateTo && step.actionLabel && (
                      <Button type="button" variant="secondary" size="sm" className="mt-2 h-8" onClick={() => go(step.navigateTo!)}>
                        {step.actionLabel}
                      </Button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ol>

          <div className="mt-6 flex flex-col gap-2 border-t pt-4">
            <p className="text-xs text-muted-foreground text-right">
              רוצים להסתיר את כפתור «תחילת עבודה» עד שתרצו שוב? (נשמר במכשיר לפי מסעדה)
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={handleDismiss}>
                הסתר תזכורות עד ביטול
              </Button>
              {dismissed && (
                <Button type="button" variant="ghost" size="sm" onClick={handleResetDismiss}>
                  החזר תזכורות
                </Button>
              )}
              <Button type="button" variant="default" size="sm" onClick={() => setOpen(false)}>
                סגור
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
