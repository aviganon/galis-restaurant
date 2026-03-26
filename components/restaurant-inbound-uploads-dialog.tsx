"use client"

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Mail, Loader2, Eye, Play } from "lucide-react"
import { firebaseBearerHeaders } from "@/lib/api-auth-client"
import { db } from "@/lib/firebase"
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
  detectedType?: "invoice" | "sales" | "other" | string
  attachmentPaths?: string[]
  source?: "email" | "manual"
  fileName?: string
  supplier?: string
}

const STALE_PENDING_MINUTES = 20

function formatReceivedAt(v: InboundJobRow["receivedAt"]): string {
  if (!v) return "-"
  if (typeof v === "object" && typeof v?.toDate === "function") {
    return v.toDate().toLocaleString("he-IL")
  }
  return new Date(v as string | number).toLocaleString("he-IL")
}

function toMillis(v: InboundJobRow["receivedAt"]): number | null {
  if (!v) return null
  if (typeof v === "object" && typeof v?.toDate === "function") return v.toDate().getTime()
  const ms = new Date(v as string | number).getTime()
  return Number.isFinite(ms) ? ms : null
}

function statusBadgeVariant(status: InboundJobRow["status"]): "default" | "secondary" | "destructive" | "outline" {
  if (status === "done") return "default"
  if (status === "processing") return "secondary"
  if (status === "error") return "destructive"
  return "outline"
}

function classifyByHeuristic(row: InboundJobRow): "invoice" | "sales" | "other" {
  const s = `${row.subject || ""} ${(row.attachmentPaths || []).join(" ")}`.toLowerCase()
  if (/(חשבונית|invoice|tax[-_ ]?invoice|קבלה)/i.test(s)) return "invoice"
  if (/(דוח\s*מכירות|sales|z\s*report|דו\"ח)/i.test(s)) return "sales"
  return "other"
}

function typeLabel(t: "invoice" | "sales" | "other"): string {
  if (t === "invoice") return "חשבונית ספק"
  if (t === "sales") return "דוח מכירות"
  return "אחר"
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
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "processing" | "done" | "error" | "uploaded">("all")
  const [typeFilter, setTypeFilter] = useState<"all" | "invoice" | "sales" | "other">("all")

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
      const headers = await firebaseBearerHeaders()
      const res = await fetch("/api/inbound-jobs/file", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ restaurantId, jobId: row.id, attachmentPath: path0 }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const blob = await res.blob()
      const fileLike = blob as Blob & { name?: string; lastModified?: number }
      Object.defineProperty(fileLike, "name", { value: nameFromPath, configurable: true })
      Object.defineProperty(fileLike, "lastModified", { value: Date.now(), configurable: true })
      const file = fileLike as File
      let type: ExtractType = "p"
      let detectedType: "invoice" | "sales" | "other" = "invoice"
      const hasKey = await getClaudeApiKey()
      if (hasKey) {
        try {
          const detected = await detectDocumentType(file)
          type = mapDetectedToType(detected)
          detectedType = detected === "sales" ? "sales" : detected === "invoice" ? "invoice" : "other"
        } catch {
          type = "p"
        }
      }
      try {
        await fetch("/api/inbound-jobs/status", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...headers },
          body: JSON.stringify({ restaurantId, jobId: row.id, status: "processing", detectedType }),
        })
        setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, detectedType } : r)))
      } catch {
        // Non-blocking
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
    let cancelled = false
    const load = async (silent = false) => {
      if (!silent) setLoading(true)
      setLoadError(null)
      try {
        const headers = await firebaseBearerHeaders()
        const [mailRes, uploadsRes] = await Promise.all([
          fetch("/api/inbound-jobs", {
            method: "POST",
            headers: { "Content-Type": "application/json", ...headers },
            body: JSON.stringify({ restaurantId }),
            cache: "no-store",
          }),
          fetch("/api/restaurant-uploads", {
            method: "POST",
            headers: { "Content-Type": "application/json", ...headers },
            body: JSON.stringify({ restaurantId }),
            cache: "no-store",
          }),
        ])
        const json = (await mailRes.json().catch(() => ({}))) as { jobs?: InboundJobRow[]; error?: string }
        const uploadsJson = (await uploadsRes.json().catch(() => ({}))) as {
          uploads?: Array<{ id: string; fileName?: unknown; supplier?: unknown; uploadedAt?: unknown; documentType?: unknown }>
          error?: string
        }
        if (!mailRes.ok) throw new Error(json.error || `HTTP ${mailRes.status}`)
        if (!uploadsRes.ok) throw new Error(uploadsJson.error || `HTTP ${uploadsRes.status}`)
        const mailRows: InboundJobRow[] = (Array.isArray(json.jobs) ? json.jobs : []).map((r) => ({ ...r, source: "email" }))
        const manualRows: InboundJobRow[] = (Array.isArray(uploadsJson.uploads) ? uploadsJson.uploads : []).map((v) => {
          return {
            id: String(v.id || ""),
            source: "manual",
            fileName: String(v.fileName || v.id || ""),
            subject: String(v.fileName || v.id || ""),
            status: "uploaded",
            receivedAt: String(v.uploadedAt || ""),
            supplier: String(v.supplier || ""),
            detectedType: String(v.documentType || "other"),
            attachmentPaths: [],
          }
        })
        const allRows = [...mailRows, ...manualRows].sort((a, b) => String(b.receivedAt || "").localeCompare(String(a.receivedAt || "")))
        if (!cancelled) setRows(allRows)
      } catch (e) {
        if (!cancelled) {
          setRows([])
          setLoadError((e as Error)?.message || "שגיאה בטעינת העלאות")
        }
      } finally {
        if (!silent && !cancelled) setLoading(false)
      }
    }
    void load()
    const id = window.setInterval(() => void load(true), 30_000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [open, restaurantId])

  const title = useMemo(() => "העלאות למסעדה (מייל + קבצים)", [])
  const stalePendingRows = useMemo(() => {
    const now = Date.now()
    return rows
      .filter((r) => (r.status || "pending") === "pending")
      .filter((r) => {
        const ms = toMillis(r.receivedAt)
        if (!ms) return false
        return now - ms >= STALE_PENDING_MINUTES * 60 * 1000
      })
      .sort((a, b) => (toMillis(a.receivedAt) || 0) - (toMillis(b.receivedAt) || 0))
  }, [rows])
  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      const resolvedType = (r.detectedType as "invoice" | "sales" | "other" | undefined) || classifyByHeuristic(r)
      const rowStatus = (r.status || (r.source === "manual" ? "uploaded" : "pending")) as "pending" | "processing" | "done" | "error" | "uploaded"
      const statusOk = statusFilter === "all" || rowStatus === statusFilter
      const typeOk = typeFilter === "all" || resolvedType === typeFilter
      return statusOk && typeOk
    })
  }, [rows, statusFilter, typeFilter])

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
              {stalePendingRows.length > 0 ? (
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-2.5 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs md:text-sm text-amber-900">
                    {stalePendingRows.length} מיילים בהמתנה יותר מ־{STALE_PENDING_MINUTES} דקות
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => setStatusFilter("pending")}>
                      הצג pending
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="h-7 text-xs"
                      disabled={busyJobId !== null || stalePendingRows.length === 0}
                      onClick={() => void processNow(stalePendingRows[0])}
                    >
                      עבד עכשיו (הישן ביותר)
                    </Button>
                  </div>
                </div>
              ) : null}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as "all" | "pending" | "processing" | "done" | "error" | "uploaded")}>
                  <SelectTrigger>
                    <SelectValue placeholder="סינון לפי סטטוס" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">כל הסטטוסים</SelectItem>
                    <SelectItem value="pending">pending</SelectItem>
                    <SelectItem value="processing">processing</SelectItem>
                    <SelectItem value="done">done</SelectItem>
                    <SelectItem value="error">error</SelectItem>
                      <SelectItem value="uploaded">uploaded</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as "all" | "invoice" | "sales" | "other")}>
                  <SelectTrigger>
                    <SelectValue placeholder="סינון לפי סוג מסמך" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">כל הסוגים</SelectItem>
                    <SelectItem value="invoice">חשבונית ספק</SelectItem>
                    <SelectItem value="sales">דוח מכירות</SelectItem>
                    <SelectItem value="other">אחר</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {loadError ? (
                <div className="text-sm text-destructive py-3 text-center">{loadError}</div>
              ) : null}
              {filteredRows.length === 0 ? (
                <div className="text-sm text-muted-foreground py-8 text-center">אין העלאות למסעדה זו</div>
              ) : (
                filteredRows.map((r) => (
                  <div key={r.id} className="border rounded-lg p-3 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium truncate">{r.fileName || r.subject || "(ללא נושא)"}</p>
                      <Badge variant={statusBadgeVariant(r.status)}>{r.status || (r.source === "manual" ? "uploaded" : "pending")}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-1">
                      <span dir="ltr">{r.source === "manual" ? (r.supplier || "-") : (r.fromEmail || "-")}</span>
                      <span>{formatReceivedAt(r.receivedAt)}</span>
                      <span>{r.source === "manual" ? "קובץ ידני" : `${(r.attachmentPaths?.length || 0).toString()} קבצים`}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{r.source === "manual" ? "קובץ" : "מייל"}</Badge>
                      <Badge variant="secondary">
                        {typeLabel((r.detectedType as "invoice" | "sales" | "other" | undefined) || classifyByHeuristic(r))}
                      </Badge>
                    </div>
                    {r.source === "email" && Array.isArray(r.attachmentPaths) && r.attachmentPaths.length > 0 ? (
                      <div className="text-[11px] text-muted-foreground font-mono space-y-0.5">
                        {r.attachmentPaths.slice(0, 3).map((p) => (
                          <div key={p} dir="ltr" className="truncate">• {p.split("/").pop()}</div>
                        ))}
                      </div>
                    ) : null}
                    <div className="flex items-center gap-2 pt-1">
                      {r.source === "email" ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="h-9 sm:h-7 text-xs gap-1"
                          disabled={busyJobId === r.id || !r.attachmentPaths?.length}
                          onClick={() => void processNow(r)}
                        >
                          {busyJobId === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                          עבד עכשיו
                        </Button>
                      ) : null}
                      {r.source === "email" && r.attachmentPaths?.[0] ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-9 sm:h-7 text-xs gap-1"
                          onClick={async () => {
                            try {
                              const headers = await firebaseBearerHeaders()
                              const resp = await fetch("/api/inbound-jobs/file", {
                                method: "POST",
                                headers: { "Content-Type": "application/json", ...headers },
                                body: JSON.stringify({
                                  restaurantId,
                                  jobId: r.id,
                                  attachmentPath: r.attachmentPaths![0],
                                }),
                              })
                              if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
                              const blob = await resp.blob()
                              const objectUrl = URL.createObjectURL(blob)
                              window.open(objectUrl, "_blank")
                              setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
                            } catch {
                              // ignore click failure
                            }
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
