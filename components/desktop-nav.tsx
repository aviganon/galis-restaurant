"use client"
import {
  LayoutDashboard,
  Settings,
  LogOut,
  ChevronDown,
  Calculator,
  Package,
  Menu,
  Shield,
  Truck,
  Boxes,
  ShoppingCart,
  BookOpen,
  PieChart,
  ClipboardList,
} from "lucide-react"
import Image from "next/image"
import { cn } from "@/lib/utils"
import type { OnboardingHintsState, UserPermissions } from "@/contexts/app-context"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, } from "@/components/ui/dropdown-menu"
import { LanguageSwitcher } from "@/components/language-switcher"
import { useTranslations } from "@/lib/use-translations"

const BRAND_LOGO_PATH = "/kamershalor-logo-mark.png"

type Restaurant = { id: string; name: string; branch?: string; emoji?: string }

interface DesktopNavProps {
  currentPage: string
  setCurrentPage: (page: string) => void
  currentRestaurant: string
  restaurants: Restaurant[]
  onSelectRestaurant: (rest: Restaurant) => void
  userRole: "admin" | "owner" | "manager" | "user"
  isSystemOwner?: boolean
  userPermissions?: UserPermissions
  onLogout: () => void
  isImpersonating?: boolean
  onStopImpersonate?: () => void
  onboardingHints?: OnboardingHintsState
}

const hasFullMenu = (role: string, isSystemOwner?: boolean) => isSystemOwner || role === "owner" || role === "admin" || role === "manager"
const userCanSee = (perms: UserPermissions | undefined, key: keyof UserPermissions) => perms?.[key] !== false
const userCanSeeOptIn = (perms: UserPermissions | undefined, key: keyof UserPermissions) => !!perms?.[key]
const mainNavItems = (
  t: (k: string) => string,
  userRole: string,
  perms?: UserPermissions,
  isSystemOwner?: boolean,
  isImpersonating?: boolean
) => {
  const full = hasFullMenu(userRole, isSystemOwner)
  const items: { id: string; label: string; icon: typeof Calculator | typeof LayoutDashboard | typeof Shield }[] = []
  if (isSystemOwner && !isImpersonating) {
    /* סקירת כל המסעדות — אין מודאל כזה מעץ מוצר */
    items.push({ id: "dashboard", label: t("nav.dashboard"), icon: LayoutDashboard })
    items.push({ id: "admin-panel", label: t("nav.adminPanel"), icon: Shield })
    return items
  }
  /* לשאר המשתמשים: לוח בקרה רק מעץ המוצר (מודאל), לא בתפריט */
  if (full || userCanSee(perms, "canSeeProductTree")) items.push({ id: "calc", label: t("nav.productTree"), icon: Calculator })
  if (full && !isImpersonating) items.push({ id: "admin-panel", label: t("nav.adminPanel"), icon: Shield })
  return items
}

const moreNavItems = (
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

function NavNeedsAttentionDot({ title }: { title: string }) {
  return (
    <span
      className="flex h-2 w-2 shrink-0 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.9)] animate-pulse"
      title={title}
      aria-hidden
    />
  )
}

export function DesktopNav({
  currentPage,
  setCurrentPage,
  currentRestaurant,
  restaurants,
  onSelectRestaurant,
  userRole,
  isSystemOwner,
  userPermissions,
  onLogout,
  isImpersonating,
  onStopImpersonate,
  onboardingHints,
}: DesktopNavProps) {
  const t = useTranslations()
  const hints = onboardingHints
  const showHints = hints && !hints.loading
  return (
    <nav aria-label={t("common.navigation")} className="hidden lg:flex fixed top-0 inset-x-0 z-50 h-16 bg-primary text-primary-foreground border-b border-primary-foreground/10">
      <div className="container mx-auto px-4 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-3">
            <Image
              src={BRAND_LOGO_PATH}
              alt="Kamershalor"
              width={194}
              height={210}
              className="h-11 w-auto object-contain"
              priority
            />
          </div>
          {(isImpersonating || !isSystemOwner) && restaurants.length > 0 && (
            isImpersonating ? (
              <div className="flex items-center gap-2 h-9 px-3 bg-primary-foreground/10 rounded-full">
                <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                <span className="max-w-[120px] truncate font-medium">{currentRestaurant}</span>
                {onStopImpersonate && (
                  <button
                    onClick={onStopImpersonate}
                    title={t("nav.backToNormal")}
                    aria-label={t("nav.backToNormal")}
                    className="opacity-60 hover:opacity-100 transition-opacity text-xs leading-none"
                  >
                    X
                  </button>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 h-9 px-3 bg-primary-foreground/10 rounded-full">
                <div className="w-2 h-2 rounded-full bg-green-400" />
                <span className="max-w-[140px] truncate font-medium">{currentRestaurant}</span>
              </div>
            )
          )}
        </div>
        <div className="flex items-center gap-1">
          {mainNavItems(t, userRole, userPermissions, isSystemOwner, isImpersonating).map((item) => (
            <button key={item.id} type="button" onClick={() => setCurrentPage(item.id)}
              className={cn("flex items-center gap-2 px-3 py-2 rounded-full text-sm font-medium transition-all",
                currentPage === item.id ? "bg-primary-foreground/20 text-primary-foreground" : "text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10")}>
              <item.icon className="w-4 h-4" />
              {item.label}
            </button>
          ))}
          {moreNavItems(t, userRole, userPermissions, isSystemOwner, isImpersonating).length > 0 && (
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className={cn("h-9 px-3 gap-2 rounded-full",
                    moreNavItems(t, userRole, userPermissions, isSystemOwner, isImpersonating).some((i) => i.id === currentPage)
                      ? "bg-primary-foreground/20 text-primary-foreground"
                      : "text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10")}>
                  <Menu className="w-4 h-4" />
                  {t("common.more")}
                  <ChevronDown className="w-4 h-4 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {moreNavItems(t, userRole, userPermissions, isSystemOwner, isImpersonating).map((item) => {
                  const needIng = showHints && item.id === "ingredients" && hints!.needsIngredients
                  const needSup = showHints && item.id === "suppliers" && hints!.needsSuppliers
                  const nudgeTitle =
                    needIng ? "אין רכיבים במסעדה — הוסיפו מכאן" : needSup ? "אין ספקים — צרו או ייבאו מכאן" : ""
                  return (
                    <DropdownMenuItem
                      key={item.id}
                      onSelect={() => setCurrentPage(item.id)}
                      title={nudgeTitle || undefined}
                      className={cn(
                        "gap-2 cursor-pointer flex items-center justify-between",
                        currentPage === item.id && "bg-accent text-accent-foreground",
                        (needIng || needSup) && "border-s-2 border-amber-500/80 bg-amber-500/10",
                      )}
                    >
                      <span className="flex items-center gap-2">
                        <item.icon className="w-4 h-4 shrink-0" />
                        {item.label}
                      </span>
                      {needIng || needSup ? (
                        <span className="flex items-center gap-1 shrink-0">
                          <NavNeedsAttentionDot title={nudgeTitle} />
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5 bg-amber-500/25 text-amber-950 dark:text-amber-100 border-amber-500/40">
                            חסר
                          </Badge>
                        </span>
                      ) : null}
                    </DropdownMenuItem>
                  )
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={onLogout}
            aria-label={t("common.logout")}
            className="text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10">
            <LogOut className="w-4 h-4 ml-2" />
            {t("common.logout")}
          </Button>
          <LanguageSwitcher />
        </div>
      </div>
    </nav>
  )
}
