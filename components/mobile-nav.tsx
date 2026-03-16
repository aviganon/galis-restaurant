"use client"

import { useState } from "react"
import { 
  LayoutDashboard, 
  ChefHat, 
  Truck, 
  BarChart3, 
  Menu,
  Settings,
  Calculator,
  X,
  Package,
  Upload,
  ClipboardList,
  UtensilsCrossed,
  Shield
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { UserPermissions } from "@/contexts/app-context"
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
}

const hasFullMenu = (role: string, isSystemOwner?: boolean) => 
  isSystemOwner || role === "owner" || role === "admin" || role === "manager"
const userCanSee = (perms: UserPermissions | undefined, key: keyof UserPermissions) => perms?.[key] !== false
const userCanSeeOptIn = (perms: UserPermissions | undefined, key: keyof UserPermissions) => !!perms?.[key]

const mainItems = (
  t: (k: string) => string,
  userRole: string,
  perms?: UserPermissions,
  isSystemOwner?: boolean,
  isImpersonating?: boolean
) => {
  const full = hasFullMenu(userRole, isSystemOwner)
  const items: { id: string; label: string; icon: typeof LayoutDashboard }[] = []
  if (isSystemOwner && !isImpersonating) {
    items.push({ id: "dashboard", label: t("nav.dashboard"), icon: LayoutDashboard })
    items.push({ id: "admin-panel", label: t("nav.adminPanelShort"), icon: Shield })
    return items
  }
  if (full || userCanSee(perms, "canSeeDashboard")) items.push({ id: "dashboard", label: t("nav.dashboard"), icon: LayoutDashboard })
  if (full || userCanSee(perms, "canSeeProductTree")) items.push({ id: "calc", label: t("nav.productTree"), icon: Calculator })
  if (full && !isImpersonating) items.push({ id: "admin-panel", label: t("nav.adminPanelShort"), icon: Shield })
  // ingredients moved into product-tree tabs
  if (full || userCanSee(perms, "canSeeInventory")) items.push({ id: "inventory", label: t("nav.inventory"), icon: Package })
  items.push({ id: "more", label: t("common.more"), icon: Menu })
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
  // בעלים בהתחזות — כפתור חזרה לפאנל בעלים
  if (isSystemOwner && isImpersonating) items.push({ id: "admin-panel", label: t("nav.adminPanel"), icon: Shield })
  if (full && !isImpersonating) items.push({ id: "admin-panel", label: t("nav.adminPanel"), icon: Shield })
  if (full || userCanSeeOptIn(perms, "canSeeCosts")) items.push({ id: "menu", label: t("nav.menuCosts"), icon: UtensilsCrossed })
  // suppliers moved into product-tree tabs
  if (full || userCanSee(perms, "canSeePurchaseOrders")) items.push({ id: "purchase-orders", label: t("nav.purchaseOrders"), icon: ClipboardList })
  if (full || userCanSee(perms, "canSeeUpload")) items.push({ id: "upload", label: t("nav.upload"), icon: Upload })
  if (full || userCanSeeOptIn(perms, "canSeeReports")) items.push({ id: "reports", label: t("nav.reports"), icon: BarChart3 })
  if (full || userCanSeeOptIn(perms, "canSeeSettings")) items.push({ id: "settings", label: t("nav.settings"), icon: Settings })
  return items
}

export function MobileNav({ currentPage, setCurrentPage, userRole, isSystemOwner, userPermissions, isImpersonating, onStopImpersonate }: MobileNavProps) {
  const t = useTranslations()
  const [showMore, setShowMore] = useState(false)

  const handleClick = (id: string) => {
    if (id === "more") {
      setShowMore(true)
    } else {
      setCurrentPage(id)
      setShowMore(false)
    }
  }

  return (
    <>
      {isImpersonating && onStopImpersonate && (
        <div className="fixed top-0 inset-x-0 z-50 flex items-center justify-between px-4 h-10 bg-amber-500 text-amber-950 text-sm font-semibold md:hidden">
          <span>🎭 מצב התחזות</span>
          <button onClick={onStopImpersonate} className="flex items-center gap-1 border border-amber-800/40 rounded-full px-3 py-0.5 text-xs font-bold">
            חזור לבעלים ✕
          </button>
        </div>
      )}
      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 inset-x-0 z-50 md:hidden bg-primary/95 backdrop-blur-xl border-t border-primary-foreground/10 safe-area-pb">
        <div className="flex items-stretch h-16">
          {mainItems(t, userRole, userPermissions, isSystemOwner, isImpersonating).map((item) => {
            const isActive = item.id === "more" ? showMore : currentPage === item.id
            
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleClick(item.id)}
                className={cn(
                  "flex-1 flex flex-col items-center justify-center gap-1 relative transition-all duration-200",
                  isActive && "text-accent"
                )}
              >
                {isActive && (
                  <span className="absolute top-1 w-5 h-1 rounded-full bg-accent" />
                )}
                <item.icon className={cn(
                  "w-5 h-5 transition-transform duration-200",
                  isActive ? "text-primary-foreground scale-110" : "text-primary-foreground/60"
                )} />
                <span className={cn(
                  "text-[10px] font-medium transition-colors",
                  isActive ? "text-primary-foreground" : "text-primary-foreground/50"
                )}>
                  {item.label}
                </span>
              </button>
            )
          })}
        </div>
      </nav>

      {/* More Drawer */}
      {showMore && (
        <>
          <div 
            className="fixed inset-0 z-40 bg-background/60 backdrop-blur-sm md:hidden"
            onClick={() => setShowMore(false)}
          />
          <div className="fixed bottom-0 inset-x-0 z-50 md:hidden bg-primary rounded-t-3xl animate-in slide-in-from-bottom duration-300">
            <div className="w-12 h-1.5 bg-primary-foreground/20 rounded-full mx-auto mt-3" />
            
            <div className="p-4 pb-safe">
              <div className="flex items-center justify-between mb-4">
                <LanguageSwitcher />
                <h3 className="text-xs font-bold text-primary-foreground/50 tracking-wider">{t("nav.moreOptions")}</h3>
                <button 
                  onClick={() => setShowMore(false)}
                  className="w-8 h-8 rounded-full bg-primary-foreground/10 flex items-center justify-center"
                >
                  <X className="w-4 h-4 text-primary-foreground" />
                </button>
              </div>
              
              <div className="grid grid-cols-3 gap-3 max-h-[50vh] overflow-y-auto hide-scrollbar">
                {moreItems(t, userRole, userPermissions, isSystemOwner, isImpersonating).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleClick(item.id)}
                    className={cn(
                      "flex flex-col items-center gap-2 p-4 rounded-2xl transition-all",
                      "bg-primary-foreground/5 border border-primary-foreground/10",
                      "active:scale-95 active:bg-primary-foreground/10",
                      currentPage === item.id && "bg-accent/20 border-accent/30"
                    )}
                  >
                    <item.icon className={cn(
                      "w-6 h-6",
                      currentPage === item.id ? "text-accent" : "text-primary-foreground/70"
                    )} />
                    <span className={cn(
                      "text-xs font-medium",
                      currentPage === item.id ? "text-primary-foreground" : "text-primary-foreground/70"
                    )}>
                      {item.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </>
  )
}
