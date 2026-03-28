/**
 * יעדי % עלות מזון — ברירת מחדל + לפי קטגוריית מנה.
 * נשמר ב: restaurants/{id}/appState/categoryFoodCostTargets
 */
export const DEFAULT_FOOD_COST_TARGET_PCT = 30

export type FoodCostTargetsState = {
  defaultPercent: number
  byCategory: Record<string, number>
}

function clampTarget(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_FOOD_COST_TARGET_PCT
  return Math.min(80, Math.max(5, Math.round(n * 10) / 10))
}

/** נתונים גולמיים מ-Firestore + יעד ממסמך המסעדה (שדה target) כשאין מסמך יעדים */
export function parseFoodCostTargets(
  raw: unknown,
  restaurantDocTarget?: number | null
): FoodCostTargetsState {
  let defaultPercent = DEFAULT_FOOD_COST_TARGET_PCT
  if (typeof restaurantDocTarget === "number" && restaurantDocTarget > 0 && restaurantDocTarget <= 80) {
    defaultPercent = clampTarget(restaurantDocTarget)
  }
  const byCategory: Record<string, number> = {}
  if (raw && typeof raw === "object" && raw !== null) {
    const o = raw as Record<string, unknown>
    if (typeof o.defaultPercent === "number" && o.defaultPercent > 0 && o.defaultPercent <= 80) {
      defaultPercent = clampTarget(o.defaultPercent)
    }
    const bc = o.byCategory
    if (bc && typeof bc === "object" && bc !== null) {
      for (const [k, v] of Object.entries(bc as Record<string, unknown>)) {
        if (typeof v === "number" && v > 0 && v <= 80) {
          byCategory[k.trim()] = clampTarget(v)
        }
      }
    }
  }
  return { defaultPercent, byCategory }
}

export function resolveFoodCostTargetPercent(
  category: string | undefined,
  cfg: FoodCostTargetsState
): number {
  if (!category) return cfg.defaultPercent
  const v = cfg.byCategory[category]
  return typeof v === "number" ? v : cfg.defaultPercent
}

/** סטטוס מנה לפי יעד דינמי (יחס זהה לסף הקבועים 25/30/35) */
export function foodCostStatusForTarget(
  foodCostPct: number,
  targetT: number
): "excellent" | "good" | "warning" | "critical" {
  const ex = (25 / 30) * targetT
  const ok = targetT
  const wa = (35 / 30) * targetT
  if (foodCostPct <= ex) return "excellent"
  if (foodCostPct <= ok) return "good"
  if (foodCostPct <= wa) return "warning"
  return "critical"
}

export function isFoodCostOverTarget(foodCostPct: number, targetT: number): boolean {
  return foodCostPct > targetT
}
