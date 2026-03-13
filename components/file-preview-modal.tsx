"use client"

import { useState, useEffect, useCallback } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { extractWithAI, type ExtractType, type ExtractedItem, type ExtractedSupplierItem, type ExtractedDishItem } from "@/lib/ai-extract"
import { toast } from "sonner"
import { Loader2, X, Plus, Globe } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"

interface FilePreviewModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  file: File | null
  type: ExtractType
  supplierName?: string
  restaurantName?: string | null
  canSaveToGlobal?: boolean
  /** כשמופעל — שמירה תמיד לקטלוג הגלובלי (לפאנל מנהל) */
  forceSaveToGlobal?: boolean
  onConfirmSupplier?: (items: ExtractedSupplierItem[], supplierName: string, saveToGlobal?: boolean) => void
  onConfirmDishes?: (items: ExtractedDishItem[]) => void
  onConfirmSales?: (items: Array<{ name: string; qty: number; price: number }>) => void
}

export function FilePreviewModal({
  open,
  onOpenChange,
  file,
  type,
  supplierName: initialSupplier = "",
  restaurantName,
  canSaveToGlobal = false,
  forceSaveToGlobal = false,
  onConfirmSupplier,
  onConfirmDishes,
  onConfirmSales,
}: FilePreviewModalProps) {
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState<ExtractedItem[]>([])
  const [supplierName, setSupplierName] = useState(initialSupplier)
  const [invoiceDate, setInvoiceDate] = useState<string | null>(null)
  const [detectedSupplier, setDetectedSupplier] = useState<string | null>(null)
  const [saveToGlobal, setSaveToGlobal] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [webPriceByName, setWebPriceByName] = useState<Record<string, { price: number; store: string; unit: string }>>({})
  const [webPriceLoading, setWebPriceLoading] = useState(false)

  useEffect(() => {
    if (!open || !file) return
    setItems([])
    setError(null)
    setSupplierName(initialSupplier)
    setInvoiceDate(null)
    setDetectedSupplier(null)
    setSaveToGlobal(forceSaveToGlobal)
    setWebPriceByName({})
    setLoading(true)
    extractWithAI(file, type, initialSupplier || undefined)
      .then((res) => {
        if (res.no_prices) {
          setItems([])
          setError("תעודת משלוח — אין מחירים")
          return
        }
        setItems(res.items || [])
        if (res.supplier_name && !initialSupplier) {
          setSupplierName(res.supplier_name)
          setDetectedSupplier(res.supplier_name)
        }
        if (res.invoice_date) setInvoiceDate(res.invoice_date)
      })
      .catch((e) => {
        setError(e.message || "שגיאה בניתוח")
        toast.error(e.message)
      })
      .finally(() => setLoading(false))
  }, [open, file, type, initialSupplier, forceSaveToGlobal])

  const updateItem = useCallback((idx: number, field: string, value: string | number) => {
    setItems((prev) => {
      const next = [...prev]
      const it = next[idx] as Record<string, unknown>
      if (it) it[field] = value
      return next
    })
  }, [])

  const removeItem = useCallback((idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx))
  }, [])

  const addRow = useCallback(() => {
    if (type === "p") {
      setItems((prev) => [...prev, { name: "", price: 0, unit: "קג", sku: "", qty: 0 }])
    } else if (type === "d") {
      setItems((prev) => [...prev, { name: "", price: 0, category: "אחר", ingredients: [] }])
    } else {
      setItems((prev) => [...prev, { name: "", qty: 0, price: 0 }])
    }
  }, [type])

  const fetchWebPrices = useCallback(async () => {
    if (type !== "p") return
    const names = (items as ExtractedSupplierItem[]).map((i) => (i.name || "").trim()).filter(Boolean)
    const unique = [...new Set(names)]
    if (unique.length === 0) {
      toast.error("הזן שמות רכיבים לחיפוש")
      return
    }
    setWebPriceLoading(true)
    const next: Record<string, { price: number; store: string; unit: string }> = {}
    try {
      for (const name of unique) {
        try {
          const res = await fetch("/api/ingredient-web-price", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name }),
          })
          if (res.ok) {
            const d = await res.json()
            if (d?.price) next[name] = { price: d.price, store: d.store || "—", unit: d.unit || "קג" }
          }
        } catch {
          // נסה דרך AI מהלקוח
          const { fetchWebPriceForIngredient } = await import("@/lib/ai-extract")
          const d = await fetchWebPriceForIngredient(name)
          if (d) next[name] = { price: d.price, store: d.store || "—", unit: d.unit || "קג" }
        }
        await new Promise((r) => setTimeout(r, 400))
      }
      setWebPriceByName((prev) => ({ ...prev, ...next }))
      if (Object.keys(next).length > 0) toast.success(`נמצאו מחירים ל־${Object.keys(next).length} רכיבים`)
    } catch (e) {
      toast.error((e as Error)?.message || "שגיאה בחיפוש מחירים")
    } finally {
      setWebPriceLoading(false)
    }
  }, [type, items])

  const handleConfirm = useCallback(() => {
    if (type === "p") {
      if (!supplierName.trim()) {
        toast.error("יש להזין שם ספק")
        return
      }
      onConfirmSupplier?.(items as ExtractedSupplierItem[], supplierName.trim(), forceSaveToGlobal ? true : (canSaveToGlobal ? saveToGlobal : undefined))
    } else if (type === "d") {
      onConfirmDishes?.(items as ExtractedDishItem[])
    } else {
      onConfirmSales?.(items as Array<{ name: string; qty: number; price: number }>)
    }
    onOpenChange(false)
  }, [type, items, supplierName, saveToGlobal, canSaveToGlobal, forceSaveToGlobal, onConfirmSupplier, onConfirmDishes, onConfirmSales, onOpenChange])

  const typeLabel = type === "p" ? "מחירי ספקים" : type === "d" ? "ייבוא תפריט" : "דוח מכירות"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {file?.name ?? "קובץ"}
            <span className="text-sm font-normal text-muted-foreground">— {typeLabel}</span>
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto space-y-4 py-2">
          {loading && (
            <div className="flex flex-col items-center gap-4 py-12">
              <Loader2 className="w-10 h-10 animate-spin text-primary" />
              <p className="text-muted-foreground">Claude מנתח את הקובץ...</p>
              <Progress value={66} className="w-48" />
            </div>
          )}
          {error && !loading && (
            <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-200">
              {error}
            </div>
          )}
          {!loading && !error && items.length > 0 && (
            <>
              {/* ישויוך — למי הפריטים ישויכו */}
              <div className="p-3 rounded-lg bg-muted/50 border space-y-2">
                <p className="text-sm font-medium">ישויוך הפריטים</p>
                {type === "p" && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="fpm-supplier">שם ספק — הפריטים ישויכו לספק זה</Label>
                      {detectedSupplier && (
                        <p className="text-xs text-emerald-600 dark:text-emerald-500">זוהה מהחשבונית: {detectedSupplier}</p>
                      )}
                      <Input
                        id="fpm-supplier"
                        name="fpmSupplier"
                        value={supplierName}
                        onChange={(e) => setSupplierName(e.target.value)}
                        placeholder="שם הספק"
                        className="h-10"
                      />
                    </div>
                    {invoiceDate && (
                      <p className="text-xs text-muted-foreground">תאריך חשבונית: {invoiceDate}</p>
                    )}
                  </>
                )}
                {(type === "d" || type === "s") && (
                  <p className="text-sm text-muted-foreground">
                    {restaurantName ? `הפריטים ישויכו למסעדה: ${restaurantName}` : "הפריטים ישויכו למסעדה הנבחרת — בחר מסעדה למעלה"}
                  </p>
                )}
              </div>
              {type === "p" && (
                <div className="space-y-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={fetchWebPrices}
                    disabled={webPriceLoading || items.length === 0}
                  >
                    {webPriceLoading ? <Loader2 className="w-4 h-4 animate-spin ml-2" /> : <Globe className="w-4 h-4 ml-2" />}
                    השוואת מחירים באינטרנט
                  </Button>
                  {canSaveToGlobal && !forceSaveToGlobal && (
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Checkbox checked={saveToGlobal} onCheckedChange={(v) => setSaveToGlobal(!!v)} />
                      <span className="text-sm">שמור לקטלוג הגלובלי (רק בעלים)</span>
                    </label>
                  )}
                </div>
              )}
              <div className="border rounded-lg overflow-hidden">
                <div className="overflow-x-auto max-h-[320px] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted sticky top-0">
                      <tr>
                        <th className="text-right p-2 font-semibold">שם</th>
                        {type === "p" && (
                          <>
                            <th className="text-center p-2 font-semibold">כמות</th>
                            <th className="text-center p-2 font-semibold">מחיר חשבונית</th>
                            <th className="text-center p-2 font-semibold">מחיר באינטרנט</th>
                            <th className="text-center p-2 font-semibold">יחידה</th>
                            <th className="text-center p-2 font-semibold w-16">מק"ט</th>
                          </>
                        )}
                        {(type === "d" || type === "s") && (
                          <>
                            {type === "s" && <th className="text-center p-2 font-semibold">כמות</th>}
                            <th className="text-center p-2 font-semibold">מחיר</th>
                          </>
                        )}
                        <th className="w-10" />
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, idx) => (
                        <tr key={idx} className="border-t border-border">
                          <td className="p-2">
                            <Input
                              id={`fpm-item-${idx}-name`}
                              name={`fpmItemName-${idx}`}
                              value={(item as Record<string, unknown>).name ?? ""}
                              onChange={(e) => updateItem(idx, "name", e.target.value)}
                              className="h-8 text-sm"
                              aria-label="שם"
                            />
                          </td>
                          {type === "p" && (
                            <>
                              <td className="p-2">
                                <Input
                                  id={`fpm-item-${idx}-qty`}
                                  name={`fpmItemQty-${idx}`}
                                  type="number"
                                  value={(item as ExtractedSupplierItem).qty ?? 0}
                                  onChange={(e) => updateItem(idx, "qty", parseFloat(e.target.value) || 0)}
                                  className="h-8 text-sm w-16"
                                  aria-label="כמות"
                                  placeholder="מלאי"
                                />
                              </td>
                              <td className="p-2">
                                <Input
                                  id={`fpm-item-${idx}-price`}
                                  name={`fpmItemPrice-${idx}`}
                                  type="number"
                                  value={(item as ExtractedSupplierItem).price ?? 0}
                                  onChange={(e) => updateItem(idx, "price", parseFloat(e.target.value) || 0)}
                                  className="h-8 text-sm w-20"
                                  aria-label="מחיר"
                                />
                              </td>
                              <td className="p-2 text-center min-w-[100px]">
                                {(() => {
                                  const name = ((item as ExtractedSupplierItem).name || "").trim()
                                  const invPrice = (item as ExtractedSupplierItem).price ?? 0
                                  const wp = name ? webPriceByName[name] : null
                                  if (!wp) return <span className="text-muted-foreground text-xs">—</span>
                                  const diff = invPrice > 0 ? ((wp.price - invPrice) / invPrice) * 100 : 0
                                  const cheaper = diff < -5
                                  const pricier = diff > 5
                                  return (
                                    <div className="text-xs">
                                      <span className={cheaper ? "text-emerald-600 dark:text-emerald-400 font-medium" : pricier ? "text-amber-600 dark:text-amber-400" : ""}>
                                        ₪{wp.price.toFixed(1)} {wp.store && <span className="text-muted-foreground">({wp.store})</span>}
                                      </span>
                                      {invPrice > 0 && (cheaper || pricier) && (
                                        <div className={cheaper ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}>
                                          {cheaper ? `זול ב־${Math.abs(diff).toFixed(0)}%` : `יקר ב־${diff.toFixed(0)}%`}
                                        </div>
                                      )}
                                    </div>
                                  )
                                })()}
                              </td>
                              <td className="p-2">
                                <Input
                                  id={`fpm-item-${idx}-unit`}
                                  name={`fpmItemUnit-${idx}`}
                                  value={(item as ExtractedSupplierItem).unit ?? ""}
                                  onChange={(e) => updateItem(idx, "unit", e.target.value)}
                                  className="h-8 text-sm w-16"
                                  aria-label="יחידה"
                                />
                              </td>
                              <td className="p-2">
                                <Input
                                  id={`fpm-item-${idx}-sku`}
                                  name={`fpmItemSku-${idx}`}
                                  value={(item as ExtractedSupplierItem).sku ?? ""}
                                  onChange={(e) => updateItem(idx, "sku", e.target.value)}
                                  className="h-8 text-sm w-16"
                                  aria-label="מק״ט"
                                />
                              </td>
                            </>
                          )}
                          {(type === "d" || type === "s") && (
                            <>
                              {type === "s" && (
                                <td className="p-2">
                                  <Input
                                    id={`fpm-item-${idx}-qty`}
                                    name={`fpmItemQty-${idx}`}
                                    type="number"
                                    value={(item as { qty?: number }).qty ?? 0}
                                    onChange={(e) => updateItem(idx, "qty", parseInt(e.target.value) || 0)}
                                    className="h-8 text-sm w-16"
                                    aria-label="כמות"
                                  />
                                </td>
                              )}
                              <td className="p-2">
                                <Input
                                  id={`fpm-item-${idx}-price`}
                                  name={`fpmItemPrice-${idx}`}
                                  type="number"
                                  value={(item as { price?: number }).price ?? 0}
                                  onChange={(e) => updateItem(idx, "price", parseFloat(e.target.value) || 0)}
                                  className="h-8 text-sm w-20"
                                  aria-label="מחיר"
                                />
                              </td>
                            </>
                          )}
                          <td className="p-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              onClick={() => removeItem(idx)}
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={addRow} className="w-full">
                <Plus className="w-4 h-4 ml-2" />
                הוסף שורה
              </Button>
            </>
          )}
        </div>
        {!loading && items.length > 0 && (
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              ביטול
            </Button>
            <Button onClick={handleConfirm}>
              אשר וייבא
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
