"use client"

import { useState, useEffect } from "react"
import { collection, getDocs, query, where, addDoc, updateDoc, deleteDoc, doc, getDoc } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { useApp } from "@/contexts/app-context"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { FileText, Clock, CheckCircle2, DollarSign, Loader2, Search, ShoppingCart, Package } from "lucide-react"
import { useTranslations } from "@/lib/use-translations"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface OrderSuggestion {
  name: string
  currentStock: number
  minStock: number
  suggestedQty: number
  unit: string
  price: number
  supplier: string
}

interface PurchaseOrder {
  id: string
  orderNumber: string
  supplier: string
  items: { name: string; quantity: number; unit: string; price: number }[]
  total: number
  status: string
  createdAt: string
  expectedDelivery?: string
}
<app />
<page className="tsx"></page>
interface RestaurantSupplier {
  id: string
  name: string
  email: string
  phone: string
}

interface UploadRecord {
  id: string
  fileName: string
  uploadedAt: string
  ingredientCount: number
  supplier: string
}

export function PurchaseOrders() {
  const t = useTranslations()
  const { currentRestaurantId } = useApp()
  const [orders, setOrders] = useState<PurchaseOrder[]>([])
  const [suggestions, setSuggestions] = useState<OrderSuggestion[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [activeTab, setActiveTab] = useState("suggestions")
  const [restaurantSuppliers, setRestaurantSuppliers] = useState<RestaurantSupplier[]>([])
  const [selSup, setSelSup] = useState<RestaurantSupplier | null>(null)
  const [orderItems, setOrderItems] = useState<{name:string;quantity:number;unit:string;price:number}[]>([])
  const [orderNotes, setOrderNotes] = useState("")
  const [saving, setSaving] = useState(false)
  const [uploads, setUploads] = useState<UploadRecord[]>([])

  const loadData = async () => {
    if (!currentRestaurantId) { setLoading(false); return }
    setLoading(true)
    try {
      const [ordersSnap, ingSnap] = await Promise.all([
        getDocs(query(collection(db, "purchaseOrders"), where("restaurantId", "==", currentRestaurantId))),
        getDocs(collection(db, "restaurants", currentRestaurantId, "ingredients")),
      ])
      const list: PurchaseOrder[] = ordersSnap.docs.map(d => {
        const data = d.data()
        return { id: d.id, orderNumber: (data.orderNumber as string) || d.id, supplier: (data.supplier as string) || "", items: Array.isArray(data.items) ? data.items : [], total: typeof data.total === "number" ? data.total : 0, status: (data.status as string) || "draft", createdAt: (data.createdAt as string) || "", expectedDelivery: data.expectedDelivery as string | undefined }
      })
      list.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      setOrders(list)
      const sugg: OrderSuggestion[] = []
      ingSnap.forEach(d => {
        const data = d.data()
        const stock = typeof data.stock === "number" ? data.stock : 0
        const minStock = typeof data.minStock === "number" ? data.minStock : 0
        const price = typeof data.price === "number" ? data.price : 0
        const unit = (data.unit as string) || "יח"
        const supplier = (data.supplier as string) || ""
        if (stock < minStock || (stock === 0 && minStock === 0)) {
          sugg.push({ name: d.id, currentStock: stock, minStock, suggestedQty: minStock - stock, unit, price, supplier: supplier || "—" })
        }
      })
      sugg.sort((a, b) => (a.supplier || "").localeCompare(b.supplier || ""))
      setSuggestions(sugg)
      try {
        const asDoc = await getDoc(doc(db, "restaurants", currentRestaurantId, "appState", "assignedSuppliers"))
        const ids: string[] = Array.isArray(asDoc.data()?.list) ? asDoc.data()!.list : []
        const supDocs = await Promise.all(ids.map(id => getDoc(doc(db, "suppliers", id))))
        setRestaurantSuppliers(supDocs.filter(d => d.exists()).map(d => ({ id: d.id, name: (d.data()?.name as string) || d.id, email: (d.data()?.email as string) || "", phone: (d.data()?.phone as string) || "" })))
      } catch(e) { console.error(e) }
      try {
        const upSnap = await getDocs(collection(db, "restaurants", currentRestaurantId, "uploads"))
        const ups: UploadRecord[] = upSnap.docs.map(d => { const v = d.data(); return { id: d.id, fileName: (v.fileName as string) || d.id, uploadedAt: (v.uploadedAt as string) || (v.createdAt as string) || "", ingredientCount: Number(v.ingredientCount) || 0, supplier: (v.supplier as string) || "" } })
        ups.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))
        setUploads(ups)
      } catch(e) { console.error(e) }
    } catch { setOrders([]); setSuggestions([]) } finally { setLoading(false) }
  }

  useEffect(() => { loadData() }, [currentRestaurantId])

  const addItem = (name: string, unit: string, price: number, qty: number) => {
    setOrderItems(prev => { const ex = prev.find(i => i.name === name); if (ex) return prev.map(i => i.name === name ? {...i, quantity: i.quantity + qty} : i); return [...prev, {name, quantity: qty, unit, price}] })
    setActiveTab("new-order")
  }

  const orderTot = orderItems.reduce((s, i) => s + i.quantity * i.price, 0)

  const saveOrder = async (method?: "email" | "whatsapp") => {
    if (!currentRestaurantId || !selSup || !orderItems.length) return
    setSaving(true)
    try {
      const num = "ORD-" + Date.now().toString().slice(-6)
      await addDoc(collection(db, "purchaseOrders"), { restaurantId: currentRestaurantId, orderNumber: num, supplier: selSup.name, supplierEmail: selSup.email || "", supplierPhone: selSup.phone || "", items: orderItems, total: orderTot, status: method ? "sent" : "draft", createdAt: new Date().toISOString().split("T")[0], notes: orderNotes })
      if (method === "email" && selSup.email) window.open("mailto:" + selSup.email + "?subject=הזמנה " + num + "&body=" + orderItems.map(i => i.name + ": " + i.quantity + " " + i.unit).join("%0A"))
      if (method === "whatsapp" && selSup.phone) window.open("https://wa.me/" + selSup.phone.replace(/[^0-9]/g, "") + "?text=" + orderItems.map(i => "* " + i.name + ": " + i.quantity + " " + i.unit).join("%0A"))
      setOrderItems([]); setSelSup(null); setOrderNotes("")
      await loadData(); setActiveTab("orders")
    } catch(e) { console.error(e) } finally { setSaving(false) }
  }

  const delOrder = async (id: string) => {
    if (!confirm("למחוק הזמנה?")) return
    await deleteDoc(doc(db, "purchaseOrders", id))
    setOrders(prev => prev.filter(o => o.id !== id))
  }

  const getStatusConfig = (status: string) => {
    switch (status) {
      case "draft": return { label: "טיוטה", color: "bg-gray-100 text-gray-700", icon: FileText }
      case "sent": return { label: "נשלחה", color: "bg-blue-100 text-blue-700", icon: Clock }
      case "confirmed": return { label: "אושרה", color: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 }
      case "delivered": return { label: "התקבלה", color: "bg-purple-100 text-purple-700", icon: CheckCircle2 }
      case "cancelled": return { label: "בוטלה", color: "bg-red-100 text-red-700", icon: FileText }
      default: return { label: status, color: "bg-gray-100 text-gray-700", icon: FileText }
    }
  }

  const filteredOrders = orders.filter(o => o.orderNumber.includes(searchTerm) || o.supplier.includes(searchTerm))
  const stats = { total: orders.length, pending: orders.filter(o => o.status === "sent" || o.status === "confirmed").length, delivered: orders.filter(o => o.status === "delivered").length, totalValue: orders.filter(o => o.status !== "cancelled").reduce((s, o) => s + o.total, 0) }

  if (loading) return <div className="p-4 md:p-6 flex items-center justify-center min-h-[40vh]"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
  if (!currentRestaurantId) return <div className="p-4 md:p-6"><p className="text-muted-foreground">בחר מסעדה</p></div>

  return (
    <div className="p-4 md:p-6 space-y-4" dir="rtl">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-4 w-full mb-4">
          <TabsTrigger value="suggestions" className="text-xs">
            המלצות {suggestions.length > 0 && <span className="bg-amber-500 text-white text-xs rounded-full px-1 mr-1">{suggestions.length}</span>}
          </TabsTrigger>
          <TabsTrigger value="new-order" className="text-xs">
            הזמנה חדשה {orderItems.length > 0 && <span className="bg-blue-500 text-white text-xs rounded-full px-1 mr-1">{orderItems.length}</span>}
          </TabsTrigger>
          <TabsTrigger value="orders" className="text-xs">הזמנות ({orders.length})</TabsTrigger>
          <TabsTrigger value="uploads" className="text-xs">העלאות ({uploads.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="suggestions">
          {suggestions.length === 0 ? (
            <Card><CardContent className="p-6 flex items-center gap-3 text-muted-foreground"><Package className="w-8 h-8 opacity-50" /><p>אין המלצות הזמנה</p></CardContent></Card>
          ) : (
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-4">
                  <div className="p-2 rounded-xl bg-amber-500/10"><ShoppingCart className="w-5 h-5 text-amber-500" /></div>
                  <div><h2 className="font-bold text-lg">המלצות הזמנה</h2><p className="text-sm text-muted-foreground">רכיבים שמלאי מתחת למינימום</p></div>
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-right">ספק</TableHead>
                        <TableHead className="text-right">רכיב</TableHead>
                        <TableHead className="text-center">מלאי</TableHead>
                        <TableHead className="text-center">מינימום</TableHead>
                        <TableHead className="text-center">מוצע</TableHead>
                        <TableHead className="text-center">יחידה</TableHead>
                        <TableHead className="text-center">מחיר</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {suggestions.map(s => (
                        <TableRow key={s.name} className="hover:bg-muted/50">
                          <TableCell className="text-right">{s.supplier}</TableCell>
                          <TableCell className="text-right font-medium">{s.name}</TableCell>
                          <TableCell className="text-center text-red-500 font-bold">{s.currentStock}</TableCell>
                          <TableCell className="text-center">{s.minStock}</TableCell>
                          <TableCell className="text-center font-semibold text-blue-600">{s.suggestedQty}</TableCell>
                          <TableCell className="text-center">{s.unit}</TableCell>
                          <TableCell className="text-center">&#8362;{(s.suggestedQty * s.price).toFixed(2)}</TableCell>
                          <TableCell className="text-center">
                            <button onClick={() => addItem(s.name, s.unit, s.price, s.suggestedQty)} className="text-xs px-2 py-1 border rounded hover:bg-muted">+ הוסף</button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="new-order">
          <div className="bg-card border rounded-xl p-4 space-y-4 max-h-[70vh] overflow-y-auto">
            <h3 className="font-bold text-lg">יצירת הזמנה חדשה</h3>
            <div>
              <label className="text-sm font-medium mb-1 block">ספק</label>
              <Select value={selSup?.id || ""} onValueChange={v => setSelSup(restaurantSuppliers.find(x => x.id === v) || null)}>
                              <SelectTrigger className="w-full"><SelectValue placeholder="בחר ספק מהמסעדה..." /></SelectTrigger>
                                              <SelectContent position="popper" className="z-[9999] w-full">{restaurantSuppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                                                            </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">הוסף רכיב מהמלצות</label>
<Select onValueChange={v => { const ing = suggestions.find(i => i.name === v); if (ing) addItem(ing.name, ing.unit, ing.price, ing.suggestedQty); }}>
                <SelectTrigger className="w-full"><SelectValue placeholder="בחר רכיב..." /></SelectTrigger>
                                <SelectContent position="popper" className="z-[9999] w-full">{suggestions.map(i => <SelectItem key={i.name} value={i.name}>{i.name} ({i.suggestedQty} {i.unit} מוצע)</SelectItem>)}</SelectContent>
                                              </Select>
            </div>
            {orderItems.length > 0 && (
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr><th className="text-right px-3 py-2">רכיב</th><th className="text-center px-3 py-2">כמות</th><th className="text-center px-3 py-2">מחיר</th><th className="w-8" /></tr>
                  </thead>
                  
                  <tbody>
                    {orderItems.map((item, idx) => (
                      <tr key={idx} className="border-t">
                        <td className="px-3 py-2 font-medium">{item.name}</td>
                        <td className="px-3 py-2"><Input type="number" value={item.quantity} min={1} className="w-20 h-8 text-center mx-auto" onChange={e => setOrderItems(p => p.map((i, j) => j === idx ? {...i, quantity: Number(e.target.value)} : i))} /></td>
                        <td className="px-3 py-2 text-center">&#8362;{(item.quantity * item.price).toFixed(2)}</td>
                        <td className="px-3 py-2 text-center"><button onClick={() => setOrderItems(p => p.filter((_, j) => j !== idx))} className="text-red-500 font-bold">x</button></td>
                      </tr>
                    ))}
                    <tr className="border-t bg-muted/30 font-bold"><td colSpan={2} className="px-3 py-2">סהכ</td><td className="px-3 py-2 text-center text-lg">&#8362;{orderTot.toFixed(2)}</td><td /></tr>
                  </tbody>
                </table>
              </div>
            )}
            <div>
              <label className="text-sm font-medium mb-1 block">הערות</label>
              <textarea className="w-full border rounded-lg px-3 py-2 bg-background text-sm resize-none" rows={2} value={orderNotes} onChange={e => setOrderNotes(e.target.value)} placeholder="הערות אופציונליות..." />
            </div>
            <div className="flex gap-2 flex-wrap">
              <button disabled={saving || !selSup || !orderItems.length} onClick={() => saveOrder()} className="px-3 py-2 text-sm border rounded-lg hover:bg-muted disabled:opacity-50">שמור טיוטה</button>
              <button disabled={saving || !selSup || !orderItems.length || !selSup?.email} onClick={() => saveOrder("email")} className="px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">שלח במייל</button>
              <button disabled={saving || !selSup || !orderItems.length || !selSup?.phone} onClick={() => saveOrder("whatsapp")} className="px-3 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">שלח בווצאפ</button>
              {saving && <span className="text-sm text-muted-foreground animate-pulse">שומר...</span>}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="orders">
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: "סהכ הזמנות", value: stats.total, color: "text-primary" },
                { label: "ממתינות", value: stats.pending, color: "text-amber-500" },
                { label: "התקבלו", value: stats.delivered, color: "text-emerald-500" },
                { label: "שווי", value: "&#8362;" + stats.totalValue.toLocaleString(), color: "text-blue-500" },
              ].map(s => (
                <Card key={s.label}><CardContent className="p-3 text-center"><p className={"text-2xl font-bold " + s.color} dangerouslySetInnerHTML={{__html: String(s.value)}} /><p className="text-xs text-muted-foreground">{s.label}</p></CardContent></Card>
              ))}
            </div>
            <div className="relative"><Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><input className="w-full border rounded-lg px-3 py-2 pr-10 bg-background text-sm" placeholder="חפש הזמנה..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} /></div>
            <div className="space-y-3">
              {filteredOrders.length === 0 ? <div className="text-center py-8 text-muted-foreground">אין הזמנות</div>
              : filteredOrders.map(order => {
                const sc = getStatusConfig(order.status)
                return (
                  <div key={order.id} className="bg-card border rounded-xl p-4">
                    <div className="flex items-start justify-between mb-1">
                      <div><span className="font-bold ml-2">{order.orderNumber}</span><span className="text-muted-foreground">{order.supplier}</span></div>
                      <Badge className={sc.color}>{sc.label}</Badge>
                    </div>
                    <div className="text-sm text-muted-foreground mb-2">{order.items.length} פריטים &middot; &#8362;{order.total.toLocaleString()} &middot; {order.createdAt}</div>
                    <div className="flex gap-2">
                      <select className="text-xs border rounded px-2 py-1 bg-background" value={order.status} onChange={e => updateDoc(doc(db, "purchaseOrders", order.id), {status: e.target.value}).then(() => setOrders(prev => prev.map(o => o.id === order.id ? {...o, status: e.target.value} : o)))}>
                        <option value="draft">טיוטה</option>
                        <option value="sent">נשלחה</option>
                        <option value="confirmed">אושרה</option>
                        <option value="delivered">התקבלה</option>
                        <option value="cancelled">בוטלה</option>
                      </select>
                      <button onClick={() => delOrder(order.id)} className="text-xs text-red-500 border rounded px-2 py-1 hover:bg-red-50">מחק</button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="uploads">
          <div className="space-y-3">
            {uploads.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <div className="text-5xl mb-3">📁</div>
                <p className="font-medium">אין היסטוריית העלאות</p>
                <p className="text-sm mt-1">העלאות קבצים יופיעו כאן</p>
              </div>
            ) : uploads.map(up => (
              <div key={up.id} className="bg-card border rounded-xl p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-500/10 text-2xl">📄</div>
                  <div>
                    <p className="font-medium text-sm">{up.fileName}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {up.supplier && <span className="ml-2">ספק: {up.supplier}</span>}
                      {up.ingredientCount > 0 && <span>{up.ingredientCount} רכיבים</span>}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs font-medium">{up.uploadedAt?.split("T")[0] || up.uploadedAt}</p>
                  <p className="text-xs text-muted-foreground">העלאה</p>
                </div>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}

export { PurchaseOrders as OrdersPanel }
