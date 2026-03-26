"use client"

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Mail, Loader2 } from "lucide-react"
import { firebaseBearerHeaders } from "@/lib/api-auth-client"

type InboundJobRow = {
  id: string
  fromEmail?: string
  subject?: string
  receivedAt?: string | number | { toDate?: () => Date }
  status?: "pending" | "processing" | "done" | "error" | string
  attachmentPaths?: string[]
}

function formatReceivedAt(v: InboundJobRow["receivedAt"]): string {
  if (!v) return "-"
  if (typeof v === "object" && typeof v?.toDate === "function") {
    return v.toDate().toLocaleString("he-IL")
  }
  return new Date(v as string | number).toLocaleString("he-IL")
}

function statusBadgeVariant(status: InboundJobRow["status"]): "default" | "secondary" | "destructive" | "outline" {
  if (status === "done") return "default"
  if (status === "processing") return "secondary"
  if (status === "error") return "destructive"
  return "outline"
}

export function RestaurantInboundUploadsDialog({
  restaurantId,
  triggerLabel,
}: {
  restaurantId: string | null
  triggerLabel: string
}) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState<InboundJobRow[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !restaurantId) return
    setLoading(true)
    setLoadError(null)
    void (async () => {
      try {
        const headers = await firebaseBearerHeaders()
        const res = await fetch("/api/inbound-jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...headers },
          body: JSON.stringify({ restaurantId }),
          cache: "no-store",
        })
        const json = (await res.json().catch(() => ({}))) as { jobs?: InboundJobRow[]; error?: string }
        if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
        setRows(Array.isArray(json.jobs) ? json.jobs : [])
      } catch (e) {
        setRows([])
        setLoadError((e as Error)?.message || "שגיאה בטעינת העלאות")
      } finally {
        setLoading(false)
      }
    })()
  }, [open, restaurantId])

  const title = useMemo(() => "העלאות ממייל למסעדה", [])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline" disabled={!restaurantId} className="gap-1.5">
          <Mail className="w-3.5 h-3.5" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="py-10 flex items-center justify-center text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
          </div>
        ) : (
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-2">
              {loadError ? (
                <div className="text-sm text-destructive py-3 text-center">{loadError}</div>
              ) : null}
              {rows.length === 0 ? (
                <div className="text-sm text-muted-foreground py-8 text-center">אין העלאות ממייל למסעדה זו</div>
              ) : (
                rows.map((r) => (
                  <div key={r.id} className="border rounded-lg p-3 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium truncate">{r.subject || "(ללא נושא)"}</p>
                      <Badge variant={statusBadgeVariant(r.status)}>{r.status || "pending"}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-1">
                      <span dir="ltr">{r.fromEmail || "-"}</span>
                      <span>{formatReceivedAt(r.receivedAt)}</span>
                      <span>{(r.attachmentPaths?.length || 0).toString()} קבצים</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  )
}
