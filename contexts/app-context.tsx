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

export type OnboardingHintsState = {
  loading: boolean
  needsIngredients: boolean
  needsSuppliers: boolean
}

interface AppContextValue {
  currentRestaurantId: string | null
  userRole: "admin" | "owner" | "manager" | "user"
  isSystemOwner?: boolean
  userPermissions?: UserPermissions
  restaurants?: Restaurant[]
  isImpersonating?: boolean
  onImpersonate?: (rest: Restaurant) => void
  onStopImpersonate?: () => void
  onRestaurantDeleted?: (deletedId: string) => void
  setCurrentPage?: (page: string) => void
  refreshRestaurants?: () => void
  refreshIngredientsKey?: number
  refreshIngredients?: () => void
  onboardingHints?: OnboardingHintsState
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
  onRestaurantDeleted,
  setCurrentPage,
  refreshRestaurants,
  refreshIngredientsKey,
  refreshIngredients,
  onboardingHints,
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
  onRestaurantDeleted?: (deletedId: string) => void
  setCurrentPage?: (page: string) => void
  refreshRestaurants?: () => void
  refreshIngredientsKey?: number
  refreshIngredients?: () => void
  onboardingHints?: OnboardingHintsState
}) {
  return (
    <AppContext.Provider
      value={{
        currentRestaurantId,
        userRole,
        isSystemOwner,
        userPermissions,
        restaurants,
        isImpersonating,
        onImpersonate,
        onStopImpersonate,
        onRestaurantDeleted,
        setCurrentPage,
        refreshRestaurants,
        refreshIngredientsKey,
        refreshIngredients,
        onboardingHints,
      }}
    >
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  return ctx ?? { currentRestaurantId: null, userRole: "user" as const, isSystemOwner: false, userPermissions: undefined }
}
