"use client"

import { useEffect, useState } from "react"
import { collection, doc, getDoc, getDocs } from "firebase/firestore"
import { db } from "@/lib/firebase"

export type RestaurantOnboardingHints = {
  loading: boolean
  ingredientDocCount: number
  needsIngredients: boolean
  needsSuppliers: boolean
}

/**
 * מצב "מסעדה ריקה" למנהלים: אין רכיבים במסמכי המסעדה / אין ספקים משויכים או בשימוש.
 */
export function useRestaurantOnboardingStatus(
  restaurantId: string | null | undefined,
  refreshKey?: number,
): RestaurantOnboardingHints {
  const [state, setState] = useState<RestaurantOnboardingHints>({
    loading: true,
    ingredientDocCount: 0,
    needsIngredients: false,
    needsSuppliers: false,
  })

  useEffect(() => {
    if (!restaurantId) {
      queueMicrotask(() =>
        setState({
          loading: false,
          ingredientDocCount: 0,
          needsIngredients: false,
          needsSuppliers: false,
        }),
      )
      return
    }

    let cancelled = false
    ;(async () => {
      try {
        const [ingSnap, asSnap] = await Promise.all([
          getDocs(collection(db, "restaurants", restaurantId, "ingredients")),
          getDoc(doc(db, "restaurants", restaurantId, "appState", "assignedSuppliers")),
        ])
        if (cancelled) return
        const assignedList: string[] = Array.isArray(asSnap.data()?.list) ? asSnap.data()!.list : []
        const supplierSet = new Set<string>()
        for (const raw of assignedList) {
          const s = String(raw || "").trim()
          if (s) supplierSet.add(s)
        }
        ingSnap.forEach((d) => {
          const sup = String((d.data().supplier as string) || "").trim()
          if (sup && sup !== "ללא ספק") supplierSet.add(sup)
        })
        const ingredientDocCount = ingSnap.size
        setState({
          loading: false,
          ingredientDocCount,
          needsIngredients: ingredientDocCount === 0,
          needsSuppliers: supplierSet.size === 0,
        })
      } catch {
        if (!cancelled) {
          setState((prev) => ({ ...prev, loading: false }))
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [restaurantId, refreshKey])

  return state
}
