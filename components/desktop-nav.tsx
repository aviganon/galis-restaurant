"use client"

import { useState } from "react"
import { 
  LayoutDashboard, 
  ChefHat, 
  Truck, 
  BarChart3,
  Settings,
  LogOut,
  ChevronDown,
  UtensilsCrossed,
  Calculator,
  Package,
  Upload,
  ClipboardList,
  Menu,
  Shield
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { UserPermissions } from "@/contexts/app-context"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

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
}

const hasFullMenu = (role: string, isSystemOwner?: boolean) => 
  isSystemOwner || role === "owner" || role === "admin" || role === "manager"
const userCanSee = (perms: UserPermissions | undefined, key: keyof UserPermissions) => perms?.[key] !== false
const userCanSeeOptIn = (perms: UserPermissions | undefined, key: keyof UserPermissions) => !!perms?.[key]

// בעלים: כשלא מתחזה — רק פאנל מנהל. במצב התחזה — תפריט המסעדה (בלי פאנל מנהל)
// מנהל/משתמש: תמיד תפריט המסעדה (לפי הרשאות)
const mainNavItems = (userRole: string, perms?: UserPermissions, isSystemOwner?: boolean, isImpersonating?: boolean) => {
  const full = hasFullMenu(userRole, isSystemOwner)
  const items: { id: string; label: string; icon: typeof LayoutDashboard }[] = []

  if (isSystemOwner && !isImpersonating) {
    items.push({ id: "dashboard", label: "📊 לוח בקרה", icon: LayoutDashboard })
    items.push({ id: "admin-panel", label: "🛡️ פאנל מנהל", icon: Shield })
    return items
  }
  if (full || userCanSee(perms, "canSeeDashboard")) items.push({ id: "dashboard", label: "📊 לוח בקרה", icon: LayoutDashboard })
  if (full || userCanSee(perms, "canSeeProductTree")) items.push({ id: "calc", label: "🧮 עץ מוצר", icon: Calculator })
  if (full && !isImpersonating) items.push({ id: "admin-panel", label: "🛡️ פאנל מנהל", icon: Shield })
  if (full || userCanSee(perms, "canSeeIngredients")) items.push({ id: "ingredients", label: "רכיבים", icon: ChefHat })
  if (full || userCanSeeOptIn(perms, "canSeeCosts")) items.push({ id: "menu", label: "עלויות תפריט", icon: UtensilsCrossed })
  if (full || userCanSee(perms, "canSeeSuppliers")) items.push({ id: "suppliers", label: "ספקים", icon: Truck })
  return items
}

const moreNavItems = (userRole: string, perms?: UserPermissions, isSystemOwner?: boolean, isImpersonating?: boolean) => {
  const full = hasFullMenu(userRole, isSystemOwner)
  const items: { id: string; label: string; icon: typeof Package }[] = []
  if (isSystemOwner && !isImpersonating) return items
  if (full || userCanSee(perms, "canSeeInventory")) items.push({ id: "inventory", label: "מלאי", icon: Package })
  if (full || userCanSee(perms, "canSeePurchaseOrders")) items.push({ id: "purchase-orders", label: "הזמנות ספקים", icon: ClipboardList })
  if (full || userCanSee(perms, "canSeeUpload")) items.push({ id: "upload", label: "העלאה", icon: Upload })
  if (full || userCanSeeOptIn(perms, "canSeeReports")) items.push({ id: "reports", label: "דוחות", icon: BarChart3 })
  if (full || userCanSeeOptIn(perms, "canSeeSettings")) items.push({ id: "settings", label: "הגדרות", icon: Settings })
  return items
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
  isImpersonating
}: DesktopNavProps) {
  return (
    <nav className="hidden md:flex fixed top-0 inset-x-0 z-50 h-16 bg-primary text-primary-foreground border-b border-primary-foreground/10">
      <div className="container mx-auto px-4 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary-foreground/10 flex items-center justify-center">
              <UtensilsCrossed className="w-5 h-5" />
            </div>
            <span className="font-bold text-lg">Restaurant Pro</span>
          </div>

          {/* מסעדה — רק בהתחזה (בעלים) או למנהל/משתמש */}
          {(isImpersonating || !isSystemOwner) && restaurants.length > 0 && (
            isImpersonating ? (
              <div className="flex items-center gap-2 h-9 px-3 bg-primary-foreground/10 rounded-full">
                <div className="w-2 h-2 rounded-full bg-amber-400" />
                <span className="max-w-[140px] truncate font-medium">{currentRestaurant}</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 h-9 px-3 bg-primary-foreground/10 rounded-full">
                <div className="w-2 h-2 rounded-full bg-green-400" />
                <span className="max-w-[140px] truncate font-medium">{currentRestaurant}</span>
              </div>
            )
          )}
        </div>

        {/* Nav Items */}
        <div className="flex items-center gap-1">
          {mainNavItems(userRole, userPermissions, isSystemOwner, isImpersonating).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setCurrentPage(item.id)}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-full text-sm font-medium transition-all",
                currentPage === item.id 
                  ? "bg-primary-foreground/20 text-primary-foreground" 
                  : "text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10"
              )}
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </button>
          ))}
          
          {/* More Dropdown — מוסתר לבעלים כשלא מתחזה (אין פריטים) */}
          {moreNavItems(userRole, userPermissions, isSystemOwner, isImpersonating).length > 0 && (
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="ghost" 
                  className={cn(
                    "h-9 px-3 gap-2 rounded-full",
                    moreNavItems(userRole, userPermissions, isSystemOwner, isImpersonating).some((i) => i.id === currentPage)
                      ? "bg-primary-foreground/20 text-primary-foreground"
                      : "text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10"
                  )}
                >
                  <Menu className="w-4 h-4" />
                  עוד
                  <ChevronDown className="w-4 h-4 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {moreNavItems(userRole, userPermissions, isSystemOwner, isImpersonating).map((item) => (
                  <DropdownMenuItem 
                    key={item.id}
                    onSelect={() => setCurrentPage(item.id)}
                    className={cn(
                      "gap-2 cursor-pointer",
                      currentPage === item.id && "bg-accent text-accent-foreground"
                    )}
                  >
                    <item.icon className="w-4 h-4" />
                    {item.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {/* Logout */}
        <Button 
          variant="ghost" 
          size="sm"
          onClick={onLogout}
          className="text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10"
        >
          <LogOut className="w-4 h-4 ml-2" />
          יציאה
        </Button>
      </div>
    </nav>
  )
}
