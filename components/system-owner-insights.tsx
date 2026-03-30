"use client"

import { useCallback, useState } from "react"
import { BarChart3, Loader2, RefreshCw } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useTranslations } from "@/lib/use-translations"
import { firebaseBearerHeaders } from "@/lib/api-auth-client"

type AuditRow = {
  id: string
  action: string
  target: string | null
  actorEmail: string | null
  createdAt: string | null
}

type Summary = {
  restaurantCount: number
  userCount: number
  recentAudit: AuditRow[]
}

export function SystemOwnerInsights() {
  const t = useTranslations()
  const [data, setData] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setErr(null)
    try {
      const res = await fetch("/api/admin/activity-summary?auditLimit=20", {
        headers: { ...(await firebaseBearerHeaders()) },
        cache: "no-store",
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(typeof j.error === "string" ? j.error : res.statusText)
      setData(j as Summary)
    } catch (e) {
      setErr((e as Error).message || t("pages.settings.activityLoadError"))
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [t])

  return (
    <Card className="border border-primary/15 bg-gradient-to-br from-slate-950/[0.03] to-transparent shadow-sm" dir="rtl">
      <CardHeader className="pb-2 flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-muted-foreground shrink-0" />
          {t("pages.settings.activitySummaryTitle")}
        </CardTitle>
        <Button type="button" variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={() => void load()} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {t("pages.settings.activityRefresh")}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p className="text-muted-foreground">{t("pages.settings.activitySummarySubtitle")}</p>
        {err ? <p className="text-destructive text-sm">{err}</p> : null}
        {data ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-lg border bg-background/80 px-3 py-2">
              <p className="text-xs text-muted-foreground">{t("pages.settings.activityRestaurants")}</p>
              <p className="text-2xl font-semibold tabular-nums">{data.restaurantCount}</p>
            </div>
            <div className="rounded-lg border bg-background/80 px-3 py-2">
              <p className="text-xs text-muted-foreground">{t("pages.settings.activityUsers")}</p>
              <p className="text-2xl font-semibold tabular-nums">{data.userCount}</p>
            </div>
          </div>
        ) : null}
        {data && data.recentAudit.length > 0 ? (
          <div>
            <p className="font-medium mb-2">{t("pages.settings.auditRecentTitle")}</p>
            <ul className="space-y-1.5 max-h-48 overflow-y-auto text-xs border rounded-md p-2 bg-muted/30">
              {data.recentAudit.map((row) => (
                <li key={row.id} className="flex flex-col gap-0.5 border-b border-border/40 pb-1.5 last:border-0 last:pb-0">
                  <span className="font-medium">{row.action}</span>
                  {row.target ? <span className="text-muted-foreground truncate">{row.target}</span> : null}
                  <span className="text-muted-foreground">
                    {row.actorEmail || "—"} · {row.createdAt ? new Date(row.createdAt).toLocaleString("he-IL") : "—"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {!data && !loading && !err ? (
          <p className="text-muted-foreground text-sm">{t("pages.settings.activityHintLoad")}</p>
        ) : null}
      </CardContent>
    </Card>
  )
}
