"use client"

import { Mail, MessageCircle, useState, useEffect } from "react"
import { collection, getDocs, query, where, addDoc, updateDoc, deleteDoc, doc, getDoc } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { useApp } from "@/contexts/app-context"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { FileText, Clock, CheckCircle2, DollarSign, Loader2, Search, ShoppingCart, Package, Plus, Send, X, ChevronDown, ChevronUp , Mail, MessageCircle, Plus, Trash2 } from "lucide-react"
import { useTranslations } from "@/lib/use-translations"

interface OrderSuggestion { name: string; currentStock: number; minStock: number; suggestedQty: number; unit: string; price: number; supplier: string }
interface PurchaseOrder { id: string; orderNumber: string; supplier: string; items: { name: string; quantity: number; unit: string; price: number }[]; total: number; status: string; createdAt: string; expectedDelivery?: string }
interface Ingredient { id: string; name: string; unit: string; price: number; supplier: string; stock: number; minStock: number }

export function PurchaseOrders() {
  const t = useTranslations()
  const { currentRestaurantId } = useApp()
  const [orders, setOrders] = useState<PurchaseOrder[]>([])
  const [restaurantSuppliers, setRestaurantSuppliers] = useState<{id:string;name:string;email:string;phone:string}[]>([])
  const [activeTab, setActiveTab] = useState("suggestions")
  const [selSup, setSelSup] = useState<{id:string;name:string;email:string;phone:string}|null>(null)
  const [orderItems, setOrderItems] = useState<{name:string;quantity:number;unit:string;price:number}[]>([])
  const [orderNotes, setOrderNotes] = useState("")
  const [saving, setSaving] = useState(false)
  const [suggestions, setSuggestions] = useState<OrderSuggestion[]>([])
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [activeTab, setActiveTab] = useState<"suggestions"|"new"|"orders"|"inventory">("suggestions")
  const [saving, setSaving] = useState(false)

  // New order state
  const [newSupplier, setNewSupplier] = useState("")
  const [newItems, setNewItems] = useState<{name:string;qty:string;unit:string;price:string}[]>([{name:"",qty:"",unit:"",price:""}])

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
        return { id: d.id, orderNumber: (data.orderNumber as string)||d.id, supplier: (data.supplier as string)||"", items: Array.isArray(data.items)?data.items:[], total: typeof data.total==="number"?data.total:0, status: (data.status as string)||"draft", createdAt: (data.createdAt as string)||"" }
      })
      setOrders(list.sort((a,b) => b.createdAt.localeCompare(a.createdAt)))

      const ings: Ingredient[] = []
      const sugg: OrderSuggestion[] = []
      ingSnap.forEach(d => {
        const data = d.data()
        const stock = typeof data.stock==="number"?data.stock:0
        const minStock = typeof data.minStock==="number"?data.minStock:0
        const ing: Ingredient = { id: d.id, name: d.id, unit: (data.unit as string)||'יח׳', price: typeof data.price==="number"?data.price:0, supplier: (data.supplier as string)||"—", stock, minStock }
        ings.push(ing)
        if (stock < minStock) {
          sugg.push({ name: d.id, currentStock: stock, minStock, suggestedQty: minStock-stock, unit: ing.unit, price: ing.price, supplier: ing.supplier||"—" })
        }
      })
      setIngredients(ings.sort((a,b)=>a.name.localeCompare(b.name)))
      setSuggestions(sugg.sort((a,b)=>(a.supplier||"").localeCompare(b.supplier||"")))
    } catch { setOrders([]); setSuggestions([]) }
    finally { setLoading(false) }
  }

  useEffect(() => { loadData() }, [currentRestaurantId])

  const getStatusConfig = (status: string) => {
    switch(status) {
      case "draft": return { label: "טיוטה", color: "bg-gray-100 text-gray-700", icon: FileText }
      case "sent": return { label: "נשלח", color: "bg-blue-100 text-blue-700", icon: Clock }
      case "confirmed": return { label: "אושר", color: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 }
      case "delivered": return { label: "נמסר", color: "bg-purple-100 text-purple-700", icon: CheckCircle2 }
      case "cancelled": return { label: "בוטל", color: "bg-red-100 text-red-700", icon: X }
      default: return { label: status, color: "bg-gray-100 text-gray-700", icon: FileText }
    }
  }

  const handleOrderFromSuggestions = () => {
    if (suggestions.length === 0) return
    const bySupplier = suggestions.reduce((acc, s) => {
      if (!acc[s.supplier]) acc[s.supplier] = []
      acc[s.supplier].push(s)
      return acc
    }, {} as Record<string, OrderSuggestion[]>)
    const firstSupplier = Object.keys(bySupplier)[0]
    setNewSupplier(firstSupplier)
    setNewItems(bySupplier[firstSupplier].map(s => ({ name: s.name, qty: String(s.suggestedQty), unit: s.unit, price: String(s.price) })))
    setActiveTab("new")
  }

  const handleAddOrder = async () => {
    if (!currentRestaurantId || !newSupplier) return
    setSaving(true)
    try {
      const items = newItems.filter(i => i.name && i.qty).map(i => ({ name: i.name, quantity: parseFloat(i.qty)||0, unit: i.unit||'יח׳', price: parseFloat(i.price)||0 }))
      const total = items.reduce((s,i) => s + i.quantity*i.price, 0)
      await addDoc(collection(db, "purchaseOrders"), {
        restaurantId: currentRestaurantId,
        orderNumber: 'PO-' + Date.now(),
        supplier: newSupplier,
        items,
        total,
        status: "draft",
        createdAt: new Date().toISOString().split('T')[0],
      })
      setNewSupplier(""); setNewItems([{name:"",qty:"",unit:"",price:""}])
      await loadData()
      setActiveTab("orders")
    } catch(e) { console.error(e) }
    finally { setSaving(false) }
  }

  const handleUpdateStatus = async (orderId: string, status: string) => {
    await updateDoc(doc(db, "purchaseOrders", orderId), { status })
    await loadData()
  }

  const stats = {
    total: orders.length,
    pending: orders.filter(o=>o.status==="sent"||o.status==="confirmed").length,
    delivered: orders.filter(o=>o.status==="delivered").length,
    totalValue: orders.filter(o=>o.status!=="cancelled").reduce((s,o)=>s+o.total,0),
  }

  if (loading) return <div className="p-8 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground"/></div>

  const tabs = [
    { id: "suggestions", label: "💡 המלצות חכמות", badge: suggestions.length > 0 ? suggestions.length : undefined },
    { id: "new", label: "➕ הזמנה חדשה" },
    { id: "orders", label: "📋 הזמנות", badge: stats.pending > 0 ? stats.pending : undefined },
    { id: "inventory", label: "📦 מלאי" },
  ]

  const addItem = (name: string, unit: string, price: number, qty: number) => {
    setOrderItems(prev => {
      const ex = prev.find(i=>i.name===name)
      if (ex) return prev.map(i=>i.name===name?{...i,quantity:i.quantity+qty}:i)
      return [...prev,{name,quantity:qty,unit,price}]
    })
    setActiveTab("new-order")
  }

  const orderTotal = orderItems.reduce((s,i)=>s+i.quantity*i.price,0)

  const saveOrder = async (method?:"email"|"whatsapp") => {
    if(!currentRestaurantId||!selSup||!orderItems.length) return
    setSaving(true)
    try {
      const num="ORD-"+Date.now().toString().slice(-6)
      await addDoc(collection(db,"purchaseOrders"),{
        restaurantId:currentRestaurantId, orderNumber:num,
        supplier:selSup.name, supplierEmail:selSup.email||"",
        supplierPhone:selSup.phone||"", items:orderItems,
        total:orderTotal, status:method?"sent":"draft",
        createdAt:new Date().toISOString().split("T")[0], notes:orderNotes,
      })
      if(method==="email"&&selSup.email){const b=orderItems.map(i=>i.name+": "+i.quantity+" "+i.unit).join("%0A");window.open("mailto:"+selSup.email+"?subject=הזמנה "+num+"&body="+b)}
      if(method==="whatsapp"&&selSup.phone){const b=orderItems.map(i=>"* "+i.name+": "+i.quantity+" "+i.unit).join("%0A");window.open("https://wa.me/"+selSup.phone.replace(/[^0-9]/g,"")+"?text=הזמנה "+num+"%0A"+b)}
      setOrderItems([]);setSelSup(null);setOrderNotes("")
      await loadData();setActiveTab("orders")
    } catch(e){console.error(e)} finally{setSaving(false)}
  }

  const deleteOrder = async (id:string) => {
    if(!confirm("למחוק הזמנה?")) return
    await deleteDoc(doc(db,"purchaseOrders",id))
    setOrders(prev=>prev.filter(o=>o.id!==id))
  }


  return (
    <div className="p-4 md:p-6 space-y-4" dir="rtl">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-3 w-full mb-4">
          <TabsTrigger value="suggestions" className="text-xs gap-1">💡 המלצות {suggestions.length>0&&<span className="bg-amber-500 text-white text-xs px-1 rounded-full mr-1">{suggestions.length}</span>}</TabsTrigger>
          <TabsTrigger value="new-order" className="text-xs gap-1">➕ הזמנה חדשה {orderItems.length>0&&<span className="bg-blue-500 text-white text-xs px-1 rounded-full mr-1">{orderItems.length}</span>}</TabsTrigger>
          <TabsTrigger value="orders" className="text-xs gap-1">📋 הזמנות ({orders.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="suggestions">
          return (
    <div className="p-4 md:p-6 space-y-4" dir="rtl">
      {/* סטטיסטיקות */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "סה״כ הזמנות", value: stats.total, icon: FileText, color: "bg-primary/10 text-primary" },
          { label: "ממתינות", value: stats.pending, icon: Clock, color: "bg-amber-500/10 text-amber-500" },
          { label: "נמסרו", value: stats.delivered, icon: CheckCircle2, color: "bg-emerald-500/10 text-emerald-500" },
          { label: "שווי כולל", value: stats.totalValue.toLocaleString() + ' ₪', icon: DollarSign, color: "bg-blue-500/10 text-blue-500" },
        ].map((s,i) => (
          <Card key={i}><CardContent className="p-3">
            <div className="flex items-center gap-2">
              <div className={`p-2 rounded-xl ${s.color}`}><s.icon className="w-4 h-4"/></div>
              <div><p className="text-xs text-muted-foreground">{s.label}</p><p className="text-xl font-bold">{s.value}</p></div>
            </div>
          </CardContent></Card>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-muted p-1 rounded-xl overflow-x-auto">
        {tabs.map(tab => (
          <button key={tab.id} onClick={()=>setActiveTab(tab.id as typeof activeTab)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${activeTab===tab.id?"bg-background shadow text-foreground":"text-muted-foreground hover:text-foreground"}`}>
            {tab.label}
            {tab.badge && <span className="bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5 min-w-[20px] text-center">{tab.badge}</span>}
          </button>
        ))}
      </div>

      {/* המלצות חכמות */}
      {activeTab === "suggestions" && (
        <div className="space-y-4">
          {suggestions.length === 0 ? (
            <Card><CardContent className="p-8 flex flex-col items-center gap-3 text-muted-foreground">
              <CheckCircle2 className="w-12 h-12 text-emerald-500 opacity-50"/>
              <p className="text-lg font-medium">המלאי תקין! אין המלצות להזמנה</p>
            </CardContent></Card>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">{suggestions.length} פריטים זקוקים להזמנה</p>
                <Button onClick={handleOrderFromSuggestions} size="sm" className="gap-2">
                  <Send className="w-4 h-4"/>
                  הזמן מהמלצות
                </Button>
              </div>
              <Card><CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead className="text-right">ספק</TableHead>
                      <TableHead className="text-right">פריט</TableHead>
                      <TableHead className="text-center">מלאי נוכחי</TableHead>
                      <TableHead className="text-center">מינימום</TableHead>
                      <TableHead className="text-center">כמות מוצעת</TableHead>
                      <TableHead className="text-center">יחידה</TableHead>
                      <TableHead className="text-center">עלות משוערת</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {suggestions.map(s => (
                        <TableRow key={s.name} className="hover:bg-muted/50">
                          <TableCell className="font-medium">{s.supplier}</TableCell>
                          <TableCell>{s.name}</TableCell>
                          <TableCell className="text-center"><span className="text-red-500 font-semibold">{s.currentStock}</span></TableCell>
                          <TableCell className="text-center">{s.minStock}</TableCell>
                          <TableCell className="text-center font-bold text-blue-600">{s.suggestedQty}</TableCell>
                          <TableCell className="text-center">{s.unit}</TableCell>
                          <TableCell className="text-center">₪{(s.price*s.suggestedQty).toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent></Card>
            </>
          )}
        </div>
      )}

      {/* הזמנה חדשה */}
      {activeTab === "new" && (
        <Card><CardContent className="p-4 space-y-4">
          <div>
            <label className="text-sm font-medium mb-1 block">שם הספק</label>
            <Input value={newSupplier} onChange={e=>setNewSupplier(e.target.value)} placeholder="שם הספק..." />
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium">פריטים</label>
              <Button size="sm" variant="outline" onClick={()=>setNewItems(p=>[...p,{name:"",qty:"",unit:"",price:""}])}>
                <Plus className="w-4 h-4 ml-1"/>הוסף פריט
              </Button>
            </div>
            <div className="space-y-2">
              {newItems.map((item,i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center">
                  <Input className="col-span-4" placeholder="שם פריט" value={item.name} onChange={e=>setNewItems(p=>p.map((x,j)=>j===i?{...x,name:e.target.value}:x))}/>
                  <Input className="col-span-2" placeholder="כמות" type="number" value={item.qty} onChange={e=>setNewItems(p=>p.map((x,j)=>j===i?{...x,qty:e.target.value}:x))}/>
                  <Input className="col-span-2" placeholder="יחידה" value={item.unit} onChange={e=>setNewItems(p=>p.map((x,j)=>j===i?{...x,unit:e.target.value}:x))}/>
                  <Input className="col-span-3" placeholder="מחיר ליח׳" type="number" value={item.price} onChange={e=>setNewItems(p=>p.map((x,j)=>j===i?{...x,price:e.target.value}:x))}/>
                  <button onClick={()=>setNewItems(p=>p.filter((_,j)=>j!==i))} className="col-span-1 text-muted-foreground hover:text-red-500"><X className="w-4 h-4"/></button>
                </div>
              ))}
            </div>
          </div>
          <div className="flex justify-between items-center pt-2 border-t">
            <span className="font-semibold">סה״כ: ₪{newItems.reduce((s,i)=>s+(parseFloat(i.qty)||0)*(parseFloat(i.price)||0),0).toFixed(2)}</span>
            <Button onClick={handleAddOrder} disabled={!newSupplier||saving} className="gap-2">
              {saving?<Loader2 className="w-4 h-4 animate-spin"/>:<Send className="w-4 h-4"/>}
              שמור הזמנה
            </Button>
          </div>
        </CardContent></Card>
      )}

      {/* הזמנות */}
      {activeTab === "orders" && (
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"/>
            <Input placeholder="חיפוש הזמנה..." value={searchTerm} onChange={e=>setSearchTerm(e.target.value)} className="pr-10"/>
          </div>
          <Card><CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead className="text-right">מס׳ הזמנה</TableHead>
                  <TableHead className="text-right">ספק</TableHead>
                  <TableHead className="text-center">פריטים</TableHead>
                  <TableHead className="text-center">סכום</TableHead>
                  <TableHead className="text-center">תאריך</TableHead>
                  <TableHead className="text-center">סטטוס</TableHead>
                  <TableHead className="text-center">פעולות</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {orders.filter(o=>o.orderNumber.includes(searchTerm)||o.supplier.includes(searchTerm)).length===0?(
                    <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">אין הזמנות</TableCell></TableRow>
                  ):(
                    orders.filter(o=>o.orderNumber.includes(searchTerm)||o.supplier.includes(searchTerm)).map(order=>{
                      const sc=getStatusConfig(order.status)
                      return (
                        <TableRow key={order.id} className="hover:bg-muted/50">
                          <TableCell className="font-semibold text-sm">{order.orderNumber}</TableCell>
                          <TableCell>{order.supplier}</TableCell>
                          <TableCell className="text-center">{order.items.length}</TableCell>
                          <TableCell className="text-center font-semibold">{order.total.toLocaleString()} ₪</TableCell>
                          <TableCell className="text-center text-muted-foreground text-sm">{order.createdAt}</TableCell>
                          <TableCell className="text-center"><Badge className={sc.color}><sc.icon className="w-3 h-3 ml-1"/>{sc.label}</Badge></TableCell>
                          <TableCell className="text-center">
                            <select value={order.status} onChange={e=>handleUpdateStatus(order.id,e.target.value)}
                              className="text-xs border rounded px-1 py-0.5 bg-background">
                              <option value="draft">טיוטה</option>
                              <option value="sent">נשלח</option>
                              <option value="confirmed">אושר</option>
                              <option value="delivered">נמסר</option>
                              <option value="cancelled">בוטל</option>
                            </select>
                          </TableCell>
                        </TableRow>
                      )
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent></Card>
        </div>
      )}

      {/* מלאי */}
      {activeTab === "inventory" && (
        <Card><CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead className="text-right">פריט</TableHead>
                <TableHead className="text-right">ספק</TableHead>
                <TableHead className="text-center">מלאי</TableHead>
                <TableHead className="text-center">מינימום</TableHead>
                <TableHead className="text-center">יחידה</TableHead>
                <TableHead className="text-center">מחיר</TableHead>
                <TableHead className="text-center">סטטוס</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {ingredients.map(ing => (
                  <TableRow key={ing.id} className="hover:bg-muted/50">
                    <TableCell className="font-medium">{ing.name}</TableCell>
                    <TableCell className="text-muted-foreground">{ing.supplier}</TableCell>
                    <TableCell className="text-center">
                      <span className={ing.stock < ing.minStock ? "text-red-500 font-bold" : "text-emerald-600 font-semibold"}>{ing.stock}</span>
                    </TableCell>
                    <TableCell className="text-center">{ing.minStock}</TableCell>
                    <TableCell className="text-center">{ing.unit}</TableCell>
                    <TableCell className="text-center">₪{ing.price}</TableCell>
                    <TableCell className="text-center">
                      {ing.stock < ing.minStock
                        ? <Badge className="bg-red-100 text-red-700">חסר</Badge>
                        : <Badge className="bg-emerald-100 text-emerald-700">תקין</Badge>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent></Card>
      )}
    </div>
        </TabsContent>

        <TabsContent value="new-order">
          <div className="space-y-4">
            <div className="bg-card border rounded-xl p-4 space-y-4">
              <h3 className="font-bold text-lg">יצירת הזמנה חדשה</h3>
              <div>
                <label className="text-sm font-medium mb-1 block">ספק</label>
                <select className="w-full border rounded-lg px-3 py-2 bg-background text-sm" value={selSup?.id||""} onChange={e=>{const s=restaurantSuppliers.find(x=>x.id===e.target.value);setSelSup(s||null)}}>
                  <option value="">בחר ספק...</option>
                  {restaurantSuppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">הוסף רכיב</label>
                <select className="w-full border rounded-lg px-3 py-2 bg-background text-sm" onChange={e=>{const ing=suggestions.find(i=>i.name===e.target.value)||{name:e.target.value,currentStock:0,minStock:0,suggestedQty:1,unit:"יח",price:0,supplier:""};if(ing.name)addItem(ing.name,ing.unit,ing.price,Math.max(1,ing.suggestedQty));e.target.value=""}}>
                  <option value="">בחר רכיב...</option>
                  {suggestions.map(i=><option key={i.name} value={i.name}>{i.name} (מוצע: {i.suggestedQty} {i.unit})</option>)}
                </select>
              </div>
              {orderItems.length>0&&(
                <table className="w-full text-sm">
                  <thead><tr className="border-b"><th className="text-right py-2">רכיב</th><th className="text-center py-2">כמות</th><th className="text-center py-2">מחיר</th><th/></tr></thead>
                  <tbody>
                    {orderItems.map((item,idx)=>(
                      <tr key={idx} className="border-b">
                        <td className="py-2 font-medium">{item.name}</td>
                        <td className="py-2 text-center">
                          <Input type="number" value={item.quantity} min={1} className="w-20 text-center mx-auto h-8"
                            onChange={e=>setOrderItems(prev=>prev.map((i,j)=>j===idx?{...i,quantity:Number(e.target.value)}:i))}/>
                        </td>
                        <td className="py-2 text-center">₪{(item.quantity*item.price).toFixed(2)}</td>
                        <td className="py-2 text-center">
                          <button onClick={()=>setOrderItems(prev=>prev.filter((_,j)=>j!==idx))} className="text-red-500 hover:text-red-700 p-1">✕</button>
                        </td>
                      </tr>
                    ))}
                    <tr><td colSpan={2} className="pt-2 font-bold">סהכ</td><td className="pt-2 text-center font-bold text-lg">₪{orderTotal.toFixed(2)}</td><td/></tr>
                  </tbody>
                </table>
              )}
              <div>
                <label className="text-sm font-medium mb-1 block">הערות</label>
                <textarea className="w-full border rounded-lg px-3 py-2 bg-background text-sm resize-none" rows={2} value={orderNotes} onChange={e=>setOrderNotes(e.target.value)} placeholder="הערות אופציונליות..."/>
              </div>
              <div className="flex gap-2 flex-wrap">
                <button disabled={saving||!selSup||!orderItems.length} onClick={()=>saveOrder()} className="flex items-center gap-1 px-3 py-2 text-sm border rounded-lg hover:bg-muted disabled:opacity-50">💾 שמור טיוטה</button>
                <button disabled={saving||!selSup||!orderItems.length||!selSup?.email} onClick={()=>saveOrder("email")} className="flex items-center gap-1 px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">✉️ שלח במייל</button>
                <button disabled={saving||!selSup||!orderItems.length||!selSup?.phone} onClick={()=>saveOrder("whatsapp")} className="flex items-center gap-1 px-3 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">💬 שלח בווצאפ</button>
                {saving&&<span className="text-sm text-muted-foreground animate-pulse">שומר...</span>}
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="orders">
          <div className="space-y-4">
            {orders.length===0?(
              <div className="text-center py-8 text-muted-foreground">אין הזמנות עדיין</div>
            ):orders.map(order=>{
              const sc = order.status==="sent"?"bg-blue-100 text-blue-700":order.status==="confirmed"?"bg-emerald-100 text-emerald-700":order.status==="delivered"?"bg-purple-100 text-purple-700":order.status==="cancelled"?"bg-red-100 text-red-700":"bg-gray-100 text-gray-700"
              const statusLabel = order.status==="sent"?"נשלחה":order.status==="confirmed"?"אושרה":order.status==="delivered"?"התקבלה":order.status==="cancelled"?"בוטלה":"טיוטה"
              return(
                <div key={order.id} className="bg-card border rounded-xl p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <span className="font-bold">{order.orderNumber}</span>
                      <span className="text-muted-foreground mr-2">·</span>
                      <span>{order.supplier}</span>
                    </div>
                    <span className={"text-xs px-2 py-1 rounded-full font-medium "+sc}>{statusLabel}</span>
                  </div>
                  <div className="text-sm text-muted-foreground mb-2">{order.items.length} פריטים · ₪{order.total.toLocaleString()} · {order.createdAt}</div>
                  <div className="flex gap-2 flex-wrap">
                    <select className="text-xs border rounded px-2 py-1 bg-background" value={order.status}
                      onChange={e=>updateDoc(doc(db,"purchaseOrders",order.id),{status:e.target.value}).then(()=>setOrders(prev=>prev.map(o=>o.id===order.id?{...o,status:e.target.value as typeof order.status}:o)))}>
                      {["draft","sent","confirmed","delivered","cancelled"].map(s=><option key={s} value={s}>{s==="sent"?"נשלחה":s==="confirmed"?"אושרה":s==="delivered"?"התקבלה":s==="cancelled"?"בוטלה":"טיוטה"}</option>)}
                    </select>
                    <button onClick={()=>deleteOrder(order.id)} className="text-xs text-red-500 border rounded px-2 py-1 hover:bg-red-50">🗑 מחק</button>
                  </div>
                </div>
              )
            })}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}

export { PurchaseOrders as OrdersPanel }
