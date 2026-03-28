"use client"

import { useState, useEffect } from "react"
import { doc, getDoc, setDoc, deleteDoc, addDoc, collection } from "firebase/firestore"
import { auth, db } from "@/lib/firebase"
import { useApp } from "@/contexts/app-context"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import {
  Mail,
  Copy,
  Plus,
  X,
  Loader2,
  ShieldCheck,
  Info,
  CheckCircle2,
  AlertCircle,
  Search,
} from "lucide-react"
import {
  buildInboundAddress,
  normalizeInboundCustomSlug,
  validateInboundSlugFormat,
  checkInboundSlugAvailability,
  type InboundSettings,
  type InboundSlugAvailability,
} from "@/lib/inbound-email"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface Props {
  externalRestaurantId?: string
  compact?: boolean
  onInboundCreated?: () => void
  /** false = צפייה והעתקה בלבד + בקשת שינוי לבעל המערכת (הגדרות מסעדה) */
  allowEdit?: boolean
}

export function InboundEmailSettings({
  externalRestaurantId,
  compact = false,
  onInboundCreated,
  allowEdit = true,
}: Props) {
  const { currentRestaurantId, restaurants } = useApp()
  const restaurantId = externalRestaurantId ?? currentRestaurantId

  const [settings, setSettings] = useState<InboundSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const [newEmail, setNewEmail] = useState("")
  const [showAllowlist, setShowAllowlist] = useState(false)
  const [customSlugInput, setCustomSlugInput] = useState("")
  const [slugAvailability, setSlugAvailability] = useState<InboundSlugAvailability | null>(null)
  const [slugChecking, setSlugChecking] = useState(false)
  /** קומפקטי + כבר יש כתובת — להציג טופס החלפת מזהה */
  const [compactEditSlug, setCompactEditSlug] = useState(false)
  const [requestDialogOpen, setRequestDialogOpen] = useState(false)
  const [requestMessage, setRequestMessage] = useState("")
  const [requestSubmitting, setRequestSubmitting] = useState(false)

  useEffect(() => {
    if (!restaurantId) {
      setLoading(false)
      return
    }
    setLoading(true)
    getDoc(doc(db, "restaurants", restaurantId, "appState", "inboundSettings"))
      .then((inboundSnap) => {
        if (inboundSnap.exists()) setSettings(inboundSnap.data() as InboundSettings)
        else setSettings(null)
      })
      .catch(() => toast.error("שגיאה בטעינת הגדרות מייל"))
      .finally(() => setLoading(false))
  }, [restaurantId])

  useEffect(() => {
    setSlugAvailability(null)
    setCustomSlugInput("")
    setCompactEditSlug(false)
  }, [restaurantId])

  useEffect(() => {
    if (settings?.inboundEmailToken) {
      setCustomSlugInput(settings.inboundEmailToken)
      setSlugAvailability(null)
      setCompactEditSlug(false)
    }
  }, [settings?.inboundEmailToken])

  const save = async (next: InboundSettings, successToast?: string) => {
    if (!restaurantId) return
    const oldToken = settings?.inboundEmailToken
    setSaving(true)
    try {
      await setDoc(doc(db, "restaurants", restaurantId, "appState", "inboundSettings"), next, { merge: true })
      await setDoc(doc(db, "inboundEmailLookup", next.inboundEmailToken), { restaurantId })
      if (oldToken && oldToken !== next.inboundEmailToken) {
        try {
          await deleteDoc(doc(db, "inboundEmailLookup", oldToken))
        } catch (delErr) {
          console.warn("[inbound-email-settings] could not remove old lookup:", delErr)
        }
      }
      setSettings(next)
      onInboundCreated?.()
      toast.success(successToast ?? "נשמר בהצלחה")
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error("[inbound-email-settings] save failed:", err)
      toast.error(`שגיאה בשמירה${msg ? `: ${msg}` : ""}`)
    } finally {
      setSaving(false)
    }
  }

  const runCheckSlug = async () => {
    if (!restaurantId) return
    const raw = normalizeInboundCustomSlug(customSlugInput)
    const v = validateInboundSlugFormat(raw)
    if (!v.ok) {
      setSlugAvailability(null)
      toast.error(v.message)
      return
    }
    setSlugChecking(true)
    try {
      const status = await checkInboundSlugAvailability(raw, restaurantId)
      setSlugAvailability(status)
    } catch (e: unknown) {
      setSlugAvailability(null)
      const code =
        e && typeof e === "object" && "code" in e ? String((e as { code: string }).code) : ""
      if (code === "permission-denied") {
        toast.error(
          "חסום על ידי כללי Firestore. פרוס את הקובץ firestore.rules העדכני (קריאה ל-inboundEmailLookup למשתמשים עם מסעדה) — firebase deploy --only firestore:rules",
        )
      } else {
        toast.error((e as Error)?.message || "שגיאה בבדיקת זמינות")
      }
    } finally {
      setSlugChecking(false)
    }
  }

  /** שמירת מזהה ידני (בודק שוב לפני שמירה) */
  const handleApplyCustom = async (hadAddressBefore: boolean) => {
    if (!restaurantId) return
    const raw = normalizeInboundCustomSlug(customSlugInput)
    const v = validateInboundSlugFormat(raw)
    if (!v.ok) {
      toast.error(v.message)
      return
    }
    setSlugChecking(true)
    try {
      const status = await checkInboundSlugAvailability(raw, restaurantId)
      setSlugAvailability(status)
      if (status === "taken") {
        toast.error("לא ניתן לשמור — המזהה תפוס על ידי מסעדה אחרת")
        return
      }
      if (status === "same-restaurant" && settings?.inboundEmailToken === raw) {
        toast.info("זה כבר המזהה הפעיל שלך")
        return
      }
      await save(
        {
          inboundEmailToken: raw,
          inboundAddressKind: "custom",
          inboundAllowedSenderEmails: settings?.inboundAllowedSenderEmails ?? [],
          inboundCreatedAt: settings?.inboundCreatedAt ?? new Date().toISOString(),
        },
        hadAddressBefore ? "הכתובת עודכנה למזהה שבחרת" : "נשמרה כתובת לפי המזהה שלך",
      )
    } catch (e: unknown) {
      setSlugAvailability(null)
      const code =
        e && typeof e === "object" && "code" in e ? String((e as { code: string }).code) : ""
      if (code === "permission-denied") {
        toast.error(
          "חסום על ידי כללי Firestore. פרוס את firestore.rules (inboundEmailLookup).",
        )
      } else {
        toast.error((e as Error)?.message || "שגיאה בבדיקת זמינות")
      }
    } finally {
      setSlugChecking(false)
    }
  }

  const normalizedPreview = normalizeInboundCustomSlug(customSlugInput)
  const formatHint = validateInboundSlugFormat(normalizedPreview)

  const handleCopy = () => {
    if (!settings) return
    navigator.clipboard.writeText(buildInboundAddress(settings.inboundEmailToken))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    toast.success("הכתובת הועתקה")
  }

  const submitChangeRequest = async () => {
    if (!restaurantId || !requestMessage.trim()) return
    setRequestSubmitting(true)
    try {
      const rest = restaurants?.find((r) => r.id === restaurantId)
      await addDoc(collection(db, "inboundChangeRequests"), {
        restaurantId,
        restaurantName: rest?.name ?? null,
        message: requestMessage.trim(),
        requestedByUid: auth.currentUser?.uid ?? "",
        requestedByEmail: auth.currentUser?.email ?? null,
        createdAt: new Date().toISOString(),
      })
      toast.success("הבקשה נשלחה לבעל המערכת")
      setRequestDialogOpen(false)
      setRequestMessage("")
    } catch (e) {
      toast.error((e as Error).message || "שגיאה בשליחה")
    } finally {
      setRequestSubmitting(false)
    }
  }

  const handleAddEmail = async () => {
    if (!settings || !newEmail.trim()) return
    await save(
      {
        ...settings,
        inboundAllowedSenderEmails: [...(settings.inboundAllowedSenderEmails ?? []), newEmail.trim().toLowerCase()],
      },
      "מייל מורשה נוסף"
    )
    setNewEmail("")
  }

  const handleRemoveEmail = async (email: string) => {
    if (!settings) return
    await save(
      {
        ...settings,
        inboundAllowedSenderEmails: (settings.inboundAllowedSenderEmails ?? []).filter((e) => e !== email),
      },
      "עודכן"
    )
  }

  if (!restaurantId) return null

  if (loading) {
    return (
      <Card>
        <CardContent className="p-4 flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          <span>טוען...</span>
        </CardContent>
      </Card>
    )
  }

  if (!allowEdit) {
    if (compact && !settings) {
      return (
        <div className="w-full rounded-lg border border-dashed bg-muted/20 p-2.5 text-center text-[11px] text-muted-foreground">
          לא הוגדרה כתובת ייבוא על ידי בעל המערכת
        </div>
      )
    }
    if (compact && settings) {
      return (
        <div className="w-full space-y-2">
          <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/40 border text-sm">
            <Mail className="w-3.5 h-3.5 text-primary shrink-0" />
            <span className="font-mono text-xs truncate flex-1">{buildInboundAddress(settings.inboundEmailToken)}</span>
            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={handleCopy}>
              {copied ? <CheckCircle2 className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground text-center">שינוי כתובת — דרך בעל המערכת בלבד</p>
        </div>
      )
    }
    return (
      <>
        <div className="space-y-4">
          <div className="flex gap-2 p-3 rounded-lg bg-muted/40 text-sm text-foreground">
            <Info className="w-4 h-4 mt-0.5 shrink-0" />
            <p>
              כתובת הייבוא <strong>מוגדרת על ידי בעל המערכת</strong>. אפשר להעתיק ולשלוח אליה חשבוניות; לשינוי הכתובת ניתן לשלוח בקשה.
            </p>
          </div>
          {!settings ? (
            <p className="text-sm text-muted-foreground">עדיין לא הוגדרה כתובת מייל ייבוא למסעדה זו.</p>
          ) : (
            <>
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">כתובת הייבוא</p>
                <div className="flex items-center gap-2 flex-wrap">
                  <div
                    className="flex-1 min-w-[200px] rounded-lg border bg-muted/30 px-3 py-2.5 text-sm font-mono select-all break-all text-start"
                    dir="ltr"
                  >
                    {buildInboundAddress(settings.inboundEmailToken)}
                  </div>
                  <Button size="icon" variant={copied ? "default" : "outline"} onClick={handleCopy} title="העתק">
                    {copied ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
              <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => setRequestDialogOpen(true)}>
                בקשה לשינוי כתובת…
              </Button>
            </>
          )}
        </div>
        <Dialog open={requestDialogOpen} onOpenChange={setRequestDialogOpen}>
          <DialogContent dir="rtl" className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>בקשה לשינוי כתובת ייבוא</DialogTitle>
              <DialogDescription>
                הבקשה תישלח לבעל המערכת. תאר במדויק מה תרצו לשנות (למשל מזהה חדש או סיבה).
              </DialogDescription>
            </DialogHeader>
            <textarea
              className="w-full min-h-[100px] rounded-md border bg-background px-3 py-2 text-sm"
              placeholder="לדוגמה: נא לשנות את המזהה לשם הסניף באנגלית…"
              value={requestMessage}
              onChange={(e) => setRequestMessage(e.target.value)}
            />
            <DialogFooter className="gap-2 sm:justify-start">
              <Button variant="outline" onClick={() => setRequestDialogOpen(false)}>
                ביטול
              </Button>
              <Button onClick={() => void submitChangeRequest()} disabled={requestSubmitting || !requestMessage.trim()}>
                {requestSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                שלח בקשה
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    )
  }

  if (compact && !settings) {
    return (
      <div className="w-full space-y-2 rounded-lg border border-primary/25 bg-muted/20 p-2.5">
        <p className="text-[11px] font-medium text-foreground">מזהה לכתובת (אנגלית/מספרים)</p>
        <Input
          dir="ltr"
          className="font-mono text-xs h-8"
          placeholder="my-restaurant"
          value={customSlugInput}
          onChange={(e) => {
            setCustomSlugInput(e.target.value)
            setSlugAvailability(null)
          }}
          disabled={saving}
        />
        <div className="flex flex-wrap gap-1.5">
          <Button type="button" size="sm" variant="secondary" className="h-7 text-xs gap-1" onClick={() => void runCheckSlug()} disabled={saving || slugChecking}>
            {slugChecking ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
            בדוק
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-7 text-xs"
            onClick={() => void handleApplyCustom(false)}
            disabled={
              saving ||
              slugChecking ||
              !formatHint.ok ||
              slugAvailability === "taken" ||
              slugAvailability === null
            }
          >
            שמור
          </Button>
        </div>
        {customSlugInput.trim() && formatHint.ok === false ? (
          <p className="text-[10px] text-amber-600">{formatHint.message}</p>
        ) : null}
        {slugAvailability === "taken" ? <p className="text-[10px] text-destructive">תפוס</p> : null}
        {slugAvailability === "available" ? <p className="text-[10px] text-emerald-600">פנוי</p> : null}
        {slugAvailability === "same-restaurant" ? <p className="text-[10px] text-blue-600">שלך</p> : null}
      </div>
    )
  }

  if (compact && settings) {
    return (
      <div className="w-full space-y-2">
        <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/40 border text-sm">
          <Mail className="w-3.5 h-3.5 text-primary shrink-0" />
          <span className="font-mono text-xs truncate flex-1">{buildInboundAddress(settings.inboundEmailToken)}</span>
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={handleCopy}>
            {copied ? <CheckCircle2 className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
          </Button>
        </div>
        {compactEditSlug ? (
          <div className="space-y-2 rounded-lg border border-dashed p-2.5">
            <Input
              dir="ltr"
              className="font-mono text-xs h-8"
              placeholder="מזהה חדש"
              value={customSlugInput}
              onChange={(e) => {
                setCustomSlugInput(e.target.value)
                setSlugAvailability(null)
              }}
              disabled={saving}
            />
            <div className="flex flex-wrap gap-1.5">
              <Button type="button" size="sm" variant="secondary" className="h-7 text-xs" onClick={() => void runCheckSlug()} disabled={saving || slugChecking}>
                {slugChecking ? <Loader2 className="w-3 h-3 animate-spin" /> : "בדוק"}
              </Button>
              <Button
                type="button"
                size="sm"
                className="h-7 text-xs"
                onClick={() => void handleApplyCustom(true)}
                disabled={
                  saving ||
                  slugChecking ||
                  !formatHint.ok ||
                  slugAvailability === "taken" ||
                  slugAvailability === null
                }
              >
                עדכן
              </Button>
              <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setCompactEditSlug(false); setCustomSlugInput(settings.inboundEmailToken); setSlugAvailability(null) }}>
                סגור
              </Button>
            </div>
            {slugAvailability === "taken" ? <p className="text-[10px] text-destructive">תפוס</p> : null}
            {slugAvailability === "available" ? <p className="text-[10px] text-emerald-600">פנוי</p> : null}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => { setCompactEditSlug(true); setCustomSlugInput(settings.inboundEmailToken); setSlugAvailability(null) }}
            className="w-full text-center text-[11px] text-primary underline-offset-2 hover:underline"
          >
            שינוי מזהה…
          </button>
        )}
      </div>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Mail className="w-4 h-4 text-primary" />
          ייבוא ממייל
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 text-sm text-blue-700 dark:text-blue-300">
          <Info className="w-4 h-4 mt-0.5 shrink-0" />
          <p>
            שלח חשבוניות ודוחות מכירות <strong>לכתובת הייחודית שלהלן</strong>. הקבצים יעובדו אוטומטית. העתק את
            הכתובת ושלח לספקים — אין צורך בחלון נוסף.
          </p>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed px-0.5">
          בחר <strong>מזהה ייחודי</strong> (אנגלית, מספרים, מקף). לחץ <strong>בדוק זמינות</strong> — אם הפנוי, שמור.
          הכתובת המלאה תהיה <span className="font-mono" dir="ltr">inbound+המזהה@…</span>
        </p>

        {!settings ? (
          <div className="space-y-4">
            <p className="text-xs font-medium text-muted-foreground">הגדרת כתובת ייבוא</p>

            <div className="rounded-lg border bg-muted/20 p-3 space-y-3">
              <p className="text-xs font-medium">מזהה לכתובת</p>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                רק אותיות באנגלית, מספרים ומקף. דוגמה: <span className="font-mono" dir="ltr">pizza-downtown</span>
              </p>
              <div className="flex flex-wrap gap-2 items-stretch">
                <Input
                  dir="ltr"
                  className="font-mono text-sm flex-1 min-w-[160px]"
                  placeholder="my-restaurant"
                  value={customSlugInput}
                  onChange={(e) => {
                    setCustomSlugInput(e.target.value)
                    setSlugAvailability(null)
                  }}
                  disabled={saving}
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="gap-1.5 shrink-0"
                  onClick={() => void runCheckSlug()}
                  disabled={saving || slugChecking}
                >
                  {slugChecking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                  בדוק זמינות
                </Button>
              </div>
              {customSlugInput.trim() && formatHint.ok === false ? (
                <p className="text-xs text-amber-600 dark:text-amber-500 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  {formatHint.message}
                </p>
              ) : null}
              {slugAvailability === "available" ? (
                <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  המזהה פנוי — אפשר לשמור
                </p>
              ) : null}
              {slugAvailability === "taken" ? (
                <p className="text-xs text-destructive flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  המזהה תפוס על ידי מסעדה אחרת — בחר שם אחר
                </p>
              ) : null}
              {slugAvailability === "same-restaurant" ? (
                <p className="text-xs text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 shrink-0" />
                  המזהה כבר משויך למסעדה שלך — אפשר להפעיל
                </p>
              ) : null}
              <Button
                type="button"
                size="sm"
                className="w-full sm:w-auto"
                onClick={() => void handleApplyCustom(false)}
                disabled={
                  saving ||
                  slugChecking ||
                  !formatHint.ok ||
                  slugAvailability === "taken" ||
                  (slugAvailability !== "available" && slugAvailability !== "same-restaurant")
                }
              >
                {slugChecking ? <Loader2 className="w-3.5 h-3.5 animate-spin me-1" /> : null}
                שמור כתובת עם המזהה הזה
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-xs font-medium text-muted-foreground">כתובת הייבוא</p>
                {settings.inboundAddressKind === "custom" ? (
                  <span className="text-[10px] px-1.5 py-0 rounded bg-muted text-muted-foreground">מזהה ידני</span>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <div
                  className="flex-1 rounded-lg border bg-muted/30 px-3 py-2.5 text-sm font-mono select-all break-all text-start"
                  dir="ltr"
                >
                  {buildInboundAddress(settings.inboundEmailToken)}
                </div>
                <Button
                  size="icon"
                  variant={copied ? "default" : "outline"}
                  onClick={handleCopy}
                  title="העתק כתובת"
                >
                  {copied ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
            </div>

            <div className="rounded-lg border bg-muted/20 p-3 space-y-3">
              <p className="text-xs font-medium">שינוי מזהה</p>
              <p className="text-[11px] text-muted-foreground">
                מזהה חדש — אנגלית/מספרים ומקף. בדוק זמינות ואז עדכן. הכתובת הישנה תפסיק לקבל מיילים.
              </p>
              <div className="flex flex-wrap gap-2 items-stretch">
                <Input
                  dir="ltr"
                  className="font-mono text-sm flex-1 min-w-[160px]"
                  placeholder="מזהה חדש"
                  value={customSlugInput}
                  onChange={(e) => {
                    setCustomSlugInput(e.target.value)
                    setSlugAvailability(null)
                  }}
                  disabled={saving}
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="gap-1.5 shrink-0"
                  onClick={() => void runCheckSlug()}
                  disabled={saving || slugChecking}
                >
                  {slugChecking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                  בדוק זמינות
                </Button>
              </div>
              {customSlugInput.trim() && formatHint.ok === false ? (
                <p className="text-xs text-amber-600 dark:text-amber-500 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  {formatHint.message}
                </p>
              ) : null}
              {slugAvailability === "available" ? (
                <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  המזהה פנוי — אפשר לעדכן
                </p>
              ) : null}
              {slugAvailability === "taken" ? (
                <p className="text-xs text-destructive flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  תפוס על ידי מסעדה אחרת
                </p>
              ) : null}
              {slugAvailability === "same-restaurant" ? (
                <p className="text-xs text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 shrink-0" />
                  זה המזהה הנוכחי שלך
                </p>
              ) : null}
              <Button
                type="button"
                size="sm"
                onClick={() => void handleApplyCustom(true)}
                disabled={
                  saving ||
                  slugChecking ||
                  !formatHint.ok ||
                  slugAvailability === "taken" ||
                  slugAvailability === null
                }
              >
                {slugChecking ? <Loader2 className="w-3.5 h-3.5 animate-spin me-1" /> : null}
                עדכן כתובת למסעדה
              </Button>
            </div>

            <button
              type="button"
              onClick={() => setShowAllowlist((v) => !v)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors underline-offset-2 hover:underline"
            >
              הגדרות מתקדמות — מיילים מורשים לשליחה {showAllowlist ? "▾" : "◂"}
            </button>

            {showAllowlist && (
              <div className="space-y-4 pt-2 border-t">
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>מיילים מורשים לשליחה (ריק = כולם מותרים)</span>
                  </div>
                  {(settings.inboundAllowedSenderEmails ?? []).length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {settings.inboundAllowedSenderEmails!.map((email) => (
                        <Badge key={email} variant="secondary" className="gap-1 text-xs">
                          {email}
                          <button type="button" onClick={() => void handleRemoveEmail(email)} className="hover:text-destructive">
                            <X className="w-3 h-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Input
                      type="email"
                      placeholder="supplier@example.com"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && void handleAddEmail()}
                      className="text-sm h-8"
                      dir="ltr"
                    />
                    <Button size="sm" variant="outline" onClick={() => void handleAddEmail()} disabled={!newEmail.trim() || saving} className="h-8">
                      <Plus className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
