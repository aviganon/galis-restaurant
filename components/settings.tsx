"use client"

import { useState, useEffect, useRef } from "react"
import { onAuthStateChanged, sendPasswordResetEmail } from "firebase/auth"
import { collection, getDocs, getDoc, writeBatch, doc, deleteDoc, setDoc } from "firebase/firestore"
import { auth, db } from "@/lib/firebase"
import { useApp } from "@/contexts/app-context"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  User,
  Building2,
  Bell,
  Lock,
  Database,
  Download,
  Upload,
  Trash2,
  ChevronLeft,
} from "lucide-react"
import { toast } from "sonner"
import { useTranslations } from "@/lib/use-translations"

export function Settings() {
  const t = useTranslations()
  const { userRole, currentRestaurantId, refreshIngredients } = useApp()
  const [email, setEmail] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [userId, setUserId] = useState<string | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)

  const [notifyLowStock, setNotifyLowStock] = useState(true)
  const [dailySummary, setDailySummary] = useState(true)
  const [supplierAlerts, setSupplierAlerts] = useState(false)
  const [weeklyReport, setWeeklyReport] = useState(true)
  const [loadingNotifications, setLoadingNotifications] = useState(true)
  const [savingNotification, setSavingNotification] = useState<string | null>(null)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setEmail(user?.email || "")
      setDisplayName(user?.displayName || "")
      setUserId(user?.uid || null)
    })
    return () => unsub()
  }, [])

  const getNotificationSettingsPath = () =>
    currentRestaurantId
      ? doc(db, "restaurants", currentRestaurantId, "appState", "notificationSettings")
      : userId
        ? doc(db, "users", userId)
        : null

  useEffect(() => {
    const path = currentRestaurantId
      ? doc(db, "restaurants", currentRestaurantId, "appState", "notificationSettings")
      : userId
        ? doc(db, "users", userId)
        : null
    if (!path) {
      setLoadingNotifications(false)
      return
    }
    setLoadingNotifications(true)
    getDoc(path)
      .then((snap) => {
        const d = snap.data()
        if (d?.notificationSettings) {
          const s = d.notificationSettings as Record<string, boolean>
          setNotifyLowStock(s.notifyLowStock ?? true)
          setDailySummary(s.dailySummary ?? true)
          setSupplierAlerts(s.supplierAlerts ?? false)
          setWeeklyReport(s.weeklyReport ?? true)
        }
      })
      .catch(() => {})
      .finally(() => setLoadingNotifications(false))
  }, [currentRestaurantId, userId])

  const saveNotificationSetting = async (key: string, value: boolean) => {
    const path = getNotificationSettingsPath()
    if (!path) return
    setSavingNotification(key)
    try {
      const snap = await getDoc(path)
      const current = snap.data()?.notificationSettings as Record<string, boolean> | undefined
      const next = { ...current, [key]: value }
      await setDoc(path, { notificationSettings: next }, { merge: true })
    } catch (e) {
      toast.error(t("pages.settings.saveError"))
    } finally {
      setSavingNotification(null)
    }
  }

  const roleLabel = userRole === "owner" ? t("pages.settings.owner") : userRole === "manager" ? t("pages.settings.manager") : userRole === "user" ? t("pages.settings.user") : t("pages.settings.manager")

  const handleChangePassword = async () => {
    if (!email) {
      toast.error(t("pages.settings.noEmailForReset"))
      return
    }
    try {
      await sendPasswordResetEmail(auth, email)
      toast.success(t("pages.settings.resetEmailSent"))
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t("authErrors.resetError"))
    }
  }

  const handleExportData = async () => {
    if (!currentRestaurantId) {
      toast.error(t("pages.settings.selectRestaurant"))
      return
    }
    setExporting(true)
    try {
      const [recipesSnap, ingredientsSnap] = await Promise.all([
        getDocs(collection(db, "restaurants", currentRestaurantId, "recipes")),
        getDocs(collection(db, "restaurants", currentRestaurantId, "ingredients")),
      ])
      const data = {
        exportedAt: new Date().toISOString(),
        restaurantId: currentRestaurantId,
        recipes: recipesSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
        ingredients: ingredientsSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
      }
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `גיבוי_${currentRestaurantId}_${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
      toast.success(t("pages.settings.exportSuccess"))
    } catch (e) {
      console.error(e)
      toast.error(t("pages.settings.exportError"))
    } finally {
      setExporting(false)
    }
  }

  const handleImportData = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !currentRestaurantId) return
    setImporting(true)
    try {
      const text = await file.text()
      const data = JSON.parse(text) as { recipes?: { id: string; [k: string]: unknown }[]; ingredients?: { id: string; [k: string]: unknown }[] }
      const ops: { col: "recipes" | "ingredients"; id: string; data: Record<string, unknown> }[] = []
      if (Array.isArray(data.recipes)) {
        for (const r of data.recipes) {
          const { id, ...rest } = r
          if (id) ops.push({ col: "recipes", id, data: rest })
        }
      }
      if (Array.isArray(data.ingredients)) {
        for (const i of data.ingredients) {
          const { id, ...rest } = i
          if (id) ops.push({ col: "ingredients", id, data: rest })
        }
      }
      const BATCH_SIZE = 500
      for (let i = 0; i < ops.length; i += BATCH_SIZE) {
        const chunk = ops.slice(i, i + BATCH_SIZE)
        const batch = writeBatch(db)
        chunk.forEach(({ col, id, data: d }) => batch.set(doc(db, "restaurants", currentRestaurantId, col, id), d))
        await batch.commit()
      }
      toast.success(t("pages.settings.importSuccess"))
      refreshIngredients?.()
    } catch (err) {
      console.error(err)
      toast.error(t("pages.settings.importError"))
    } finally {
      setImporting(false)
      e.target.value = ""
    }
  }

  const handleDeleteAllData = async () => {
    if (!currentRestaurantId) return
    setDeleting(true)
    try {
      const [recipesSnap, ingredientsSnap] = await Promise.all([
        getDocs(collection(db, "restaurants", currentRestaurantId, "recipes")),
        getDocs(collection(db, "restaurants", currentRestaurantId, "ingredients")),
      ])
      const BATCH_SIZE = 500
      const allDeletes: { col: "recipes" | "ingredients"; id: string }[] = [
        ...recipesSnap.docs.map((d) => ({ col: "recipes" as const, id: d.id })),
        ...ingredientsSnap.docs.map((d) => ({ col: "ingredients" as const, id: d.id })),
      ]
      for (let i = 0; i < allDeletes.length; i += BATCH_SIZE) {
        const chunk = allDeletes.slice(i, i + BATCH_SIZE)
        const batch = writeBatch(db)
        chunk.forEach(({ col, id }) => batch.delete(doc(db, "restaurants", currentRestaurantId, col, id)))
        await batch.commit()
      }
      toast.success(t("pages.settings.deleteSuccess"))
      setDeleteDialogOpen(false)
    } catch (err) {
      console.error(err)
      toast.error(t("pages.settings.deleteError"))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="container mx-auto px-4 py-6 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-bold mb-1">{t("pages.settings.title")}</h1>
        <p className="text-muted-foreground">{t("pages.settings.subtitle")}</p>
      </div>

      <div className="space-y-6">
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <User className="w-5 h-5 text-muted-foreground" />
              {t("pages.settings.userDetails")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-2xl">
                👨‍🍳
              </div>
              <div>
                <p className="font-semibold">{displayName || email || t("pages.settings.user")}</p>
                <p className="text-sm text-muted-foreground">{roleLabel}</p>
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-4 pt-4">
              <div className="space-y-2">
                <label htmlFor="settings-email" className="text-sm font-medium">{t("pages.settings.email")}</label>
                <Input id="settings-email" value={email} readOnly className="h-11 rounded-xl bg-muted" dir="ltr" />
              </div>
              <div className="space-y-2">
                <label htmlFor="settings-role" className="text-sm font-medium">{t("pages.settings.role")}</label>
                <Input id="settings-role" value={roleLabel} readOnly className="h-11 rounded-xl bg-muted" />
              </div>
            </div>
          </CardContent>
        </Card>

        {currentRestaurantId && (
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <Building2 className="w-5 h-5 text-muted-foreground" />
              {t("pages.settings.restaurantSettings")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">{t("pages.settings.restaurantSettingsHint")}</p>
          </CardContent>
        </Card>
        )}

        {/* Notifications */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <Bell className="w-5 h-5 text-muted-foreground" />
              {t("pages.settings.notifications")}
            </CardTitle>
            <p className="text-sm text-muted-foreground font-normal">
              {currentRestaurantId ? t("pages.settings.savedPerRestaurant") : t("pages.settings.savedPerUser")}
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {loadingNotifications ? (
              <p className="text-sm text-muted-foreground py-4">{t("pages.settings.loadingSettings")}</p>
            ) : (
              <>
                <label htmlFor="settings-notify-low-stock" className="flex items-center justify-between cursor-pointer">
                  <div>
                    <p className="font-medium">{t("pages.settings.lowStockAlert")}</p>
                    <p className="text-sm text-muted-foreground">{t("pages.settings.lowStockAlertDesc")}</p>
                  </div>
                  <Switch
                    id="settings-notify-low-stock"
                    checked={notifyLowStock}
                    onCheckedChange={(v) => {
                      setNotifyLowStock(!!v)
                      saveNotificationSetting("notifyLowStock", !!v)
                    }}
                    disabled={!!savingNotification}
                  />
                </label>
                <label htmlFor="settings-daily-summary" className="flex items-center justify-between cursor-pointer">
                  <div>
                    <p className="font-medium">{t("pages.settings.dailySummary")}</p>
                    <p className="text-sm text-muted-foreground">{t("pages.settings.dailySummaryDesc")}</p>
                  </div>
                  <Switch
                    id="settings-daily-summary"
                    checked={dailySummary}
                    onCheckedChange={(v) => {
                      setDailySummary(!!v)
                      saveNotificationSetting("dailySummary", !!v)
                    }}
                    disabled={!!savingNotification}
                  />
                </label>
                <label htmlFor="settings-supplier-alerts" className="flex items-center justify-between cursor-pointer">
                  <div>
                    <p className="font-medium">{t("pages.settings.supplierAlerts")}</p>
                    <p className="text-sm text-muted-foreground">{t("pages.settings.supplierAlertsDesc")}</p>
                  </div>
                  <Switch
                    id="settings-supplier-alerts"
                    checked={supplierAlerts}
                    onCheckedChange={(v) => {
                      setSupplierAlerts(!!v)
                      saveNotificationSetting("supplierAlerts", !!v)
                    }}
                    disabled={!!savingNotification}
                  />
                </label>
                <label htmlFor="settings-weekly-report" className="flex items-center justify-between cursor-pointer">
                  <div>
                    <p className="font-medium">{t("pages.settings.weeklyReport")}</p>
                    <p className="text-sm text-muted-foreground">{t("pages.settings.weeklyReportDesc")}</p>
                  </div>
                  <Switch
                    id="settings-weekly-report"
                    checked={weeklyReport}
                    onCheckedChange={(v) => {
                      setWeeklyReport(!!v)
                      saveNotificationSetting("weeklyReport", !!v)
                    }}
                    disabled={!!savingNotification}
                  />
                </label>
              </>
            )}
          </CardContent>
        </Card>

        {/* Security */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <Lock className="w-5 h-5 text-muted-foreground" />
              {t("pages.settings.security")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button variant="outline" className="w-full justify-between h-12 rounded-xl" onClick={handleChangePassword}>
              <span>{t("pages.settings.changePassword")}</span>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              className="w-full justify-between h-12 rounded-xl"
              onClick={() => toast.info("אימות דו-שלבי יהיה זמין בגרסה הבאה")}
            >
              <span>{t("pages.settings.twoFactor")}</span>
              <Badge variant="secondary">{t("pages.settings.twoFactorInactive")}</Badge>
            </Button>
            <Button
              variant="outline"
              className="w-full justify-between h-12 rounded-xl"
              onClick={() => toast.info("היסטוריית התחברויות תהיה זמינה בגרסה הבאה")}
            >
              <span>{t("pages.settings.loginHistory")}</span>
              <ChevronLeft className="w-4 h-4" />
            </Button>
          </CardContent>
        </Card>

        {/* Data Management - only for owner/manager, when restaurant selected */}
        {currentRestaurantId && (userRole === "owner" || userRole === "admin" || userRole === "manager") && (
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <Database className="w-5 h-5 text-muted-foreground" />
              {t("pages.settings.dataManagement")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <Button
                variant="outline"
                className="h-12 rounded-xl gap-2"
                onClick={handleExportData}
                disabled={!currentRestaurantId || exporting}
              >
                <Download className="w-4 h-4" />
                {exporting ? t("pages.settings.exporting") : t("pages.settings.exportData")}
              </Button>
              <Button
                variant="outline"
                className="h-12 rounded-xl gap-2"
                onClick={() => importInputRef.current?.click()}
                disabled={!currentRestaurantId || importing}
              >
                <Upload className="w-4 h-4" />
                {importing ? t("pages.settings.importing") : t("pages.settings.importData")}
              </Button>
              <input
                ref={importInputRef}
                type="file"
                accept=".json"
                className="hidden"
                onChange={handleImportData}
              />
            </div>
            <Button
              variant="outline"
              className="w-full h-12 rounded-xl gap-2 text-destructive hover:text-destructive"
              onClick={() => setDeleteDialogOpen(true)}
              disabled={!currentRestaurantId || deleting}
            >
              <Trash2 className="w-4 h-4" />
              {t("pages.settings.deleteAllData")}
            </Button>
            <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
              <AlertDialogContent>
                <AlertDialogTitle>{t("pages.settings.deleteAllData")}</AlertDialogTitle>
                <AlertDialogDescription>
                  {t("pages.settings.deleteAllConfirm")}
                </AlertDialogDescription>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={deleting}>{t("pages.settings.cancel")}</AlertDialogCancel>
                  <Button
                    variant="destructive"
                    onClick={async () => {
                      await handleDeleteAllData()
                    }}
                    disabled={deleting}
                  >
                    {deleting ? t("pages.settings.deleting") : t("pages.settings.deleteAll")}
                  </Button>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>
        )}

        {/* App Info */}
        <Card className="border-0 shadow-sm">
          <CardContent className="p-6">
            <div className="text-center text-sm text-muted-foreground">
              <p className="font-medium text-foreground mb-1">Restaurant Pro</p>
              <p>{t("pages.settings.version")}</p>
              <p className="mt-2">{t("login.footerRights")}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
