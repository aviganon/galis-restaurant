"use client"

import { useEffect, useMemo, useState } from "react"
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore"
import { db } from "@/lib/firebase"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Building2, Loader2, Mail, Trash2 } from "lucide-react"
import { toast } from "sonner"

export type InboundChangeRequestDoc = {
  restaurantId: string
  restaurantName?: string | null
  message: string
  requestedByUid: string
  requestedByEmail?: string | null
  createdAt: string
}

type InboundChangeRequestsPanelProps = {
  /** רק בקשות למסעדה זו (לדיאלוג מהשורה) */
  restaurantIdFilter?: string | null
  /** בלי מסגרת Card — לשימוש בתוך Dialog */
  compact?: boolean
}

export function InboundChangeRequestsPanel({
  restaurantIdFilter = null,
  compact = false,
}: InboundChangeRequestsPanelProps) {
  const [items, setItems] = useState<{ id: string; data: InboundChangeRequestDoc }[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const filteredItems = useMemo(() => {
    if (!restaurantIdFilter) return items
    return items.filter((x) => x.data.restaurantId === restaurantIdFilter)
  }, [items, restaurantIdFilter])

  useEffect(() => {
    const q = query(
      collection(db, "inboundChangeRequests"),
      orderBy("createdAt", "desc"),
    )
    const unsub = onSnapshot(
      q,
      (snap) => {
        const next: { id: string; data: InboundChangeRequestDoc }[] = []
        snap.forEach((d) => {
          next.push({ id: d.id, data: d.data() as InboundChangeRequestDoc })
        })
        setItems(next)
        setLoading(false)
      },
      (err) => {
        console.error(err)
        toast.error("שגיאה בטעינת בקשות")
        setLoading(false)
      },
    )
    return () => unsub()
  }, [])

  const remove = async (id: string) => {
    setDeletingId(id)
    try {
      await deleteDoc(doc(db, "inboundChangeRequests", id))
      toast.success("הבקשה הוסרה")
    } catch (e) {
      toast.error((e as Error).message || "שגיאה במחיקה")
    } finally {
      setDeletingId(null)
    }
  }

  const hint = (
    <p className="text-sm text-muted-foreground font-normal leading-relaxed">
      צוותי מסעדות יכולים לבקש שינוי כתובת המייל; כאן מופיעות הבקשות — לאחר טיפול אפשר למחוק את הרשומה.
    </p>
  )

  const listBody =
    loading ? (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
        <Loader2 className="w-4 h-4 animate-spin" />
        טוען…
      </div>
    ) : filteredItems.length === 0 ? (
      <p className="text-sm text-muted-foreground py-4">
        {restaurantIdFilter ? "אין בקשות פתוחות למסעדה זו" : "אין בקשות פתוחות"}
      </p>
    ) : (
      <ul className="space-y-3">
            {filteredItems.map(({ id, data }) => (
              <li
                key={id}
                className="rounded-lg border bg-card p-3 space-y-2 text-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 space-y-1">
                    <p className="font-medium text-foreground">
                      {data.restaurantName || "מסעדה"}
                      <span className="text-muted-foreground font-normal text-xs ms-2 font-mono" dir="ltr">
                        ({data.restaurantId})
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <Mail className="w-3.5 h-3.5 shrink-0" />
                      <span dir="ltr">{data.requestedByEmail || data.requestedByUid}</span>
                      {data.createdAt ? (
                        <span className="text-muted-foreground/80">
                          · {new Date(data.createdAt).toLocaleString("he-IL")}
                        </span>
                      ) : null}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0 gap-1"
                    disabled={deletingId === id}
                    onClick={() => void remove(id)}
                  >
                    {deletingId === id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" />
                    )}
                    טופל
                  </Button>
                </div>
                <p className="text-sm whitespace-pre-wrap border-t pt-2 bg-muted/20 rounded-md p-2">
                  {data.message}
                </p>
              </li>
            ))}
      </ul>
    )

  if (compact) {
    return (
      <div className="space-y-3">
        {!restaurantIdFilter ? hint : null}
        {listBody}
      </div>
    )
  }

  return (
    <Card className="border-0 shadow-sm border-primary/15 bg-primary/[0.03]">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <Building2 className="w-5 h-5 text-primary" />
          בקשות שינוי כתובת ייבוא
        </CardTitle>
        {hint}
      </CardHeader>
      <CardContent className="space-y-3">{listBody}</CardContent>
    </Card>
  )
}
