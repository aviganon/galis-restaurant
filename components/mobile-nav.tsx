"use client"
import { useState } from "react"
import {
  LayoutDashboard,
  Menu,
  Settings,
  Calculator,
  X,
  Package,
  Shield,
  Truck,
  Boxes,
  ShoppingCart,
  BookOpen,
  PieChart,
  ClipboardList,
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { OnboardingHintsState, UserPermissions } from "@/contexts/app-context"
import { Badge } from "@/components/ui/badge"
import { LanguageSwitcher } from "@/components/language-switcher"
import { useTranslations } from "@/lib/use-translations"

interface MobileNavProps {
  currentPage: string
  setCurrentPage: (page: string) => void
  userRole: "admin" | "owner" | "manager" | "user"
  isSystemOwner?: boolean
  userPermissions?: UserPermissions
  isImpersonating?: boolean
  onStopImpersonate?: () => void
  onboardingHints?: OnboardingHintsState
}

const hasFullMenu = (role: string, isSystemOwner?: boolean) => isSystemOwner || role === "owner" || role === "admin" || role === "manager"
const userCanSee = (perms: UserPermissions | undefined, key: keyof UserPermissions) => perms?.[key] !== false
const userCanSeeOptIn = (perms: UserPermissions | undefined, key: keyof UserPermissions) => !!perms?.[key]
const mainItems = (
  t: (k: string) => string,
  userRole: string,
  perms?: UserPermissions,
  isSystemOwner?: boolean,
  isImpersonating?: boolean,
  includeMoreTab?: boolean
) => {
  const full = hasFullMenu(userRole, isSystemOwner)
  const items: { id: string; label: string; icon: typeof Calculator | typeof LayoutDashboard | typeof Shield }[] = []
  if (isSystemOwner && !isImpersonating) {
    items.push({ id: "dashboard", label: t("nav.dashboard"), icon: LayoutDashboard })
    items.push({ id: "admin-panel", label: t("nav.adminPanelShort"), icon: Shield })
    return items
  }
  if (full || userCanSee(perms, "canSeeProductTree")) items.push({ id: "calc", label: t("nav.productTree"), icon: Calculator })
  if (full && !isImpersonating) items.push({ id: "admin-panel", label: t("nav.adminPanelShort"), icon: Shield })
  if (includeMoreTab) items.push({ id: "more", label: t("common.more"), icon: Menu })
  return items
}

const moreItems = (
  t: (k: string) => string,
  userRole: string,
  perms?: UserPermissions,
  isSystemOwner?: boolean,
  isImpersonating?: boolean
) => {
  const full = hasFullMenu(userRole, isSystemOwner)
  const items: { id: string; label: string; icon: typeof Package }[] = []
  if (isSystemOwner && !isImpersonating) return items
  if (isSystemOwner && isImpersonating) items.push({ id: "admin-panel", label: t("nav.adminPanel"), icon: Shield })
  if (full && !isImpersonating) items.push({ id: "admin-panel", label: t("nav.adminPanel"), icon: Shield })
  if (full || userCanSee(perms, "canSeeIngredients")) items.push({ id: "ingredients", label: t("nav.ingredients"), icon: Boxes })
  if (full || userCanSee(perms, "canSeeSuppliers")) items.push({ id: "suppliers", label: t("nav.suppliers"), icon: Truck })
  if (full || userCanSee(perms, "canSeeInventory")) items.push({ id: "inventory", label: t("nav.inventory"), icon: Package })
  if (full || userCanSee(perms, "canSeePurchaseOrders")) items.push({ id: "purchase-orders", label: t("nav.purchaseOrders"), icon: ShoppingCart })
  if (full || userCanSee(perms, "canSeeOperations")) items.push({ id: "operations", label: t("nav.operations"), icon: ClipboardList })
  items.push({ id: "recipes", label: t("nav.recipes"), icon: BookOpen })
  if (full || userCanSeeOptIn(perms, "canSeeCosts")) items.push({ id: "menu", label: t("nav.menuCosts"), icon: PieChart })
  if (full || userCanSeeOptIn(perms, "canSeeSettings")) items.push({ id: "settings", label: t("nav.settings"), icon: Settings })
  return items
}

export function MobileNav({
  currentPage,
  setCurrentPage,
  userRole,
  isSystemOwner,
  userPermissions,
  isImpersonating,
  onStopImpersonate,
  onboardingHints,
}: MobileNavProps) {
  const t = useTranslations()
  const [showMore, setShowMore] = useState(false)
  const moreList = moreItems(t, userRole, userPermissions, isSystemOwner, isImpersonating)
  const hints = onboardingHints
  const showHints = hints && !hints.loading
  const handleClick = (id: string) => {
    if (id === "more") { setShowMore(true) } else { setCurrentPage(id); setShowMore(false) }
  }
  return (
    <>
      {isImpersonating && onStopImpersonate && (
        <div className="fixed top-0 inset-x-0 z-[55] flex min-h-11 items-center justify-between gap-2 px-4 pt-safe bg-amber-500 text-amber-950 text-xs font-semibold lg:hidden">
          <span className="min-w-0 truncate ps-1">{t("nav.impersonating")}</span>
          <button
            type="button"
            onClick={onStopImpersonate}
            className="shrink-0 flex items-center gap-1 border border-amber-800/40 rounded-full px-3 py-2 text-xs font-bold min-h-10 min-w-[44px] justify-center active:scale-95"
          >
            {t("nav.backToNormal")}
          </button>
        </div>
      )}
      <nav className="fixed bottom-0 inset-x-0 z-50 lg:hidden bg-primary/95 backdrop-blur-xl border-t border-primary-foreground/10 pb-[max(env(safe-area-inset-bottom),0px)]">
        <div className="flex items-stretch min-h-[64px] h-[64px]">
          {mainItems(t, userRole, userPermissions, isSystemOwner, isImpersonating, moreList.length > 0).map((item) => {
            const isActive = item.id === "more" ? showMore : currentPage === item.id
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleClick(item.id)}
                aria-label={item.label}
                className={cn(
                  "flex-1 flex flex-col items-center justify-center gap-0.5 relative transition-all duration-200 min-h-[48px] min-w-0 px-0.5 active:opacity-90",
                  isActive && "text-accent"
                )}
              >
                {isActive && <span className="absolute top-1.5 w-6 h-1 rounded-full bg-accent" />}
                <item.icon
                  className={cn(
                    "w-[22px] h-[22px] shrink-0 transition-transform duration-200",
                    isActive ? "text-primary-foreground scale-110" : "text-primary-foreground/60"
                  )}
                />
                <span
                  className={cn(
                    "text-[11px] font-medium transition-colors leading-tight text-center max-w-full truncate px-0.5",
                    isActive ? "text-primary-foreground" : "text-primary-foreground/50"
                  )}
                >
                  {item.label}
                </span>
              </button>
            )
          })}
        </div>
      </nav>
      {showMore && (
        <>
          <button
            type="button"
            aria-label={t("pages.close")}
            className="fixed inset-0 z-40 bg-background/60 backdrop-blur-sm lg:hidden"
            onClick={() => setShowMore(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t("nav.moreOptions")}
            className="fixed bottom-0 inset-x-0 z-50 lg:hidden bg-primary rounded-t-3xl animate-in slide-in-from-bottom duration-300 max-h-[calc(100dvh-0.5rem)] flex flex-col shadow-2xl"
          >
            <div className="w-12 h-1.5 bg-primary-foreground/20 rounded-full mx-auto mt-3" />
            <div className="p-4 pb-safe">
              <div className="flex items-center justify-between mb-4">
                <LanguageSwitcher />
                <h3 className="text-xs font-bold text-primary-foreground/50 tracking-wider">{t("nav.moreOptions")}</h3>
                <button
                  onClick={() => setShowMore(false)}
                  aria-label={t("pages.close")}
                  className="w-11 h-11 rounded-full bg-primary-foreground/10 flex items-center justify-center"
                >
                  <X className="w-4 h-4 text-primary-foreground" />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2 sm:gap-3 flex-1 min-h-0 max-h-[min(56dvh,420px)] overflow-y-auto overscroll-contain hide-scrollbar [-webkit-overflow-scrolling:touch]">
                {moreList.map((item) => {
                  const needIng = showHints && item.id === "ingredients" && hints!.needsIngredients
                  const needSup = showHints && item.id === "suppliers" && hints!.needsSuppliers
                  const nudge = needIng || needSup
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleClick(item.id)}
                      title={
                        needIng
                          ? "אין רכיבים — הוסיפו"
                          : needSup
                            ? "אין ספקים — צרו או ייבאו"
                            : undefined
                      }
                      className={cn(
                        "relative flex flex-col items-center justify-center gap-2 min-h-[76px] p-3 rounded-2xl transition-all",
                        "bg-primary-foreground/5 border border-primary-foreground/10",
                        "active:scale-[0.98] active:bg-primary-foreground/10",
                        currentPage === item.id && "bg-accent/20 border-accent/30",
                        nudge && "ring-2 ring-amber-400/90 ring-offset-1 ring-offset-primary",
                      )}
                    >
                      {nudge && (
                        <Badge className="absolute top-1.5 start-1.5 h-5 min-w-5 px-1 text-[9px] font-bold bg-amber-500 text-amber-950 border-0">
                          !
                        </Badge>
                      )}
                      <item.icon className={cn("w-6 h-6 shrink-0", currentPage === item.id ? "text-accent" : "text-primary-foreground/70")} />
                      <span
                        className={cn(
                          "text-[11px] font-medium text-center leading-snug line-clamp-2",
                          currentPage === item.id ? "text-primary-foreground" : "text-primary-foreground/70",
                        )}
                      >
                        {item.label}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </>
      )}
    </>
  )
}
