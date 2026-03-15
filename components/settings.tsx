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
  Phone,
  MapPin,
  Save,
  Loader2,
} from "lucide-react"
import { toast } from "sonner"
import { useTranslations } from "@/lib/use-translations"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Users, UserPlus, Ticket, Copy } from "lucide-react"

export function Settings() {
  const t = useTranslations()
  const { userRole, currentRestaurantId, refreshIngredients, isImpersonating, isSystemOwner, restaurants } = useApp()
  const [email, setEmail] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [userId, setUserId] = useState<string | null>(null)
  const [profileName, setProfileName] = useState("")
  const [profilePhone, setProfilePhone] = useState("")
  const [profileAddress, setProfileAddress] = useState("")
  const [savingProfile, setSavingProfile] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [usersData, setUsersData] = useState<{uid:string;email:string;role:string;restaurantId:string|null;restaurantName?:string}[]>([])
  const [usersLoaded, setUsersLoaded] = useState(false)
  const [loadingUsers2, setLoadingUsers2] = useState(false)
  const [assignTgt, setAssignTgt] = useState<{uid:string;email:string}|null>(null)
  const [assignTgtRestId, setAssignTgtRestId] = useState("")
  const [savingAssign2, setSavingAssign2] = useState(false)
  const [showCreate2, setShowCreate2] = useState(false)
  const [cEmail, setCEmail] = useState(""); const [cPass, setCPass] = useState("")
  const [cRole, setCRole] = useState<"manager"|"user">("user"); const [cRest, setCRest] = useState("")
  const [cErr, setCErr] = useState<string|null>(null); const [creating2, setCreating2] = useState(false)
  const [inv2, setInv2] = useState(""); const [invRole2, setInvRole2] = useState<"user"|"manager">("user"); const [inviting3, setInviting3] = useState(false)
  const [code2, setCode2] = useState<string|null>(null); const [genCode2, setGenCode2] = useState(false)
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
    const unsub = onAuthStateChanged(auth, async (user) => {
      setEmail(user?.email || "")
      setDisplayName(user?.displayName || "")
      setUserId(user?.uid || null)
      if (user?.uid) {
        try {
          const snap = await getDoc(doc(db, "users", user.uid))
          const d = snap.data()
          if (d) {
            setProfileName((d.name as string) || user.displayName || "")
            setProfilePhone((d.phone as string) || "")
            setProfileAddress((d.address as string) || "")
          }
        } catch {}
      }
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

  const saveProfile = async () => {
    if (!userId) return
    setSavingProfile(true)
    try {
      await setDoc(doc(db, "users", userId), {
        name: profileName.trim(),
        phone: profilePhone.trim(),
        address: profileAddress.trim(),
      }, { merge: true })
      toast.success("פרטי הפרופיל עודכנו בהצלחה")
    } catch (e) {
      toast.error((e as Error).message || "שגיאה בשמירה")
    } finally {
      setSavingProfile(false)
    }
  }

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

  // בהתחזות — הצג "מנהל" ולא "בעלים"
  const effectiveRole = (userRole === "owner" && isImpersonating) ? "manager" : userRole
  const roleLabel = effectiveRole === "owner" ? t("pages.settings.owner") : effectiveRole === "manager" ? t("pages.settings.manager") : effectiveRole === "user" ? t("pages.settings.user") : t("pages.settings.manager")

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

  const loadU = async()=>{setLoadingUsers2(true);try{const s=await getDocs(collection(db,"users"));const rs=restaurants||[];setUsersData(s.docs.map(d=>{const dt=d.data();const r=rs.find(x=>x.id===dt.restaurantId);return{uid:d.id,email:dt.email||"",role:dt.role||"user",restaurantId:dt.restaurantId||null,restaurantName:r?.name}}).filter(u=>u.role!=="owner"));setUsersLoaded(true)}catch{toast.error("שגיאה")}finally{setLoadingUsers2(false)}}
  const doCreate=async()=>{setCErr(null);if(!cEmail.trim()||!cPass.trim()){setCErr("נא למלא אימייל וסיסמה");return}if(cPass.length<6){setCErr("סיסמה קצרה");return}setCreating2(true);try{const{createUserWithEmailAndPassword}=await import("firebase/auth");const cr=await createUserWithEmailAndPassword(auth,cEmail.trim(),cPass);await setDoc(doc(db,"users",cr.user.uid),{email:cEmail.trim(),role:cRole,restaurantId:cRest||null});setUsersData(p=>[...p,{uid:cr.user.uid,email:cEmail.trim(),role:cRole,restaurantId:cRest||null,restaurantName:(restaurants||[]).find(r=>r.id===cRest)?.name}]);toast.success("נוצר");setCEmail("");setCPass("");setCRest("");setShowCreate2(false)}catch(e){const c=(e as{code?:string}).code;setCErr(c==="auth/email-already-in-use"?"אימייל בשימוש":(e as Error).message||"שגיאה")}finally{setCreating2(false)}}
  const doAssign=async()=>{if(!assignTgt)return;setSavingAssign2(true);try{await setDoc(doc(db,"users",assignTgt.uid),{restaurantId:assignTgtRestId||null},{merge:true});setUsersData(p=>p.map(u=>u.uid===assignTgt.uid?{...u,restaurantId:assignTgtRestId||null,restaurantName:(restaurants||[]).find(r=>r.id===assignTgtRestId)?.name}:u));toast.success("שויך");setAssignTgt(null)}catch{toast.error("שגיאה")}finally{setSavingAssign2(false)}}
  const doInvite=async()=>{if(!inv2.trim())return;setInviting3(true);try{await fetch("/api/invite",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:inv2.trim(),role:invRole2})});toast.success("נשלח");setInv2("")}catch{toast.error("שגיאה")}finally{setInviting3(false)}}
  const doCode=async()=>{setGenCode2(true);try{const c=Math.random().toString(36).slice(2,8).toUpperCase();await setDoc(doc(db,"inviteCodes",c),{createdAt:new Date().toISOString(),used:false,restaurantId:currentRestaurantId||null});setCode2(c);toast.success("קוד: "+c)}catch{toast.error("שגיאה")}finally{setGenCode2(false)}}

  return (
    <div className="container mx-auto px-4 py-6 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold mb-1">{t("pages.settings.title")}</h1>
        <p className="text-muted-foreground">{t("pages.settings.subtitle")}</p>
      </div>
      <Tabs defaultValue="settings">
        <TabsList className="mb-6">
          <TabsTrigger value="settings">הגדרות</TabsTrigger>
          {isSystemOwner && <TabsTrigger value="users" className="gap-1.5"><Users className="w-4 h-4"/>משתמשים</TabsTrigger>}
        </TabsList>
        <TabsContent value="settings">
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
            <div className="border-t pt-4 space-y-3">
              <p className="text-sm font-medium text-muted-foreground">פרטים נוספים</p>
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium flex items-center gap-1.5"><User className="w-3.5 h-3.5" />שם מלא</label>
                  <Input value={profileName} onChange={e => setProfileName(e.target.value)} placeholder="שם פרטי ומשפחה" className="h-10 rounded-xl" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" />טלפון</label>
                  <Input value={profilePhone} onChange={e => setProfilePhone(e.target.value)} placeholder="050-0000000" className="h-10 rounded-xl" dir="ltr" type="tel" />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-sm font-medium flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" />כתובת</label>
                  <Input value={profileAddress} onChange={e => setProfileAddress(e.target.value)} placeholder="רחוב, עיר" className="h-10 rounded-xl" />
                </div>
              </div>
              <Button onClick={saveProfile} disabled={savingProfile} size="sm" className="w-full sm:w-auto">
                {savingProfile ? <Loader2 className="w-4 h-4 animate-spin ml-2" /> : <Save className="w-4 h-4 ml-2" />}
                שמור פרטים
              </Button>
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
        {!isSystemOwner && (
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
        )}

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
        {!isSystemOwner && currentRestaurantId && (userRole === "owner" || userRole === "admin" || userRole === "manager") && (
        {!isSystemOwner && (
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
        </TabsContent>
        {isSystemOwner && (
        <TabsContent value="users" className="space-y-4">
          <div className="grid grid-cols-3 gap-3">{[{label:`סה"כ`,val:usersData.length},{label:"מנהלים",val:usersData.filter(u=>u.role==="manager").length},{label:"משתמשים",val:usersData.filter(u=>u.role==="user").length}].map((s,i)=>(<div key={i} className="bg-muted/50 rounded-lg p-3"><p className="text-xs text-muted-foreground mb-1">{s.label}</p><p className="text-2xl font-semibold">{usersLoaded?s.val:"—"}</p></div>))}</div>
          <div className="bg-card border rounded-xl overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b">
              <div className="flex items-center gap-2 font-semibold text-sm"><Users className="w-4 h-4 text-primary"/>כל המשתמשים</div>
              <div className="flex gap-2">
                <button onClick={loadU} disabled={loadingUsers2} className="text-xs px-3 py-1.5 rounded-md border hover:bg-muted flex items-center gap-1">{loadingUsers2?<Loader2 className="w-3 h-3 animate-spin"/>:"🔄"}{usersLoaded?"רענן":"טען"}</button>
                <button onClick={()=>setShowCreate2(v=>!v)} className="text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground flex items-center gap-1"><UserPlus className="w-3.5 h-3.5"/>צור משתמש</button>
              </div>
            </div>
            {showCreate2&&(<div className="p-4 bg-muted/40 border-b space-y-3"><p className="text-sm font-medium">יצירת משתמש</p><div className="grid grid-cols-2 gap-3"><div><label className="text-xs text-muted-foreground block mb-1">אימייל</label><Input type="email" dir="ltr" value={cEmail} onChange={e=>setCEmail(e.target.value)}/></div><div><label className="text-xs text-muted-foreground block mb-1">סיסמה</label><Input type="password" value={cPass} onChange={e=>setCPass(e.target.value)}/></div><div><label className="text-xs text-muted-foreground block mb-1">תפקיד</label><select className="w-full h-9 rounded-md border px-3 text-sm bg-background" value={cRole} onChange={e=>setCRole(e.target.value as "manager"|"user")}><option value="manager">מנהל</option><option value="user">משתמש</option></select></div><div><label className="text-xs text-muted-foreground block mb-1">מסעדה</label><select className="w-full h-9 rounded-md border px-3 text-sm bg-background" value={cRest} onChange={e=>setCRest(e.target.value)}><option value="">— ללא —</option>{(restaurants||[]).map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></div></div><div className="flex gap-2"><button onClick={doCreate} disabled={creating2} className="text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground flex items-center gap-1">{creating2?<Loader2 className="w-3 h-3 animate-spin"/>:<UserPlus className="w-3 h-3"/>}צור</button><button onClick={()=>setShowCreate2(false)} className="text-xs px-3 py-1.5 rounded-md border hover:bg-muted">ביטול</button></div>{cErr&&<p className="text-xs text-destructive">{cErr}</p>}</div>)}
            {!usersLoaded?<div className="text-center py-10 text-sm text-muted-foreground">לחץ "טען" לראות משתמשים</div>:usersData.length===0?<div className="text-center py-10 text-sm text-muted-foreground">אין משתמשים</div>:(
              <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-muted/50 border-b"><tr><th className="w-10 p-2"></th><th className="text-right p-2 text-xs font-medium text-muted-foreground">אימייל</th><th className="text-center p-2 text-xs font-medium text-muted-foreground">תפקיד</th><th className="text-right p-2 text-xs font-medium text-muted-foreground">מסעדה</th><th className="p-2 text-xs font-medium text-muted-foreground">פעולות</th></tr></thead>
              <tbody>{usersData.map(u=>{const i=(u.email||"?").slice(0,2).toUpperCase();const cs=[{bg:"#E6F1FB",c:"#0C447C"},{bg:"#EAF3DE",c:"#27500A"},{bg:"#FAEEDA",c:"#633806"},{bg:"#EEEDFE",c:"#3C3489"},{bg:"#E1F5EE",c:"#085041"}];const cl=cs[(u.email||"").charCodeAt(0)%5];return(
                <tr key={u.uid} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="p-2 pl-3"><div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium" style={{background:cl.bg,color:cl.c}}>{i}</div></td>
                  <td className="p-2"><div className="text-xs font-medium" dir="ltr">{u.email}</div></td>
                  <td className="p-2 text-center"><select className="text-xs rounded border px-1.5 py-0.5 bg-background" value={u.role} onChange={async e=>{const nr=e.target.value;try{await setDoc(doc(db,"users",u.uid),{role:nr},{merge:true});setUsersData(p=>p.map(x=>x.uid===u.uid?{...x,role:nr}:x));toast.success("עודכן")}catch{toast.error("שגיאה")}}}><option value="manager">מנהל</option><option value="user">משתמש</option></select></td>
                  <td className="p-2 text-xs text-muted-foreground">{u.restaurantName||(u.restaurantId?"—":"ללא")}</td>
                  <td className="p-2"><div className="flex gap-1"><button className="text-xs px-2 py-1 rounded border hover:bg-muted" onClick={()=>{setAssignTgt({uid:u.uid,email:u.email});setAssignTgtRestId(u.restaurantId||"")}}>שייך</button><button className="text-xs px-2 py-1 rounded border border-blue-200 text-blue-600 hover:bg-blue-50" onClick={async()=>{if(!u.email)return;try{await fetch("/api/invite",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:u.email,role:u.role})});toast.success("קוד נשלח")}catch{toast.error("שגיאה")}}}>שלח קוד</button></div></td>
                </tr>
              )})}</tbody></table></div>
            )}
            {assignTgt&&(<div className="m-4 p-3 rounded-lg border border-primary/30 bg-primary/5 space-y-2"><p className="text-sm font-medium">שיוך: <span dir="ltr" className="font-normal text-muted-foreground">{assignTgt.email}</span></p><div className="flex gap-2"><select className="flex-1 h-9 rounded-md border px-3 text-sm bg-background" value={assignTgtRestId} onChange={e=>setAssignTgtRestId(e.target.value)}><option value="">— ללא —</option>{(restaurants||[]).map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select><button onClick={doAssign} disabled={savingAssign2} className="px-3 py-1.5 text-xs rounded-md bg-primary text-primary-foreground">{savingAssign2?<Loader2 className="w-3 h-3 animate-spin"/>:"שמור"}</button><button onClick={()=>setAssignTgt(null)} className="px-3 py-1.5 text-xs rounded-md border hover:bg-muted">ביטול</button></div></div>)}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-card border rounded-xl p-4"><p className="text-sm font-semibold flex items-center gap-2 mb-3"><Ticket className="w-4 h-4"/>קוד הזמנה</p><div className="flex gap-2 items-center flex-wrap"><button onClick={doCode} disabled={genCode2} className="text-xs px-3 py-1.5 rounded-md border hover:bg-muted flex items-center gap-1">{genCode2?<Loader2 className="w-3 h-3 animate-spin"/>:<Copy className="w-3 h-3"/>}צור קוד</button>{code2&&(<div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted font-mono text-sm"><span>{code2}</span><button className="h-6 w-6 flex items-center justify-center hover:bg-background rounded" onClick={()=>{navigator.clipboard.writeText(code2!);toast.success("הועתק")}}><Copy className="w-3 h-3"/></button></div>)}</div></div>
            <div className="bg-card border rounded-xl p-4"><p className="text-sm font-semibold flex items-center gap-2 mb-3"><UserPlus className="w-4 h-4"/>הזמן לפי אימייל</p><div className="flex gap-2 flex-wrap"><Input type="email" placeholder="אימייל..." value={inv2} onChange={e=>setInv2(e.target.value)} className="flex-1 min-w-[140px]"/><select value={invRole2} onChange={e=>setInvRole2(e.target.value as "user"|"manager")} className="h-9 rounded-md border px-2 text-sm bg-background"><option value="user">משתמש</option><option value="manager">מנהל</option></select><button onClick={doInvite} disabled={inviting3} className="text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground flex items-center gap-1">{inviting3?<Loader2 className="w-3 h-3 animate-spin"/>:<UserPlus className="w-3 h-3"/>}שלח</button></div></div>
          </div>
        </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
