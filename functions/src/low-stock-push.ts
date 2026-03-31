/**
 * שליחת התראות Web Push (FCM) יומית כשיש מלאי נמוך במסעדה.
 * רץ לפי Asia/Jerusalem; מכבד notificationSettings.notifyLowStock.
 */
import * as admin from "firebase-admin"
import { onSchedule } from "firebase-functions/v2/scheduler"
import { logger } from "firebase-functions"

if (!admin.apps.length) admin.initializeApp()

const db = admin.firestore()
const messaging = admin.messaging()
const FieldValue = admin.firestore.FieldValue

function countLowStockIngredients(ingSnap: admin.firestore.QuerySnapshot): { low: number; out: number } {
  let low = 0
  let out = 0
  for (const d of ingSnap.docs) {
    const x = d.data() as { stock?: unknown; minStock?: unknown; isCompound?: boolean }
    if (x.isCompound) continue
    const stock = typeof x.stock === "number" ? x.stock : 0
    const minStock = typeof x.minStock === "number" ? x.minStock : 0
    if (stock === 0) out++
    else if (minStock > 0 && stock < minStock) low++
  }
  return { low, out }
}

/** טוקנים לפי משתמש — לשליחת FCM ולכתיבת מסמך היסטוריה לכל uid */
async function collectTokensByUser(restaurantId: string): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>()
  const staffSnap = await db.collection("users").where("restaurantId", "==", restaurantId).get()
  const uids = new Set(staffSnap.docs.map((d) => d.id))

  const ownersSnap = await db.collection("users").where("isSystemOwner", "==", true).get()
  for (const d of ownersSnap.docs) uids.add(d.id)

  for (const uid of uids) {
    const ptSnap = await db.collection("users").doc(uid).collection("pushTokens").get()
    const tokens: string[] = []
    for (const doc of ptSnap.docs) {
      const data = doc.data() as { token?: string; restaurantId?: string | null }
      if (!data.token || typeof data.token !== "string") continue
      if (data.restaurantId === restaurantId) tokens.push(data.token)
    }
    if (tokens.length) map.set(uid, tokens)
  }
  return map
}

export const lowStockPushDigest = onSchedule(
  {
    schedule: "0 8 * * *",
    timeZone: "Asia/Jerusalem",
    region: "europe-west1",
    memory: "512MiB",
    timeoutSeconds: 540,
  },
  async () => {
    const restsSnap = await db.collection("restaurants").get()
    let skipped = 0
    let restaurantsNotified = 0

    for (const restDoc of restsSnap.docs) {
      const restaurantId = restDoc.id
      const restaurantName = ((restDoc.data() as { name?: string }).name || "מסעדה").trim()

      const notifSnap = await db.doc(`restaurants/${restaurantId}/appState/notificationSettings`).get()
      const ns = notifSnap.data()?.notificationSettings as Record<string, boolean> | undefined
      if (ns && ns.notifyLowStock === false) {
        skipped++
        continue
      }

      const ingSnap = await db.collection("restaurants").doc(restaurantId).collection("ingredients").get()
      const { low, out } = countLowStockIngredients(ingSnap)
      const total = low + out
      if (total === 0) continue

      const tokensByUser = await collectTokensByUser(restaurantId)
      if (tokensByUser.size === 0) continue

      const title = `${restaurantName} — מלאי לתשומת לב`
      const body =
        out > 0 && low > 0
          ? `${out} פריטים אזלו, ${low} מתחת לסף`
          : out > 0
            ? `${out} פריטים אזלו מהמלאי`
            : `${low} פריטים מתחת למינימום`

      const chunkSize = 500
      for (const [uid, userTokens] of tokensByUser.entries()) {
        for (let i = 0; i < userTokens.length; i += chunkSize) {
          const chunk = userTokens.slice(i, i + chunkSize)
          const res = await messaging.sendEachForMulticast({
            tokens: chunk,
            notification: { title, body },
            webpush: {
              notification: { title, body, dir: "rtl", lang: "he" },
              fcmOptions: { link: "/" },
            },
          })
          if (res.failureCount > 0) {
            res.responses.forEach((r, idx) => {
              if (!r.success && r.error?.code === "messaging/invalid-registration-token") {
                logger.warn("invalid token in batch", { idx })
              }
            })
          }
          logger.info("lowStockPushDigest batch", { restaurantId, uid, success: res.successCount, fail: res.failureCount })
        }
        await db.collection("users").doc(uid).collection("notifications").add({
          title,
          body,
          type: "low_stock",
          read: false,
          createdAt: FieldValue.serverTimestamp(),
          restaurantId,
          restaurantName,
        })
      }
      restaurantsNotified++
    }

    logger.info("lowStockPushDigest done", { restaurantsNotified, skippedNotifyOff: skipped })
  },
)
