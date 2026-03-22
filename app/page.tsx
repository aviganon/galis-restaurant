"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { AnimatePresence, motion, type Variants } from "framer-motion"
import { onAuthStateChanged, signOut } from "firebase/auth"
import { doc, getDoc, getDocFromServer, getDocsFromServer, setDoc, collection, getDocs } from "firebase/firestore"
import { auth, db } from "@/lib/firebase"
import { firestoreConfig } from "@/lib/firestore-config"
import { LoginScreen } from "@/components/login-screen"
import { Dashboard } from "@/components/dashboard"
import { Recipes } from "@/components/recipes"
import Suppliers from "@/components/suppliers"
import { Reports } from "@/components/reports"
import { Inventory } from "@/components/inventory"
import { Settings } from "@/components/settings"
import ProductTree from "@/components/product-tree"
import { Ingredients } from "@/components/ingredients"
import { MenuCosts } from "@/components/menu-costs"
import { PurchaseOrders } from "@/components/purchase-orders"
import { MobileNav } from "@/components/mobile-nav"
import { DesktopNav } from "@/components/desktop-nav"
import { AdminPanel } from "@/components/admin-panel"
import { AppProvider, type UserPermissions } from "@/contexts/app-context"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useTranslations } from "@/lib/use-translations"
import { useLanguage } from "@/contexts/language-context"
import { getTranslation } from "@/lib/translations"
import { RestaurantTopBar } from "@/components/restaurant-top-bar"
import { X } from "lucide-react"

const RESTRICTED_PAGES = [
  "admin-panel",
  "dashboard",
  "calc",
  "ingredients",
  "inventory",
  "suppliers",
  "purchase-orders",
  "upload",
  "reports",
  "menu",
] as const

const RESTAURANT_ONLY_PAGES = [
  "calc",
  "ingredients",
  "inventory",
  "suppliers",
  "purchase-orders",
  "upload",
  "reports",
  "menu",
] as const

/** מעברים קצרים יותר — פחות המתנה כשיוצאים מהתחזה / מחליפים מסעדה (התוכן עדיין נטען מחדש) */
const pageVariants: Variants = {
  initial: { opacity: 0, x: 12 },
  animate: { opacity: 1, x: 0, transition: { duration: 0.2, ease: [0.4, 0, 0.2, 1] } },
  exit: { opacity: 0, x: -12, transition: { duration: 0.12, ease: [0.4, 0, 1, 1] } },
}

export default function Home() {
  const t = useTranslations()
  const { locale, dir } = useLanguage()
  const localeRef = useRef(locale)
  const [authLoading, setAuthLoading] = useState(true)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [userRole, setUserRole] = useState<"admin" | "owner" | "manager" | "user">("owner")
  const [currentPage, setCurrentPage] = useState("calc")
  const [previousPage, setPreviousPage] = useState("calc")
  const [currentRestaurant, setCurrentRestaurant] = useState(() => t("common.loading"))
  const [currentRestaurantId, setCurrentRestaurantId] = useState<string | null>(null)
  const navigateTo = useCallback((page: string) => {
    if (page === "purchase-orders") {
      setPreviousPage(currentPage)
    }
    setCurrentPage(page)
  }, [currentPage])
  const [restaurants, setRestaurants] = useState<{ id: string; name: string; branch?: string; emoji?: string }[]>([])
  const [isSystemOwner, setIsSystemOwner] = useState(false)
  const [userPermissions, setUserPermissions] = useState<UserPermissions | undefined>(undefined)
  const [impersonatingRestaurant, setImpersonatingRestaurant] = useState<{ id: string; name: string } | null>(null)
  const [refreshIngredientsKey, setRefreshIngredientsKey] = useState(0)

  const refreshRestaurants = useCallback(async () => {
    if (!isSystemOwner) return
    try {
      const { restaurantsCollection, restaurantFields } = firestoreConfig
      // getDocs — נהנה ממטמון Firestore המקומי (IndexedDB) אחרי ביקור קודם; מהיר יותר אחרי יציאה מהתחזה
      const restsSnap = await getDocs(collection(db, restaurantsCollection))
      const list: { id: string; name: string; branch?: string; emoji?: string }[] = []
      restsSnap.forEach((d) => {
        const ddata = d.data()
        list.push({
          id: d.id,
          name: (ddata[restaurantFields.name] ?? d.id) as string,
          branch: ddata[restaurantFields.branch] as string | undefined,
          emoji: ddata[restaurantFields.emoji] as string | undefined,
        })
      })
      setRestaurants(list)
      if (list.length > 0 && !currentRestaurantId) {
        const first = list[0]
        setCurrentRestaurant(first.emoji ? `${first.emoji} ${first.name}` : first.name)
        setCurrentRestaurantId(first.id)
      }
    } catch (e) {
      console.error("[Restaurant Pro] refresh restaurants:", e)
    }
  }, [isSystemOwner, currentRestaurantId])

  const refreshIngredients = useCallback(() => setRefreshIngredientsKey((k) => k + 1), [])

  useEffect(() => {
    localeRef.current = locale
  }, [locale])

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setAuthLoading(false)
      if (!user) {
        setIsLoggedIn(false)
        return
      }
      try {
        const { usersCollection, roleField, restaurantIdField, restaurantsCollection, restaurantFields, permissionsField, defaultPermissions } = firestoreConfig
        // getDocFromServer: עוקף מטמון — חשוב אחרי עדכון isSystemOwner בסקריפט
        const userDoc = await getDocFromServer(doc(db, usersCollection, user.uid)).catch(() => getDoc(doc(db, usersCollection, user.uid)))
        const data = userDoc.exists() ? userDoc.data() : null
        let roleRaw = data?.[roleField]
        let isInAdminsList = false
        if (user.email) {
          try {
            const { adminsDocPath, adminsEmailsField } = firestoreConfig
            const altPaths = [adminsDocPath, { collection: "config" as const, docId: "adminEmails" as const }]
            const userEmailLower = user.email.toLowerCase().trim()
            for (const p of altPaths) {
              const adminsDoc = await getDoc(doc(db, p.collection, p.docId))
              const adminsData = adminsDoc.exists() ? adminsDoc.data() : null
              const raw = adminsData?.[adminsEmailsField] ?? adminsData?.emails ?? adminsData?.adminEmails
              const adminEmails: string[] = Array.isArray(raw)
                ? raw.map((e) => String(e).toLowerCase().trim())
                : raw && typeof raw === "object" && !Array.isArray(raw)
                  ? Object.keys(raw).map((e) => String(e).toLowerCase().trim())
                  : []
              if (adminEmails.includes(userEmailLower)) {
                isInAdminsList = true
                break
              }
            }
          } catch { /* ignore */ }
        }
        // בעלים: config/admins או users.role=owner | מנהל: users.role=manager/admin (לא בעלים) | משתמש: users.role=user
        const role: "admin" | "owner" | "manager" | "user" =
          isInAdminsList || roleRaw === "owner" ? "owner"
          : data?.[roleField] === "user" ? "user"
          : roleRaw === "manager" || roleRaw === "admin" ? "manager"
          : "owner"
        const userRestaurantId = data?.[restaurantIdField] as string | null | undefined
        const perms = data?.[permissionsField] as UserPermissions | undefined
        const isSystemOwnerFromUsers = data?.isSystemOwner === true
        const effectiveSystemOwner = isInAdminsList || isSystemOwnerFromUsers
        setUserRole(effectiveSystemOwner ? "owner" : role)
        setIsSystemOwner(effectiveSystemOwner)
        if (role === "user" && perms) {
          setUserPermissions({
            canSeeDashboard: perms.canSeeDashboard ?? defaultPermissions.canSeeDashboard ?? true,
            canSeeProductTree: perms.canSeeProductTree ?? defaultPermissions.canSeeProductTree ?? true,
            canSeeIngredients: perms.canSeeIngredients ?? defaultPermissions.canSeeIngredients ?? true,
            canSeeInventory: perms.canSeeInventory ?? defaultPermissions.canSeeInventory ?? true,
            canSeeSuppliers: perms.canSeeSuppliers ?? defaultPermissions.canSeeSuppliers ?? true,
            canSeePurchaseOrders: perms.canSeePurchaseOrders ?? defaultPermissions.canSeePurchaseOrders ?? true,
            canSeeUpload: perms.canSeeUpload ?? defaultPermissions.canSeeUpload ?? true,
            canSeeReports: perms.canSeeReports ?? defaultPermissions.canSeeReports,
            canSeeCosts: perms.canSeeCosts ?? defaultPermissions.canSeeCosts,
            canSeeSettings: perms.canSeeSettings ?? defaultPermissions.canSeeSettings,
          })
        } else {
          setUserPermissions(undefined)
        }

        // בעלים מ-config/admins או users.isSystemOwner: רואה את כל המסעדות (getDocsFromServer עוקף מטמון)
        if (effectiveSystemOwner) {
          const restsSnap = await getDocsFromServer(collection(db, restaurantsCollection)).catch((e) => {
            console.error("[Restaurant Pro] שגיאה בטעינת מסעדות:", e)
            return getDocs(collection(db, restaurantsCollection))
          })
          const list: { id: string; name: string; branch?: string; emoji?: string }[] = []
          restsSnap.forEach((d) => {
            const ddata = d.data()
            list.push({
              id: d.id,
              name: (ddata[restaurantFields.name] ?? d.id) as string,
              branch: ddata[restaurantFields.branch] as string | undefined,
              emoji: ddata[restaurantFields.emoji] as string | undefined,
            })
          })
          setRestaurants(list)
          if (list.length > 0) {
            const first = list[0]
            setCurrentRestaurant(first.emoji ? `${first.emoji} ${first.name}` : first.name)
            setCurrentRestaurantId(first.id)
          } else {
            setCurrentRestaurant(getTranslation(localeRef.current, "app.noRestaurants"))
          }
        } else if (userRestaurantId) {
          const restDoc = await getDoc(doc(db, restaurantsCollection, userRestaurantId))
          if (restDoc.exists()) {
            const ddata = restDoc.data()
            const rName = (ddata[restaurantFields.name] ?? restDoc.id) as string
            const rEmoji = ddata[restaurantFields.emoji] as string | undefined
            const name = rEmoji ? `${rEmoji} ${rName}` : rName
            setRestaurants([{ id: restDoc.id, name: rName, branch: ddata[restaurantFields.branch] as string | undefined, emoji: rEmoji }])
            setCurrentRestaurant(name)
            setCurrentRestaurantId(restDoc.id)
          } else {
            setRestaurants([{ id: userRestaurantId, name: userRestaurantId }])
            setCurrentRestaurant(userRestaurantId)
            setCurrentRestaurantId(userRestaurantId)
          }
        } else if (user.email && !isInAdminsList) {
          const restsSnap = await getDocs(collection(db, restaurantsCollection))
          let foundRestId: string | null = null
          for (const d of restsSnap.docs) {
            try {
              const invDoc = await getDoc(doc(db, "restaurants", d.id, "appState", "invitedEmails"))
              const list: string[] = Array.isArray(invDoc.data()?.list) ? invDoc.data()!.list : []
              if (list.includes(user.email!)) {
                foundRestId = d.id
                await setDoc(doc(db, usersCollection, user.uid), {
                  restaurantId: d.id,
                  role: "user",
                  email: user.email,
                  permissions: defaultPermissions,
                }, { merge: true })
                const newList = list.filter((e) => e !== user.email)
                await setDoc(doc(db, "restaurants", d.id, "appState", "invitedEmails"), { list: newList }, { merge: true })
                break
              }
            } catch {
              // אין הרשאה לקרוא — המשתמש לא מוזמן למסעדה זו
            }
          }
          if (foundRestId) {
            const restDoc = await getDoc(doc(db, restaurantsCollection, foundRestId))
            if (restDoc.exists()) {
              const ddata = restDoc.data()
              const rName = (ddata[restaurantFields.name] ?? restDoc.id) as string
              const rEmoji = ddata[restaurantFields.emoji] as string | undefined
              const name = rEmoji ? `${rEmoji} ${rName}` : rName
              setRestaurants([{ id: restDoc.id, name: rName, branch: ddata[restaurantFields.branch] as string | undefined, emoji: rEmoji }])
              setCurrentRestaurant(name)
              setCurrentRestaurantId(restDoc.id)
            }
            setUserRole("user")
            setUserPermissions(defaultPermissions)
          } else {
            setRestaurants([])
            setCurrentRestaurant(getTranslation(localeRef.current, "app.noRestaurantLabel"))
          }
        } else {
          setRestaurants([])
          setCurrentRestaurant(getTranslation(localeRef.current, "app.noRestaurantLabel"))
        }
        setIsLoggedIn(true)
      } catch (err) {
        console.error("[Restaurant Pro] שגיאה בטעינת נתוני משתמש:", err)
        setUserRole("owner")
        setIsLoggedIn(true)
      }
    })
    return () => unsub()
    // locale דרך localeRef — לא מפעילים מחדש onAuthStateChanged כשהשפה משתנה (מונע מרוצים / איפוס state)
  }, [])

  const hasFullMenu = !!isSystemOwner || userRole === "owner" || userRole === "admin" || userRole === "manager"
  const canAccessPage = useCallback(
    (page: string) => {
      if (isSystemOwner || hasFullMenu) return true
      if (userRole !== "user") return false
      const p = userPermissions
      switch (page) {
        case "admin-panel": return false
        case "dashboard": return p?.canSeeDashboard !== false
        case "calc": return p?.canSeeProductTree !== false
        case "ingredients": return p?.canSeeIngredients !== false
        case "inventory": return p?.canSeeInventory !== false
        case "suppliers": return p?.canSeeSuppliers !== false
        case "purchase-orders": return p?.canSeePurchaseOrders !== false
        case "upload":
          return p?.canSeeUpload !== false || p?.canSeeProductTree !== false
        case "reports": return !!p?.canSeeReports
        case "menu": return !!p?.canSeeCosts
        case "settings": return !!p?.canSeeSettings
        default: return true
      }
    },
    [isSystemOwner, hasFullMenu, userRole, userPermissions]
  )

  useEffect(() => {
    if ((RESTRICTED_PAGES as readonly string[]).includes(currentPage) && !canAccessPage(currentPage)) {
      const fallback = ["calc", "ingredients", "inventory", "suppliers", "purchase-orders", "reports", "menu"]
        .find((p) => canAccessPage(p))
      setCurrentPage(fallback || "calc")
    }
  }, [currentPage, canAccessPage])

  /* דף לוח בקרה מלא רק לבעל מערכת; לאחרים — רק מודאל מעץ מוצר */
  useEffect(() => {
    if (currentPage !== "dashboard") return
    if (!isSystemOwner || impersonatingRestaurant) {
      setCurrentPage("calc")
    }
  }, [currentPage, isSystemOwner, impersonatingRestaurant])

  useEffect(() => {
    if (isSystemOwner && !impersonatingRestaurant) {
      setCurrentPage("admin-panel")
    }
  }, [isSystemOwner, impersonatingRestaurant])

  useEffect(() => {
    if (isSystemOwner && !impersonatingRestaurant && (RESTAURANT_ONLY_PAGES as readonly string[]).includes(currentPage)) {
      setCurrentPage("admin-panel")
    }
  }, [isSystemOwner, impersonatingRestaurant, currentPage])

  const handleLogout = () => {
    signOut(auth)
    setIsLoggedIn(false)
  }

  const effectiveRestaurantId = impersonatingRestaurant?.id ?? currentRestaurantId
  const effectiveRestaurantName = impersonatingRestaurant?.name ?? currentRestaurant
  /** מצב עבודה בתוך מסעדה — ללא תפריט עליון; סרגל מותאם + עץ מוצר כדף ראשי */
  const inRestaurantWorkspace =
    !!effectiveRestaurantId && (!isSystemOwner || !!impersonatingRestaurant)
  /** בעלי מערכת בפאנל ניהול / דשבורד — בלי תפריט עליון; מצמצמים ריווח main */
  const compactSystemOwnerShell =
    isSystemOwner &&
    !impersonatingRestaurant &&
    (currentPage === "admin-panel" || currentPage === "dashboard")
  const handleImpersonate = (rest: { id: string; name: string; emoji?: string }) => {
    const display = rest.emoji ? `${rest.emoji} ${rest.name}` : rest.name
    setImpersonatingRestaurant({ id: rest.id, name: display })
    setCurrentPage("calc")
  }
  const handleStopImpersonate = () => setImpersonatingRestaurant(null)
  const handleRestaurantDeleted = useCallback((deletedId: string) => {
    if (impersonatingRestaurant?.id === deletedId) setImpersonatingRestaurant(null)
    if (currentRestaurantId === deletedId) {
      const next = restaurants?.find((r) => r.id !== deletedId)
      setCurrentRestaurantId(next?.id ?? null)
      setCurrentRestaurant(next ? (next.emoji ? `${next.emoji} ${next.name}` : next.name) : t("app.noRestaurants"))
    }
    refreshRestaurants()
  }, [impersonatingRestaurant?.id, currentRestaurantId, restaurants, t, refreshRestaurants])

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">{t("common.loading")}</div>
      </div>
    )
  }

  if (!isLoggedIn) {
    return <LoginScreen />
  }

  if (!currentRestaurantId && !isSystemOwner) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
        <div className="max-w-md text-center space-y-6">
          <h1 className="text-2xl font-bold">{t("app.noRestaurant")}</h1>
          <p className="text-muted-foreground">
            {t("app.noRestaurantDesc")}
          </p>
          <p className="text-sm text-muted-foreground">
            {t("app.noRestaurantHint")}
          </p>
          <Button onClick={handleLogout} variant="outline" className="rounded-full">
            {t("common.backToLogin")}
          </Button>
        </div>
      </div>
    )
  }

  const renderPage = () => {
    if ((RESTRICTED_PAGES as readonly string[]).includes(currentPage) && !canAccessPage(currentPage)) {
      return (
        <div className="container mx-auto px-4 py-16 text-center">
          <p className="text-lg text-muted-foreground mb-2">{t("app.noPermission")}</p>
          <p className="text-sm text-muted-foreground">{t("app.noPermissionHint")}</p>
        </div>
      )
    }
    switch (currentPage) {
      case "dashboard":
        if (isSystemOwner && !impersonatingRestaurant) return <Dashboard />
        return <ProductTree />
      case "calc":
        return <ProductTree />
      case "ingredients":
        return <Ingredients />
      case "menu":
        return <MenuCosts />
      case "inventory":
        return <Inventory />
      case "purchase-orders":
        if (inRestaurantWorkspace) {
          return <ProductTree />
        }
        return (
          <div>
            <div className="container mx-auto px-4 py-4">
              <button onClick={() => setCurrentPage(previousPage)} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors">
                {t("app.backToSuppliers")}
              </button>
            </div>
            <PurchaseOrders />
          </div>
        )
      case "upload":
        return <ProductTree />
      case "recipes":
        return <Recipes />
      case "suppliers":
        return <Suppliers />
      case "reports":
        return <Reports />
      case "settings":
        return <Settings />
      case "admin-panel":
        return <AdminPanel />
      default:
        return <ProductTree />
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {inRestaurantWorkspace && (
        <RestaurantTopBar
          dir={dir}
          restaurantDisplayName={effectiveRestaurantName}
          restaurants={restaurants}
          currentRestaurantId={effectiveRestaurantId}
          onSelectRestaurant={(rest) => {
            setCurrentRestaurant(rest.emoji ? `${rest.emoji} ${rest.name}` : rest.name)
            setCurrentRestaurantId(rest.id)
          }}
          currentPage={currentPage}
          setCurrentPage={setCurrentPage}
          canAccessPage={canAccessPage}
          onLogout={handleLogout}
          isImpersonating={!!impersonatingRestaurant}
          onStopImpersonate={handleStopImpersonate}
        />
      )}
      {!inRestaurantWorkspace && (!isSystemOwner || !!impersonatingRestaurant) && (
        <DesktopNav
          currentPage={currentPage}
          setCurrentPage={setCurrentPage}
          currentRestaurant={effectiveRestaurantName}
          restaurants={restaurants}
          onSelectRestaurant={(rest) => {
            setCurrentRestaurant(rest.emoji ? `${rest.emoji} ${rest.name}` : rest.name)
            setCurrentRestaurantId(rest.id)
          }}
          userRole={userRole}
          isSystemOwner={isSystemOwner}
          userPermissions={userPermissions}
          onLogout={handleLogout}
          isImpersonating={!!impersonatingRestaurant}
          onStopImpersonate={handleStopImpersonate}
        />
      )}

      <AppProvider
        currentRestaurantId={effectiveRestaurantId} 
        userRole={userRole} 
        isSystemOwner={isSystemOwner} 
        userPermissions={userPermissions}
        restaurants={restaurants}
        isImpersonating={!!impersonatingRestaurant}
        onImpersonate={handleImpersonate}
        onStopImpersonate={handleStopImpersonate}
        onRestaurantDeleted={handleRestaurantDeleted}
        setCurrentPage={setCurrentPage}
        refreshRestaurants={refreshRestaurants}
        refreshIngredientsKey={refreshIngredientsKey}
        refreshIngredients={refreshIngredients}
      >
        <main
          className={cn(
            compactSystemOwnerShell
              ? "pb-3 pt-[env(safe-area-inset-top,0px)] max-lg:pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] lg:pb-5"
              : inRestaurantWorkspace && currentPage === "calc"
                ? "pb-6 max-lg:pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] pt-[calc(7.25rem+env(safe-area-inset-top,0px))] lg:pb-8 lg:pt-[7.25rem]"
                : inRestaurantWorkspace
                  ? "pb-6 max-lg:pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] pt-[calc(3.5rem+env(safe-area-inset-top,0px))] lg:pb-8 lg:pt-14"
                  : "max-lg:pb-[calc(6rem+env(safe-area-inset-bottom,0px))] max-lg:pt-[calc(4rem+env(safe-area-inset-top,0px))] pb-24 pt-16 lg:pb-8 lg:pt-16",
            !compactSystemOwnerShell &&
              !inRestaurantWorkspace &&
              impersonatingRestaurant &&
              "max-lg:pt-[calc(7rem+env(safe-area-inset-top,0px))] lg:pt-28"
          )}
        >
          <AnimatePresence mode="sync">
            <motion.div
              key={
                inRestaurantWorkspace && (currentPage === "calc" || currentPage === "purchase-orders")
                  ? `tree-${effectiveRestaurantId ?? ""}`
                  : `${currentPage}-${effectiveRestaurantId ?? ""}`
              }
              variants={pageVariants}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              {renderPage()}
            </motion.div>
            {inRestaurantWorkspace && currentPage === "purchase-orders" && (
              <div
                className="fixed inset-0 z-[70] flex items-center justify-center p-3"
                role="dialog"
                aria-modal="true"
              >
                <button
                  type="button"
                  className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
                  aria-label={t("pages.close")}
                  onClick={() => setCurrentPage("calc")}
                />
                <div className="relative flex h-[min(88vh,900px)] max-lg:h-[min(calc(100dvh-1.5rem-env(safe-area-inset-top)-env(safe-area-inset-bottom)),900px)] w-[min(92vw,1200px)] max-lg:w-full max-lg:max-w-full flex-col overflow-hidden rounded-xl max-lg:rounded-2xl border bg-background shadow-2xl">
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon"
                    className="absolute end-3 top-[max(0.75rem,env(safe-area-inset-top))] z-10 h-10 w-10 lg:h-9 lg:w-9 rounded-full shadow-md"
                    onClick={() => setCurrentPage("calc")}
                    aria-label={t("pages.close")}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                  <div className="flex-1 overflow-y-auto overscroll-contain pt-2">
                    <PurchaseOrders />
                  </div>
                </div>
              </div>
            )}
          </AnimatePresence>
        </main>
      </AppProvider>

      {!inRestaurantWorkspace && (!isSystemOwner || !!impersonatingRestaurant) && (
        <MobileNav
          currentPage={currentPage}
          setCurrentPage={setCurrentPage}
          userRole={userRole}
          isSystemOwner={isSystemOwner}
          userPermissions={userPermissions}
          isImpersonating={!!impersonatingRestaurant}
        />
      )}
    </div>
  )
}
