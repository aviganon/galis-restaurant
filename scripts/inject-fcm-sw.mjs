/**
 * יוצר public/firebase-messaging-sw.js ממשתני NEXT_PUBLIC_FIREBASE_*
 * כדי ש-FCM יקבל את אותה קונפיגורציה כמו האפליקציה (בילד מקומי / CI).
 */
import { writeFileSync } from "fs"
import { resolve } from "path"
import { config } from "dotenv"

config({ path: resolve(process.cwd(), ".env.local") })
config({ path: resolve(process.cwd(), ".env") })

const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY || ""
const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || ""
const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || ""
const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || ""
const messagingSenderId = process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || ""
const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID || ""

const outPath = resolve(process.cwd(), "public", "firebase-messaging-sw.js")

const stub = `/* FCM: הרץ build עם משתני NEXT_PUBLIC_FIREBASE_* מלאים (.env.local או GitHub Secrets) */
self.addEventListener("install", (e) => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
`

if (!projectId || projectId === "placeholder" || !apiKey || apiKey === "placeholder") {
  writeFileSync(outPath, stub, "utf8")
  console.warn("[inject-fcm-sw] דילוג — חסרים משתני Firebase ציבוריים")
  process.exit(0)
}

const cfg = { apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId }
const cfgJson = JSON.stringify(cfg)

const body = `/* נוצר אוטומטית — לא לערוך ידנית */
importScripts("https://www.gstatic.com/firebasejs/12.10.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.10.0/firebase-messaging-compat.js");
firebase.initializeApp(${cfgJson});
const messaging = firebase.messaging();
messaging.onBackgroundMessage((payload) => {
  const title = (payload.notification && payload.notification.title) || "Restaurant Pro";
  const options = {
    body: (payload.notification && payload.notification.body) || "",
    icon: "/icon-light-32x32.png",
  };
  self.registration.showNotification(title, options);
});
`

writeFileSync(outPath, body, "utf8")
console.log("[inject-fcm-sw] עודכן", outPath)
