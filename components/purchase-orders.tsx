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
  ShoppingCart,
  Package,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { useTranslations } from "@/lib/use-translations"

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

export function PurchaseOrders() {
  const t = useTranslations()
  const { currentRestaurantId } = useApp()
  const [orders, setOrders] = useState<PurchaseOrder[]>([])
  const [suggestions, setSuggestions] = useState<OrderSuggestion[]>([])
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
        const [ordersSnap, ingSnap] = await Promise.all([
          getDocs(query(collection(db, "purchaseOrders"), where("restaurantId", "==", currentRestaurantId))),
          getDocs(collection(db, "restaurants", currentRestaurantId, "ingredients")),
        ])
        const list: PurchaseOrder[] = ordersSnap.docs.map((d) => {
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

        const sugg: OrderSuggestion[] = []
        ingSnap.forEach((d) => {
          const data = d.data()
          const stock = typeof data.stock === "number" ? data.stock : 0
          const minStock = typeof data.minStock === "number" ? data.minStock : 0
          const price = typeof data.price === "number" ? data.price : 0
          const unit = (data.unit as string) || "ק\"ג"
          const supplier = (data.supplier as string) || ""
          if (stock < minStock || (stock === 0 && minStock === 0)) {
            const suggestedQty = minStock > 0 ? minStock - stock : 1
            sugg.push({
              name: d.id,
              currentStock: stock,
              minStock,
              suggestedQty,
              unit,
              price,
              supplier: supplier || "—",
            })
          }
        })
        sugg.sort((a, b) => (a.supplier || "").localeCompare(b.supplier || ""))
        setSuggestions(sugg)
      } catch {
        setOrders([])
        setSuggestions([])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [currentRestaurantId])

  const getStatusConfig = (status: string) => {
    switch (status) {
      case "draft":
        return { label: t("pages.purchaseOrders.draft"), color: "bg-gray-100 text-gray-700", icon: FileText }
      case "sent":
        return { label: t("pages.purchaseOrders.sent"), color: "bg-blue-100 text-blue-700", icon: Clock }
      case "confirmed":
        return { label: t("pages.purchaseOrders.confirmed"), color: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 }
      case "delivered":
        return { label: t("pages.purchaseOrders.delivered"), color: "bg-purple-100 text-purple-700", icon: CheckCircle2 }
      case "cancelled":
        return { label: t("pages.purchaseOrders.cancelled"), color: "bg-red-100 text-red-700", icon: FileText }
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
        <h1 className="text-2xl font-bold mb-1">{t("nav.purchaseOrders")}</h1>
        <p className="text-muted-foreground">{t("pages.purchaseOrders.selectRestaurant")}</p>
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
                <p className="text-sm text-muted-foreground">{t("pages.purchaseOrders.ordersTotal")}</p>
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
                <p className="text-sm text-muted-foreground">{t("pages.purchaseOrders.pending")}</p>
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
                <p className="text-sm text-muted-foreground">{t("pages.purchaseOrders.deliveredCount")}</p>
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
                <p className="text-sm text-muted-foreground">{t("pages.purchaseOrders.ordersValue")}</p>
                <p className="text-2xl font-bold">{stats.totalValue.toLocaleString()} ש"ח</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {suggestions.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-4">
              <div className="p-2 rounded-xl bg-amber-500/10">
                <ShoppingCart className="w-5 h-5 text-amber-500" />
              </div>
              <div>
                <h2 className="font-bold text-lg">{t("pages.purchaseOrders.orderSuggestionsTitle")}</h2>
                <p className="text-sm text-muted-foreground">{t("pages.purchaseOrders.orderSuggestionsDesc")}</p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">{t("pages.ingredients.supplier")}</TableHead>
                    <TableHead className="text-right">{t("pages.ingredients.ingredient")}</TableHead>
                    <TableHead className="text-center">{t("pages.purchaseOrders.currentStock")}</TableHead>
                    <TableHead className="text-center">{t("pages.ingredients.minStockLabel")}</TableHead>
                    <TableHead className="text-center">{t("pages.purchaseOrders.suggestedQty")}</TableHead>
                    <TableHead className="text-center">{t("pages.ingredients.unit")}</TableHead>
                    <TableHead className="text-center">{t("pages.ingredients.price")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {suggestions.map((s) => (
                    <TableRow key={s.name} className="hover:bg-muted/50">
                      <TableCell className="text-right">{s.supplier}</TableCell>
                      <TableCell className="text-right font-medium">{s.name}</TableCell>
                      <TableCell className="text-center">{s.currentStock}</TableCell>
                      <TableCell className="text-center">{s.minStock}</TableCell>
                      <TableCell className="text-center font-semibold">{s.suggestedQty}</TableCell>
                      <TableCell className="text-center">{s.unit}</TableCell>
                      <TableCell className="text-center">₪{(s.price * s.suggestedQty).toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {suggestions.length === 0 && (
        <Card>
          <CardContent className="p-6 flex items-center gap-3 text-muted-foreground">
            <Package className="w-8 h-8 opacity-50" />
            <p>{t("pages.purchaseOrders.noSuggestions")}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex items-center gap-2 flex-1">
              <span className="font-bold text-lg">{t("pages.purchaseOrders.ordersTitle")}</span>
              <Badge variant="secondary">{filteredOrders.length} {t("pages.purchaseOrders.ordersCount")}</Badge>
            </div>
          </div>

          <div className="flex flex-col md:flex-row gap-3 mt-4">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder={t("pages.purchaseOrders.searchPlaceholder")}
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
                  <TableHead className="text-right">{t("pages.purchaseOrders.orderNumber")}</TableHead>
                  <TableHead className="text-right">{t("pages.ingredients.supplier")}</TableHead>
                  <TableHead className="text-center">{t("pages.purchaseOrders.items")}</TableHead>
                  <TableHead className="text-center">{t("pages.purchaseOrders.amount")}</TableHead>
                  <TableHead className="text-center">{t("pages.purchaseOrders.date")}</TableHead>
                  <TableHead className="text-center">{t("pages.purchaseOrders.status")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOrders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      {t("pages.purchaseOrders.noOrdersMessage")}
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
