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
import { Mail, Copy, RefreshCw, Plus, X, Loader2, ShieldCheck, Info, CheckCircle2 } from "lucide-react"
import { generateInboundToken, buildInboundAddress, type InboundSettings } from "@/lib/inbound-email"

interface Props {
  /** כשמועבר restaurantId חיצוני — משמש לבעלים שיוצר עבור מסעדה */
  externalRestaurantId?: string
  /** מצב קומפקטי לתצוגה בפאנל בעלים */
  compact?: boolean
}

export function InboundEmailSettings({ externalRestaurantId, compact = false }: Props) {
  const { currentRestaurantId } = useApp()
  const restaurantId = externalRestaurantId ?? currentRestaurantId

  const [settings, setSettings] = useState<InboundSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const [newEmail, setNewEmail] = useState("")
  const [showAllowlist, setShowAllowlist] = useState(false)

  useEffect(() => {
    if (!restaurantId) { setLoading(false); return }
    setLoading(true)
    getDoc(doc(db, "restaurants", restaurantId, "appState", "inboundSettings"))
      .then((snap) => { if (snap.exists()) setSettings(snap.data() as InboundSettings) })
      .catch(() => toast.error("שגיאה בטעינת הגדרות מייל"))
      .finally(() => setLoading(false))
  }, [restaurantId])

  const save = async (next: InboundSettings) => {
    if (!restaurantId) return
    setSaving(true)
    try {
      await setDoc(doc(db, "restaurants", restaurantId, "appState", "inboundSettings"), next, { merge: true })
      await setDoc(doc(db, "inboundEmailLookup", next.inboundEmailToken), { restaurantId })
      setSettings(next)
      toast.success("כתובת מייל נוצרה ✅")
    } catch { toast.error("שגיאה בשמירה") }
    finally { setSaving(false) }
  }

  const handleGenerate = () => save({
    inboundEmailToken: generateInboundToken(),
    inboundAllowedSenderEmails: settings?.inboundAllowedSenderEmails ?? [],
    inboundCreatedAt: new Date().toISOString(),
  })

  const handleCopy = () => {
    if (!settings) return
    navigator.clipboard.writeText(buildInboundAddress(settings.inboundEmailToken))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    toast.success("הכתובת הועתקה ✅")
  }

  const handleAddEmail = async () => {
    if (!settings || !newEmail.trim()) return
    await save({ ...settings, inboundAllowedSenderEmails: [...(settings.inboundAllowedSenderEmails ?? []), newEmail.trim().toLowerCase()] })
    setNewEmail("")
  }

  const handleRemoveEmail = async (email: string) => {
    if (!settings) return
    await save({ ...settings, inboundAllowedSenderEmails: (settings.inboundAllowedSenderEmails ?? []).filter(e => e !== email) })
  }

  if (!restaurantId) return null

  if (loading) return (
    <Card><CardContent className="p-4 flex items-center gap-2 text-muted-foreground text-sm">
      <Loader2 className="w-3.5 h-3.5 animate-spin" /><span>טוען...</span>
    </CardContent></Card>
  )

  if (compact && !settings) return (
    <Button size="sm" variant="outline" onClick={handleGenerate} disabled={saving} className="w-full">
      {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin ml-1.5" /> : <Mail className="w-3.5 h-3.5 ml-1.5" />}
      צור כתובת ייבוא ממייל
    </Button>
  )

  if (compact && settings) return (
    <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/40 border text-sm">
      <Mail className="w-3.5 h-3.5 text-primary shrink-0" />
      <span className="font-mono text-xs truncate flex-1">{buildInboundAddress(settings.inboundEmailToken)}</span>
      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={handleCopy}>
        {copied ? <CheckCircle2 className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
      </Button>
    </div>
  )

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
          <p>שלח חשבוניות ודוחות מכירות לכתובת הייחודית שלך. הקבצים יעובדו אוטומטית.</p>
        </div>

        {!settings ? (
          <div className="text-center py-6 space-y-3">
            <p className="text-sm text-muted-foreground">טרם נוצרה כתובת מייל לייבוא</p>
            <Button onClick={handleGenerate} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin ml-2" /> : <Mail className="w-4 h-4 ml-2" />}
              צור כתובת מייל
            </Button>
          </div>
        ) : (
          <>
            {/* כתובת המייל — ברורה ופשוטה */}
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">שלח חשבוניות ודוחות לכתובת זו:</p>
              <div className="flex items-center gap-2">
                <div className="flex-1 rounded-lg border bg-muted/30 px-3 py-2.5 text-sm font-mono select-all break-all text-right" dir="ltr">
                  {buildInboundAddress(settings.inboundEmailToken)}
                </div>
                <Button size="icon" variant={copied ? "default" : "outline"} onClick={handleCopy} title="העתק כתובת">
                  {copied ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">לחץ להעתקה ושלח לספקים שלך</p>
            </div>

            {/* חידוש כתובת */}
            <div className="flex items-center justify-between pt-1">
              <button
                onClick={() => setShowAllowlist(v => !v)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors underline-offset-2 hover:underline"
              >
                הגדרות מתקדמות
              </button>
              <Button size="sm" variant="ghost" onClick={handleGenerate} disabled={saving} className="text-xs text-muted-foreground h-7">
                {saving ? <Loader2 className="w-3 h-3 animate-spin ml-1" /> : <RefreshCw className="w-3 h-3 ml-1" />}
                חדש כתובת
              </Button>
            </div>

            {/* הגדרות מתקדמות — מוסתרות כברירת מחדל */}
            {showAllowlist && (
              <div className="space-y-2 pt-1 border-t">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>מיילים מורשים לשליחה (ריק = כולם מותרים)</span>
                </div>
                {(settings.inboundAllowedSenderEmails ?? []).length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {settings.inboundAllowedSenderEmails!.map(email => (
                      <Badge key={email} variant="secondary" className="gap-1 text-xs">
                        {email}
                        <button onClick={() => handleRemoveEmail(email)} className="hover:text-destructive">
                          <X className="w-3 h-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <Input type="email" placeholder="supplier@example.com" value={newEmail}
                    onChange={e => setNewEmail(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleAddEmail()}
                    className="text-sm h-8" dir="ltr" />
                  <Button size="sm" variant="outline" onClick={handleAddEmail}
                    disabled={!newEmail.trim() || saving} className="h-8">
                    <Plus className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
