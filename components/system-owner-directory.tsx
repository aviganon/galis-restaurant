"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { sendPasswordResetEmail } from "firebase/auth"
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  where,
  writeBatch,
} from "firebase/firestore"
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from "firebase/storage"
import { auth, db, getAuthForUserCreation, storage } from "@/lib/firebase"
import type { Restaurant } from "@/contexts/app-context"
import { buildInboundAddress, type InboundSettings } from "@/lib/inbound-email"
import { InboundEmailSettings } from "@/components/inbound-email-settings"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import {
  Building2,
  Loader2,
  Mail,
  RefreshCw,
  Search,
  UserCircle2,
  UserPlus,
  Users,
  Link2,
  KeyRound,
  Pencil,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"
import { useTranslations } from "@/lib/use-translations"
import { postInviteEmail } from "@/lib/invite-email"
import { createUniqueInviteCode } from "@/lib/invite-code-document"

export type DirectoryUserRow = {
  uid: string
  email: string
  role: string
  restaurantId: string | null
  restaurantName?: string
}

type Props = {
  restaurants: Restaurant[]
  usersData: DirectoryUserRow[]
  usersLoaded: boolean
  loadingUsers: boolean
  onRefreshUsers: () => void | Promise<void>
  selectedRestId: string | null
  onSelectRestaurant: (id: string | null) => void
  onEditUser: (u: DirectoryUserRow) => void
  onAssignClick: (u: DirectoryUserRow) => void
  onSendInvite?: (u: DirectoryUserRow) => void
  /** סטטיסטיקות + יצירת משתמש — מעל רשימת המשתמשים בטאב «לפי משתמש» */
  userTabToolbar?: ReactNode
  /** טבלה מלאה + הזמנות — מתחת לרשימה/פרטים */
  userTabBulk?: ReactNode
  /** אחרי שמירת פרטי מסעדה — רענון רשימת מסעדות מה־context */
  onRestaurantSaved?: () => void
  /** אחרי מחיקת מסעדה (למשל עדכון בחירה בהגדרות) */
  onRestaurantDeleted?: (deletedId: string) => void
}

export function SystemOwnerDirectory({
  restaurants,
  usersData,
  usersLoaded,
  loadingUsers,
  onRefreshUsers,
  selectedRestId,
  onSelectRestaurant,
  onEditUser,
  onAssignClick,
  onSendInvite,
  userTabToolbar,
  userTabBulk,
  onRestaurantSaved,
  onRestaurantDeleted,
}: Props) {
  const t = useTranslations()
  const [search, setSearch] = useState("")
  const [inboundMap, setInboundMap] = useState<Record<string, InboundSettings | null>>({})
  const [loadingInbound, setLoadingInbound] = useState(false)
  const [panelTab, setPanelTab] = useState<"restaurant" | "user">("restaurant")
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [sendingPasswordResetUid, setSendingPasswordResetUid] = useState<string | null>(null)

  const handlePasswordResetUser = async (u: DirectoryUserRow) => {
    const email = u.email?.trim()
    if (!email) {
      toast.error(t("pages.settings.noEmailForReset"))
      return
    }
    setSendingPasswordResetUid(u.uid)
    try {
      auth.languageCode = "he"
      await sendPasswordResetEmail(auth, email, {
        url: `${typeof window !== "undefined" ? window.location.origin : ""}/`,
        handleCodeInApp: false,
      })
      toast.success(t("pages.settings.resetEmailSent"))
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSendingPasswordResetUid(null)
    }
  }

  const loadInboundForAll = useCallback(async () => {
    const list = restaurants || []
    if (list.length === 0) {
      setInboundMap({})
      return
    }
    setLoadingInbound(true)
    try {
      const entries = await Promise.all(
        list.map(async (r) => {
          const snap = await getDoc(doc(db, "restaurants", r.id, "appState", "inboundSettings"))
          return [r.id, snap.exists() ? (snap.data() as InboundSettings) : null] as const
        })
      )
      const next: Record<string, InboundSettings | null> = {}
      for (const [id, data] of entries) next[id] = data
      setInboundMap(next)
    } catch {
      toast.error("שגיאה בטעינת כתובות מייל")
    } finally {
      setLoadingInbound(false)
    }
  }, [restaurants])

  useEffect(() => {
    void loadInboundForAll()
  }, [loadInboundForAll])

  const filteredRestaurants = useMemo(() => {
    const q = search.trim().toLowerCase()
    const base = restaurants || []
    if (!q) return base
    return base.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        (r.branch && r.branch.toLowerCase().includes(q)) ||
        r.id.toLowerCase().includes(q)
    )
  }, [restaurants, search])

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase()
    const base = usersData || []
    if (!q) return base
    return base.filter(
      (u) =>
        (u.email || "").toLowerCase().includes(q) ||
        (u.restaurantName || "").toLowerCase().includes(q) ||
        (u.role || "").toLowerCase().includes(q)
    )
  }, [usersData, search])

  const usersByRestaurant = useCallback(
    (restId: string) => usersData.filter((u) => u.restaurantId === restId),
    [usersData]
  )

  const selectedUser = useMemo(
    () => (selectedUserId ? usersData.find((u) => u.uid === selectedUserId) : null),
    [selectedUserId, usersData]
  )

  /** מסעדה פעילה: בחירה ישירה או דרך משתמש */
  const effectiveRestId =
    panelTab === "user" && selectedUser?.restaurantId
      ? selectedUser.restaurantId
      : selectedRestId

  const effectiveRest = (restaurants || []).find((r) => r.id === effectiveRestId)

  const selectRestaurant = (id: string) => {
    if (selectedRestId === id && panelTab === "restaurant") {
      onSelectRestaurant(null)
      return
    }
    setPanelTab("restaurant")
    onSelectRestaurant(id)
    setSelectedUserId(null)
  }

  /** בחירת מסעדה בלי toggle (לחיצה על מייל / ניהול צוות בשורה) */
  const ensureRestaurantSelected = (id: string) => {
    setPanelTab("restaurant")
    setSelectedUserId(null)
    if (selectedRestId !== id || panelTab !== "restaurant") {
      onSelectRestaurant(id)
    }
  }

  const [inboundDialogRestId, setInboundDialogRestId] = useState<string | null>(null)
  const [staffDialogRestId, setStaffDialogRestId] = useState<string | null>(null)
  const [editRestaurantId, setEditRestaurantId] = useState<string | null>(null)

  const selectUserRow = (u: DirectoryUserRow) => {
    if (selectedUserId === u.uid) {
      setSelectedUserId(null)
      return
    }
    setPanelTab("user")
    setSelectedUserId(u.uid)
    if (u.restaurantId) onSelectRestaurant(u.restaurantId)
  }

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-primary/[0.04] to-transparent shadow-sm overflow-hidden">
      <CardHeader className="pb-2 space-y-1">
        <CardTitle className="text-lg flex flex-wrap items-center gap-2">
          <Building2 className="w-5 h-5 text-primary shrink-0" />
          ניהול מסעדות ומשתמשים
        </CardTitle>
        <p className="text-sm text-muted-foreground leading-relaxed">
          בשורת המסעדה: <strong>עריכה</strong> לפרטי המסעדה, <strong>ניהול צוות</strong>, ולחיצה על <strong>כתובת המייל</strong> לייבוא. לחיצה על רקע השורה פותחת פרטים <strong>מתחת</strong> לאותה שורה.{" "}
          <span className="text-muted-foreground/90">הפרטים נפתחים מתחת לשורה; לחיצה שוב על הרקע סוגרת.</span>
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="חיפוש לפי שם מסעדה, סניף, אימייל משתמש..."
              className="pr-9 h-10 rounded-xl"
            />
          </div>
          <div className="flex gap-2 shrink-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => void onRefreshUsers()}
              disabled={loadingUsers}
            >
              {loadingUsers ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              רענן רשימות
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => void loadInboundForAll()}
              disabled={loadingInbound}
            >
              {loadingInbound ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Mail className="w-3.5 h-3.5" />
              )}
              רענן מיילים
            </Button>
          </div>
        </div>

        <Tabs value={panelTab} onValueChange={(v) => setPanelTab(v as "restaurant" | "user")}>
          <TabsList className="grid w-full max-w-md grid-cols-2 h-10">
            <TabsTrigger value="restaurant" className="gap-1.5 text-xs sm:text-sm">
              <Building2 className="w-3.5 h-3.5" />
              לפי מסעדה
            </TabsTrigger>
            <TabsTrigger value="user" className="gap-1.5 text-xs sm:text-sm">
              <Users className="w-3.5 h-3.5" />
              לפי משתמש
            </TabsTrigger>
          </TabsList>

          <TabsContent value="restaurant" className="mt-4 space-y-0">
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground px-1">
                מסעדות ({filteredRestaurants.length})
              </p>
              <div className="border rounded-xl max-h-[min(70vh,560px)] overflow-y-auto bg-card">
                {!restaurants?.length ? (
                  <div className="p-6 text-sm text-muted-foreground text-center">אין מסעדות</div>
                ) : (
                  filteredRestaurants.map((r) => {
                    const n = usersByRestaurant(r.id).length
                    const inbound = inboundMap[r.id]
                    const addr =
                      inbound?.inboundEmailToken != null
                        ? buildInboundAddress(inbound.inboundEmailToken)
                        : null
                    const active = selectedRestId === r.id && panelTab === "restaurant"
                    return (
                      <div key={r.id} className="border-b border-border last:border-b-0">
                        <div
                          role="button"
                          tabIndex={0}
                          title={active ? "לחיצה על הרקע סוגרת את פאנל הפרטים" : undefined}
                          onClick={() => selectRestaurant(r.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault()
                              selectRestaurant(r.id)
                            }
                          }}
                          className={cn(
                            "w-full text-right p-3 transition-colors hover:bg-muted/60 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-none",
                            active && "bg-primary/10 ring-1 ring-inset ring-primary/25"
                          )}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1 space-y-1">
                              <div className="flex items-start justify-between gap-2">
                                <div className="font-medium text-sm min-w-0 leading-snug">
                                  {r.emoji ? `${r.emoji} ` : ""}
                                  {r.name}
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-7 px-2 text-[11px] gap-1"
                                    title="עריכת פרטי מסעדה"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      ensureRestaurantSelected(r.id)
                                      setEditRestaurantId(r.id)
                                    }}
                                  >
                                    <Pencil className="h-3 w-3 shrink-0" />
                                    עריכה
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-7 px-2 text-[11px] gap-1"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      ensureRestaurantSelected(r.id)
                                      setStaffDialogRestId(r.id)
                                    }}
                                  >
                                    <UserPlus className="h-3 w-3 shrink-0" />
                                    ניהול צוות
                                  </Button>
                                  <Badge variant="secondary" className="shrink-0 tabular-nums">
                                    {n}
                                  </Badge>
                                </div>
                              </div>
                              <div className="text-xs text-muted-foreground">{r.branch || "סניף ראשי"}</div>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  ensureRestaurantSelected(r.id)
                                  setInboundDialogRestId(r.id)
                                }}
                                className={cn(
                                  "w-full text-start rounded-md px-1.5 py-1 -mx-1.5 text-[11px] transition-colors",
                                  "hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                  addr ? "font-mono text-muted-foreground" : "text-primary font-medium",
                                )}
                                dir="ltr"
                                title={addr || "הוסף כתובת ייבוא"}
                              >
                                {addr || "— אין כתובת מייל —"}
                              </button>
                            </div>
                          </div>
                        </div>
                        {active ? (
                          <div
                            className="border-t border-dashed bg-muted/20 p-3 sm:p-4"
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => e.stopPropagation()}
                          >
                            <RestaurantDetailPanel
                              restaurant={effectiveRest}
                              showDetailActions={false}
                              inboundAddress={(() => {
                                const s = inboundMap[selectedRestId]
                                return s?.inboundEmailToken != null
                                  ? buildInboundAddress(s.inboundEmailToken)
                                  : null
                              })()}
                              usersLoaded={usersLoaded}
                              userCount={usersByRestaurant(selectedRestId).length}
                              onOpenInbound={() => setInboundDialogRestId(selectedRestId)}
                              onOpenStaff={() => setStaffDialogRestId(selectedRestId)}
                              onOpenEdit={() => setEditRestaurantId(selectedRestId)}
                            />
                          </div>
                        ) : null}
                      </div>
                    )
                  })
                )}
              </div>

              {selectedRestId &&
              panelTab === "restaurant" &&
              !filteredRestaurants.some((r) => r.id === selectedRestId) ? (
                <div className="rounded-xl border border-dashed bg-muted/15 p-4">
                  <p className="text-xs text-muted-foreground mb-3">
                    המסעדה שנבחרה לא מופיעה בתוצאות החיפוש — פרטים:
                  </p>
                  <RestaurantDetailPanel
                    restaurant={effectiveRest}
                    showDetailActions={false}
                    inboundAddress={(() => {
                      const s = inboundMap[selectedRestId]
                      return s?.inboundEmailToken != null
                        ? buildInboundAddress(s.inboundEmailToken)
                        : null
                    })()}
                    usersLoaded={usersLoaded}
                    userCount={usersByRestaurant(selectedRestId).length}
                    onOpenInbound={() => setInboundDialogRestId(selectedRestId)}
                    onOpenStaff={() => setStaffDialogRestId(selectedRestId)}
                    onOpenEdit={() => setEditRestaurantId(selectedRestId)}
                  />
                </div>
              ) : null}
            </div>
          </TabsContent>

          <TabsContent value="user" className="mt-4 space-y-6">
            {userTabToolbar}
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground px-1">
                משתמשים ({filteredUsers.length})
              </p>
              <div className="border rounded-xl max-h-[min(70vh,560px)] overflow-y-auto bg-card">
                {!usersLoaded ? (
                  <div className="p-6 text-sm text-muted-foreground text-center flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    טוען משתמשים…
                  </div>
                ) : filteredUsers.length === 0 ? (
                  <div className="p-6 text-sm text-muted-foreground text-center">אין תוצאות</div>
                ) : (
                  filteredUsers.map((u) => {
                    const active = selectedUserId === u.uid && panelTab === "user"
                    const restForUser = u.restaurantId
                      ? restaurants.find((r) => r.id === u.restaurantId)
                      : undefined
                    return (
                      <div key={u.uid} className="border-b border-border last:border-b-0">
                        <div
                          role="button"
                          tabIndex={0}
                          title={active ? "לחיצה שוב סוגרת את פאנל הפרטים" : undefined}
                          onClick={() => selectUserRow(u)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault()
                              selectUserRow(u)
                            }
                          }}
                          className={cn(
                            "w-full text-right p-3 transition-colors hover:bg-muted/60 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-none",
                            active && "bg-primary/10 ring-1 ring-inset ring-primary/25",
                          )}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-xs font-mono dir-ltr text-left">{u.email}</div>
                              <div className="text-xs text-muted-foreground mt-1">
                                {u.restaurantName || "ללא מסעדה"} · {u.role}
                              </div>
                            </div>
                            <UserCircle2 className="w-4 h-4 shrink-0 text-muted-foreground mt-0.5" />
                          </div>
                        </div>
                        {active ? (
                          <div
                            className="space-y-3 border-t border-dashed bg-muted/20 p-3 sm:p-4"
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => e.stopPropagation()}
                          >
                            <div className="rounded-xl border bg-muted/30 p-4 space-y-2">
                              <div className="text-sm font-semibold flex items-center gap-2">
                                <UserCircle2 className="w-4 h-4" />
                                {u.email}
                              </div>
                              <div className="text-xs text-muted-foreground space-y-1">
                                <p>
                                  תפקיד: <strong className="text-foreground">{u.role}</strong>
                                </p>
                                <p>
                                  מסעדה:{" "}
                                  <strong className="text-foreground">
                                    {u.restaurantName || "— לא משויך —"}
                                  </strong>
                                </p>
                              </div>
                              <div className="flex flex-wrap gap-2 pt-1">
                                <Button size="sm" variant="secondary" onClick={() => onEditUser(u)}>
                                  ערוך משתמש
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => void handlePasswordResetUser(u)}
                                  disabled={!u.email?.trim() || sendingPasswordResetUid === u.uid}
                                  title={
                                    u.email?.trim()
                                      ? t("pages.settings.resetPasswordForUser")
                                      : t("pages.settings.noEmailForReset")
                                  }
                                >
                                  {sendingPasswordResetUid === u.uid ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <KeyRound className="w-3.5 h-3.5" />
                                  )}
                                  {t("pages.settings.resetPasswordForUser")}
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => onAssignClick(u)}>
                                  שייך מסעדה
                                </Button>
                                {onSendInvite ? (
                                  <Button size="sm" variant="outline" onClick={() => onSendInvite(u)}>
                                    הזמנה במייל
                                  </Button>
                                ) : null}
                              </div>
                            </div>
                            {u.restaurantId ? (
                              <RestaurantDetailPanel
                                restaurant={restForUser}
                                showDetailActions
                                inboundAddress={(() => {
                                  const s = inboundMap[u.restaurantId!]
                                  return s?.inboundEmailToken != null
                                    ? buildInboundAddress(s.inboundEmailToken)
                                    : null
                                })()}
                                usersLoaded={usersLoaded}
                                userCount={usersByRestaurant(u.restaurantId).length}
                                onOpenInbound={() => setInboundDialogRestId(u.restaurantId!)}
                                onOpenStaff={() => setStaffDialogRestId(u.restaurantId!)}
                                onOpenEdit={() => setEditRestaurantId(u.restaurantId!)}
                              />
                            ) : (
                              <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground text-center">
                                למשתמש זה אין מסעדה משויכת — לחץ &quot;שייך מסעדה&quot; כדי לקשר.
                              </div>
                            )}
                          </div>
                        ) : null}
                      </div>
                    )
                  })
                )}
              </div>

              {selectedUser &&
              panelTab === "user" &&
              !filteredUsers.some((x) => x.uid === selectedUser.uid) ? (
                <div className="rounded-xl border border-dashed bg-muted/15 p-4 space-y-3">
                  <p className="text-xs text-muted-foreground">
                    המשתמש שנבחר לא מופיע בתוצאות החיפוש — פרטים:
                  </p>
                  <div className="rounded-xl border bg-muted/30 p-4 space-y-2">
                    <div className="text-sm font-semibold flex items-center gap-2">
                      <UserCircle2 className="w-4 h-4" />
                      {selectedUser.email}
                    </div>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button size="sm" variant="secondary" onClick={() => onEditUser(selectedUser)}>
                        ערוך משתמש
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => onAssignClick(selectedUser)}>
                        שייך מסעדה
                      </Button>
                    </div>
                  </div>
                  {selectedUser.restaurantId ? (
                    <RestaurantDetailPanel
                      restaurant={effectiveRest}
                      showDetailActions
                      inboundAddress={(() => {
                        const s = inboundMap[selectedUser.restaurantId!]
                        return s?.inboundEmailToken != null
                          ? buildInboundAddress(s.inboundEmailToken)
                          : null
                      })()}
                      usersLoaded={usersLoaded}
                      userCount={usersByRestaurant(selectedUser.restaurantId).length}
                      onOpenInbound={() => setInboundDialogRestId(selectedUser.restaurantId!)}
                      onOpenStaff={() => setStaffDialogRestId(selectedUser.restaurantId!)}
                      onOpenEdit={() => setEditRestaurantId(selectedUser.restaurantId!)}
                    />
                  ) : null}
                </div>
              ) : null}
            </div>
            {userTabBulk}
          </TabsContent>
        </Tabs>

        <DirectoryRestaurantDialogs
          inboundRestId={inboundDialogRestId}
          staffRestId={staffDialogRestId}
          onInboundOpenChange={(open) => {
            if (!open) setInboundDialogRestId(null)
          }}
          onStaffOpenChange={(open) => {
            if (!open) setStaffDialogRestId(null)
          }}
          restaurants={restaurants}
          usersData={usersData}
          usersLoaded={usersLoaded}
          usersByRestaurant={usersByRestaurant}
          onRefreshUsers={onRefreshUsers}
          onInboundRefresh={() => void loadInboundForAll()}
          onEditUser={onEditUser}
          onAssignClick={onAssignClick}
          onSendInvite={onSendInvite}
          onPasswordReset={handlePasswordResetUser}
          sendingPasswordResetUid={sendingPasswordResetUid}
        />

        <RestaurantEditDialog
          restaurantId={editRestaurantId}
          restaurants={restaurants}
          onOpenChange={(open) => {
            if (!open) setEditRestaurantId(null)
          }}
          onSaved={() => onRestaurantSaved?.()}
          onDeleted={(deletedId) => {
            if (selectedRestId === deletedId) onSelectRestaurant(null)
            setInboundDialogRestId((p) => (p === deletedId ? null : p))
            setStaffDialogRestId((p) => (p === deletedId ? null : p))
            setEditRestaurantId(null)
            void loadInboundForAll()
            onRestaurantDeleted?.(deletedId)
          }}
        />
      </CardContent>
    </Card>
  )
}

/** מחיקת מסעדה + תתי־אוספים + ניתוק משתמשים (כמו בלוח ניהול) */
async function deleteRestaurantAndRelatedData(restId: string) {
  const inboundSnap = await getDoc(doc(db, "restaurants", restId, "appState", "inboundSettings"))
  if (inboundSnap.exists()) {
    const token = (inboundSnap.data() as InboundSettings).inboundEmailToken
    if (typeof token === "string" && token.trim()) {
      try {
        await deleteDoc(doc(db, "inboundEmailLookup", token))
      } catch {
        /* מסמך lookup כבר לא קיים */
      }
    }
  }
  const [recSnap, ingSnap, appSnap] = await Promise.all([
    getDocs(collection(db, "restaurants", restId, "recipes")),
    getDocs(collection(db, "restaurants", restId, "ingredients")),
    getDocs(collection(db, "restaurants", restId, "appState")),
  ])
  const toDelete: { col: string; id: string }[] = []
  recSnap.docs.forEach((d) => toDelete.push({ col: "recipes", id: d.id }))
  ingSnap.docs.forEach((d) => toDelete.push({ col: "ingredients", id: d.id }))
  appSnap.docs.forEach((d) => toDelete.push({ col: "appState", id: d.id }))
  for (let i = 0; i < toDelete.length; i += 500) {
    const batch = writeBatch(db)
    toDelete.slice(i, i + 500).forEach(({ col, id }) =>
      batch.delete(doc(db, "restaurants", restId, col, id)),
    )
    await batch.commit()
  }
  await deleteDoc(doc(db, "restaurants", restId))
  const usersSnap = await getDocs(query(collection(db, "users"), where("restaurantId", "==", restId)))
  const userBatch = writeBatch(db)
  usersSnap.docs.forEach((u) => userBatch.update(doc(db, "users", u.id), { restaurantId: null }))
  if (usersSnap.docs.length > 0) await userBatch.commit()
}

/** עריכת שם, אימוג'י, סניף, יצירת קשר ותמונה — מסמך restaurants */
function RestaurantEditDialog({
  restaurantId,
  restaurants,
  onOpenChange,
  onSaved,
  onDeleted,
}: {
  restaurantId: string | null
  restaurants: Restaurant[]
  onOpenChange: (open: boolean) => void
  onSaved?: () => void
  onDeleted?: (deletedId: string) => void
}) {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deletingRestaurant, setDeletingRestaurant] = useState(false)
  const [name, setName] = useState("")
  const [emoji, setEmoji] = useState("")
  const [branch, setBranch] = useState("")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")
  const [address, setAddress] = useState("")
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const imgInputRef = useRef<HTMLInputElement>(null)

  const filePreviewUrl = useMemo(
    () => (imageFile ? URL.createObjectURL(imageFile) : null),
    [imageFile],
  )
  useEffect(() => {
    return () => {
      if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl)
    }
  }, [filePreviewUrl])

  useEffect(() => {
    if (!restaurantId) return
    setLoading(true)
    setImageFile(null)
    getDoc(doc(db, "restaurants", restaurantId))
      .then((snap) => {
        if (!snap.exists()) {
          toast.error("מסעדה לא נמצאה")
          onOpenChange(false)
          return
        }
        const d = snap.data() as Record<string, unknown>
        setName(String(d.name ?? ""))
        setEmoji(String(d.emoji ?? ""))
        setBranch(String(d.branch ?? ""))
        setPhone(String(d.phone ?? ""))
        setEmail(String(d.email ?? ""))
        setAddress(String(d.address ?? ""))
        setImageUrl(typeof d.imageUrl === "string" ? d.imageUrl : null)
      })
      .catch(() => {
        toast.error("שגיאה בטעינת פרטי מסעדה")
        onOpenChange(false)
      })
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- טעינה מחדש רק כשמשתנה מזהה מסעדה
  }, [restaurantId])

  const handleSave = async () => {
    if (!restaurantId || !name.trim()) {
      toast.error("נא למלא שם מסעדה")
      return
    }
    setSaving(true)
    try {
      let imgUrl: string | null = imageUrl
      if (imageFile) {
        const sRef = storageRef(storage, `restaurants/${restaurantId}/cover.jpg`)
        await new Promise<void>((res, rej) => {
          const task = uploadBytesResumable(sRef, imageFile)
          task.on("state_changed", () => {}, rej, async () => {
            imgUrl = await getDownloadURL(sRef)
            res()
          })
        })
        setImageUrl(imgUrl)
      }
      await setDoc(
        doc(db, "restaurants", restaurantId),
        {
          name: name.trim(),
          emoji: emoji.trim() || null,
          branch: branch.trim() || null,
          phone: phone.trim() || null,
          email: email.trim() || null,
          address: address.trim() || null,
          ...(imgUrl ? { imageUrl: imgUrl } : {}),
          lastUpdated: new Date().toISOString(),
        },
        { merge: true },
      )
      toast.success("פרטי המסעדה עודכנו")
      onSaved?.()
      onOpenChange(false)
    } catch (e) {
      toast.error((e as Error).message || "שגיאה בשמירה")
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteRestaurant = async () => {
    if (!restaurantId) return
    setDeletingRestaurant(true)
    try {
      await deleteRestaurantAndRelatedData(restaurantId)
      toast.success(`מסעדה "${name.trim()}" נמחקה`)
      onDeleted?.(restaurantId)
      setDeleteConfirmOpen(false)
      onOpenChange(false)
    } catch (e) {
      toast.error((e as Error).message || "שגיאה במחיקה")
    } finally {
      setDeletingRestaurant(false)
    }
  }

  const previewEmoji =
    emoji.trim() || restaurants.find((x) => x.id === restaurantId)?.emoji || "🍽️"

  return (
    <>
    <Dialog open={!!restaurantId} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-md max-h-[min(calc(100dvh-2rem),920px)] overflow-y-auto"
        dir="rtl"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-5 w-5 text-primary shrink-0" />
            עריכת פרטי מסעדה
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            טוען…
          </div>
        ) : (
          <>
            <input
              ref={imgInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.currentTarget.files?.[0]
                if (f && f.size <= 5 * 1024 * 1024) setImageFile(f)
                else if (f) toast.error("קובץ גדול מדי (עד 5MB)")
                e.currentTarget.value = ""
              }}
            />
            <div className="flex items-center gap-4">
              <button
                type="button"
                className="w-16 h-16 rounded-xl overflow-hidden border bg-muted cursor-pointer hover:opacity-90 shrink-0 flex items-center justify-center"
                onClick={() => imgInputRef.current?.click()}
              >
                {filePreviewUrl || imageUrl ? (
                  <img
                    src={filePreviewUrl || imageUrl!}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-2xl">{previewEmoji}</span>
                )}
              </button>
              <div>
                <button
                  type="button"
                  onClick={() => imgInputRef.current?.click()}
                  className="text-sm text-primary hover:underline block"
                >
                  {imageUrl || imageFile ? "החלף תמונה" : "הוסף תמונה"}
                </button>
                <p className="text-xs text-muted-foreground">PNG, JPG עד 5MB</p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="dir-rest-emoji">אימוג&apos;י</Label>
                  <Input
                    id="dir-rest-emoji"
                    value={emoji}
                    onChange={(e) => setEmoji(e.target.value)}
                    placeholder="🍽️"
                    className="h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="dir-rest-branch">שם סניף</Label>
                  <Input
                    id="dir-rest-branch"
                    value={branch}
                    onChange={(e) => setBranch(e.target.value)}
                    placeholder="סניף ראשי"
                    className="h-9"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dir-rest-name">שם המסעדה</Label>
                <Input
                  id="dir-rest-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="שם המסעדה"
                  className="h-9"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="dir-rest-phone">טלפון</Label>
                  <Input
                    id="dir-rest-phone"
                    dir="ltr"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="050-0000000"
                    className="h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="dir-rest-email">אימייל</Label>
                  <Input
                    id="dir-rest-email"
                    dir="ltr"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="email@example.com"
                    className="h-9"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dir-rest-address">כתובת</Label>
                <Input
                  id="dir-rest-address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="רחוב, עיר"
                  className="h-9"
                />
              </div>
            </div>

            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-2">
              <p className="text-xs text-muted-foreground leading-relaxed">
                מחיקה תסיר את המסעדה, כל המתכונים והרכיבים שלה, ותנתק משתמשים ששויכו אליה. לא ניתן לבטל.
              </p>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="gap-1.5"
                disabled={loading || saving}
                onClick={() => setDeleteConfirmOpen(true)}
              >
                <Trash2 className="h-3.5 w-3.5 shrink-0" />
                מחק מסעדה
              </Button>
            </div>

            <DialogFooter className="gap-2 sm:justify-start">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                ביטול
              </Button>
              <Button type="button" onClick={() => void handleSave()} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                שמור
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>

    <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
      <AlertDialogContent dir="rtl">
        <AlertDialogHeader>
          <AlertDialogTitle>למחוק את המסעדה?</AlertDialogTitle>
          <AlertDialogDescription className="text-start space-y-2">
            <span className="block">
              כל הנתונים של המסעדה במערכת (מתכונים, רכיבים, הגדרות) יימחקו. משתמשים ינותקו ממנה.
            </span>
            <span className="block font-medium text-foreground">{name.trim() || "—"}</span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:justify-start">
          <AlertDialogCancel disabled={deletingRestaurant}>ביטול</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={deletingRestaurant}
            onClick={() => void handleDeleteRestaurant()}
            className="gap-1.5"
          >
            {deletingRestaurant ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            מחק לצמיתות
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  )
}

/** דיאלוגים משותפים — נפתחים מהשורה ברשימת המסעדות או מטאב משתמש */
function DirectoryRestaurantDialogs({
  inboundRestId,
  staffRestId,
  onInboundOpenChange,
  onStaffOpenChange,
  restaurants,
  usersData,
  usersLoaded,
  usersByRestaurant,
  onRefreshUsers,
  onInboundRefresh,
  onEditUser,
  onAssignClick,
  onSendInvite,
  onPasswordReset,
  sendingPasswordResetUid,
}: {
  inboundRestId: string | null
  staffRestId: string | null
  onInboundOpenChange: (open: boolean) => void
  onStaffOpenChange: (open: boolean) => void
  restaurants: Restaurant[]
  usersData: DirectoryUserRow[]
  usersLoaded: boolean
  usersByRestaurant: (id: string) => DirectoryUserRow[]
  onRefreshUsers: () => void | Promise<void>
  onInboundRefresh: () => void
  onEditUser: (u: DirectoryUserRow) => void
  onAssignClick: (u: DirectoryUserRow) => void
  onSendInvite?: (u: DirectoryUserRow) => void
  onPasswordReset?: (u: DirectoryUserRow) => void
  sendingPasswordResetUid?: string | null
}) {
  const t = useTranslations()
  const inboundRestaurant = inboundRestId ? restaurants.find((r) => r.id === inboundRestId) : undefined
  const staffRestaurant = staffRestId ? restaurants.find((r) => r.id === staffRestId) : undefined
  const staffUsers = staffRestId ? usersByRestaurant(staffRestId) : []

  return (
    <>
      <Dialog open={!!inboundRestId} onOpenChange={onInboundOpenChange}>
        {inboundRestId ? (
          <DialogContent
            className="sm:max-w-lg max-h-[min(calc(100dvh-2rem),920px)] overflow-y-auto"
            dir="rtl"
          >
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5 text-primary shrink-0" />
                ייבוא ממייל
                {inboundRestaurant?.name ? (
                  <span className="text-sm font-normal text-muted-foreground">— {inboundRestaurant.name}</span>
                ) : null}
              </DialogTitle>
            </DialogHeader>
            <InboundEmailSettings
              externalRestaurantId={inboundRestId}
              allowEdit
              onInboundCreated={onInboundRefresh}
            />
          </DialogContent>
        ) : null}
      </Dialog>

      <Dialog open={!!staffRestId} onOpenChange={onStaffOpenChange}>
        {staffRestId ? (
          <DialogContent
            className="sm:max-w-2xl max-h-[min(calc(100dvh-2rem),920px)] overflow-y-auto"
            dir="rtl"
          >
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <UserPlus className="h-5 w-5 text-primary shrink-0" />
                ניהול צוות במסעדה
                {staffRestaurant?.name ? (
                  <span className="text-sm font-normal text-muted-foreground">— {staffRestaurant.name}</span>
                ) : null}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-1">
              <RestaurantStaffActions
                restaurantId={staffRestId}
                restaurantName={staffRestaurant?.name}
                usersData={usersData}
                onRefreshUsers={onRefreshUsers}
              />
              <div className="space-y-2">
                <p className="text-sm font-semibold flex items-center gap-2">
                  <Users className="w-4 h-4 text-primary" />
                  משתמשים במסעדה ({staffUsers.length})
                </p>
                {!usersLoaded ? (
                  <p className="text-sm text-muted-foreground flex items-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    טוען…
                  </p>
                ) : staffUsers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">אין משתמשים משויכים למסעדה זו</p>
                ) : (
                  <div className="border rounded-lg overflow-hidden text-sm max-h-[min(35vh,280px)] overflow-y-auto">
                    <table className="w-full">
                      <thead className="bg-muted/50 text-xs text-muted-foreground sticky top-0">
                        <tr>
                          <th className="text-right p-2 font-medium">אימייל</th>
                          <th className="text-center p-2 font-medium w-24">תפקיד</th>
                          <th className="text-left p-2 font-medium min-w-[12rem]">פעולות</th>
                        </tr>
                      </thead>
                      <tbody>
                        {staffUsers.map((u) => (
                          <tr key={u.uid} className="border-t hover:bg-muted/30">
                            <td className="p-2 font-mono text-xs" dir="ltr">
                              {u.email}
                            </td>
                            <td className="p-2 text-center text-xs">{u.role}</td>
                            <td className="p-2">
                              <div className="flex flex-wrap gap-1 justify-end">
                                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => onEditUser(u)}>
                                  ערוך
                                </Button>
                                {onPasswordReset ? (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 text-xs gap-0.5"
                                    disabled={!u.email?.trim() || sendingPasswordResetUid === u.uid}
                                    onClick={() => void onPasswordReset(u)}
                                    title={t("pages.settings.resetPasswordForUser")}
                                  >
                                    {sendingPasswordResetUid === u.uid ? (
                                      <Loader2 className="w-3 h-3 animate-spin shrink-0" />
                                    ) : (
                                      <KeyRound className="w-3 h-3 shrink-0" />
                                    )}
                                    {t("pages.settings.resetPasswordForUser")}
                                  </Button>
                                ) : null}
                                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => onAssignClick(u)}>
                                  שייך
                                </Button>
                                {onSendInvite ? (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 text-xs whitespace-normal text-center leading-tight px-1.5"
                                    onClick={() => onSendInvite(u)}
                                  >
                                    הזמנה במייל
                                  </Button>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </DialogContent>
        ) : null}
      </Dialog>
    </>
  )
}

function RestaurantDetailPanel({
  restaurant,
  showDetailActions,
  inboundAddress,
  usersLoaded,
  userCount,
  onOpenInbound,
  onOpenStaff,
  onOpenEdit,
}: {
  restaurant?: Restaurant
  /** בטאב «לפי משתמש» — אותן פעולות כמו בשורה ברשימה */
  showDetailActions: boolean
  inboundAddress: string | null
  usersLoaded: boolean
  userCount: number
  onOpenInbound: () => void
  onOpenStaff: () => void
  onOpenEdit: () => void
}) {
  const branchLabel = restaurant?.branch?.trim() || "סניף ראשי"

  return (
    <div className="w-full space-y-4">
      {showDetailActions ? (
        <div className="rounded-xl border bg-card p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-base font-semibold flex items-center gap-2 flex-wrap min-w-0">
              {restaurant?.emoji ? <span aria-hidden>{restaurant.emoji}</span> : null}
              <span>{restaurant?.name ?? "מסעדה"}</span>
            </h3>
            <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1"
                title="עריכת פרטי מסעדה"
                onClick={onOpenEdit}
              >
                <Pencil className="h-3.5 w-3.5 shrink-0" />
                עריכה
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1"
                onClick={onOpenStaff}
              >
                <UserPlus className="h-3.5 w-3.5 shrink-0" />
                ניהול צוות
              </Button>
              <Badge variant="secondary" className="tabular-nums">
                {!usersLoaded ? "…" : userCount}
              </Badge>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{branchLabel}</p>
          <div className="space-y-1">
            <p className="text-[11px] font-medium text-muted-foreground">כתובת ייבוא ממייל</p>
            <button
              type="button"
              onClick={onOpenInbound}
              className={cn(
                "w-full text-right rounded-lg border px-3 py-2 text-sm transition-colors",
                "hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                inboundAddress ? "font-mono dir-ltr text-left" : "text-primary border-dashed",
              )}
              dir={inboundAddress ? "ltr" : undefined}
            >
              {inboundAddress ?? "— אין כתובת מייל — (לחץ להוספה)"}
            </button>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground text-center leading-relaxed space-y-3">
          <div>
            <strong className="text-foreground">{restaurant?.name ?? "מסעדה"}</strong>
            <span className="mx-1">·</span>
            {branchLabel}
            <br />
            <span className="text-xs">ייבוא ממייל, עריכה וניהול צוות — בכפתורים בשורת המסעדה למעלה.</span>
          </div>
          <Button type="button" variant="secondary" size="sm" className="gap-1.5" onClick={onOpenEdit}>
            <Pencil className="h-3.5 w-3.5 shrink-0" />
            עריכת פרטי מסעדה
          </Button>
        </div>
      )}
    </div>
  )
}

/** יצירת משתמש חדש למסעדה + שיוך משתמש קיים — ישירות מפאנל המסעדה */
function RestaurantStaffActions({
  restaurantId,
  restaurantName,
  usersData,
  onRefreshUsers,
}: {
  restaurantId: string
  restaurantName?: string
  usersData: DirectoryUserRow[]
  onRefreshUsers: () => void | Promise<void>
}) {
  const [createEmail, setCreateEmail] = useState("")
  const [createPassword, setCreatePassword] = useState("")
  const [createRole, setCreateRole] = useState<"manager" | "user">("user")
  const [createName, setCreateName] = useState("")
  const [creating, setCreating] = useState(false)
  const [createErr, setCreateErr] = useState<string | null>(null)
  const [assignUid, setAssignUid] = useState("")
  const [assigning, setAssigning] = useState(false)

  const assignableUsers = useMemo(
    () => usersData.filter((u) => u.restaurantId !== restaurantId),
    [usersData, restaurantId]
  )

  const handleCreate = async () => {
    setCreateErr(null)
    if (!createEmail.trim() || !createPassword.trim()) {
      setCreateErr("נא למלא אימייל וסיסמה")
      return
    }
    if (createPassword.length < 6) {
      setCreateErr("סיסמה לפחות 6 תווים")
      return
    }
    setCreating(true)
    try {
      const { createUserWithEmailAndPassword } = await import("firebase/auth")
      const secondaryAuth = getAuthForUserCreation()
      const cr = await createUserWithEmailAndPassword(
        secondaryAuth,
        createEmail.trim(),
        createPassword
      )
      await setDoc(
        doc(db, "users", cr.user.uid),
        {
          email: createEmail.trim(),
          role: createRole,
          restaurantId,
          name: createName.trim() || null,
          createdAt: new Date().toISOString(),
        },
        { merge: true }
      )
      try {
        const { signOut } = await import("firebase/auth")
        await signOut(secondaryAuth)
      } catch {
        /* לא קריטי */
      }
      let inviteCode: string | undefined
      try {
        inviteCode = await createUniqueInviteCode({
          restaurantId,
          role: createRole,
        })
      } catch {
        toast.warning("לא נוצר קוד הזמנה — המייל יישלח בלי קוד")
      }
      try {
        await postInviteEmail({
          email: createEmail.trim(),
          restaurantName: restaurantName ?? null,
          role: createRole,
          accountCreated: true,
          inviteCode: inviteCode ?? null,
        })
        toast.success(
          inviteCode
            ? "המשתמש נוצר — נשלח מייל עם פרטי התחברות וקוד הזמנה"
            : "המשתמש נוצר — נשלח מייל עם הוראות התחברות",
        )
      } catch (inviteErr) {
        toast.success("המשתמש נוצר ושויך למסעדה")
        toast.warning(
          `שליחת מייל ההזמנה נכשלה: ${(inviteErr as Error).message || "בדוק RESEND"}`,
        )
      }
      setCreateEmail("")
      setCreatePassword("")
      setCreateName("")
      await onRefreshUsers()
    } catch (e: unknown) {
      const c = e && typeof e === "object" && "code" in e ? String((e as { code: string }).code) : ""
      setCreateErr(c === "auth/email-already-in-use" ? "אימייל כבר בשימוש" : (e as Error).message || "שגיאה")
    } finally {
      setCreating(false)
    }
  }

  const handleAssign = async () => {
    if (!assignUid) {
      toast.error("בחר משתמש לשיוך")
      return
    }
    setAssigning(true)
    try {
      await setDoc(
        doc(db, "users", assignUid),
        {
          restaurantId,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      )
      toast.success(
        restaurantName ? `שויך למסעדה «${restaurantName}»` : "המשתמש שויך למסעדה"
      )
      setAssignUid("")
      await onRefreshUsers()
    } catch {
      toast.error("שגיאה בשיוך")
    } finally {
      setAssigning(false)
    }
  }

  return (
    <div className="rounded-xl border border-primary/20 bg-gradient-to-br from-primary/[0.06] to-transparent p-4 space-y-4 shadow-sm">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <UserPlus className="w-4 h-4 text-primary" />
        ניהול צוות במסעדה
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">
        צור משתמש חדש שיכנס ישר למסעדה זו, או שייך משתמש קיים (למשל ממסעדה אחרת או בלי שיוך).
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3 rounded-lg border bg-card/80 p-3">
          <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <UserPlus className="w-3.5 h-3.5" />
            משתמש חדש למסעדה
          </p>
          <div className="space-y-2">
            <label className="text-[11px] text-muted-foreground">אימייל</label>
            <Input
              type="email"
              dir="ltr"
              className="h-9 text-sm font-mono"
              placeholder="user@example.com"
              value={createEmail}
              onChange={(e) => setCreateEmail(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[11px] text-muted-foreground">סיסמה (מינימום 6)</label>
            <Input
              type="password"
              className="h-9 text-sm"
              value={createPassword}
              onChange={(e) => setCreatePassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-[11px] text-muted-foreground">שם (אופציונלי)</label>
              <Input
                className="h-9 text-sm"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="שם מלא"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] text-muted-foreground">תפקיד</label>
              <select
                className="w-full h-9 rounded-md border px-2 text-sm bg-background"
                value={createRole}
                onChange={(e) => setCreateRole(e.target.value as "manager" | "user")}
              >
                <option value="user">משתמש</option>
                <option value="manager">מנהל</option>
              </select>
            </div>
          </div>
          {createErr ? <p className="text-xs text-destructive">{createErr}</p> : null}
          <Button
            type="button"
            size="sm"
            className="w-full gap-1.5"
            onClick={() => void handleCreate()}
            disabled={creating}
          >
            {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
            צור ושייך למסעדה
          </Button>
          <p className="text-[10px] text-muted-foreground leading-snug pt-1">
            לאחר יצירה: נשמר קוד הזמנה ונשלח מייל עם אימייל, הוראות והקוד (Resend בשרת).
          </p>
        </div>

        <div className="space-y-3 rounded-lg border bg-card/80 p-3">
          <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <Link2 className="w-3.5 h-3.5" />
            שייך משתמש קיים
          </p>
          <p className="text-[11px] text-muted-foreground">
            רשימה: כל מי שלא במסעדה זו (ללא שיוך או במסעדה אחרת).
          </p>
          {assignableUsers.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">אין משתמשים זמינים לשיוך</p>
          ) : (
            <>
              <select
                className="w-full h-10 rounded-md border px-3 text-sm bg-background"
                value={assignUid}
                onChange={(e) => setAssignUid(e.target.value)}
              >
                <option value="">— בחר משתמש —</option>
                {assignableUsers.map((u) => (
                  <option key={u.uid} value={u.uid}>
                    {u.email}
                    {u.restaurantName ? ` → ${u.restaurantName}` : " → ללא מסעדה"}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="w-full gap-1.5"
                onClick={() => void handleAssign()}
                disabled={assigning || !assignUid}
              >
                {assigning ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Link2 className="w-3.5 h-3.5" />
                )}
                שייך למסעדה הנבחרת
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
