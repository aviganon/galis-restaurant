"use client"

import { startTransition, useEffect, useMemo, useState } from "react"
import { Bell, Check, Loader2 } from "lucide-react"
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  writeBatch,
} from "firebase/firestore"
import { onAuthStateChanged } from "firebase/auth"
import { auth, db } from "@/lib/firebase"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { useTranslations } from "@/lib/use-translations"
import { cn } from "@/lib/utils"

export type InAppNotification = {
  id: string
  title: string
  body: string
  type: string
  read: boolean
  createdAt: Date | null
  restaurantId?: string | null
  restaurantName?: string | null
}

type NotificationCenterProps = {
  /** סינון לפי מסעדה נוכחית — אם null מציגים הכל */
  currentRestaurantId: string | null
}

export function NotificationCenter({ currentRestaurantId }: NotificationCenterProps) {
  const t = useTranslations()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<InAppNotification[]>([])
  const [loading, setLoading] = useState(true)
  const [uid, setUid] = useState<string | null>(null)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUid(u?.uid ?? null)
      if (!u) setItems([])
    })
    return () => unsub()
  }, [])

  useEffect(() => {
    if (!uid) return
    startTransition(() => setLoading(true))
    const q = query(
      collection(db, "users", uid, "notifications"),
      orderBy("createdAt", "desc"),
      limit(80),
    )
    const unsub = onSnapshot(
      q,
      (snap) => {
        const next: InAppNotification[] = snap.docs.map((d) => {
          const x = d.data() as {
            title?: string
            body?: string
            type?: string
            read?: boolean
            restaurantId?: string | null
            restaurantName?: string | null
            createdAt?: { toDate?: () => Date }
          }
          const ts = x.createdAt?.toDate?.()
          return {
            id: d.id,
            title: x.title || "",
            body: x.body || "",
            type: x.type || "system",
            read: x.read === true,
            createdAt: ts instanceof Date ? ts : null,
            restaurantId: x.restaurantId ?? null,
            restaurantName: x.restaurantName ?? null,
          }
        })
        setItems(next)
        setLoading(false)
      },
      () => setLoading(false),
    )
    return () => unsub()
  }, [uid])

  const filtered = useMemo(() => {
    if (!currentRestaurantId) return items
    return items.filter(
      (n) => !n.restaurantId || n.restaurantId === currentRestaurantId,
    )
  }, [items, currentRestaurantId])

  const unreadCount = useMemo(() => filtered.filter((n) => !n.read).length, [filtered])

  const markRead = async (id: string) => {
    if (!uid) return
    try {
      await updateDoc(doc(db, "users", uid, "notifications", id), { read: true })
    } catch {
      /* ignore */
    }
  }

  const markAllRead = async () => {
    if (!uid) return
    const toMark = filtered.filter((n) => !n.read)
    if (toMark.length === 0) return
    const batch = writeBatch(db)
    for (const n of toMark) {
      batch.update(doc(db, "users", uid, "notifications", n.id), { read: true })
    }
    try {
      await batch.commit()
    } catch {
      /* ignore */
    }
  }

  if (!uid) return null

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="relative h-9 w-9 shrink-0 rounded-full"
          title={t("nav.notifications")}
          aria-label={t("nav.notifications")}
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 ? (
            <Badge
              className="absolute -top-1 -end-1 h-5 min-w-5 px-1 flex items-center justify-center text-[10px] p-0"
              variant="destructive"
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </Badge>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(100vw-2rem,22rem)] p-0" align="end" dir="rtl">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-semibold">{t("nav.notifications")}</span>
          {unreadCount > 0 ? (
            <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => void markAllRead()}>
              <Check className="h-3.5 w-3.5 ms-1" />
              {t("nav.markAllRead")}
            </Button>
          ) : null}
        </div>
        <ScrollArea className="h-[min(70vh,320px)]">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground text-center">{t("nav.noNotifications")}</p>
          ) : (
            <ul className="divide-y">
              {filtered.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    className={cn(
                      "w-full text-start px-3 py-2.5 text-sm transition-colors hover:bg-muted/60",
                      !n.read && "bg-primary/5",
                    )}
                    onClick={() => {
                      if (!n.read) void markRead(n.id)
                    }}
                  >
                    <div className="font-medium leading-snug">{n.title}</div>
                    <div className="text-muted-foreground text-xs mt-0.5 leading-relaxed">{n.body}</div>
                    {n.restaurantName ? (
                      <div className="text-[11px] text-muted-foreground mt-1">{n.restaurantName}</div>
                    ) : null}
                    {n.createdAt ? (
                      <div className="text-[10px] text-muted-foreground mt-1" dir="ltr">
                        {n.createdAt.toLocaleString("he-IL")}
                      </div>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}
