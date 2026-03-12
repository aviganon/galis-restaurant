"use client"

import { useState, useEffect } from "react"
import { collection, getDocs, query, where } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { useApp } from "@/contexts/app-context"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  FileText,
  Clock,
  CheckCircle2,
  DollarSign,
  Loader2,
  Search,
} from "lucide-react"
import { Input } from "@/components/ui/input"

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

export function PurchaseOrders() {
  const { currentRestaurantId } = useApp()
  const [orders, setOrders] = useState<PurchaseOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")

  useEffect(() => {
    if (!currentRestaurantId) {
      setLoading(false)
      return
    }
    setLoading(true)
    const load = async () => {
      try {
        const purchaseOrdersRef = collection(db, "purchaseOrders")
        const q = query(purchaseOrdersRef, where("restaurantId", "==", currentRestaurantId))
        const snap = await getDocs(q)
        const list: PurchaseOrder[] = snap.docs.map((d) => {
          const data = d.data()
          return {
            id: d.id,
            orderNumber: (data.orderNumber as string) || d.id,
            supplier: (data.supplier as string) || "",
            items: Array.isArray(data.items) ? data.items : [],
            total: typeof data.total === "number" ? data.total : 0,
            status: (data.status as string) || "draft",
            createdAt: (data.createdAt as string) || "",
            expectedDelivery: data.expectedDelivery as string | undefined,
          }
        })
        setOrders(list)
      } catch {
        setOrders([])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [currentRestaurantId])

  const getStatusConfig = (status: string) => {
    switch (status) {
      case "draft":
        return { label: "טיוטה", color: "bg-gray-100 text-gray-700", icon: FileText }
      case "sent":
        return { label: "נשלח", color: "bg-blue-100 text-blue-700", icon: Clock }
      case "confirmed":
        return { label: "אושר", color: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 }
      case "delivered":
        return { label: "התקבל", color: "bg-purple-100 text-purple-700", icon: CheckCircle2 }
      case "cancelled":
        return { label: "בוטל", color: "bg-red-100 text-red-700", icon: FileText }
      default:
        return { label: status, color: "bg-gray-100 text-gray-700", icon: FileText }
    }
  }

  const filteredOrders = orders.filter(
    (o) => o.orderNumber.includes(searchTerm) || o.supplier.includes(searchTerm)
  )

  const stats = {
    total: orders.length,
    pending: orders.filter((o) => o.status === "sent" || o.status === "confirmed").length,
    delivered: orders.filter((o) => o.status === "delivered").length,
    totalValue: orders.filter((o) => o.status !== "cancelled").reduce((s, o) => s + o.total, 0),
  }

  if (loading) {
    return (
      <div className="p-4 md:p-6 flex items-center justify-center min-h-[40vh]">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!currentRestaurantId) {
    return (
      <div className="p-4 md:p-6">
        <h1 className="text-2xl font-bold mb-1">הזמנות ספקים</h1>
        <p className="text-muted-foreground">בחר מסעדה</p>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-primary/10">
                <FileText className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">סה"כ הזמנות</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-amber-500/10">
                <Clock className="w-5 h-5 text-amber-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">בהמתנה</p>
                <p className="text-2xl font-bold">{stats.pending}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-emerald-500/10">
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">התקבלו</p>
                <p className="text-2xl font-bold">{stats.delivered}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-blue-500/10">
                <DollarSign className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">סה"כ להזמנות</p>
                <p className="text-2xl font-bold">{stats.totalValue.toLocaleString()} ש"ח</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex items-center gap-2 flex-1">
              <span className="font-bold text-lg">הזמנות ספקים</span>
              <Badge variant="secondary">{filteredOrders.length} הזמנות</Badge>
            </div>
          </div>

          <div className="flex flex-col md:flex-row gap-3 mt-4">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="חפש לפי מספר הזמנה או ספק..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pr-10"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">מספר הזמנה</TableHead>
                  <TableHead className="text-right">ספק</TableHead>
                  <TableHead className="text-center">פריטים</TableHead>
                  <TableHead className="text-center">סכום</TableHead>
                  <TableHead className="text-center">תאריך</TableHead>
                  <TableHead className="text-center">סטטוס</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOrders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      אין הזמנות. הזמנות ספקים יוצגו כאן כאשר יוגדרו במערכת.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredOrders.map((order) => {
                    const sc = getStatusConfig(order.status)
                    return (
                      <TableRow key={order.id} className="hover:bg-muted/50">
                        <TableCell className="font-semibold">{order.orderNumber}</TableCell>
                        <TableCell>{order.supplier}</TableCell>
                        <TableCell className="text-center">{order.items.length}</TableCell>
                        <TableCell className="text-center font-semibold">{order.total.toLocaleString()} ש"ח</TableCell>
                        <TableCell className="text-center text-muted-foreground">{order.createdAt}</TableCell>
                        <TableCell className="text-center">
                          <Badge className={sc.color}>
                            <sc.icon className="w-3 h-3 ml-1" />
                            {sc.label}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
