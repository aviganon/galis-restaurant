"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { onAuthStateChanged } from "firebase/auth"
import { collection, getDocs, getDoc, writeBatch, doc, deleteDoc, setDoc } from "firebase/firestore"
import { auth, db, getAuthForUserCreation } from "@/lib/firebase"
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
  ChevronRight,
  Phone,
  MapPin,
  Save,
  Loader2,
  Key,
  KeyRound,
  Mail,
} from "lucide-react"
import { toast } from "sonner"
import { useTranslations } from "@/lib/use-translations"
import { cn } from "@/lib/utils"
import { InboundEmailSettings } from "@/components/inbound-email-settings"
import { SystemOwnerDirectory } from "@/components/system-owner-directory"
import { SystemOwnerUserTabBulkSection, SystemOwnerUserTabToolbar } from "@/components/system-owner-users-management"
import { postInviteEmail } from "@/lib/invite-email"
import { createUniqueInviteCode } from "@/lib/invite-code-document"
import { useLanguage } from "@/contexts/language-context"
import { sendPasswordResetReliable } from "@/lib/password-reset-client"

export function Settings() {
  const t = useTranslations()
  const { dir, locale } = useLanguage()
  /** טאבים של בעל מערכת בעברית — כשממשק האפליקציה באנגלית עדיין RTL */
  const systemOwnerPanelDir: "rtl" | "ltr" = locale === "en" ? "rtl" : dir
  const { userRole, currentRestaurantId, refreshIngredients, refreshRestaurants, isImpersonating, isSystemOwner, restaurants, setCurrentPage } = useApp()

  const [email, setEmail] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [userId, setUserId] = useState<string | null>(null)
  const [profileName, setProfileName] = useState("")
  const [profilePhone, setProfilePhone] = useState("")
  const [profileAddress, setProfileAddress] = useState("")
  const [savingProfile, setSavingProfile] = useState(false)
  const [sendingPasswordReset, setSendingPasswordReset] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<{
    uid: string
    email: string
    role: string
    restaurantId: string | null
    isSystemOwner?: boolean
  } | null>(null)
  const [editUserName, setEditUserName] = useState("")
  const [editUserPhone, setEditUserPhone] = useState("")
  const [editUserAddress, setEditUserAddress] = useState("")
  const [editUserNotes, setEditUserNotes] = useState("")
  const [loadingEditProfile, setLoadingEditProfile] = useState(false)
  const [editUserRole, setEditUserRole] = useState<"manager"|"user">("user")
  const [editUserRestId, setEditUserRestId] = useState("")
  const [savingEditUser, setSavingEditUser] = useState(false)
  const [apiKeyInput, setApiKeyInput] = useState("")
  const [savingApiKey, setSavingApiKey] = useState(false)
  const [apiKeySaved, setApiKeySaved] = useState(false)
  const [usersData, setUsersData] = useState<
    {
      uid: string
      email: string
      role: string
      restaurantId: string | null
      restaurantName?: string
      isSystemOwner?: boolean
    }[]
  >([])
  const [usersLoaded, setUsersLoaded] = useState(false)
  const [loadingUsers2, setLoadingUsers2] = useState(false)
  const [assignTgt, setAssignTgt] = useState<{uid:string;email:string}|null>(null)
  const [assignTgtRestId, setAssignTgtRestId] = useState("")
  const [savingAssign2, setSavingAssign2] = useState(false)
  const [showCreate2, setShowCreate2] = useState(false)
  const [showRestaurantInvitePanel, setShowRestaurantInvitePanel] = useState(false)
  const [restaurantInviteCode, setRestaurantInviteCode] = useState<string | null>(null)
  const [generatingRestaurantInviteCode, setGeneratingRestaurantInviteCode] = useState(false)
  const [cEmail, setCEmail] = useState(""); const [cPass, setCPass] = useState("")
  const [cRole, setCRole] = useState<"manager"|"user">("user"); const [cRest, setCRest] = useState("")
  const [cName, setCName] = useState(""); const [cPhone, setCPhone] = useState("")
  const [cAddress, setCAddress] = useState(""); const [cNotes, setCNotes] = useState("")
  const [cErr, setCErr] = useState<string|null>(null); const [creating2, setCreating2] = useState(false)
  /** מסעדה עבור ייבוא ממייל בטאב משתמשים (בעל מערכת) */
  const [inboundEmailRestId, setInboundEmailRestId] = useState<string | null>(null)
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

  /** בהתחזות של בעל מערכת — אותה תצוגת הגדרות כמו למנהל מסעדה (כרטיסים, תפקיד מוצג, בלי מפתח מערכת) */
  const settingsViewRole =
    isImpersonating && isSystemOwner ? "manager" : userRole
  const roleLabel =
    settingsViewRole === "owner"
      ? t("pages.settings.owner")
      : settingsViewRole === "manager"
        ? t("pages.settings.manager")
        : settingsViewRole === "user"
          ? t("pages.settings.user")
          : t("pages.settings.manager")

  const handleChangePassword = async () => {
    const targetEmail = email || auth.currentUser?.email
    if (!targetEmail) {
      toast.error(t("pages.settings.noEmailForReset"))
      return
    }
    setSendingPasswordReset(true)
    try {
      const r = await sendPasswordResetReliable(targetEmail)
      if (r.ok) {
        toast.success(
          r.via === "resend" ? t("pages.settings.passwordResetSentResend") : t("pages.settings.passwordResetSentFirebase"),
        )
      } else {
        toast.error(r.error)
      }
    } finally {
      setSendingPasswordReset(false)
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
      toast.error(t("pages.settings.deleteError"))
    } finally {
      setDeleting(false)
    }
  }

  const openEditUser = async (u: {
    uid: string
    email: string
    role: string
    restaurantId: string | null
    isSystemOwner?: boolean
  }) => {
    setEditingUser(u); setEditUserRole(u.role as "manager"|"user"); setEditUserRestId(u.restaurantId||"")
    setEditUserName(""); setEditUserPhone(""); setEditUserAddress(""); setEditUserNotes("")
    setLoadingEditProfile(true)
    try { const snap=await getDoc(doc(db,"users",u.uid)); if(snap.exists()){const d=snap.data();setEditUserName(d.name||"");setEditUserPhone(d.phone||"");setEditUserAddress(d.address||"");setEditUserNotes(d.notes||"")} }
    catch{} finally{setLoadingEditProfile(false)}
  }
  const saveEditUser = async () => {
    if (!editingUser) return; setSavingEditUser(true)
    try {
      await setDoc(doc(db,"users",editingUser.uid),{role:editUserRole,restaurantId:editUserRestId||null,name:editUserName.trim()||null,phone:editUserPhone.trim()||null,address:editUserAddress.trim()||null,notes:editUserNotes.trim()||null,updatedAt:new Date().toISOString()},{merge:true})
      setUsersData(p=>p.map(u=>u.uid===editingUser.uid?{...u,role:editUserRole,restaurantId:editUserRestId||null,restaurantName:(restaurants||[]).find(r=>r.id===editUserRestId)?.name}:u))
      toast.success("משתמש עודכן"); setEditingUser(null)
    }
    catch { toast.error("שגיאה") } finally { setSavingEditUser(false) }
  }

  const [deleteUserDialogOpen, setDeleteUserDialogOpen] = useState(false)
  const [deletingUserDoc, setDeletingUserDoc] = useState(false)

  const confirmDeleteUser = async () => {
    if (!editingUser) return
    if (editingUser.uid === auth.currentUser?.uid) {
      toast.error("לא ניתן למחוק את המשתמש המחובר")
      return
    }
    setDeletingUserDoc(true)
    try {
      await deleteDoc(doc(db, "users", editingUser.uid))
      setUsersData((p) => p.filter((u) => u.uid !== editingUser.uid))
      toast.success("משתמש נמחק מהמערכת")
      setDeleteUserDialogOpen(false)
      setEditingUser(null)
    } catch (e) {
      toast.error((e as Error).message || "שגיאה במחיקה")
    } finally {
      setDeletingUserDoc(false)
    }
  }

  useEffect(() => {
    if (!isSystemOwner) return
    getDoc(doc(db,"appConfig","claudeApi")).then(snap=>{if(snap.exists())setApiKeyInput(snap.data().key||"")}).catch(()=>{})
  }, [isSystemOwner])

  const saveApiKey = async () => {
    if (!apiKeyInput.trim()) return
    setSavingApiKey(true)
    try {
      await setDoc(doc(db,"appConfig","claudeApi"),{key:apiKeyInput.trim(),updatedAt:new Date().toISOString()},{merge:true})
      setApiKeySaved(true); setTimeout(()=>setApiKeySaved(false),3000)
    } catch { toast.error("שגיאה") } finally { setSavingApiKey(false) }
  }

  /** תמיד עדכני — מונע loadU עם restaurants ריק אחרי רינדור ראשון (מרוצים / לחיצות בהגדרות) */
  const restaurantsRef = useRef(restaurants)
  restaurantsRef.current = restaurants

  const loadU = useCallback(async () => {
    setLoadingUsers2(true)
    try {
      const s = await getDocs(collection(db, "users"))
      const rs = restaurantsRef.current || []
      setUsersData(
        s.docs
          .map((d) => {
            const dt = d.data()
            const r = rs.find((x) => x.id === dt.restaurantId)
            return {
              uid: d.id,
              email: dt.email || "",
              role: dt.role || "user",
              restaurantId: dt.restaurantId || null,
              restaurantName: r?.name,
              isSystemOwner: dt.isSystemOwner === true,
            }
          })
          .filter((u) => u.role !== "owner"),
      )
      setUsersLoaded(true)
    } catch {
      toast.error("שגיאה")
    } finally {
      setLoadingUsers2(false)
    }
  }, [])

  useEffect(() => {
    if (isSystemOwner && !isImpersonating) void loadU()
  }, [isSystemOwner, isImpersonating, loadU])

  /** כשמאזין המסעדות ב־page ממלא רשימה אחרי loadU ראשון — מעדכן שמות מסעדה בשורות משתמש בלי לרענן הכל */
  useEffect(() => {
    if (!isSystemOwner || isImpersonating) return
    const list = restaurants || []
    if (list.length === 0) return
    setUsersData((prev) => {
      if (prev.length === 0) return prev
      let changed = false
      const next = prev.map((u) => {
        if (!u.restaurantId) return u
        const name = list.find((r) => r.id === u.restaurantId)?.name
        if (name === u.restaurantName) return u
        changed = true
        return { ...u, restaurantName: name }
      })
      return changed ? next : prev
    })
  }, [restaurants, isSystemOwner, isImpersonating])

  useEffect(() => {
    if (!isSystemOwner || isImpersonating) return
    const list = restaurants || []
    if (list.length === 0) {
      setInboundEmailRestId(null)
      return
    }
    setInboundEmailRestId((prev) => {
      if (prev && list.some((r) => r.id === prev)) return prev
      const fromBar = currentRestaurantId && list.some((r) => r.id === currentRestaurantId) ? currentRestaurantId : null
      return fromBar || list[0].id
    })
  }, [isSystemOwner, isImpersonating, restaurants, currentRestaurantId])
  const doCreate = async () => {
    setCErr(null)
    if (!cEmail.trim() || !cPass.trim()) {
      setCErr("נא למלא אימייל וסיסמה")
      return
    }
    if (cPass.length < 6) {
      setCErr("סיסמה קצרה")
      return
    }
    setCreating2(true)
    try {
      const { createUserWithEmailAndPassword, signOut } = await import("firebase/auth")
      const sec = getAuthForUserCreation()
      const cr = await createUserWithEmailAndPassword(sec, cEmail.trim(), cPass)
      await setDoc(doc(db, "users", cr.user.uid), {
        email: cEmail.trim(),
        role: cRole,
        restaurantId: cRest || null,
        name: cName.trim() || null,
        phone: cPhone.trim() || null,
        address: cAddress.trim() || null,
        notes: cNotes.trim() || null,
        createdAt: new Date().toISOString(),
      })
      try {
        await signOut(sec)
      } catch {
        /* */
      }
      setUsersData((p) => [
        ...p,
        {
          uid: cr.user.uid,
          email: cEmail.trim(),
          role: cRole,
          restaurantId: cRest || null,
          restaurantName: (restaurants || []).find((r) => r.id === cRest)?.name,
        },
      ])
      const restName = cRest ? (restaurants || []).find((r) => r.id === cRest)?.name : null
      let inviteCode: string | undefined
      try {
        inviteCode = await createUniqueInviteCode({
          restaurantId: cRest || null,
          role: cRole,
        })
      } catch {
        toast.warning("לא נוצר קוד הזמנה — המייל יישלח בלי קוד")
      }
      try {
        await postInviteEmail({
          email: cEmail.trim(),
          restaurantName: restName,
          role: cRole,
          accountCreated: true,
          inviteCode: inviteCode ?? null,
        })
        toast.success(
          inviteCode
            ? "המשתמש נוצר — נשלח מייל עם פרטי התחברות וקוד הזמנה"
            : "המשתמש נוצר — נשלח מייל עם הוראות התחברות",
        )
      } catch (inviteErr) {
        toast.success("המשתמש נוצר במערכת")
        toast.warning(
          `שליחת מייל ההזמנה נכשלה: ${(inviteErr as Error).message || "בדוק RESEND_API_KEY"}`,
        )
      }
      setCEmail("")
      setCPass("")
      setCRest("")
      setCName("")
      setCPhone("")
      setCAddress("")
      setCNotes("")
      setShowCreate2(false)
    } catch (e) {
      const c = (e as { code?: string }).code
      setCErr(c === "auth/email-already-in-use" ? "אימייל בשימוש" : (e as Error).message || "שגיאה")
    } finally {
      setCreating2(false)
    }
  }

  /** קוד מנהל ללא מסעדה — המזמין נרשם במסך הכניסה ומקים מסעדה חדשה */
  const handleGenerateRestaurantInviteCode = async () => {
    setGeneratingRestaurantInviteCode(true)
    try {
      const code = await createUniqueInviteCode({ restaurantId: null, role: "manager" })
      setRestaurantInviteCode(code)
      setShowRestaurantInvitePanel(true)
      toast.success(t("pages.settings.restaurantInviteCodeSuccess"))
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setGeneratingRestaurantInviteCode(false)
    }
  }

  const doAssign = async () => {
    if (!assignTgt) return
    setSavingAssign2(true)
    try {
      const rid = assignTgtRestId?.trim() || null
      const row = usersData.find((u) => u.uid === assignTgt.uid)
      const updates: Record<string, unknown> = { restaurantId: rid }
      /** הסרת שיוך: נשאר role=manager מבלבל — לבעל מערכת מאפסים ל-user (ההרשאה האמיתית מ-isSystemOwner) */
      if (!rid && row?.isSystemOwner) updates.role = "user"
      await setDoc(doc(db, "users", assignTgt.uid), updates, { merge: true })
      setUsersData((p) =>
        p.map((u) => {
          if (u.uid !== assignTgt.uid) return u
          const nextRole = !rid && u.isSystemOwner ? "user" : u.role
          return {
            ...u,
            restaurantId: rid,
            restaurantName: rid ? (restaurants || []).find((r) => r.id === rid)?.name : undefined,
            role: nextRole,
          }
        }),
      )
      toast.success("שויך")
      setAssignTgt(null)
    } catch {
      toast.error("שגיאה")
    } finally {
      setSavingAssign2(false)
    }
  }

  const goBackFromSettings = () => {
    setCurrentPage?.(isSystemOwner && !isImpersonating ? "admin-panel" : "calc")
  }

  const BackChevron = dir === "rtl" ? ChevronRight : ChevronLeft

  return (
    <div
      dir={dir}
      className={cn(
        "container mx-auto px-4 pb-6 text-start",
        isSystemOwner && !isImpersonating ? "max-w-6xl pt-2" : "max-w-4xl pt-3",
      )}
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3 gap-y-2">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl md:text-3xl font-bold leading-tight">
            {isSystemOwner && !isImpersonating ? t("pages.settings.systemOwnerPageTitle") : t("pages.settings.title")}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {isSystemOwner && !isImpersonating ? t("pages.settings.systemOwnerPageSubtitle") : t("pages.settings.subtitle")}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0 gap-1.5"
          onClick={goBackFromSettings}
        >
          <BackChevron className="w-4 h-4" />
          חזור
        </Button>
      </div>
      {isSystemOwner && !isImpersonating ? (
        <div className="mx-auto w-full max-w-4xl space-y-4" dir={systemOwnerPanelDir}>
          <SystemOwnerDirectory
            hideCardHeader
            restaurants={restaurants || []}
            usersData={usersData}
            usersLoaded={usersLoaded}
            loadingUsers={loadingUsers2}
            onRefreshUsers={loadU}
            onRestaurantSaved={() => refreshRestaurants?.()}
            onRestaurantDeleted={(id) => {
              refreshRestaurants?.()
              setInboundEmailRestId((prev) => (prev === id ? null : prev))
            }}
            selectedRestId={inboundEmailRestId}
            onSelectRestaurant={setInboundEmailRestId}
            onEditUser={openEditUser}
            onAssignClick={(u) => {
              setAssignTgt({ uid: u.uid, email: u.email })
              setAssignTgtRestId(u.restaurantId || "")
            }}
            onSendInvite={async (u) => {
              if (!u.email) return
              try {
                await postInviteEmail({
                  email: u.email,
                  role: u.role,
                  restaurantName: u.restaurantName,
                  accountCreated: false,
                })
                toast.success("נשלח מייל הזמנה")
              } catch (e) {
                toast.error((e as Error).message || "שגיאה")
              }
            }}
            userTabToolbar={
              <SystemOwnerUserTabToolbar
                usersData={usersData}
                usersLoaded={usersLoaded}
                loadingUsers={loadingUsers2}
                loadU={loadU}
                restaurants={restaurants || []}
                showCreate2={showCreate2}
                setShowCreate2={setShowCreate2}
                cEmail={cEmail}
                setCEmail={setCEmail}
                cPass={cPass}
                setCPass={setCPass}
                cRole={cRole}
                setCRole={setCRole}
                cRest={cRest}
                setCRest={setCRest}
                cName={cName}
                setCName={setCName}
                cPhone={cPhone}
                setCPhone={setCPhone}
                cAddress={cAddress}
                setCAddress={setCAddress}
                cNotes={cNotes}
                setCNotes={setCNotes}
                cErr={cErr}
                creating2={creating2}
                doCreate={doCreate}
                showRestaurantInvitePanel={showRestaurantInvitePanel}
                setShowRestaurantInvitePanel={setShowRestaurantInvitePanel}
                restaurantInviteCode={restaurantInviteCode}
                generatingRestaurantInviteCode={generatingRestaurantInviteCode}
                onGenerateRestaurantInviteCode={handleGenerateRestaurantInviteCode}
              />
            }
            userTabBulk={
              <SystemOwnerUserTabBulkSection
                restaurants={restaurants || []}
                assignTgt={assignTgt}
                setAssignTgt={setAssignTgt}
                assignTgtRestId={assignTgtRestId}
                setAssignTgtRestId={setAssignTgtRestId}
                doAssign={doAssign}
                savingAssign2={savingAssign2}
              />
            }
          />
          <Card
            className="mt-2 border border-primary/15 bg-gradient-to-br from-primary/[0.04] to-transparent shadow-sm"
            dir={systemOwnerPanelDir}
          >
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <Key className="w-5 h-5 text-muted-foreground shrink-0" />
                {t("pages.settings.claudeApiKey")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              <p className="text-sm text-muted-foreground leading-relaxed">{t("pages.settings.claudeApiKeyDesc")}</p>
              <div className="flex flex-wrap gap-2">
                <Input
                  type="password"
                  placeholder={t("pages.adminPanel.keyPlaceholderNew")}
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  className="flex-1 min-w-[12rem] font-mono text-sm"
                  dir="ltr"
                />
                <Button size="sm" onClick={saveApiKey} disabled={savingApiKey} className="shrink-0 gap-1.5">
                  {savingApiKey ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {t("pages.adminPanel.save")}
                </Button>
              </div>
              {apiKeySaved ? <p className="text-xs text-emerald-600">{t("pages.settings.claudeApiKeySaved")}</p> : null}
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="space-y-6">
        {(!isSystemOwner || isImpersonating) && (
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <User className="w-5 h-5 text-muted-foreground" />
              {t("pages.settings.userDetails")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-2xl shrink-0">
                👨‍🍳
              </div>
              <div className="min-w-0 flex-1 text-start">
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
                {savingProfile ? <Loader2 className="w-4 h-4 animate-spin ms-2" /> : <Save className="w-4 h-4 ms-2" />}
                שמור פרטים
              </Button>
            </div>
            <div className="border-t pt-4 space-y-3">
              <p className="text-sm font-medium flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-muted-foreground shrink-0" />
                {t("pages.settings.changePassword")}
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed">{t("pages.settings.passwordResetSelfHint")}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full sm:w-auto gap-2 rounded-xl"
                onClick={() => void handleChangePassword()}
                disabled={sendingPasswordReset || !email}
              >
                {sendingPasswordReset ? (
                  <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                ) : (
                  <Mail className="w-4 h-4 shrink-0 opacity-70" />
                )}
                {t("pages.settings.sendPasswordResetLink")}
              </Button>
            </div>
          </CardContent>
        </Card>

        )}
        {currentRestaurantId && (!isSystemOwner || isImpersonating) && (
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

        {currentRestaurantId &&
          (settingsViewRole === "owner" ||
            settingsViewRole === "admin" ||
            settingsViewRole === "manager" ||
            settingsViewRole === "user") &&
          (!isSystemOwner || isImpersonating) && (
            <Card className="border-0 shadow-sm border-primary/15 bg-primary/[0.03]">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg font-semibold flex items-center gap-2">
                  <Mail className="w-5 h-5 text-primary" />
                  ייבוא ממייל למסעדה
                </CardTitle>
                <p className="text-sm text-muted-foreground font-normal leading-relaxed">
                  כתובת הייבוא <strong>מוגדרת על ידי בעל המערכת</strong>. חשבוניות ודוחות שנשלחים לכתובת מתווספים לנתוני המסעדה — אפשר להעתיק את הכתובת ולהשתמש בה; שינוי כתובת רק דרך בעל המערכת או בקשה מהכפתור למטה.
                </p>
              </CardHeader>
              <CardContent>
                <InboundEmailSettings allowEdit={false} />
              </CardContent>
            </Card>
          )}

        {(!isSystemOwner || isImpersonating) && (
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

        {/* אבטחה — מנהל/משתמש מסעדה ובעל מערכת בהתחזות (איפוס סיסמה בתוך «פרטי משתמש» למעלה) */}
        {(!isSystemOwner || isImpersonating) && (
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <Lock className="w-5 h-5 text-muted-foreground" />
              {t("pages.settings.security")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              variant="outline"
              className="w-full justify-between h-12 rounded-xl gap-2"
              onClick={() => toast.info("אימות דו-שלבי יהיה זמין בגרסה הבאה")}
            >
              <span className="text-start flex-1">{t("pages.settings.twoFactor")}</span>
              <Badge variant="secondary" className="shrink-0">{t("pages.settings.twoFactorInactive")}</Badge>
            </Button>
            <Button
              variant="outline"
              className="w-full justify-between h-12 rounded-xl gap-2"
              onClick={() => toast.info("היסטוריית התחברויות תהיה זמינה בגרסה הבאה")}
            >
              <span className="text-start flex-1">{t("pages.settings.loginHistory")}</span>
              <BackChevron className="w-4 h-4 shrink-0 opacity-60" />
            </Button>
          </CardContent>
        </Card>
        )}

        {/* ניהול נתונים — לא בטאב הגדרות של בעל מערכת (ייבוא/ייצוא במקומות אחרים לפי הצורך) */}
        {(!isSystemOwner || isImpersonating) &&
          currentRestaurantId &&
          (settingsViewRole === "owner" ||
            settingsViewRole === "admin" ||
            settingsViewRole === "manager") && (
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
        )}

      <Dialog
        open={!!editingUser}
        onOpenChange={(o) => {
          if (!o) {
            setEditingUser(null)
            setDeleteUserDialogOpen(false)
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><User className="w-4 h-4"/>עריכת משתמש</DialogTitle>
            <DialogDescription dir="ltr">{editingUser?.email}</DialogDescription>
          </DialogHeader>
          {editingUser&&(
            <div className="space-y-4 py-2">
              {loadingEditProfile?(
                <div className="flex items-center gap-2 text-muted-foreground py-4"><Loader2 className="w-4 h-4 animate-spin"/>טוען פרטים...</div>
              ):(<>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium flex items-center gap-1.5"><User className="w-3.5 h-3.5"/>שם מלא</label>
                  <Input value={editUserName} onChange={e=>setEditUserName(e.target.value)} placeholder="שם פרטי ומשפחה" className="h-10"/>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium flex items-center gap-1.5"><Phone className="w-3.5 h-3.5"/>טלפון</label>
                  <Input value={editUserPhone} onChange={e=>setEditUserPhone(e.target.value)} placeholder="050-0000000" dir="ltr" type="tel" className="h-10"/>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5"/>כתובת</label>
                  <Input value={editUserAddress} onChange={e=>setEditUserAddress(e.target.value)} placeholder="רחוב, עיר" className="h-10"/>
                </div>
                {editingUser.isSystemOwner ? (
                  <p className="text-xs text-muted-foreground rounded-md border border-primary/20 bg-primary/5 px-3 py-2">
                    משתמש זה מוגדר כ<strong className="text-foreground"> בעל מערכת</strong>. שדה «תפקיד» משמש לשיוך למסעדה בלבד; ההרשאות המלאות נשארות לפי בעל המערכת.
                  </p>
                ) : null}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">תפקיד</label>
                    <select className="w-full h-10 rounded-md border px-3 text-sm bg-background" value={editUserRole} onChange={e=>setEditUserRole(e.target.value as "manager"|"user")}>
                      <option value="manager">מנהל</option><option value="user">משתמש</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">מסעדה</label>
                    <select className="w-full h-10 rounded-md border px-3 text-sm bg-background" value={editUserRestId} onChange={e=>setEditUserRestId(e.target.value)}>
                      <option value="">— ללא —</option>
                      {(restaurants||[]).map(r=><option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">הערות</label>
                  <textarea value={editUserNotes} onChange={e=>setEditUserNotes(e.target.value)} placeholder="הערות נוספות..." className="w-full min-h-[72px] rounded-md border px-3 py-2 text-sm bg-background resize-none"/>
                </div>
              </>)}
            </div>
          )}
          <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between sm:items-center">
            <Button
              type="button"
              variant="destructive"
              className="gap-1.5 w-full sm:w-auto order-2 sm:order-1"
              disabled={!editingUser || loadingEditProfile || editingUser.uid === auth.currentUser?.uid}
              onClick={() => setDeleteUserDialogOpen(true)}
            >
              <Trash2 className="w-4 h-4" />
              מחק משתמש
            </Button>
            <div className="flex gap-2 w-full sm:w-auto justify-end order-1 sm:order-2">
              <Button variant="outline" onClick={() => setEditingUser(null)}>
                ביטול
              </Button>
              <Button onClick={saveEditUser} disabled={savingEditUser || loadingEditProfile}>
                {savingEditUser ? <Loader2 className="w-4 h-4 animate-spin ms-1" /> : <Save className="w-4 h-4 ms-1" />}
                שמור
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteUserDialogOpen} onOpenChange={setDeleteUserDialogOpen}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>למחוק את המשתמש?</AlertDialogTitle>
            <AlertDialogDescription className="text-start space-y-2">
              <span className="block">
                פעולה זו תמחק את מסמך המשתמש ב-Firestore. חשבון ההתחברות ב-Firebase Authentication עשוי להישאר — אם צריך, הסר אותו ידנית מקונסולת Firebase.
              </span>
              {editingUser ? (
                <span className="block font-mono text-foreground" dir="ltr">
                  {editingUser.email}
                </span>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:justify-start">
            <AlertDialogCancel disabled={deletingUserDoc}>ביטול</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={deletingUserDoc}
              onClick={() => void confirmDeleteUser()}
              className="gap-1.5"
            >
              {deletingUserDoc ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              מחק לצמיתות
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
