"use client"

import { Settings, LogOut } from "lucide-react"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { LanguageSwitcher } from "@/components/language-switcher"
import { useTranslations } from "@/lib/use-translations"
import { cn } from "@/lib/utils"

const BRAND_LOGO_PATH = "/kamershalor-logo-mark.png"

export type RestaurantTopBarRestaurant = {
  id: string
  name: string
  branch?: string
  emoji?: string
}

type RestaurantTopBarProps = {
  dir: "rtl" | "ltr"
  /** טקסט תצוגה (כולל אימוג׳י אם רלוונטי) */
  restaurantDisplayName: string
  restaurants: RestaurantTopBarRestaurant[]
  currentRestaurantId: string | null
  onSelectRestaurant: (rest: RestaurantTopBarRestaurant) => void
  currentPage: string
  setCurrentPage: (page: string) => void
  canAccessPage: (page: string) => boolean
  onLogout: () => void
  isImpersonating?: boolean
  onStopImpersonate?: () => void
}

export function RestaurantTopBar({
  dir,
  restaurantDisplayName,
  restaurants,
  currentRestaurantId,
  onSelectRestaurant,
  currentPage,
  setCurrentPage,
  canAccessPage,
  onLogout,
  isImpersonating,
  onStopImpersonate,
}: RestaurantTopBarProps) {
  const t = useTranslations()

  /** שם מסעדה בולט — גרדיאנט עדין ברקע (תומך באימוג׳י לצד הטקסט) */
  const restaurantNameSurface =
    "rounded-xl bg-gradient-to-r from-primary/18 via-violet-500/14 to-amber-500/16 px-2.5 py-1 ring-1 ring-primary/25 shadow-sm dark:from-primary/28 dark:via-violet-400/18 dark:to-amber-400/20 dark:ring-primary/35"
  const restaurantNameText =
    "font-extrabold text-base sm:text-lg leading-tight tracking-tight text-primary"

  const showProductTreeToolsRow = currentPage === "calc"

  return (
    <header
      dir={dir}
      className={cn(
        "fixed top-0 inset-x-0 z-[60] border-b border-border/70",
        "bg-background/80 backdrop-blur-lg supports-[backdrop-filter]:bg-background/70",
        "shadow-[0_1px_0_rgba(0,0,0,0.04)] dark:shadow-[0_1px_0_rgba(255,255,255,0.06)]",
        "max-lg:pt-[env(safe-area-inset-top,0px)]",
        !showProductTreeToolsRow && "h-14"
      )}
    >
      <div className="mx-auto max-w-[1920px]">
        <div className="flex h-14 min-h-[3.5rem] items-center gap-2 px-3 sm:gap-3 sm:px-4">
          <div className="flex min-w-0 flex-1 items-center gap-2.5 sm:gap-3">
          <Image
            src={BRAND_LOGO_PATH}
            alt="Kamershalor"
            width={210}
            height={247}
            className="h-10 w-auto shrink-0 object-contain"
            priority
          />
          <div className="min-w-0 flex-1">
            {restaurants.length > 1 ? (
              <Select
                value={currentRestaurantId ?? ""}
                onValueChange={(id) => {
                  const r = restaurants.find((x) => x.id === id)
                  if (r) onSelectRestaurant(r)
                }}
              >
                <SelectTrigger
                  className={cn(
                    "h-auto min-h-0 max-w-full border-0 bg-transparent py-0 text-start shadow-none sm:max-w-md [&>svg]:shrink-0 [&>svg]:text-primary/70 [&>svg]:opacity-80 dark:bg-transparent",
                    restaurantNameSurface,
                    restaurantNameText,
                    "data-[placeholder]:text-primary/90",
                    "hover:from-primary/25 hover:via-violet-500/18 hover:to-amber-500/20 dark:hover:from-primary/35"
                  )}
                  aria-label={t("pages.dashboard.selectRestaurant")}
                >
                  <SelectValue placeholder={restaurantDisplayName} />
                </SelectTrigger>
                <SelectContent position="popper" className="z-[100] max-h-[min(70vh,320px)]">
                  {restaurants.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.emoji ? `${r.emoji} ` : ""}
                      {r.name}
                      {r.branch ? ` · ${r.branch}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className={cn("inline-flex max-w-full", restaurantNameSurface)}>
                <h1 className={cn("truncate text-start", restaurantNameText)}>
                  {restaurantDisplayName}
                </h1>
              </div>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
          {currentPage !== "calc" && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="hidden h-9 rounded-full text-xs sm:inline-flex"
              onClick={() => setCurrentPage("calc")}
            >
              {t("app.backToMain")}
            </Button>
          )}
          {isImpersonating && onStopImpersonate && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 shrink-0 rounded-full border-amber-300/80 bg-amber-500/10 px-2.5 text-xs text-amber-900 hover:bg-amber-500/15 sm:px-3 dark:border-amber-700 dark:text-amber-100"
              onClick={onStopImpersonate}
            >
              {t("nav.backToNormal")}
            </Button>
          )}
          <LanguageSwitcher variant="surface" />
          {canAccessPage("settings") && (
            <Button
              type="button"
              variant={currentPage === "settings" ? "default" : "outline"}
              size="icon"
              className="h-9 w-9 shrink-0 rounded-full"
              title={t("nav.settings")}
              onClick={() => setCurrentPage("settings")}
            >
              <Settings className="h-4 w-4" />
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-9 w-9 shrink-0 rounded-full text-destructive hover:bg-destructive/10 hover:text-destructive"
            title={t("common.logout")}
            aria-label={t("common.logout")}
            onClick={onLogout}
          >
            <LogOut className="h-4 w-4" />
          </Button>
          </div>
        </div>

        {showProductTreeToolsRow && (
          <div
            role="region"
            aria-label={t("pages.productTree.menuToolsRegionLabel")}
            className={cn(
              "border-t border-border/60 bg-background/90 backdrop-blur-md",
              "px-3 py-1.5 sm:px-4 sm:py-2"
            )}
          >
            {/* יישור עם עמודת שם המסעדה: אייקון (2.25rem) + מרווח (0.625rem) */}
            <div className="flex flex-wrap items-center gap-2 ps-[2.875rem]">
              <div
                id="product-tree-header-tools-root"
                className="flex min-w-0 flex-1 flex-wrap items-center gap-2"
              />
            </div>
          </div>
        )}
      </div>
    </header>
  )
}
