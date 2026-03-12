"use client"

import { createContext, useContext, ReactNode } from "react"

export type UserPermissions = {
  canSeeDashboard?: boolean
  canSeeProductTree?: boolean
  canSeeIngredients?: boolean
  canSeeInventory?: boolean
  canSeeSuppliers?: boolean
  canSeePurchaseOrders?: boolean
  canSeeUpload?: boolean
  canSeeReports?: boolean
  canSeeCosts?: boolean
  canSeeSettings?: boolean
}

export type Restaurant = { id: string; name: string; branch?: string; emoji?: string }

interface AppContextValue {
  currentRestaurantId: string | null
  userRole: "admin" | "owner" | "manager" | "user"
  isSystemOwner?: boolean
  userPermissions?: UserPermissions
  restaurants?: Restaurant[]
  isImpersonating?: boolean
  onImpersonate?: (rest: Restaurant) => void
  onStopImpersonate?: () => void
  setCurrentPage?: (page: string) => void
  refreshRestaurants?: () => void
  refreshIngredientsKey?: number
  refreshIngredients?: () => void
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({
  children,
  currentRestaurantId,
  userRole,
  isSystemOwner,
  userPermissions,
  restaurants,
  isImpersonating,
  onImpersonate,
  onStopImpersonate,
  setCurrentPage,
  refreshRestaurants,
  refreshIngredientsKey,
  refreshIngredients,
}: {
  children: ReactNode
  currentRestaurantId: string | null
  userRole: "admin" | "owner" | "manager" | "user"
  isSystemOwner?: boolean
  userPermissions?: UserPermissions
  restaurants?: Restaurant[]
  isImpersonating?: boolean
  onImpersonate?: (rest: Restaurant) => void
  onStopImpersonate?: () => void
  setCurrentPage?: (page: string) => void
  refreshRestaurants?: () => void
  refreshIngredientsKey?: number
  refreshIngredients?: () => void
}) {
  return (
    <AppContext.Provider value={{ currentRestaurantId, userRole, isSystemOwner, userPermissions, restaurants, isImpersonating, onImpersonate, onStopImpersonate, setCurrentPage, refreshRestaurants, refreshIngredientsKey, refreshIngredients }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  return ctx ?? { currentRestaurantId: null, userRole: "user" as const, isSystemOwner: false, userPermissions: undefined }
}
