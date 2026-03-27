"use client"

import { useState } from "react"
import { auth } from "@/lib/firebase"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useTranslations } from "@/lib/use-translations"
import { useLanguage } from "@/contexts/language-context"
import { redeemManagerRestaurantInvite } from "@/lib/redeem-manager-restaurant-invite"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"

type ManagerRestaurantSetupProps = {
  onLogout: () => void
}

export function ManagerRestaurantSetup({ onLogout }: ManagerRestaurantSetupProps) {
  const t = useTranslations()
  const { dir } = useLanguage()
  const [code, setCode] = useState("")
  const [restaurantName, setRestaurantName] = useState("")
  const [branch, setBranch] = useState("")
  const [busy, setBusy] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const user = auth.currentUser
    if (!user) {
      toast.error("אין משתמש מחובר")
      return
    }
    setBusy(true)
    try {
      const res = await redeemManagerRestaurantInvite({
        uid: user.uid,
        email: user.email,
        codeRaw: code,
        restaurantName,
        branch,
      })
      if (!res.ok) {
        toast.error(res.message)
        return
      }
      toast.success(t("app.managerSetupDone"))
      window.setTimeout(() => {
        window.location.reload()
      }, 400)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "שגיאה")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6" dir={dir}>
      <div className="w-full max-w-md space-y-6 rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="space-y-2 text-center sm:text-start">
          <h1 className="text-2xl font-bold">{t("app.managerSetupTitle")}</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">{t("app.managerSetupDesc")}</p>
        </div>
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="mgr-setup-code">{t("app.managerSetupCode")}</Label>
            <Input
              id="mgr-setup-code"
              dir="ltr"
              className="font-mono uppercase"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="ABC123"
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="mgr-setup-name">{t("app.managerSetupRestaurantName")}</Label>
            <Input
              id="mgr-setup-name"
              value={restaurantName}
              onChange={(e) => setRestaurantName(e.target.value)}
              placeholder="למשל: מסעדת הים"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="mgr-setup-branch">{t("app.managerSetupBranch")}</Label>
            <Input
              id="mgr-setup-branch"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              placeholder={t("login.branchPlaceholder")}
            />
          </div>
          <Button type="submit" className="w-full gap-2" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin shrink-0" aria-hidden /> : null}
            {t("app.managerSetupSubmit")}
          </Button>
        </form>
        <Button
          type="button"
          variant="outline"
          className="w-full rounded-full"
          disabled={busy}
          onClick={() => onLogout()}
        >
          {t("app.managerSetupLogout")}
        </Button>
      </div>
    </div>
  )
}
