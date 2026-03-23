"use client"

import type { Dispatch, SetStateAction } from "react"
import type { Restaurant } from "@/contexts/app-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { UserPlus, Loader2, Ticket, Copy } from "lucide-react"
import { toast } from "sonner"
import { useTranslations } from "@/lib/use-translations"
import { useLanguage } from "@/contexts/language-context"

export type UsersManagementRow = {
  uid: string
  email: string
  role: string
  restaurantId: string | null
  restaurantName?: string
}

export type SystemOwnerUsersManagementProps = {
  usersData: UsersManagementRow[]
  setUsersData: Dispatch<SetStateAction<UsersManagementRow[]>>
  usersLoaded: boolean
  loadingUsers: boolean
  loadU: () => void | Promise<void>
  restaurants: Restaurant[]
  openEditUser: (u: UsersManagementRow) => void
  assignTgt: { uid: string; email: string } | null
  setAssignTgt: (v: { uid: string; email: string } | null) => void
  assignTgtRestId: string
  setAssignTgtRestId: (v: string) => void
  doAssign: () => void | Promise<void>
  savingAssign2: boolean
  showCreate2: boolean
  setShowCreate2: Dispatch<SetStateAction<boolean>>
  cEmail: string
  setCEmail: (v: string) => void
  cPass: string
  setCPass: (v: string) => void
  cRole: "manager" | "user"
  setCRole: (v: "manager" | "user") => void
  cRest: string
  setCRest: (v: string) => void
  cName: string
  setCName: (v: string) => void
  cPhone: string
  setCPhone: (v: string) => void
  cAddress: string
  setCAddress: (v: string) => void
  cNotes: string
  setCNotes: (v: string) => void
  cErr: string | null
  creating2: boolean
  doCreate: () => void | Promise<void>
  /** מחולל קודים — הרשמה עצמית למסעדה חדשה (בעלים) */
  showRestaurantInvitePanel: boolean
  setShowRestaurantInvitePanel: Dispatch<SetStateAction<boolean>>
  restaurantInviteCode: string | null
  generatingRestaurantInviteCode: boolean
  onGenerateRestaurantInviteCode: () => void | Promise<void>
}

/** סטטיסטיקות + רענון + יצירת משתמש + טופס — מעל רשימת המשתמשים בטאב «לפי משתמש» */
export function SystemOwnerUserTabToolbar({
  usersData,
  usersLoaded,
  loadingUsers,
  loadU,
  restaurants,
  showCreate2,
  setShowCreate2,
  cEmail,
  setCEmail,
  cPass,
  setCPass,
  cRole,
  setCRole,
  cRest,
  setCRest,
  cName,
  setCName,
  cPhone,
  setCPhone,
  cAddress,
  setCAddress,
  cNotes,
  setCNotes,
  cErr,
  creating2,
  doCreate,
  showRestaurantInvitePanel,
  setShowRestaurantInvitePanel,
  restaurantInviteCode,
  generatingRestaurantInviteCode,
  onGenerateRestaurantInviteCode,
}: Pick<
  SystemOwnerUsersManagementProps,
  | "usersData"
  | "usersLoaded"
  | "loadingUsers"
  | "loadU"
  | "restaurants"
  | "showCreate2"
  | "setShowCreate2"
  | "cEmail"
  | "setCEmail"
  | "cPass"
  | "setCPass"
  | "cRole"
  | "setCRole"
  | "cRest"
  | "setCRest"
  | "cName"
  | "setCName"
  | "cPhone"
  | "setCPhone"
  | "cAddress"
  | "setCAddress"
  | "cNotes"
  | "setCNotes"
  | "cErr"
  | "creating2"
  | "doCreate"
  | "showRestaurantInvitePanel"
  | "setShowRestaurantInvitePanel"
  | "restaurantInviteCode"
  | "generatingRestaurantInviteCode"
  | "onGenerateRestaurantInviteCode"
>) {
  const t = useTranslations()
  const { dir } = useLanguage()
  const rs = restaurants || []

  return (
    <div className="space-y-3 text-start" dir={dir}>
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div className="grid grid-cols-3 gap-2 sm:gap-3 flex-1 min-w-0">
          {[
            { label: `סה"כ`, val: usersData.length },
            { label: "מנהלים", val: usersData.filter((u) => u.role === "manager").length },
            { label: "משתמשים", val: usersData.filter((u) => u.role === "user").length },
          ].map((s, i) => (
            <div key={i} className="bg-muted/50 rounded-lg p-2.5 sm:p-3">
              <p className="text-[10px] sm:text-xs text-muted-foreground mb-0.5">{s.label}</p>
              <p className="text-lg sm:text-2xl font-semibold leading-tight">{usersLoaded ? s.val : "—"}</p>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => void loadU()}
            disabled={loadingUsers}
            className="text-xs px-3 py-1.5 rounded-md border hover:bg-muted flex items-center gap-1 h-8"
          >
            {loadingUsers ? <Loader2 className="w-3 h-3 animate-spin" /> : "🔄"}
            {usersLoaded ? "רענן" : "טען"}
          </button>
          <button
            type="button"
            onClick={() => {
              setShowCreate2((v) => {
                const next = !v
                if (next) setShowRestaurantInvitePanel(false)
                return next
              })
            }}
            className="text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground flex items-center gap-1 h-8"
          >
            <UserPlus className="w-3.5 h-3.5" />
            צור משתמש
          </button>
          <button
            type="button"
            onClick={() => {
              setShowRestaurantInvitePanel((v) => !v)
              setShowCreate2(false)
            }}
            className="text-xs px-3 py-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 text-foreground hover:bg-amber-500/15 flex items-center gap-1 h-8"
          >
            <Ticket className="w-3.5 h-3.5" />
            {t("pages.settings.restaurantInviteCodeGenerator")}
          </button>
        </div>
      </div>

      {showRestaurantInvitePanel ? (
        <div className="p-4 bg-amber-500/5 border border-amber-500/20 rounded-xl space-y-3">
          <p className="text-sm font-semibold">{t("pages.settings.restaurantInviteCodeTitle")}</p>
          <p className="text-xs text-muted-foreground leading-relaxed">{t("pages.settings.restaurantInviteCodeHint")}</p>
          <div className="flex flex-wrap gap-2 items-center">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={generatingRestaurantInviteCode}
              onClick={() => void onGenerateRestaurantInviteCode()}
            >
              {generatingRestaurantInviteCode ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Ticket className="w-3.5 h-3.5" />
              )}
              {restaurantInviteCode
                ? t("pages.settings.restaurantInviteCodeGenerateAnother")
                : t("pages.settings.restaurantInviteCodeGenerate")}
            </Button>
            {restaurantInviteCode ? (
              <>
                <code
                  className="text-sm font-mono px-2 py-1 rounded-md bg-muted border shrink min-w-0 max-w-full truncate"
                  dir="ltr"
                  title={restaurantInviteCode}
                >
                  {restaurantInviteCode}
                </code>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="shrink-0"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(restaurantInviteCode)
                      toast.success(t("pages.settings.restaurantInviteCodeCopied"))
                    } catch {
                      toast.error("Clipboard")
                    }
                  }}
                >
                  <Copy className="w-3.5 h-3.5 me-1" />
                  {t("pages.productTree.copy")}
                </Button>
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      {showCreate2 ? (
        <div className="p-4 bg-muted/40 border rounded-xl space-y-4">
          <p className="text-sm font-semibold">יצירת משתמש חדש</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">אימייל *</label>
              <Input type="email" dir="ltr" value={cEmail} onChange={(e) => setCEmail(e.target.value)} placeholder="user@example.com" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">סיסמה *</label>
              <Input type="password" value={cPass} onChange={(e) => setCPass(e.target.value)} placeholder="מינימום 6 תווים" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">שם מלא</label>
              <Input value={cName} onChange={(e) => setCName(e.target.value)} placeholder="שם פרטי ומשפחה" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">טלפון</label>
              <Input type="tel" dir="ltr" value={cPhone} onChange={(e) => setCPhone(e.target.value)} placeholder="050-0000000" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">תפקיד</label>
              <select
                className="w-full h-9 rounded-md border px-3 text-sm bg-background"
                value={cRole}
                onChange={(e) => setCRole(e.target.value as "manager" | "user")}
              >
                <option value="manager">מנהל</option>
                <option value="user">משתמש</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">מסעדה</label>
              <select className="w-full h-9 rounded-md border px-3 text-sm bg-background" value={cRest} onChange={(e) => setCRest(e.target.value)}>
                <option value="">— ללא —</option>
                {rs.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs text-muted-foreground block mb-1">כתובת</label>
              <Input value={cAddress} onChange={(e) => setCAddress(e.target.value)} placeholder="רחוב, עיר" />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs text-muted-foreground block mb-1">הערות</label>
              <textarea
                value={cNotes}
                onChange={(e) => setCNotes(e.target.value)}
                placeholder="הערות נוספות..."
                className="w-full min-h-[64px] rounded-md border px-3 py-2 text-sm bg-background resize-none"
              />
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => void doCreate()}
              disabled={creating2}
              className="text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground flex items-center gap-1"
            >
              {creating2 ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserPlus className="w-3 h-3" />}
              צור משתמש
            </button>
            <button type="button" onClick={() => setShowCreate2(false)} className="text-xs px-3 py-1.5 rounded-md border hover:bg-muted">
              ביטול
            </button>
          </div>
          {cErr ? <p className="text-xs text-destructive">{cErr}</p> : null}
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            לאחר יצירה: נשמר ב-Firestore קוד הזמנה, ונשלח מייל עם אימייל, הוראות התחברות והקוד (נדרש RESEND בשרת).
          </p>
        </div>
      ) : null}
    </div>
  )
}

/** שיוך מסעדה (כשפותחים מ«שייך מסעדה») — מתחת לרשימה/פרטים */
export function SystemOwnerUserTabBulkSection({
  restaurants,
  assignTgt,
  setAssignTgt,
  assignTgtRestId,
  setAssignTgtRestId,
  doAssign,
  savingAssign2,
}: Pick<
  SystemOwnerUsersManagementProps,
  | "restaurants"
  | "assignTgt"
  | "setAssignTgt"
  | "assignTgtRestId"
  | "setAssignTgtRestId"
  | "doAssign"
  | "savingAssign2"
>) {
  const { dir } = useLanguage()
  const rs = restaurants || []

  return (
    <div className="space-y-4 text-start" dir={dir}>
      {assignTgt ? (
        <div className="bg-card border rounded-xl p-4 space-y-2">
          <p className="text-sm font-medium">
            שיוך מסעדה:{" "}
            <span dir="ltr" className="font-normal text-muted-foreground">
              {assignTgt.email}
            </span>
          </p>
          <div className="flex gap-2 flex-wrap">
            <select
              className="flex-1 min-w-[140px] h-9 rounded-md border px-3 text-sm bg-background"
              value={assignTgtRestId}
              onChange={(e) => setAssignTgtRestId(e.target.value)}
            >
              <option value="">— ללא —</option>
              {rs.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void doAssign()}
              disabled={savingAssign2}
              className="px-3 py-1.5 text-xs rounded-md bg-primary text-primary-foreground"
            >
              {savingAssign2 ? <Loader2 className="w-3 h-3 animate-spin" /> : "שמור"}
            </button>
            <button type="button" onClick={() => setAssignTgt(null)} className="px-3 py-1.5 text-xs rounded-md border hover:bg-muted">
              ביטול
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
