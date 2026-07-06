"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { collection, getDocs, query, where, addDoc, deleteDoc, doc } from "firebase/firestore"
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from "firebase/storage"
import { db, storage, auth } from "@/lib/firebase"
import { useApp } from "@/contexts/app-context"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Loader2, Upload, FileText, Trash2, ExternalLink } from "lucide-react"
import { toast } from "sonner"

export type DocType = "harassment" | "accessibility" | "form101" | "workAgreement" | "forms"

type StoredDoc = {
  id: string
  title: string
  fileName: string
  storageUrl: string
  uploadedByEmail?: string
  createdAt: string
}

const META: Record<DocType, { title: string; intro: string; mode: "static" | "upload"; body?: string }> = {
  harassment: {
    title: "תקנון למניעת הטרדה מינית",
    mode: "static",
    intro: "בהתאם לחוק למניעת הטרדה מינית, התשנ״ח-1998 ולתקנות למניעת הטרדה מינית (חובות מעביד), התשנ״ח-1998.",
    body: [
      "1. המעסיק והעובדים מחויבים לסביבת עבודה נקייה מהטרדה מינית ומהתנכלות.",
      "2. הטרדה מינית והתנכלות אסורות ומהוות עבירת משמעת חמורה, עבירה פלילית ועוולה אזרחית.",
      "3. אחראי/ת למניעת הטרדה מינית במקום העבודה: יש למנות אחראי/ת ולפרסם את פרטי ההתקשרות.",
      "4. עובד/ת שנפגע/ה רשאי/ת להגיש תלונה לאחראי/ת; התלונה תיבדק ביעילות, בהגינות ותוך שמירה על כבוד וסודיות.",
      "5. המעסיק ינקוט צעדים למניעה, לבירור תלונות ולטיפול בכל מקרה, לרבות צעדים משמעתיים.",
      "6. אין לפגוע בעובד/ת בשל הגשת תלונה או סיוע למתלונן/ת.",
      "",
      "יש להתאים תקנון זה לפרטי העסק, למנות אחראי/ת ולהחתים את העובדים. מומלץ להיוועץ עם עו״ד.",
    ].join("\n"),
  },
  accessibility: {
    title: "הצהרת נגישות ושוויון זכויות",
    mode: "static",
    intro: "בהתאם לחוק שוויון זכויות לאנשים עם מוגבלות, התשנ״ח-1998 ולתקנות הנגישות.",
    body: [
      "העסק פועל להנגשת השירות והמקום לאנשים עם מוגבלות, ורואה בכך ערך חשוב.",
      "",
      "• הנגשת המקום: כניסה, שירותים ודרכי מעבר מונגשים ככל האפשר.",
      "• הנגשת השירות: צוות מודרך למתן שירות נגיש ושוויוני.",
      "• רכז/ת נגישות: יש למנות ולפרסם פרטי התקשרות לפניות בנושא נגישות.",
      "• פניות והצעות לשיפור הנגישות יטופלו בהקדם.",
      "",
      "יש להתאים הצהרה זו לפרטי העסק ולמנות רכז/ת נגישות. מומלץ להיוועץ עם מורשה נגישות.",
    ].join("\n"),
  },
  form101: {
    title: "טופס 101",
    mode: "upload",
    intro: "כרטיס עובד לצורכי מס (טופס 101) — העלה טפסים חתומים של עובדים לשמירה מרוכזת.",
  },
  workAgreement: {
    title: "הסכם עבודה",
    mode: "upload",
    intro: "הסכמי העסקה חתומים — העלה ושמור את ההסכמים של העובדים.",
  },
  forms: {
    title: "טפסים ונהלים",
    mode: "upload",
    intro: "מסמכים, טפסים ונהלים כלליים של העסק לשמירה ושיתוף.",
  },
}

export function DocumentPage({ docType }: { docType: DocType }) {
  const { currentRestaurantId } = useApp()
  const meta = META[docType]
  const [docs, setDocs] = useState<StoredDoc[]>([])
  const [loading, setLoading] = useState(meta.mode === "upload")
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const loadDocs = useCallback(async () => {
    if (meta.mode !== "upload" || !currentRestaurantId) { setLoading(false); return }
    setLoading(true)
    try {
      const snap = await getDocs(query(collection(db, "restaurants", currentRestaurantId, "documents"), where("docType", "==", docType)))
      const list: StoredDoc[] = snap.docs.map((d) => {
        const v = d.data()
        return { id: d.id, title: (v.title as string) || (v.fileName as string) || d.id, fileName: (v.fileName as string) || "", storageUrl: (v.storageUrl as string) || "", uploadedByEmail: v.uploadedByEmail as string | undefined, createdAt: (v.createdAt as string) || "" }
      })
      list.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      setDocs(list)
    } catch (e) { console.error(e) } finally { setLoading(false) }
  }, [currentRestaurantId, docType, meta.mode])

  useEffect(() => { void loadDocs() }, [loadDocs])

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ""
    if (!f || !currentRestaurantId) return
    setUploading(true)
    try {
      const safe = f.name.replace(/[^a-zA-Z0-9._-]/g, "_")
      const path = `restaurants/${currentRestaurantId}/documents/${docType}/${Date.now()}_${safe}`
      const sRef = storageRef(storage, path)
      await new Promise<void>((res, rej) => {
        const task = uploadBytesResumable(sRef, f)
        task.on("state_changed", () => {}, rej, () => res())
      })
      const url = await getDownloadURL(sRef)
      await addDoc(collection(db, "restaurants", currentRestaurantId, "documents"), {
        docType, title: f.name, fileName: f.name, storageUrl: url,
        uploadedByEmail: auth.currentUser?.email ?? null, createdAt: new Date().toISOString(),
      })
      toast.success("הקובץ הועלה")
      await loadDocs()
    } catch (err) { console.error(err); toast.error("שגיאה בהעלאת הקובץ") } finally { setUploading(false) }
  }

  const handleDelete = async (id: string) => {
    if (!currentRestaurantId || !confirm("למחוק את המסמך?")) return
    try {
      await deleteDoc(doc(db, "restaurants", currentRestaurantId, "documents", id))
      setDocs((prev) => prev.filter((d) => d.id !== id))
    } catch (e) { console.error(e) }
  }

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-4" dir="rtl">
      <div>
        <h1 className="font-bold text-xl mb-1">{meta.title}</h1>
        <p className="text-sm text-muted-foreground">{meta.intro}</p>
      </div>

      {meta.mode === "static" ? (
        <Card><CardContent className="p-5">
          <div className="whitespace-pre-wrap leading-relaxed text-sm">{meta.body}</div>
        </CardContent></Card>
      ) : (
        <>
          <input ref={fileRef} type="file" className="hidden" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" onChange={handleUpload} />
          <Button onClick={() => fileRef.current?.click()} disabled={uploading || !currentRestaurantId} className="gap-2">
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {uploading ? "מעלה..." : "העלה מסמך"}
          </Button>

          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
          ) : docs.length === 0 ? (
            <Card><CardContent className="p-6 text-center text-muted-foreground">אין מסמכים עדיין. העלה קובץ ראשון.</CardContent></Card>
          ) : (
            <div className="space-y-2">
              {docs.map((d) => (
                <div key={d.id} className="flex items-center justify-between gap-2 rounded-xl border bg-card p-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2 rounded-lg bg-blue-500/10 shrink-0"><FileText className="w-5 h-5 text-blue-600" /></div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{d.title}</p>
                      <p className="text-xs text-muted-foreground">{d.createdAt?.split("T")[0]}{d.uploadedByEmail ? ` · ${d.uploadedByEmail}` : ""}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <a href={d.storageUrl} target="_blank" rel="noopener noreferrer" className="p-2 rounded-lg hover:bg-muted text-muted-foreground" aria-label="פתח"><ExternalLink className="w-4 h-4" /></a>
                    <button onClick={() => handleDelete(d.id)} className="p-2 rounded-lg hover:bg-red-50 text-red-500" aria-label="מחק"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default DocumentPage
