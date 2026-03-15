"use client"

import { useState, useCallback, useRef } from "react"
import { motion } from "framer-motion"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Upload as UploadIcon, FileText, X } from "lucide-react"
import { FilePreviewModal } from "@/components/file-preview-modal"
import { isSupportedFormat } from "@/lib/ai-extract"
import type { ExtractedSupplierItem } from "@/lib/ai-extract"
import { toast } from "sonner"

const INVOICE_ACCEPT = ".xlsx,.xls,.csv,.pdf,.rtf,image/*"

interface SuppliersInvoiceUploadProps {
  restaurantName?: string
  onConfirm: (items: ExtractedSupplierItem[], supName: string, saveToGlobal?: boolean) => Promise<void>
  onClose: () => void
  onSuccess?: () => void
}

export function SuppliersInvoiceUpload({ restaurantName, onConfirm, onClose, onSuccess }: SuppliersInvoiceUploadProps) {
  const [fpmOpen, setFpmOpen] = useState(false)
  const [fpmFile, setFpmFile] = useState<File | null>(null)
  const [isInvoiceDragging, setIsInvoiceDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsInvoiceDragging(false)
    const files = e.dataTransfer?.files ? Array.from(e.dataTransfer.files) : []
    if (files.length > 0) {
      const f = files[0]
      if (!isSupportedFormat(f)) {
        toast.error("פורמט לא נתמך. השתמש ב-PDF, Excel, CSV, RTF או תמונה.")
        return
      }
      setFpmFile(f)
      setFpmOpen(true)
    }
  }, [])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files?.length) {
      const f = files[0]
      if (!isSupportedFormat(f)) {
        toast.error("פורמט לא נתמך. השתמש ב-PDF, Excel, CSV, RTF או תמונה.")
        e.target.value = ""
        return
      }
      setFpmFile(f)
      setFpmOpen(true)
    }
    e.target.value = ""
  }, [])

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
          <Button variant="ghost" size="icon" className="absolute left-2 top-2 h-8 w-8" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
          <div
            className={`border-2 border-dashed rounded-xl p-6 text-center transition-all min-h-[140px] flex flex-col items-center justify-center cursor-pointer ${
              isInvoiceDragging ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50"
            }`}
            onClick={() => fileInputRef.current?.click()}
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
              onClick={(e) => {
                e.stopPropagation()
                fileInputRef.current?.click()
              }}
            >
              <UploadIcon className="w-4 h-4 ml-2" />
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
