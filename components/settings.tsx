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

export function Settings() {
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
      toast.error("שגיאה בשמירה")
    } finally {
      setSavingNotification(null)
    }
  }

  const roleLabel = userRole === "owner" ? "בעלים" : userRole === "manager" ? "מנהל" : userRole === "user" ? "משתמש" : "מנהל"

  const handleChangePassword = async () => {
    if (!email) {
      toast.error("אין אימייל לשינוי סיסמה")
      return
    }
    try {
      await sendPasswordResetEmail(auth, email)
      toast.success("נשלח אימייל לאיפוס סיסמה. בדוק את תיבת הדואר.")
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "שגיאה בשליחת אימייל")
    }
  }

  const handleExportData = async () => {
    if (!currentRestaurantId) {
      toast.error("בחר מסעדה")
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
      toast.success("הנתונים יוצאו בהצלחה")
    } catch (e) {
      console.error(e)
      toast.error("שגיאה בייצוא נתונים")
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
      toast.success("הנתונים יובאו בהצלחה")
      refreshIngredients?.()
    } catch (err) {
      console.error(err)
      toast.error("שגיאה בייבוא — ודא שזה קובץ גיבוי תקין")
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
      toast.success("כל הנתונים נמחקו")
      setDeleteDialogOpen(false)
    } catch (err) {
      console.error(err)
      toast.error("שגיאה במחיקה")
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="container mx-auto px-4 py-6 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-bold mb-1">הגדרות</h1>
        <p className="text-muted-foreground">ניהול החשבון והמערכת</p>
      </div>

      <div className="space-y-6">
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <User className="w-5 h-5 text-muted-foreground" />
              פרטי משתמש
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-2xl">
                👨‍🍳
              </div>
              <div>
                <p className="font-semibold">{displayName || email || "משתמש"}</p>
                <p className="text-sm text-muted-foreground">{roleLabel}</p>
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-4 pt-4">
              <div className="space-y-2">
                <label htmlFor="settings-email" className="text-sm font-medium">אימייל</label>
                <Input id="settings-email" value={email} readOnly className="h-11 rounded-xl bg-muted" dir="ltr" />
              </div>
              <div className="space-y-2">
                <label htmlFor="settings-role" className="text-sm font-medium">תפקיד</label>
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
              הגדרות מסעדה
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">הגדרות מסעדה ניהוליות — ערוך בפאנל מנהל.</p>
          </CardContent>
        </Card>
        )}

        {/* Notifications */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <Bell className="w-5 h-5 text-muted-foreground" />
              התראות
            </CardTitle>
            <p className="text-sm text-muted-foreground font-normal">
              {currentRestaurantId ? "ההגדרות נשמרות לפי מסעדה" : "ההגדרות נשמרות לפי משתמש"}
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {loadingNotifications ? (
              <p className="text-sm text-muted-foreground py-4">טוען הגדרות...</p>
            ) : (
              <>
                <label htmlFor="settings-notify-low-stock" className="flex items-center justify-between cursor-pointer">
                  <div>
                    <p className="font-medium">התראות מלאי נמוך</p>
                    <p className="text-sm text-muted-foreground">קבל התראה כשמוצר יורד מתחת לסף</p>
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
                    <p className="font-medium">סיכום יומי</p>
                    <p className="text-sm text-muted-foreground">קבל דוח יומי במייל</p>
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
                    <p className="font-medium">התראות ספקים</p>
                    <p className="text-sm text-muted-foreground">עדכונים על הזמנות ומשלוחים</p>
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
                    <p className="font-medium">דוח שבועי</p>
                    <p className="text-sm text-muted-foreground">סיכום ביצועים שבועי</p>
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
              אבטחה
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button variant="outline" className="w-full justify-between h-12 rounded-xl" onClick={handleChangePassword}>
              <span>שינוי סיסמה</span>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              className="w-full justify-between h-12 rounded-xl"
              onClick={() => toast.info("אימות דו-שלבי יהיה זמין בגרסה הבאה")}
            >
              <span>אימות דו-שלבי</span>
              <Badge variant="secondary">לא פעיל</Badge>
            </Button>
            <Button
              variant="outline"
              className="w-full justify-between h-12 rounded-xl"
              onClick={() => toast.info("היסטוריית התחברויות תהיה זמינה בגרסה הבאה")}
            >
              <span>היסטוריית התחברויות</span>
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
              ניהול נתונים
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
                {exporting ? "מייצא..." : "ייצוא נתונים"}
              </Button>
              <Button
                variant="outline"
                className="h-12 rounded-xl gap-2"
                onClick={() => importInputRef.current?.click()}
                disabled={!currentRestaurantId || importing}
              >
                <Upload className="w-4 h-4" />
                {importing ? "מייבא..." : "ייבוא נתונים"}
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
              מחיקת כל הנתונים
            </Button>
            <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
              <AlertDialogContent>
                <AlertDialogTitle>מחיקת כל הנתונים</AlertDialogTitle>
                <AlertDialogDescription>
                  פעולה זו תמחק את כל המתכונים והרכיבים של המסעדה. לא ניתן לשחזר. להמשיך?
                </AlertDialogDescription>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={deleting}>ביטול</AlertDialogCancel>
                  <Button
                    variant="destructive"
                    onClick={async () => {
                      await handleDeleteAllData()
                    }}
                    disabled={deleting}
                  >
                    {deleting ? "מוחק..." : "מחק הכל"}
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
              <p>גרסה 2.0.0</p>
              <p className="mt-2">© 2026 Restaurant Pro. כל הזכויות שמורות.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
