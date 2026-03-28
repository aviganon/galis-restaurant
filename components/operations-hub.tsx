"use client"

import { useCallback, useEffect, useState } from "react"
import {
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  updateDoc,
  type QueryDocumentSnapshot,
} from "firebase/firestore"
import { db, auth } from "@/lib/firebase"
import { useApp } from "@/contexts/app-context"
import { createOperationalTask } from "@/lib/restaurant-operations"
import { downloadExcelMultiSheet } from "@/lib/export-excel"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Checkbox } from "@/components/ui/checkbox"
import { Loader2, ClipboardList, History, LineChart, Download } from "lucide-react"
import { toast } from "sonner"
import { useTranslations } from "@/lib/use-translations"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"

const LS_EXPORT_REMINDER = "galis_ops_weekly_export_reminder"
const LS_LAST_EXPORT = "galis_ops_last_export_at"

type TaskRow = {
  id: string
  title: string
  notes: string
  dueAt: string | null
  done: boolean
  createdAt: string
}

function parseTask(d: QueryDocumentSnapshot): TaskRow {
  const v = d.data()
  return {
    id: d.id,
    title: typeof v.title === "string" ? v.title : "",
    notes: typeof v.notes === "string" ? v.notes : "",
    dueAt: typeof v.dueAt === "string" ? v.dueAt : v.dueAt ? String(v.dueAt) : null,
    done: v.done === true,
    createdAt: typeof v.createdAt === "string" ? v.createdAt : "",
  }
}

export function OperationsHub() {
  const t = useTranslations()
  const { currentRestaurantId } = useApp()
  const [tab, setTab] = useState("tasks")
  const [loading, setLoading] = useState(true)
  const [tasks, setTasks] = useState<TaskRow[]>([])
  const [audit, setAudit] = useState<{ id: string; summary: string; action: string; createdAt: string }[]>([])
  const [priceHist, setPriceHist] = useState<
    { id: string; ingredientName: string; oldPrice: number; newPrice: number; unit: string; at: string }[]
  >([])

  const [newTitle, setNewTitle] = useState("")
  const [newNotes, setNewNotes] = useState("")
  const [newDue, setNewDue] = useState("")
  const [savingTask, setSavingTask] = useState(false)
  const [weeklyExportReminder, setWeeklyExportReminder] = useState(false)
  const [lastExportAt, setLastExportAt] = useState<string | null>(null)
  const [exportingPack, setExportingPack] = useState(false)

  useEffect(() => {
    try {
      setWeeklyExportReminder(localStorage.getItem(LS_EXPORT_REMINDER) === "1")
      setLastExportAt(localStorage.getItem(LS_LAST_EXPORT))
    } catch {
      setWeeklyExportReminder(false)
      setLastExportAt(null)
    }
  }, [])

  const loadAll = useCallback(async () => {
    if (!currentRestaurantId) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const [tSnap, aSnap, pSnap] = await Promise.all([
        getDocs(
          query(
            collection(db, "restaurants", currentRestaurantId, "operationalTasks"),
            orderBy("createdAt", "desc"),
            limit(80)
          )
        ),
        getDocs(
          query(
            collection(db, "restaurants", currentRestaurantId, "auditLog"),
            orderBy("createdAt", "desc"),
            limit(80)
          )
        ),
        getDocs(
          query(
            collection(db, "restaurants", currentRestaurantId, "ingredientPriceHistory"),
            orderBy("at", "desc"),
            limit(80)
          )
        ),
      ])
      setTasks(tSnap.docs.map((d) => parseTask(d)))
      setAudit(
        aSnap.docs.map((d) => {
          const v = d.data()
          return {
            id: d.id,
            action: typeof v.action === "string" ? v.action : "",
            summary: typeof v.summary === "string" ? v.summary : "",
            createdAt: typeof v.createdAt === "string" ? v.createdAt : "",
          }
        })
      )
      setPriceHist(
        pSnap.docs.map((d) => {
          const v = d.data()
          return {
            id: d.id,
            ingredientName: typeof v.ingredientName === "string" ? v.ingredientName : "",
            oldPrice: typeof v.oldPrice === "number" ? v.oldPrice : 0,
            newPrice: typeof v.newPrice === "number" ? v.newPrice : 0,
            unit: typeof v.unit === "string" ? v.unit : "",
            at: typeof v.at === "string" ? v.at : "",
          }
        })
      )
    } catch (e) {
      console.error(e)
      toast.error(t("pages.operationsHub.loadError"))
    } finally {
      setLoading(false)
    }
  }, [currentRestaurantId, t])

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  const handleAddTask = async () => {
    if (!currentRestaurantId || !newTitle.trim()) {
      toast.error(t("pages.operationsHub.taskTitleRequired"))
      return
    }
    setSavingTask(true)
    try {
      await createOperationalTask(db, currentRestaurantId, {
        title: newTitle.trim(),
        notes: newNotes.trim(),
        dueAt: newDue.trim() || null,
        createdByUid: auth.currentUser?.uid ?? null,
        createdByEmail: auth.currentUser?.email ?? null,
      })
      setNewTitle("")
      setNewNotes("")
      setNewDue("")
      toast.success(t("pages.operationsHub.taskAdded"))
      await loadAll()
    } catch (e) {
      toast.error((e as Error)?.message || t("pages.operationsHub.taskAddError"))
    } finally {
      setSavingTask(false)
    }
  }

  const persistLastExport = () => {
    const iso = new Date().toISOString()
    try {
      localStorage.setItem(LS_LAST_EXPORT, iso)
    } catch {
      /* */
    }
    setLastExportAt(iso)
  }

  const handleExportDataPack = async () => {
    setExportingPack(true)
    try {
      await downloadExcelMultiSheet(
        [
          {
            name: "משימות",
            data: tasks.map((r) => ({
              כותרת: r.title,
              הערות: r.notes,
              יעד: r.dueAt ?? "",
              בוצע: r.done ? "כן" : "לא",
              נוצר: r.createdAt,
            })),
          },
          {
            name: "יומן",
            data: audit.map((a) => ({
              פעולה: a.action,
              תיאור: a.summary,
              זמן: a.createdAt,
            })),
          },
          {
            name: "היסטוריית מחירים",
            data: priceHist.map((p) => ({
              רכיב: p.ingredientName,
              "מחיר קודם": p.oldPrice,
              "מחיר חדש": p.newPrice,
              יחידה: p.unit,
              מתי: p.at,
            })),
          },
        ],
        `תפעול_${currentRestaurantId}_${new Date().toISOString().slice(0, 10)}`
      )
      persistLastExport()
      toast.success(t("pages.operationsHub.exportPackSuccess"))
    } catch (e) {
      console.error(e)
      toast.error(t("pages.operationsHub.exportPackError"))
    } finally {
      setExportingPack(false)
    }
  }

  const toggleTask = async (row: TaskRow) => {
    if (!currentRestaurantId) return
    try {
      await updateDoc(doc(db, "restaurants", currentRestaurantId, "operationalTasks", row.id), {
        done: !row.done,
        updatedAt: new Date().toISOString(),
      })
      setTasks((prev) => prev.map((x) => (x.id === row.id ? { ...x, done: !x.done } : x)))
    } catch (e) {
      toast.error((e as Error)?.message || t("pages.operationsHub.taskUpdateError"))
    }
  }

  if (!currentRestaurantId) {
    return (
      <div className="container mx-auto px-4 py-8 text-muted-foreground">
        {t("pages.dashboard.selectRestaurant")}
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const openTasks = tasks.filter((x) => !x.done).length
  const lastExportMs = lastExportAt ? new Date(lastExportAt).getTime() : NaN
  const exportNudge =
    weeklyExportReminder &&
    (!lastExportAt ||
      Number.isNaN(lastExportMs) ||
      (Date.now() - lastExportMs) / 86_400_000 >= 7)

  return (
    <div className="container mx-auto max-w-4xl px-4 py-6 space-y-4" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("pages.operationsHub.title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("pages.operationsHub.subtitle")}</p>
      </div>

      <Card className="border-primary/20 bg-muted/30">
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="space-y-1">
              <p className="font-medium text-sm">{t("pages.operationsHub.exportPackTitle")}</p>
              <p className="text-xs text-muted-foreground">{t("pages.operationsHub.exportPackDesc")}</p>
            </div>
            <Button
              type="button"
              variant="default"
              className="shrink-0 gap-2"
              disabled={exportingPack}
              onClick={() => void handleExportDataPack()}
            >
              {exportingPack ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {t("pages.operationsHub.exportPackButton")}
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-3 pt-1 border-t border-border/60">
            <Switch
              id="weekly-export-reminder"
              checked={weeklyExportReminder}
              onCheckedChange={(on) => {
                setWeeklyExportReminder(on)
                try {
                  if (on) localStorage.setItem(LS_EXPORT_REMINDER, "1")
                  else localStorage.removeItem(LS_EXPORT_REMINDER)
                } catch {
                  /* */
                }
              }}
            />
            <Label htmlFor="weekly-export-reminder" className="text-sm cursor-pointer">
              {t("pages.operationsHub.weeklyExportReminder")}
            </Label>
          </div>
          {exportNudge ? (
            <p className="text-xs text-amber-800 dark:text-amber-200 bg-amber-500/15 rounded-md px-2 py-1.5">
              {t("pages.operationsHub.exportNudge")}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full grid-cols-3 h-auto flex-wrap gap-1">
          <TabsTrigger value="tasks" className="gap-1.5 text-xs sm:text-sm">
            <ClipboardList className="h-4 w-4 shrink-0" />
            {t("pages.operationsHub.tabTasks")}
            {openTasks > 0 ? (
              <span className="rounded-full bg-amber-500/20 px-1.5 text-[10px] font-semibold text-amber-800 dark:text-amber-200">
                {openTasks}
              </span>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="audit" className="gap-1.5 text-xs sm:text-sm">
            <History className="h-4 w-4 shrink-0" />
            {t("pages.operationsHub.tabAudit")}
          </TabsTrigger>
          <TabsTrigger value="prices" className="gap-1.5 text-xs sm:text-sm">
            <LineChart className="h-4 w-4 shrink-0" />
            {t("pages.operationsHub.tabPrices")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tasks" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{t("pages.operationsHub.newTask")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input
                placeholder={t("pages.operationsHub.taskTitlePlaceholder")}
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
              />
              <Input
                placeholder={t("pages.operationsHub.taskDuePlaceholder")}
                type="date"
                value={newDue}
                onChange={(e) => setNewDue(e.target.value)}
              />
              <Input
                placeholder={t("pages.operationsHub.taskNotesPlaceholder")}
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
              />
              <Button type="button" onClick={() => void handleAddTask()} disabled={savingTask}>
                {savingTask ? <Loader2 className="h-4 w-4 animate-spin" /> : t("pages.operationsHub.addTask")}
              </Button>
            </CardContent>
          </Card>

          <div className="space-y-2">
            {tasks.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-8">{t("pages.operationsHub.noTasks")}</p>
            ) : (
              tasks.map((row) => (
                <div
                  key={row.id}
                  className="flex items-start gap-3 rounded-xl border bg-card/50 p-3"
                >
                  <Checkbox
                    checked={row.done}
                    onCheckedChange={() => void toggleTask(row)}
                    className="mt-1"
                    aria-label={t("pages.operationsHub.markDone")}
                  />
                  <div className="min-w-0 flex-1">
                    <p className={`font-medium ${row.done ? "line-through text-muted-foreground" : ""}`}>
                      {row.title}
                    </p>
                    {row.notes ? <p className="text-xs text-muted-foreground mt-0.5">{row.notes}</p> : null}
                    <div className="flex flex-wrap gap-2 mt-1 text-[11px] text-muted-foreground">
                      {row.dueAt ? <span>{t("pages.operationsHub.due")}: {row.dueAt}</span> : null}
                      {row.createdAt ? <span>{row.createdAt.slice(0, 10)}</span> : null}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="audit" className="mt-4">
          {audit.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-12">{t("pages.operationsHub.noAudit")}</p>
          ) : (
            <ul className="space-y-2">
              {audit.map((a) => (
                <li key={a.id} className="rounded-lg border px-3 py-2 text-sm">
                  <span className="text-[10px] uppercase text-muted-foreground font-mono">{a.action}</span>
                  <p className="font-medium">{a.summary}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{a.createdAt}</p>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="prices" className="mt-4">
          {priceHist.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-12">{t("pages.operationsHub.noPriceHistory")}</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-right">
                    <th className="p-2 font-medium">{t("pages.ingredients.ingredient")}</th>
                    <th className="p-2 font-medium">{t("pages.operationsHub.oldPrice")}</th>
                    <th className="p-2 font-medium">{t("pages.operationsHub.newPrice")}</th>
                    <th className="p-2 font-medium">{t("pages.ingredients.unit")}</th>
                    <th className="p-2 font-medium">{t("pages.operationsHub.when")}</th>
                  </tr>
                </thead>
                <tbody>
                  {priceHist.map((r) => (
                    <tr key={r.id} className="border-b border-border/60">
                      <td className="p-2 font-medium">{r.ingredientName}</td>
                      <td className="p-2 tabular-nums">₪{r.oldPrice.toFixed(2)}</td>
                      <td className="p-2 tabular-nums">₪{r.newPrice.toFixed(2)}</td>
                      <td className="p-2">{r.unit}</td>
                      <td className="p-2 text-xs text-muted-foreground whitespace-nowrap">{r.at}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
