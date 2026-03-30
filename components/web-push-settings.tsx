"use client"

import { useCallback, useState } from "react"
import { Smartphone, Loader2 } from "lucide-react"
import { collection, addDoc, serverTimestamp } from "firebase/firestore"
import { getMessaging, getToken, isSupported } from "firebase/messaging"
import { auth, db, firebaseApp } from "@/lib/firebase"
import { Button } from "@/components/ui/button"
import { useTranslations } from "@/lib/use-translations"
import { toast } from "sonner"

type WebPushSettingsProps = {
  /** כשאין מסעדה — עדיין שומרים טוקן למשתמש (התראות כלליות בעתיד) */
  restaurantId: string | null
}

export function WebPushSettings({ restaurantId }: WebPushSettingsProps) {
  const t = useTranslations()
  const [loading, setLoading] = useState(false)

  const enablePush = useCallback(async () => {
    const vapid = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY?.trim()
    if (!vapid) {
      toast.error(t("pages.settings.webPushNoVapid"))
      return
    }
    const user = auth.currentUser
    if (!user) {
      toast.error(t("pages.settings.webPushNeedLogin"))
      return
    }
    setLoading(true)
    try {
      const supported = await isSupported()
      if (!supported) {
        toast.error(t("pages.settings.webPushNotSupported"))
        return
      }
      const reg = await navigator.serviceWorker.register("/firebase-messaging-sw.js")
      const messaging = getMessaging(firebaseApp)
      const token = await getToken(messaging, {
        vapidKey: vapid,
        serviceWorkerRegistration: reg,
      })
      if (!token) {
        toast.error(t("pages.settings.webPushNoToken"))
        return
      }
      await addDoc(collection(db, "users", user.uid, "pushTokens"), {
        token,
        restaurantId: restaurantId || null,
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 500) : null,
        createdAt: serverTimestamp(),
      })
      toast.success(t("pages.settings.webPushSaved"))
    } catch (e) {
      toast.error((e as Error).message || t("pages.settings.webPushError"))
    } finally {
      setLoading(false)
    }
  }, [restaurantId, t])

  return (
    <div className="rounded-lg border border-border/80 bg-muted/20 p-4 space-y-2">
      <div className="flex items-start gap-3">
        <Smartphone className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
        <div className="min-w-0 space-y-1">
          <p className="font-medium">{t("pages.settings.webPushTitle")}</p>
          <p className="text-sm text-muted-foreground leading-relaxed">{t("pages.settings.webPushDesc")}</p>
        </div>
      </div>
      <Button type="button" variant="secondary" size="sm" className="gap-2" onClick={() => void enablePush()} disabled={loading}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {t("pages.settings.webPushEnable")}
      </Button>
    </div>
  )
}
