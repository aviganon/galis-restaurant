"use client"

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Mail, Loader2, Eye, Play } from "lucide-react"
import { firebaseBearerHeaders } from "@/lib/api-auth-client"
import { ref, getDownloadURL } from "firebase/storage"
import { db, storage } from "@/lib/firebase"
import { FilePreviewModal } from "@/components/file-preview-modal"
import type { ExtractType, ExtractedSupplierItem, SalesReportPeriod } from "@/lib/ai-extract"
import { detectDocumentType } from "@/lib/ai-extract"
import { getClaudeApiKey } from "@/lib/claude"
import { confirmSupplierInvoiceImport, confirmSalesReportImport } from "@/lib/restaurant-import-handlers"
import { useApp } from "@/contexts/app-context"

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
  const { userRole, isSystemOwner, refreshIngredients } = useApp()
  const isOwner = !!isSystemOwner || userRole === "owner"
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState<InboundJobRow[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [fpmOpen, setFpmOpen] = useState(false)
  const [fpmFile, setFpmFile] = useState<File | null>(null)
  const [fpmType, setFpmType] = useState<ExtractType>("p")
  const [activeJobId, setActiveJobId] = useState<string | null>(null)
  const [busyJobId, setBusyJobId] = useState<string | null>(null)

  const mapDetectedToType = (detected: "menu" | "sales" | "invoice" | "unknown"): ExtractType =>
    detected === "sales" ? "s" : "p"

  const patchStatus = async (jobId: string, status: "pending" | "processing" | "done" | "error") => {
    if (!restaurantId) return
    try {
      const headers = await firebaseBearerHeaders()
      await fetch("/api/inbound-jobs/status", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ restaurantId, jobId, status }),
      })
      setRows((prev) => prev.map((r) => (r.id === jobId ? { ...r, status } : r)))
    } catch {
      // Non-blocking, UI still usable.
    }
  }

  const processNow = async (row: InboundJobRow) => {
    if (!restaurantId || !row.attachmentPaths?.length) return
    const path0 = row.attachmentPaths[0]
    if (!path0) return
    const nameFromPath = path0.split("/").pop() || "inbound-file"
    setBusyJobId(row.id)
    await patchStatus(row.id, "processing")
    try {
      const url = await getDownloadURL(ref(storage, path0))
      const res = await fetch(url)
      const blob = await res.blob()
      const inferredType = blob.type || "application/octet-stream"
      const file = Object.assign(blob, {
        name: nameFromPath,
        lastModified: Date.now(),
        type: inferredType,
      }) as File
      let type: ExtractType = "p"
      const hasKey = await getClaudeApiKey()
      if (hasKey) {
        try {
          const detected = await detectDocumentType(file)
          type = mapDetectedToType(detected)
        } catch {
          type = "p"
        }
      }
      setActiveJobId(row.id)
      setFpmType(type)
      setFpmFile(file)
      setFpmOpen(true)
    } catch (e) {
      console.error("[inboundJobs] processNow failed:", e)
      await patchStatus(row.id, "error")
    } finally {
      setBusyJobId(null)
    }
  }

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
                    {Array.isArray(r.attachmentPaths) && r.attachmentPaths.length > 0 ? (
                      <div className="text-[11px] text-muted-foreground font-mono space-y-0.5">
                        {r.attachmentPaths.slice(0, 3).map((p) => (
                          <div key={p} dir="ltr" className="truncate">• {p.split("/").pop()}</div>
                        ))}
                      </div>
                    ) : null}
                    <div className="flex items-center gap-2 pt-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="h-7 text-xs gap-1"
                        disabled={busyJobId === r.id || !r.attachmentPaths?.length}
                        onClick={() => void processNow(r)}
                      >
                        {busyJobId === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                        עבד עכשיו
                      </Button>
                      {r.attachmentPaths?.[0] ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1"
                          onClick={async () => {
                            const url = await getDownloadURL(ref(storage, r.attachmentPaths![0]))
                            window.open(url, "_blank")
                          }}
                        >
                          <Eye className="w-3.5 h-3.5" />
                          צפה בקובץ
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
      <FilePreviewModal
        open={fpmOpen}
        onOpenChange={(o) => {
          setFpmOpen(o)
          if (!o) {
            setFpmFile(null)
            setFpmType("p")
            setActiveJobId(null)
          }
        }}
        file={fpmFile}
        type={fpmType}
        currentRestaurantId={restaurantId}
        canSaveToGlobal={isOwner}
        onConfirmSupplier={async (items: ExtractedSupplierItem[], supplierName: string, saveToGlobal?: boolean) => {
          const ok = await confirmSupplierInvoiceImport({
            db,
            items,
            supName: supplierName,
            saveToGlobal,
            isOwner,
            currentRestaurantId: restaurantId,
            refreshIngredients,
          })
          if (ok && activeJobId) await patchStatus(activeJobId, "done")
          setFpmOpen(false)
        }}
        onConfirmSales={async (
          items: Array<{ name: string; qty: number; price: number }>,
          meta?: {
            salesReportPeriod?: SalesReportPeriod
            salesReportDateFrom?: string
            salesReportDateTo?: string
          },
        ) => {
          await confirmSalesReportImport({
            db,
            currentRestaurantId: restaurantId,
            items,
            meta,
            refreshIngredients,
          })
          if (activeJobId) await patchStatus(activeJobId, "done")
          setFpmOpen(false)
        }}
      />
    </Dialog>
  )
}
