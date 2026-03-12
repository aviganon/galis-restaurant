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
import { Loader2, X, Plus } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"

interface FilePreviewModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  file: File | null
  type: ExtractType
  supplierName?: string
  canSaveToGlobal?: boolean
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
  canSaveToGlobal = false,
  onConfirmSupplier,
  onConfirmDishes,
  onConfirmSales,
}: FilePreviewModalProps) {
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState<ExtractedItem[]>([])
  const [supplierName, setSupplierName] = useState(initialSupplier)
  const [saveToGlobal, setSaveToGlobal] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !file) return
    setItems([])
    setError(null)
    setSupplierName(initialSupplier)
    setSaveToGlobal(false)
    setLoading(true)
    extractWithAI(file, type, initialSupplier || undefined)
      .then((res) => {
        if (res.no_prices) {
          setItems([])
          setError("תעודת משלוח — אין מחירים")
          return
        }
        setItems(res.items || [])
        if (res.supplier_name && !initialSupplier) setSupplierName(res.supplier_name)
      })
      .catch((e) => {
        setError(e.message || "שגיאה בניתוח")
        toast.error(e.message)
      })
      .finally(() => setLoading(false))
  }, [open, file, type, initialSupplier])

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
      setItems((prev) => [...prev, { name: "", price: 0, unit: "קג", sku: "" }])
    } else if (type === "d") {
      setItems((prev) => [...prev, { name: "", price: 0, category: "אחר", ingredients: [] }])
    } else {
      setItems((prev) => [...prev, { name: "", qty: 0, price: 0 }])
    }
  }, [type])

  const handleConfirm = useCallback(() => {
    if (type === "p") {
      if (!supplierName.trim()) {
        toast.error("יש להזין שם ספק")
        return
      }
      onConfirmSupplier?.(items as ExtractedSupplierItem[], supplierName.trim(), canSaveToGlobal ? saveToGlobal : undefined)
    } else if (type === "d") {
      onConfirmDishes?.(items as ExtractedDishItem[])
    } else {
      onConfirmSales?.(items as Array<{ name: string; qty: number; price: number }>)
    }
    onOpenChange(false)
  }, [type, items, supplierName, saveToGlobal, canSaveToGlobal, onConfirmSupplier, onConfirmDishes, onConfirmSales, onOpenChange])

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
              {type === "p" && (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="fpm-supplier">שם ספק</Label>
                    <Input
                      id="fpm-supplier"
                      name="fpmSupplier"
                      value={supplierName}
                      onChange={(e) => setSupplierName(e.target.value)}
                      placeholder="שם הספק"
                      className="h-10"
                    />
                  </div>
                  {canSaveToGlobal && (
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
                            <th className="text-center p-2 font-semibold">מחיר</th>
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
                                  id={`fpm-item-${idx}-price`}
                                  name={`fpmItemPrice-${idx}`}
                                  type="number"
                                  value={(item as ExtractedSupplierItem).price ?? 0}
                                  onChange={(e) => updateItem(idx, "price", parseFloat(e.target.value) || 0)}
                                  className="h-8 text-sm w-20"
                                  aria-label="מחיר"
                                />
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
