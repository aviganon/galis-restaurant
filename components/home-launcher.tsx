"use client"

import type { LucideIcon } from "lucide-react"
import {
  LayoutDashboard, Truck, ShoppingCart, CreditCard, TrendingDown, TrendingUp,
  Boxes, Package, Warehouse, Users, PieChart, Calculator, ShieldAlert,
  FileSignature, UserCircle, FileText, Files, Accessibility,
} from "lucide-react"
import { toast } from "sonner"
import { useApp } from "@/contexts/app-context"
import { useTranslations } from "@/lib/use-translations"
import { useLanguage } from "@/contexts/language-context"
import { tileVisible, type TileGate } from "@/lib/permissions"
import { cn } from "@/lib/utils"

type Tile = {
  id: string
  labelKey: string
  icon: LucideIcon
  /** יעד ניווט קיים; אם undefined — עדיין לא נבנה (מציג "בקרוב") */
  destination?: string
  gate: TileGate
}

const TILES: Tile[] = [
  { id: "dashboard", labelKey: "launcher.dashboard", icon: LayoutDashboard, destination: "dashboard", gate: { kind: "canSee", key: "canSeeDashboard" } },
  { id: "orders", labelKey: "launcher.orders", icon: Truck, destination: "purchase-orders", gate: { kind: "canSee", key: "canSeePurchaseOrders" } },
  { id: "new-orders", labelKey: "launcher.newOrders", icon: ShoppingCart, destination: "purchase-orders", gate: { kind: "canSee", key: "canSeePurchaseOrders" } },
  { id: "fixed-expenses", labelKey: "launcher.fixedExpenses", icon: CreditCard, destination: "fixed-expenses", gate: { kind: "optIn", key: "canSeeExpenses" } },
  { id: "expense-analysis", labelKey: "launcher.expenseAnalysis", icon: TrendingDown, destination: "expense-analysis", gate: { kind: "optIn", key: "canSeeExpenses" } },
  { id: "income-analysis", labelKey: "launcher.incomeAnalysis", icon: TrendingUp, destination: "income-analysis", gate: { kind: "optIn", key: "canSeeReports" } },
  { id: "products", labelKey: "launcher.products", icon: Boxes, destination: "ingredients", gate: { kind: "canSee", key: "canSeeIngredients" } },
  { id: "inventory", labelKey: "launcher.inventory", icon: Package, destination: "inventory", gate: { kind: "canSee", key: "canSeeInventory" } },
  { id: "warehouses", labelKey: "launcher.warehouses", icon: Warehouse, destination: "warehouses", gate: { kind: "optIn", key: "canSeeWarehouses" } },
  { id: "employees", labelKey: "launcher.employees", icon: Users, destination: "employees", gate: { kind: "optIn", key: "canSeeEmployees" } },
  { id: "cost-of-sales", labelKey: "launcher.costOfSales", icon: PieChart, destination: "menu", gate: { kind: "optIn", key: "canSeeCosts" } },
  { id: "product-tree", labelKey: "launcher.productTree", icon: Calculator, destination: "calc", gate: { kind: "canSee", key: "canSeeProductTree" } },
  { id: "harassment", labelKey: "launcher.harassment", icon: ShieldAlert, destination: "doc-harassment", gate: { kind: "canSee", key: "canSeeHrDocs" } },
  { id: "work-agreement", labelKey: "launcher.workAgreement", icon: FileSignature, destination: "doc-work-agreement", gate: { kind: "canSee", key: "canSeeHrDocs" } },
  { id: "personal-area", labelKey: "launcher.personalArea", icon: UserCircle, destination: "settings", gate: { kind: "always" } },
  { id: "form101", labelKey: "launcher.form101", icon: FileText, destination: "doc-form101", gate: { kind: "canSee", key: "canSeeHrDocs" } },
  { id: "forms", labelKey: "launcher.forms", icon: Files, destination: "doc-forms", gate: { kind: "canSee", key: "canSeeHrDocs" } },
  { id: "accessibility", labelKey: "launcher.accessibility", icon: Accessibility, destination: "doc-accessibility", gate: { kind: "always" } },
]

export function HomeLauncher() {
  const t = useTranslations()
  const { dir } = useLanguage()
  const { setCurrentPage, userRole, isSystemOwner, userPermissions } = useApp()

  const visible = TILES.filter((tile) => tileVisible(tile.gate, userRole, userPermissions, isSystemOwner))

  const handleClick = (tile: Tile) => {
    if (tile.destination) {
      setCurrentPage?.(tile.destination)
    } else {
      toast.info(`${t(tile.labelKey)} — ${t("launcher.comingSoon")}`)
    }
  }

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto" dir={dir}>
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        {visible.map((tile) => {
          const Icon = tile.icon
          const soon = !tile.destination
          return (
            <button
              key={tile.id}
              type="button"
              onClick={() => handleClick(tile)}
              className={cn(
                "relative flex flex-col items-center justify-center gap-2 rounded-2xl border bg-card p-3 text-center min-h-[104px] sm:min-h-[120px] transition-all",
                "hover:bg-muted hover:shadow-sm active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                soon && "opacity-60",
              )}
            >
              {soon && (
                <span className="absolute top-1.5 end-1.5 rounded-full bg-muted-foreground/15 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  {t("launcher.comingSoon")}
                </span>
              )}
              <Icon className="w-7 h-7 sm:w-8 sm:h-8 text-primary shrink-0" strokeWidth={1.75} />
              <span className="text-xs sm:text-sm font-medium leading-tight text-foreground">{t(tile.labelKey)}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default HomeLauncher
