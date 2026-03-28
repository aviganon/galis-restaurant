"use client"

import { useState, useCallback, useRef } from "react"
import { motion } from "framer-motion"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Upload as UploadIcon, FileText, X, Loader2 } from "lucide-react"
import { FilePreviewModal } from "@/components/file-preview-modal"
import { detectDocumentType, isSupportedFormat } from "@/lib/ai-extract"
import type { ExtractedSupplierItem } from "@/lib/ai-extract"
import { getClaudeApiKey } from "@/lib/claude"
import { toast } from "sonner"
import { useApp } from "@/contexts/app-context"

const DETECT_TIMEOUT_MS = 45_000

const AI_DETECT_EXTENSIONS = new Set(["xlsx", "xls", "csv", "pdf", "png", "jpg", "jpeg", "gif", "webp", "rtf"])

const INVOICE_ACCEPT = ".xlsx,.xls,.csv,.pdf,.rtf,image/*"

interface SuppliersInvoiceUploadProps {
  restaurantName?: string
  onConfirm: (items: ExtractedSupplierItem[], supName: string, saveToGlobal?: boolean) => Promise<void>
  onClose: () => void
  onSuccess?: () => void
}

export function SuppliersInvoiceUpload({ restaurantName, onConfirm, onClose, onSuccess }: SuppliersInvoiceUploadProps) {
  const { currentRestaurantId } = useApp()
  const [fpmOpen, setFpmOpen] = useState(false)
  const [fpmFile, setFpmFile] = useState<File | null>(null)
  const [isInvoiceDragging, setIsInvoiceDragging] = useState(false)
  const [detectingDocType, setDetectingDocType] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const openInvoiceModal = useCallback((file: File) => {
    setFpmFile(file)
    setFpmOpen(true)
  }, [])

  /** זיהוי סוג לפני חשבונית: תפריט/מכירות — הודעה; חשבונית/לא ידוע — המשך כרגיל */
  const handleFileForInvoiceFlow = useCallback(
    async (file: File) => {
      if (!isSupportedFormat(file)) {
        toast.error("פורמט לא נתמך. השתמש ב-PDF, Excel, CSV, RTF או תמונה.")
        return
      }
      const ext = file.name.split(".").pop()?.toLowerCase() ?? ""
      if (!AI_DETECT_EXTENSIONS.has(ext)) {
        openInvoiceModal(file)
        return
      }
      const hasKey = await getClaudeApiKey()
      if (!hasKey) {
        toast.warning("מפתח API לא הוגדר — ממשיך כחשבונית. לזיהוי אוטומטי של תפריט/מכירות הגדר מפתח בהגדרות.")
        openInvoiceModal(file)
        return
      }
      setDetectingDocType(true)
      try {
        const detected = await Promise.race([
          detectDocumentType(file),
          new Promise<"unknown">((_, reject) =>
            setTimeout(() => reject(new Error("timeout")), DETECT_TIMEOUT_MS),
          ),
        ])
        if (detected === "menu") {
          toast.error(
            "זוהה תפריט מסעדה — לא חשבונית ספק. לייבוא מנות: בעץ מוצר פתח «ייבוא», בחר «מנות» או «תמונת מנה», או לשונית «העלאה» עם סוג תפריט/מנות.",
            { duration: 10_000 },
          )
          return
        }
        if (detected === "sales") {
          toast.error(
            "זוהה דוח מכירות — לא חשבונית ספק. העלה דרך לשונית «העלאה» (דוח מכירות) או ייבוא מכירות בעץ מוצר.",
            { duration: 10_000 },
          )
          return
        }
        if (detected === "invoice") {
          toast.info("זוהתה חשבונית ספק — ממשיך בחילוץ.")
        } else {
          toast.info("לא זוהה סוג מסמך בבירור — מטפל כחשבונית ספק.")
        }
        openInvoiceModal(file)
      } catch (e) {
        const msg = (e as Error)?.message
        if (msg === "timeout") {
          toast.warning("זיהוי סוג המסמך ארך יותר מדי — ממשיך כחשבונית ספק.")
        } else {
          toast.warning((e as Error)?.message || "שגיאה בזיהוי — ממשיך כחשבונית ספק.")
        }
        openInvoiceModal(file)
      } finally {
        setDetectingDocType(false)
      }
    },
    [openInvoiceModal],
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = "copy"
    setIsInvoiceDragging(true)
  }, [])

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsInvoiceDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsInvoiceDragging(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsInvoiceDragging(false)
      if (detectingDocType) return
      const files = e.dataTransfer?.files ? Array.from(e.dataTransfer.files) : []
      if (files.length > 0) void handleFileForInvoiceFlow(files[0])
    },
    [detectingDocType, handleFileForInvoiceFlow],
  )

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files
      if (files?.length && !detectingDocType) void handleFileForInvoiceFlow(files[0])
      e.target.value = ""
    },
    [detectingDocType, handleFileForInvoiceFlow],
  )

  const handleConfirm = useCallback(
    async (items: ExtractedSupplierItem[], supName: string, saveToGlobal?: boolean) => {
      await onConfirm(items, supName, saveToGlobal)
      setFpmFile(null)
      setFpmOpen(false)
      onSuccess?.()
    },
    [onConfirm, onSuccess]
  )

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="mb-6"
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <Card className={isInvoiceDragging ? "ring-2 ring-primary ring-offset-2" : ""}>
        <CardContent className="p-6 relative">
          <Button variant="ghost" size="icon" className="absolute left-2 top-2 h-8 w-8" onClick={onClose} disabled={detectingDocType}>
            <X className="w-4 h-4" />
          </Button>
          {detectingDocType && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-xl bg-background/80 backdrop-blur-sm">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground px-4 text-center">מזהה סוג מסמך…</p>
            </div>
          )}
          <div
            className={`border-2 border-dashed rounded-xl p-6 text-center transition-all min-h-[140px] flex flex-col items-center justify-center ${
              detectingDocType ? "cursor-wait opacity-70" : "cursor-pointer"
            } ${
              isInvoiceDragging ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50"
            }`}
            onClick={() => {
              if (!detectingDocType) fileInputRef.current?.click()
            }}
          >
            <div className="flex items-center gap-3 mb-3">
              <div
                className={`w-12 h-12 rounded-full flex items-center justify-center ${isInvoiceDragging ? "bg-primary text-primary-foreground" : "bg-muted"}`}
              >
                <FileText className="w-6 h-6" />
              </div>
              <div className="text-right">
                <h3 className="font-semibold">חשבוניות ספקים</h3>
                <p className="text-sm text-muted-foreground">גרור PDF/Excel/תמונה — AI יחלץ רכיבים ומחירים (PDF עד 8MB)</p>
              </div>
            </div>
            <div className="flex flex-wrap justify-center gap-2 text-xs text-muted-foreground mb-3">
              <Badge variant="outline">PDF</Badge>
              <Badge variant="outline">Excel</Badge>
              <Badge variant="outline">CSV</Badge>
              <Badge variant="outline">תמונות</Badge>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept={INVOICE_ACCEPT}
              className="hidden"
              onChange={handleFileSelect}
              aria-hidden
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={detectingDocType}
              onClick={(e) => {
                e.stopPropagation()
                fileInputRef.current?.click()
              }}
            >
              {detectingDocType ? <Loader2 className="w-4 h-4 ml-2 animate-spin" /> : <UploadIcon className="w-4 h-4 ml-2" />}
              בחר קובץ
            </Button>
          </div>
        </CardContent>
      </Card>

      <FilePreviewModal
        open={fpmOpen}
        onOpenChange={(o) => {
          setFpmOpen(o)
          if (!o) setFpmFile(null)
        }}
        file={fpmFile}
        type="p"
        restaurantName={restaurantName}
        canSaveToGlobal={false}
        currentRestaurantId={currentRestaurantId}
        onConfirmSupplier={handleConfirm}
      />
    </motion.div>
  )
}
