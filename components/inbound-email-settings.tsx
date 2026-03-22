"use client"

import { useState, useEffect } from "react"
import { doc, getDoc, setDoc } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { useApp } from "@/contexts/app-context"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import {
  Mail, Copy, RefreshCw, Plus, X, Loader2, ShieldCheck, Info,
} from "lucide-react"
import {
  generateInboundToken,
  buildInboundAddress,
  type InboundSettings,
} from "@/lib/inbound-email"

export function InboundEmailSettings() {
  const { currentRestaurantId } = useApp()

  const [settings, setSettings] = useState<InboundSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [newEmail, setNewEmail] = useState("")

  useEffect(() => {
    if (!currentRestaurantId) { setLoading(false); return }
    setLoading(true)
    getDoc(doc(db, "restaurants", currentRestaurantId, "appState", "inboundSettings"))
      .then((snap) => {
        if (snap.exists()) setSettings(snap.data() as InboundSettings)
        else setSettings(null)
      })
      .catch(() => toast.error("שגיאה בטעינת הגדרות מייל"))
      .finally(() => setLoading(false))
  }, [currentRestaurantId])

  const save = async (next: InboundSettings) => {
    if (!currentRestaurantId) return
    setSaving(true)
    try {
      await setDoc(
        doc(db, "restaurants", currentRestaurantId, "appState", "inboundSettings"),
        next, { merge: true }
      )
      await setDoc(
        doc(db, "inboundEmailLookup", next.inboundEmailToken),
        { restaurantId: currentRestaurantId }
      )
      setSettings(next)
      toast.success("הגדרות מייל נשמרו ✅")
    } catch {
      toast.error("שגיאה בשמירת הגדרות מייל")
    } finally {
      setSaving(false)
    }
  }

  const handleGenerate = async () => {
    const token = generateInboundToken()
    await save({
      inboundEmailToken: token,
      inboundAllowedSenderEmails: settings?.inboundAllowedSenderEmails ?? [],
      inboundCreatedAt: new Date().toISOString(),
    })
  }

  const handleCopy = () => {
    if (!settings) return
    navigator.clipboard.writeText(buildInboundAddress(settings.inboundEmailToken))
    toast.success("כתובת המייל הועתקה ✅")
  }

  const handleAddEmail = async () => {
    if (!settings || !newEmail.trim()) return
    const list = [...(settings.inboundAllowedSenderEmails ?? []), newEmail.trim().toLowerCase()]
    await save({ ...settings, inboundAllowedSenderEmails: list })
    setNewEmail("")
  }

  const handleRemoveEmail = async (email: string) => {
    if (!settings) return
    const list = (settings.inboundAllowedSenderEmails ?? []).filter((e) => e !== email)
    await save({ ...settings, inboundAllowedSenderEmails: list })
  }

  if (!currentRestaurantId) return null

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6 flex items-center gap-2 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>טוען הגדרות מייל...</span>
        </CardContent>
      </Card>
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
      <CardContent className="space-y-5">
        <div className="flex gap-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 text-sm text-blue-700 dark:text-blue-300">
          <Info className="w-4 h-4 mt-0.5 shrink-0" />
          <p>כל ספק ישלח חשבוניות ודוחות ישירות לכתובת הייחודית שלכם. הקבצים יזוהו ויעובדו אוטומטית.</p>
        </div>

        {!settings ? (
          <div className="text-center py-4 space-y-3">
            <p className="text-sm text-muted-foreground">טרם נוצרה כתובת מייל לייבוא</p>
            <Button onClick={handleGenerate} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin ml-2" /> : <Mail className="w-4 h-4 ml-2" />}
              צור כתובת מייל
            </Button>
          </div>
        ) : (
          <>
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">כתובת הייבוא שלכם</p>
              <div className="flex items-center gap-2">
                <div className="flex-1 rounded-lg border bg-muted/30 px-3 py-2 text-sm font-mono select-all break-all">
                  {buildInboundAddress(settings.inboundEmailToken)}
                </div>
                <Button size="icon" variant="outline" onClick={handleCopy} title="העתק">
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>חידוש טוקן מבטל את הכתובת הישנה</span>
              </div>
              <Button size="sm" variant="outline" onClick={handleGenerate} disabled={saving} className="text-xs">
                {saving ? <Loader2 className="w-3 h-3 animate-spin ml-1" /> : <RefreshCw className="w-3 h-3 ml-1" />}
                חדש כתובת
              </Button>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                מיילים מורשים לשליחה
                <span className="mr-1 font-normal">(ריק = כולם מותרים)</span>
              </p>
              {(settings.inboundAllowedSenderEmails ?? []).length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {settings.inboundAllowedSenderEmails!.map((email) => (
                    <Badge key={email} variant="secondary" className="gap-1 text-xs">
                      {email}
                      <button onClick={() => handleRemoveEmail(email)} className="hover:text-destructive transition-colors">
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
                  onKeyDown={(e) => e.key === "Enter" && handleAddEmail()}
                  className="text-sm h-8"
                  dir="ltr"
                />
                <Button size="sm" variant="outline" onClick={handleAddEmail} disabled={!newEmail.trim() || saving} className="h-8">
                  <Plus className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
