"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import { motion } from "framer-motion"
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage"
import { writeBatch, doc, getDocs, collection, query, where, orderBy, limit, onSnapshot } from "firebase/firestore"
import { confirmSupplierInvoiceImport, confirmSalesReportImport } from "@/lib/restaurant-import-handlers"
import { auth, storage, db } from "@/lib/firebase"
import { useApp } from "@/contexts/app-context"
import { FilePreviewModal } from "@/components/file-preview-modal"
import type { ExtractedSupplierItem, ExtractedDishItem, SalesReportPeriod } from "@/lib/ai-extract"
import { detectDocumentType, type DetectedDocType } from "@/lib/ai-extract"
import { getClaudeApiKey } from "@/lib/claude"
import { normalizeDishCategoryToHebrew } from "@/lib/dish-category-hebrew"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { toast } from "sonner"
import { downloadExcelFromArrays } from "@/lib/export-excel"
import { useTranslations } from "@/lib/use-translations"
import {
  Upload as UploadIcon,
  FileSpreadsheet,
  FileText,
  Camera,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Trash2,
  Eye,
  Clock,
  File,
  Image as ImageIcon,
  Mail,
} from "lucide-react"

const ACCEPT = ".xlsx,.xls,.csv,.pdf,.doc,.docx,image/*"
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"]

interface UploadedFile {
  id: string
  name: string
  type: "excel" | "csv" | "invoice" | "image"
  size: string
  status: "processing" | "completed" | "error"
  progress: number
  uploadedAt: string
  recordsImported?: number
  errors?: string[]
  downloadUrl?: string
  source?: "email" | "manual"
  fromEmail?: string
}

function getFileType(file: File): UploadedFile["type"] {
  const ext = file.name.split(".").pop()?.toLowerCase()
  const mime = file.type
  if (IMAGE_TYPES.includes(mime) || ["jpg", "jpeg", "png", "webp", "gif"].includes(ext ?? "")) return "image"
  if (["xlsx", "xls"].includes(ext ?? "") || mime.includes("spreadsheet")) return "excel"
  if (ext === "csv" || mime === "text/csv") return "csv"
  if (ext === "pdf" || mime === "application/pdf") return "invoice"
  return "invoice"
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatTime(): string {
  const d = new Date()
  return `היום ${d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}`
}

const getUploadTypes = (t: (k: string) => string) => [
  { id: "prices", label: t("pages.upload.pricesLabel"), icon: FileSpreadsheet, description: t("pages.upload.pricesDesc") },
  { id: "sales", label: t("pages.upload.salesLabel"), icon: FileSpreadsheet, description: t("pages.upload.salesDesc") },
  { id: "inventory", label: t("pages.upload.inventoryLabel"), icon: FileSpreadsheet, description: t("pages.upload.inventoryDesc") },
]

const AI_ACCEPT = ".xlsx,.xls,.csv,.pdf,.rtf,image/*"

const isOwnerRole = (role: string, isSystemOwner?: boolean) => isSystemOwner || role === "owner"

export function Upload() {
  const t = useTranslations()
  const { currentRestaurantId, userRole, isSystemOwner, refreshIngredients, restaurants } = useApp()
  const uploadTypes = getUploadTypes(t)
  const isOwner = isOwnerRole(userRole, isSystemOwner)
  const [isDragging, setIsDragging] = useState(false)
  const [selectedType, setSelectedType] = useState<string | null>(null)
  const [uploads, setUploads] = useState<UploadedFile[]>([])
  const [fpmOpen, setFpmOpen] = useState(false)
  const [fpmFile, setFpmFile] = useState<File | null>(null)
  const [fpmType, setFpmType] = useState<"p" | "d" | "s">("p")
  const [detectingType, setDetectingType] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const mapDetectedToFpmType = (detected: DetectedDocType): "p" | "d" | "s" => {
    if (detected === "menu") return "d"
    if (detected === "sales") return "s"
    if (detected === "invoice") return "p"
    return "p"
  }

  const processFilesToStorage = useCallback((files: File[]) => {
    const uid = auth.currentUser?.uid ?? "anonymous"
    const basePath = `uploads/${uid}`
    files.forEach((file) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_")
      const storagePath = `${basePath}/${Date.now()}_${safeName}`
      const newFile: UploadedFile = {
        id,
        name: file.name,
        type: getFileType(file),
        size: formatSize(file.size),
        status: "processing",
        progress: 0,
        uploadedAt: formatTime(),
      }
      setUploads((prev) => [newFile, ...prev])
      const storageRef = ref(storage, storagePath)
      const task = uploadBytesResumable(storageRef, file)
      task.on(
        "state_changed",
        (snap) => {
          const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100)
          setUploads((prev) => prev.map((u) => (u.id === id ? { ...u, progress: pct } : u)))
        },
        async (err) => {
          setUploads((prev) =>
            prev.map((u) =>
              u.id === id ? { ...u, status: "error" as const, progress: 100, errors: [err.message] } : u
            )
          )
          toast.error(`שגיאה בהעלאת ${file.name}`)
        },
        async () => {
          const url = await getDownloadURL(storageRef)
          setUploads((prev) =>
            prev.map((u) =>
              u.id === id ? { ...u, status: "completed" as const, progress: 100, downloadUrl: url } : u
            )
          )
          toast.success(`${file.name} הועלה בהצלחה`)
        }
      )
    })
  }, [])

  const openFpm = useCallback((file: File, forceType?: "p" | "d" | "s") => {
    const ext = file.name.split(".").pop()?.toLowerCase()
    const isAiCapable = ["xlsx", "xls", "csv", "pdf", "png", "jpg", "jpeg", "gif", "webp", "rtf"].includes(ext ?? "")
    const explicitType = selectedType === "prices" ? "p" : selectedType === "recipe" ? "d" : selectedType === "sales" ? "s" : null
    const typeToUse = forceType ?? (explicitType ?? (isAiCapable ? "p" : null))
    if (isAiCapable && typeToUse) {
      // מנות (d), דוח מכירות (s) וחשבונית (p) כשמשתמש רגיל — דורשים מסעדה נבחרת
      const needsRestaurant = typeToUse === "d" || typeToUse === "s" || (typeToUse === "p" && !isOwner)
      if (needsRestaurant && !currentRestaurantId) {
        toast.error("בחר מסעדה לפני ההעלאה — כל הנתונים יישמרו במסעדה הנבחרת")
        return
      }
      setFpmFile(file)
      setFpmType(typeToUse)
      setFpmOpen(true)
    } else {
      processFilesToStorage([file])
    }
  }, [selectedType, processFilesToStorage, currentRestaurantId, isOwner])

  const processFiles = useCallback(
    async (files: FileList | File[] | null) => {
      const arr = files ? Array.from(files) : []
      if (!arr.length) return
      const first = arr[0]
      if (!first) return
      try {
        const ext = first.name.split(".").pop()?.toLowerCase()
        const isAiCapable = ["xlsx", "xls", "csv", "pdf", "png", "jpg", "jpeg", "gif", "webp", "rtf"].includes(ext ?? "")
        const hasExplicitType = selectedType === "prices" || selectedType === "recipe" || selectedType === "sales"

        if (isAiCapable) {
          if (hasExplicitType) {
            openFpm(first)
          } else {
            const hasKey = await getClaudeApiKey()
            if (!hasKey) {
              toast.warning("מפתח API לא הוגדר — ממשיך כחשבונית. הגדר מפתח בהגדרות לזיהוי אוטומטי.")
              openFpm(first, "p")
            } else {
            setDetectingType(true)
            try {
              const DETECT_TIMEOUT = 45_000
              const detected = await Promise.race([
                detectDocumentType(first),
                new Promise<"unknown">((_, reject) =>
                  setTimeout(() => reject(new Error("זיהוי ארך יותר מדי — ממשיך כחשבונית")), DETECT_TIMEOUT)
                ),
              ])
              const fpmType = mapDetectedToFpmType(detected)
              if (detected !== "unknown") {
                toast.info(`זוהה: ${detected === "menu" ? "תפריט מסעדה" : detected === "sales" ? "דוח מכירות" : "חשבונית ספק"}`)
                openFpm(first, fpmType)
              } else {
                toast.info("לא זוהה — מטפל כחשבונית ספק")
                openFpm(first, "p")
              }
            } catch (e) {
              toast.warning((e as Error)?.message || "שגיאה בזיהוי — ממשיך כחשבונית")
              openFpm(first, "p")
            } finally {
              setDetectingType(false)
            }
            }
          }
          if (arr.length > 1) processFilesToStorage(arr.slice(1))
        } else {
          processFilesToStorage(arr)
        }
      } catch (e) {
        toast.error((e as Error)?.message || "שגיאה בעיבוד הקובץ")
      }
    },
    [selectedType, openFpm, processFilesToStorage]
  )

  const handleConfirmSupplier = useCallback(
    async (items: ExtractedSupplierItem[], supName: string, saveToGlobal?: boolean) => {
      const ok = await confirmSupplierInvoiceImport({
        db,
        items,
        supName,
        saveToGlobal,
        isOwner,
        currentRestaurantId,
        refreshIngredients,
      })
      if (ok) {
        setUploads((prev) => [
          {
            id: `${Date.now()}`,
            name: fpmFile?.name ?? "קובץ",
            type: "excel",
            size: "—",
            status: "completed",
            progress: 100,
            uploadedAt: formatTime(),
            recordsImported: items.length,
          },
          ...prev,
        ])
      }
      setFpmFile(null)
    },
    [currentRestaurantId, isOwner, fpmFile, refreshIngredients]
  )

  const handleConfirmDishes = useCallback(
    async (items: ExtractedDishItem[]) => {
      if (!currentRestaurantId) {
        toast.error("יש לבחור מסעדה לפני שמירת מנות")
        setFpmFile(null)
        return
      }
      const toSave: ExtractedDishItem[] = items.filter((it) => it.name?.trim())
      if (toSave.length === 0) {
        toast.error("אין מנות לשמירה")
        setFpmFile(null)
        return
      }
      try {
        const recSnap = await getDocs(collection(db, "restaurants", currentRestaurantId, "recipes"))
        const existingNames = new Set(recSnap.docs.map((d) => d.id))
        const newDishes = toSave.filter((it) => !existingNames.has(it.name!.trim()))
        if (newDishes.length === 0) {
          toast.info("כל המנות כבר קיימות במסעדה — עבור לעץ מוצר לעריכה")
          setFpmFile(null)
          return
        }
        const batch = writeBatch(db)
        newDishes.forEach((it) => {
          const name = it.name!.trim()
          const ingredients = (it.ingredients || []).map((ing) => ({
            name: ing.name,
            qty: ing.qty,
            unit: ing.unit || "גרם",
            waste: 0,
          }))
          batch.set(
            doc(db, "restaurants", currentRestaurantId, "recipes", name),
            {
              name,
              category: normalizeDishCategoryToHebrew(it.category || "עיקריות"),
              sellingPrice: it.price || 0,
              ingredients,
              isCompound: false,
            },
            { merge: true }
          )
        })
        await batch.commit()
        const skipped = toSave.length - newDishes.length
        toast.success(
          `${newDishes.length} מנות נוספו בהצלחה${skipped > 0 ? ` (${skipped} כבר קיימות — דולגו)` : ""} — עבור לעץ מוצר לעריכה`
        )
        refreshIngredients?.()
      } catch (e) {
        toast.error("שגיאה בשמירה: " + (e as Error).message)
      }
      setFpmFile(null)
    },
    [currentRestaurantId, refreshIngredients]
  )

  const handleConfirmSales = useCallback(
    async (
      items: Array<{ name: string; qty: number; price: number }>,
      meta?: {
        salesReportPeriod?: SalesReportPeriod
        salesReportDateFrom?: string
        salesReportDateTo?: string
      }
    ) => {
      await confirmSalesReportImport({
        db,
        currentRestaurantId,
        items,
        meta,
        refreshIngredients,
      })
      setFpmFile(null)
    },
    [currentRestaurantId, refreshIngredients]
  )

  // Safari/Chrome: מונע מהדפדפן לפתוח קובץ כשמשחררים מחוץ לאזור — חיוני לגרירה
  useEffect(() => {
    const prevent = (e: DragEvent) => {
      if (e.dataTransfer?.types?.includes("Files")) {
        e.preventDefault()
        e.dataTransfer.dropEffect = "copy"
      }
    }
    window.addEventListener("dragover", prevent, { passive: false })
    window.addEventListener("drop", prevent, { passive: false })
    return () => {
      window.removeEventListener("dragover", prevent)
      window.removeEventListener("drop", prevent)
    }
  }, [])

  // האזנה לקבצים שהגיעו ממייל
  useEffect(() => {
    if (!currentRestaurantId) return
    const q = query(
      collection(db, "inboundJobs"),
      where("restaurantId", "==", currentRestaurantId),
      where("status", "==", "pending"),
      orderBy("receivedAt", "desc"),
      limit(10)
    )
    const unsub = onSnapshot(q, (snap) => {
      snap.docChanges().forEach((change) => {
        if (change.type === "added") {
          const job = change.doc.data() as {
            attachmentPaths?: string[]
            receivedAt?: { toDate?: () => Date } | string | number
            fromEmail?: string
          }
          const path0 = job.attachmentPaths?.[0]
          const nameFromPath = typeof path0 === "string" ? path0.split("/").pop() : undefined
          const receivedRaw = job.receivedAt
          let uploadedAtStr: string
          if (receivedRaw && typeof (receivedRaw as { toDate?: () => Date }).toDate === "function") {
            uploadedAtStr = (receivedRaw as { toDate: () => Date }).toDate().toLocaleString("he-IL")
          } else if (receivedRaw !== undefined && receivedRaw !== null) {
            uploadedAtStr = new Date(receivedRaw as string | number).toLocaleString("he-IL")
          } else {
            uploadedAtStr = new Date().toLocaleString("he-IL")
          }
          const emailFile: UploadedFile = {
            id: change.doc.id,
            name: nameFromPath ?? "קובץ ממייל",
            type: "invoice",
            size: "",
            status: "completed",
            progress: 100,
            uploadedAt: uploadedAtStr,
            source: "email",
            fromEmail: job.fromEmail,
          }
          setUploads((prev) => {
            if (prev.find((u) => u.id === change.doc.id)) return prev
            return [emailFile, ...prev]
          })
        }
      })
    })
    return () => unsub()
  }, [currentRestaurantId])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = "copy"
    e.dataTransfer.effectAllowed = "copy"
    setIsDragging(true)
  }, [])

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragging(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragging(false)
      let files: File[] = []
      if (e.dataTransfer?.files?.length) {
        files = Array.from(e.dataTransfer.files)
      } else if (e.dataTransfer?.items?.length) {
        for (let i = 0; i < e.dataTransfer.items.length; i++) {
          const item = e.dataTransfer.items[i]
          if (item.kind === "file") {
            const f = item.getAsFile()
            if (f) files.push(f)
          }
        }
      }
      if (files.length) {
        toast.info(`נמצאו ${files.length} קבצים — מעבד...`)
        processFiles(files)
      } else {
        toast.error("לא נמצאו קבצים — גרור קובץ מהמחשב (לא מתמונה בדף)")
      }
    },
    [processFiles]
  )

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      processFiles(e.target.files)
      e.target.value = ""
    },
    [processFiles]
  )

  const handleRemove = useCallback((id: string) => {
    setUploads((prev) => prev.filter((u) => u.id !== id))
  }, [])

  const getFileIcon = (type: string) => {
    switch (type) {
      case "excel": return FileSpreadsheet
      case "csv": return FileSpreadsheet
      case "invoice": return FileText
      case "image": return ImageIcon
      default: return File
    }
  }

  const getStatusConfig = (status: string) => {
    switch (status) {
      case "processing": return { label: "מעבד...", color: "bg-blue-100 text-blue-700", icon: RefreshCw }
      case "completed": return { label: "הושלם", color: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 }
      case "error": return { label: "שגיאה", color: "bg-red-100 text-red-700", icon: XCircle }
      default: return { label: "לא ידוע", color: "bg-gray-100 text-gray-700", icon: AlertTriangle }
    }
  }

  const stats = {
    total: uploads.length,
    completed: uploads.filter(u => u.status === "completed").length,
    processing: uploads.filter(u => u.status === "processing").length,
    errors: uploads.filter(u => u.status === "error").length
  }

  const restaurantName = restaurants?.find((r) => r.id === currentRestaurantId)?.name

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* באנר מסעדה נבחרת — כל ההעלאות נשמרות במסעדה הזו */}
      {currentRestaurantId && restaurantName ? (
        <Card className="border-primary/50 bg-primary/5">
          <CardContent className="py-3 px-4 flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />
            <span className="text-sm font-medium">
              העלאה למסעדה: <strong>{restaurantName}</strong> — כל הנתונים יישמרו במסעדה הזו
            </span>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-amber-500/50 bg-amber-50 dark:bg-amber-950/20">
          <CardContent className="py-3 px-4 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
            <span className="text-sm">
              בחר מסעדה כדי להעלות — מנות, דוחות מכירות ומחירונים יישמרו במסעדה הנבחרת
            </span>
          </CardContent>
        </Card>
      )}
      <FilePreviewModal
        open={fpmOpen}
        onOpenChange={(o) => {
          setFpmOpen(o)
          if (!o) setFpmFile(null)
        }}
        file={fpmFile}
        type={fpmType}
        restaurantName={restaurantName}
        canSaveToGlobal={isOwner && (fpmType === "p")}
        onConfirmSupplier={handleConfirmSupplier}
        onConfirmDishes={handleConfirmDishes}
        onConfirmSales={handleConfirmSales}
      />
      {/* Upload Types */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {uploadTypes.map((type, index) => {
          const Icon = type.icon
          return (
            <motion.div
              key={type.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <Card 
                className={`cursor-pointer transition-all hover:shadow-md hover:border-primary/50 ${selectedType === type.id ? 'border-primary bg-primary/5' : ''}`}
                onClick={() => setSelectedType(type.id)}
              >
                <CardContent className="p-4 text-center">
                  <div className={`w-12 h-12 mx-auto mb-3 rounded-xl flex items-center justify-center ${selectedType === type.id ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                    <Icon className="w-6 h-6" />
                  </div>
                  <h3 className="font-semibold text-sm">{type.label}</h3>
                  <p className="text-xs text-muted-foreground mt-1">{type.description}</p>
                </CardContent>
              </Card>
            </motion.div>
          )
        })}
      </div>

      {/* Drop Zone */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <Card
          className={isDragging ? "ring-2 ring-primary ring-offset-2" : ""}
        >
          <CardContent className="p-6">
            <div
              className={`border-2 border-dashed rounded-xl p-8 text-center transition-all min-h-[180px] flex flex-col items-center justify-center cursor-pointer ${
                detectingType ? "border-primary bg-primary/5 pointer-events-none" :
                isDragging 
                  ? 'border-primary bg-primary/5' 
                  : 'border-muted-foreground/25 hover:border-primary/50'
              }`}
            >
              <motion.div
                animate={isDragging ? { scale: 1.05 } : { scale: 1 }}
                className="space-y-4"
              >
                <div className={`w-16 h-16 mx-auto rounded-full flex items-center justify-center ${detectingType || isDragging ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                  {detectingType ? <RefreshCw className="w-8 h-8 animate-spin" /> : <UploadIcon className="w-8 h-8" />}
                </div>
                <div>
                  <h3 className="font-semibold text-lg mb-1">
                    {detectingType ? "מזהה סוג מסמך..." : isDragging ? "שחרר כאן להעלאה" : "גרור קבצים לכאן"}
                  </h3>
                  <p className="text-muted-foreground text-sm">
                    {detectingType ? "AI מנתח את הקובץ" : "תמונה/Excel/PDF — AI יזהה אוטומטית: תפריט, דוח מכירות או חשבונית"}
                  </p>
                </div>
                <div className="flex flex-wrap justify-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline">Excel (.xlsx)</Badge>
                  <Badge variant="outline">CSV</Badge>
                  <Badge variant="outline">PDF</Badge>
                  <Badge variant="outline">RTF</Badge>
                  <Badge variant="outline">תמונות</Badge>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  id="upload-files"
                  name="uploadFiles"
                  accept={(selectedType === "prices" || selectedType === "recipe" || selectedType === "sales") ? AI_ACCEPT : ACCEPT}
                  multiple
                  className="hidden"
                  onChange={handleFileSelect}
                />
                <Button
                  type="button"
                  className="mt-2"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <UploadIcon className="w-4 h-4 ml-2" />
                  בחר קבצים
                </Button>
              </motion.div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Upload History */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">היסטוריית העלאות</CardTitle>
            <div className="flex gap-2">
              <Badge variant="secondary">{stats.completed} הושלמו</Badge>
              {stats.processing > 0 && <Badge variant="outline" className="text-blue-600">{stats.processing} בעיבוד</Badge>}
              {stats.errors > 0 && <Badge variant="destructive">{stats.errors} שגיאות</Badge>}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {uploads.length === 0 && (
              <div className="p-8 text-center text-muted-foreground text-sm">
                עדיין לא הועלו קבצים. גרור לכאן או לחץ "בחר קבצים"
              </div>
            )}
            {uploads.map((file, index) => {
              const FileIcon = getFileIcon(file.type)
              const statusConfig = getStatusConfig(file.status)
              const StatusIcon = statusConfig.icon

              return (
                <motion.div
                  key={file.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="p-4 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      file.type === "excel" || file.type === "csv" ? 'bg-emerald-100 text-emerald-600' :
                      file.type === "invoice" ? 'bg-blue-100 text-blue-600' :
                      'bg-purple-100 text-purple-600'
                    }`}>
                      <FileIcon className="w-5 h-5" />
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium truncate">{file.name}</h4>
                        <Badge className={statusConfig.color}>
                          <StatusIcon className={`w-3 h-3 ml-1 ${file.status === 'processing' ? 'animate-spin' : ''}`} />
                          {statusConfig.label}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1 flex-wrap">
                        {file.source === "email" && (
                          <Badge variant="secondary" className="text-xs gap-1 me-1">
                            <Mail className="w-3 h-3" />
                            ממייל
                            {file.fromEmail && <span className="opacity-70">{file.fromEmail}</span>}
                          </Badge>
                        )}
                        <span>{file.size}</span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {file.uploadedAt}
                        </span>
                        {file.recordsImported && (
                          <span className="text-emerald-600">{file.recordsImported} רשומות יובאו</span>
                        )}
                      </div>
                      {file.status === "processing" && (
                        <Progress value={file.progress} className="h-1.5 mt-2" />
                      )}
                      {file.errors && file.errors.length > 0 && (
                        <div className="mt-2 text-sm text-red-600">
                          {file.errors.map((error, i) => (
                            <div key={i} className="flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" />
                              {error}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      {file.downloadUrl && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => window.open(file.downloadUrl, "_blank")}
                          title="צפה בקובץ"
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-red-500"
                        onClick={() => handleRemove(file.id)}
                        title="הסר מרשימה"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Templates Download */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">תבניות להורדה</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Button
              variant="outline"
              className="h-auto py-4 flex-col gap-2"
              onClick={() => {
                downloadExcelFromArrays(
                  [["שם הרכיב", "מחיר", "יחידה", "פחת %", "ספק", "מק\"ט"]],
                  "תבנית_מחירון",
                  "מחירון"
                )
                toast.success("התבנית הורדה")
              }}
            >
              <FileSpreadsheet className="w-6 h-6 text-emerald-600" />
              <span>תבנית מחירון</span>
              <span className="text-xs text-muted-foreground">Excel</span>
            </Button>
            <Button
              variant="outline"
              className="h-auto py-4 flex-col gap-2"
              onClick={() => {
                downloadExcelFromArrays(
                  [["שם הרכיב", "מחיר", "יחידה", "פחת %", "מלאי", "מינימום", "ספק", "מק\"ט"]],
                  "תבנית_רכיבים",
                  "רכיבים"
                )
                toast.success("התבנית הורדה")
              }}
            >
              <FileSpreadsheet className="w-6 h-6 text-emerald-600" />
              <span>תבנית רכיבים</span>
              <span className="text-xs text-muted-foreground">Excel</span>
            </Button>
            <Button
              variant="outline"
              className="h-auto py-4 flex-col gap-2"
              onClick={() => {
                downloadExcelFromArrays(
                  [["שם הרכיב", "כמות"]],
                  "תבנית_מלאי",
                  "מלאי"
                )
                toast.success("התבנית הורדה")
              }}
            >
              <FileSpreadsheet className="w-6 h-6 text-emerald-600" />
              <span>תבנית מלאי</span>
              <span className="text-xs text-muted-foreground">Excel</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
