"use client"

import { useState, useEffect, useCallback } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { onAuthStateChanged, signOut } from "firebase/auth"
import { doc, getDoc, getDocFromServer, getDocsFromServer, setDoc, collection, getDocs } from "firebase/firestore"
import { auth, db } from "@/lib/firebase"
import { firestoreConfig } from "@/lib/firestore-config"
import { LoginScreen } from "@/components/login-screen"
import { Dashboard } from "@/components/dashboard"
import { Recipes } from "@/components/recipes"
import Suppliers from "@/components/suppliers"
import { Reports } from "@/components/reports"
import { Settings } from "@/components/settings"
import ProductTree from "@/components/product-tree"
import { Ingredients } from "@/components/ingredients"
import { MenuCosts } from "@/components/menu-costs"
import { Inventory } from "@/components/inventory"
import { PurchaseOrders } from "@/components/purchase-orders"
import { Upload } from "@/components/upload"
import { MobileNav } from "@/components/mobile-nav"
import { DesktopNav } from "@/components/desktop-nav"
import { AdminPanel } from "@/components/admin-panel"
import { AppProvider, type UserPermissions } from "@/contexts/app-context"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useTranslations } from "@/lib/use-translations"

const pageVariants = {
  initial: { opacity: 0, x: 20 },
  animate: { opacity: 1, x: 0, transition: { duration: 0.3, ease: "easeOut" } },
  exit: { opacity: 0, x: -20, transition: { duration: 0.2, ease: "easeIn" } }
}

export default function Home() {
  const t = useTranslations()
  const [authLoading, setAuthLoading] = useState(true)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [userRole, setUserRole] = useState<"admin" | "owner" | "manager" | "user">("owner")
  const [currentPage, setCurrentPage] = useState("dashboard")
  const [currentRestaurant, setCurrentRestaurant] = useState(() => t("common.loading"))
  const [currentRestaurantId, setCurrentRestaurantId] = useState<string | null>(null)
  const [restaurants, setRestaurants] = useState<{ id: string; name: string; branch?: string; emoji?: string }[]>([])
  const [isSystemOwner, setIsSystemOwner] = useState(false)
  const [userPermissions, setUserPermissions] = useState<UserPermissions | undefined>(undefined)
  const [impersonatingRestaurant, setImpersonatingRestaurant] = useState<{ id: string; name: string } | null>(null)
  const [refreshIngredientsKey, setRefreshIngredientsKey] = useState(0)

  const refreshRestaurants = useCallback(async () => {
    if (!isSystemOwner) return
    try {
      const { restaurantsCollection, restaurantFields } = firestoreConfig
      const restsSnap = await getDocsFromServer(collection(db, restaurantsCollection)).catch(() => getDocs(collection(db, restaurantsCollection)))
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
            setCurrentRestaurant(t("app.noRestaurants"))
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
            setCurrentRestaurant(t("app.noRestaurantLabel"))
          }
        } else {
          setRestaurants([])
          setCurrentRestaurant(t("app.noRestaurantLabel"))
        }
        setIsLoggedIn(true)
      } catch (err) {
        console.error("[Restaurant Pro] שגיאה בטעינת נתוני משתמש:", err)
        setUserRole("owner")
        setIsLoggedIn(true)
      }
    })
    return () => unsub()
  }, [])

  const restrictedPages = ["admin-panel", "dashboard", "calc", "ingredients", "inventory", "suppliers", "purchase-orders", "upload", "reports", "menu", "settings"]
  const isRestrictedPage = restrictedPages.includes(currentPage)
  const hasFullMenu = !!isSystemOwner || userRole === "owner" || userRole === "admin" || userRole === "manager"
  const canAccessPage = (page: string) => {
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
      case "upload": return p?.canSeeUpload !== false
      case "reports": return !!p?.canSeeReports
      case "menu": return !!p?.canSeeCosts
      case "settings": return !!p?.canSeeSettings
      default: return true
    }
  }

  useEffect(() => {
    if (isRestrictedPage && !canAccessPage(currentPage)) {
      const fallback = ["dashboard", "calc", "ingredients", "inventory", "suppliers", "purchase-orders", "upload", "reports", "menu", "settings"]
        .find((p) => canAccessPage(p))
      setCurrentPage(fallback || "dashboard")
    }
  }, [userRole, currentPage, isRestrictedPage, hasFullMenu, userPermissions])

  useEffect(() => {
    if (isSystemOwner && !impersonatingRestaurant) {
      setCurrentPage("admin-panel")
    }
  }, [isSystemOwner, impersonatingRestaurant])

  const restaurantOnlyPages = ["calc", "ingredients", "inventory", "suppliers", "purchase-orders", "upload", "reports", "menu", "settings"]
  useEffect(() => {
    if (isSystemOwner && !impersonatingRestaurant && restaurantOnlyPages.includes(currentPage)) {
      setCurrentPage("admin-panel")
    }
  }, [isSystemOwner, impersonatingRestaurant, currentPage])

  const handleLogout = () => {
    signOut(auth)
    setIsLoggedIn(false)
  }

  const effectiveRestaurantId = impersonatingRestaurant?.id ?? currentRestaurantId
  const effectiveRestaurantName = impersonatingRestaurant?.name ?? currentRestaurant
  const handleImpersonate = (rest: { id: string; name: string; emoji?: string }) => {
    const display = rest.emoji ? `${rest.emoji} ${rest.name}` : rest.name
    setImpersonatingRestaurant({ id: rest.id, name: display })
    setCurrentPage(isSystemOwner ? "admin-panel" : "dashboard")
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
    if (isRestrictedPage && !canAccessPage(currentPage)) {
      return (
        <div className="container mx-auto px-4 py-16 text-center">
          <p className="text-lg text-muted-foreground mb-2">{t("app.noPermission")}</p>
          <p className="text-sm text-muted-foreground">{t("app.noPermissionHint")}</p>
        </div>
      )
    }
    switch (currentPage) {
      case "dashboard":
        return <Dashboard />
      case "calc":
        return <ProductTree />
      case "ingredients":
        return <Ingredients />
      case "menu":
        return <MenuCosts />
      case "inventory":
        return <Inventory />
      case "purchase-orders":
        return <PurchaseOrders />
      case "upload":
        return <Upload />
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
        return <Dashboard />
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {(!isSystemOwner || !!impersonatingRestaurant) && <DesktopNav 
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
      />
      
      {impersonatingRestaurant && (
        <div className="fixed top-0 md:top-16 left-0 right-0 z-40 flex items-center justify-center gap-3 py-2 bg-amber-500/90 text-amber-950 text-sm font-medium">
          <span>🎭 {t("nav.impersonating")}: {impersonatingRestaurant.name}</span>
          <Button size="sm" variant="secondary" className="h-7 px-3" onClick={handleStopImpersonate}>
            {t("nav.backToNormal")}
          </Button>
        </div>
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
        <main className={cn("pb-24 md:pb-8 pt-16 md:pt-16", impersonatingRestaurant && "pt-14 md:pt-28")}>
          <AnimatePresence mode="wait">
            <motion.div
              key={`${currentPage}-${effectiveRestaurantId || ""}`}
              variants={pageVariants}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              {renderPage()}
            </motion.div>
          </AnimatePresence>
        </main>
      </AppProvider>

      {/* Mobile Navigation */}
      {(!isSystemOwner || !!impersonatingRestaurant) && <MobileNav 
        currentPage={currentPage} 
        setCurrentPage={setCurrentPage}
        userRole={userRole}
        isSystemOwner={isSystemOwner}
        userPermissions={userPermissions}
        isImpersonating={!!impersonatingRestaurant}
      />}
    </div>
  )
}
