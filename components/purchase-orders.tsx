"use client"

import { useState, useEffect } from "react"
import { collection, getDocs, query, where, addDoc, updateDoc, deleteDoc, doc, getDoc } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { useApp } from "@/contexts/app-context"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { FileText, Clock, CheckCircle2, DollarSign, Loader2, Search, ShoppingCart, Package, Plus, Send, X, ChevronDown, ChevronUp } from "lucide-react"
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

  const addItem = (name:string,unit:string,price:number,qty:number) => {
    setOrderItems(prev=>{const ex=prev.find(i=>i.name===name);if(ex)return prev.map(i=>i.name===name?{...i,quantity:i.quantity+qty}:i);return[...prev,{name,quantity:qty,unit,price}]})
    setActiveTab("new-order")
  }
  const orderTotal = orderItems.reduce((s,i)=>s+i.quantity*i.price,0)
  const saveOrder = async(method?:"email"|"whatsapp")=>{
    if(!currentRestaurantId||!selSup||!orderItems.length)return
    setSaving(true)
    try{
      const num="ORD-"+Date.now().toString().slice(-6)
      await addDoc(collection(db,"purchaseOrders"),{restaurantId:currentRestaurantId,orderNumber:num,supplier:selSup.name,supplierEmail:selSup.email||"",supplierPhone:selSup.phone||"",items:orderItems,total:orderTotal,status:method?"sent":"draft",createdAt:new Date().toISOString().split("T")[0],notes:orderNotes})
      if(method==="email"&&selSup.email){const b=orderItems.map(i=>i.name+": "+i.quantity+" "+i.unit).join("%0A");window.open("mailto:"+selSup.email+"?subject=הזמנה "+num+"&body="+b)}
      if(method==="whatsapp"&&selSup.phone){const b=orderItems.map(i=>"* "+i.name+": "+i.quantity+" "+i.unit).join("%0A");window.open("https://wa.me/"+selSup.phone.replace(/[^0-9]/g,"")+"?text=הזמנה "+num+"%0A"+b)}
      setOrderItems([]);setSelSup(null);setOrderNotes("")
      await loadData();setActiveTab("orders")
    }catch(e){console.error(e)}finally{setSaving(false)}
  }
  const delOrder = async(id:string)=>{if(!confirm("למחוק?"))return;await deleteDoc(doc(db,"purchaseOrders",id));setOrders(prev=>prev.filter(o=>o.id!==id))}

  return (
    <div className="p-4 md:p-6" dir="rtl">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-3 w-full mb-4">
          <TabsTrigger value="suggestions" className="text-xs">💡 המלצות{suggestions.length>0&&<span className="bg-amber-500 text-white text-xs rounded-full px-1 mr-1">{suggestions.length}</span>}</TabsTrigger>
          <TabsTrigger value="new-order" className="text-xs">➕ הזמנה חדשה{orderItems.length>0&&<span className="bg-blue-500 text-white text-xs rounded-full px-1 mr-1">{orderItems.length}</span>}</TabsTrigger>
          <TabsTrigger value="orders" className="text-xs">📋 הזמנות ({orders.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="suggestions">
