"use client"

import Papa from "papaparse"
import readXlsxFile from "read-excel-file/universal"
import * as XLSX from "xlsx"
import { fileToBase64, callClaude } from "./claude"
import { normalizeDishCategoryToHebrew } from "./dish-category-hebrew"

export type ExtractType = "p" | "d" | "s"
// p = supplier prices/invoice, d = dishes/menu, s = sales report

export type DetectedDocType = "menu" | "sales" | "invoice" | "unknown"

const DETECT_SYSTEM = `אתה מנתח מסמכים. קבע את סוג המסמך בתמונה/קובץ:
- menu: תפריט מסעדה (מנות, מחירים, קטגוריות)
- sales: דוח מכירות (מכירות, כמויות שנמכרו, סטטיסטיקות)
- invoice: חשבונית ספק, תעודת משלוח, תעודת שליחה, אישור הזמנה (פריטים וכמויות — גם ללא מחירים)

החזר JSON בלבד: {"type":"menu"} או {"type":"sales"} או {"type":"invoice"} או {"type":"unknown"}`

export interface ExtractedSupplierItem {
  name: string
  price: number
  unit: string
  sku?: string
  /** כמות שהתקבלה — מעדכן מלאי אוטומטית */
  qty?: number
}

export interface ExtractedDishItem {
  name: string
  price: number
  category?: string
  ingredients?: Array<{ name: string; qty: number; unit: string }>
  /** השראה מסגנון שף שנבחר להצעה */
  suggestedByChef?: string
  /** תיאור קצר (טעם, הגשה) */
  description?: string
  /** שלבי הכנה / הרכבה — טקסט עם מספור */
  preparation?: string
}

export interface ExtractedSalesItem {
  name: string
  qty: number
  price: number
}

export type ExtractedItem = ExtractedSupplierItem | ExtractedDishItem | ExtractedSalesItem

/** זיהוי AI לתקופת דוח המכירות (משמש להצגה ולשקיפות — המספרים תמיד "לתקופת הדוח") */
export type SalesReportPeriod = "daily" | "monthly" | "weekly" | "unknown"

export interface ExtractResult {
  items: ExtractedItem[]
  supplier_name?: string
  invoice_date?: string | null
  no_prices?: boolean
  /** מזוהה מכותרת/תאריכים בדוח — יומי / חודשי / שבועי */
  sales_report_period?: SalesReportPeriod
  /** תחילת תקופת הדוח — YYYY-MM-DD אחרי נרמול */
  sales_report_date_from?: string | null
  /** סוף תקופת הדוח — YYYY-MM-DD אחרי נרמול */
  sales_report_date_to?: string | null
}

const SUPPLIER_KNOWLEDGE = `
מבנה חשבונית/אישור הזמנה: שם פריט (תיאור בלבד), מק"ט (קוד נפרד), כמות שהתקבלה (qty), יחידה, מחיר ליחידה, הנחה, סה"כ. חלץ מחיר נטו ליחידה (אחרי הנחה) וכמות (qty) — הכמות מעדכנת מלאי.
סדר עמודות נפוץ בחשבוניות ישראליות: פריט | כמות | ברקוד | מחירון | הנחה% | נטו | סה"כ לשורה.
qty = עמודת "כמות" — המספר שמופיע ליד שם הפריט. אם כמות=1 — החזר qty:1. אל תחזיר qty:0 אלא אם כמות חסרה לגמרי.
אישור הזמנה = כמו חשבונית — חלץ אותו המבנה (פריטים, מחירים, מק"ט, כמות).
מחירים: זהה ₪ ש״ח שקלים NIS — המר למספר. דלג: מע"מ, סיכומים, פקדונות, הובלה, מחיר=0. אם יש עמודת הנחה — המחיר ליחידה הוא המחיר הסופי אחרי הנחה.
יחידות נפוצות: קג/ק"ג (משקל), גרם (משקל קטן), ליטר/מ"ל (נוזלים), יחידה (פריט בודד), חבילה, קרטון, קופסה, שקית, בקבוק. נרמל: קג→קג, ג→גרם, ליטר→ליטר.
רכיבים נפוצים: בשר (חזה עוף, שוק, אונטריב, אנטריקוט, כבש), ירקות (עגבניות, מלפפון, חסה, בצל, גזר, פלפל, חציל, ברוקולי), קמחים (קמח חיטה, קמח מלא, סולת), מוצרי חלב (גבינה, שמנת, יוגורט, חלב), דגים (סלמון, דניס, מוסר ים, טונה), תבלינים (מלח, פלפל, פפריקה כתבלין בלבד — לא לבלבל עם "אנטריקוט" חתך בשר!, כורכום), שמנים (שמן קנולה, שמן זית), גרגרים (אורז, גרגרי חומוס, עדשים), מוצרים יבשים (פסטה, אטריות, קוסקוס).
משקאות: משקאות חריפים (ג'ין, וודקה, ויסקי, בורבון, רום, טקילה, ברנדי), יין, בירה, קולה, מים, מיצים, משקאות קלים. יחידות: בקבוק, ליטר, מ"ל.
קפה: פולי קפה, קפה טחון, קפה מסונן, קפה נמס, וסקובי, פולי קפה וסקובי.
שמות חלופיים: חזה עוף=חזה תרנגולת, אונטריב=בשר טחון שמן, אנטרקוט=צלע, טחינה=טחינה גולמית, גרגרי חומוס=חומוס יבש.
טבלאות: עמודות נפוצות — שורה, מק"ט, תיאור מוצר (=name), כמות (=qty), תאריך אספקה, מחיר ליחידה, הנחה, סה"כ מחיר.
דוגמה: שורה=1, מק"ט=6090, תאור מוצר=בנדקטין, כמות=6 → name:"בנדקטין", sku:"6090", qty:6, price:0, unit:"יחידה"
חשוב: name = תוכן עמודת "תאור מוצר" / "תיאור" / "פריט" — לא המק"ט ולא מספר השורה!
פורמט pipe: עמודות barcode-name-qty-price-discount-netprice. חלץ: price=netprice (מחיר אחרי הנחה), qty=כמות, sku=barcode. דוגמה: |7290005966354|ירדן בלאן|24|54.00|20.0|43.20|... → name:ירדן בלאן, sku:7290005966354, qty:24, price:43.20
`

/** דיוק OCR עברית — הצעות מחיר / מחירונים מודפסים (למשל כרמל מעדנים, מזון וסיטונאות) */
const SUPPLIER_HEBREW_ACCURACY = `
דיוק שמות בעברית (קריטי):
- במסמכי "הצעת מחיר" / מחירון נפוץ סדר עמודות (RTL): מפתח פריט (=sku), שם פריט (=name), כמות, מחיר, מטבע, סה"כ לשורה.
- שדה name: העתק **מדויק** מעמודת "שם פריט" / "תיאור" **באותה שורה בדיוק** כמו ה-sku. אל תערבב שורות — כל פריט = שם+מקט מאותה שורה בטבלה.
- אסור "לתקן" או להחליף במילים שנשמעות דומות: אל תהפוך "פרוס" ל-"פרוג"; "אנטריקוט" ל-"פפריקה"; "מקוצצת" ל-"מקורזנת"; "קפוא"/"קפואה" ל-"קרי" או "כפוויה"; "קרפצ'ו" ל-"קרפיול"; "שפונדרה" ל-"מוסר"; "אונטריב" ל-"אומנטריב".
- פפריקה = תבלין בלבד. אנטריקוט / אונטריב / שפונדרה / גולש = בשר — לעולם אל תבלבל.
- מונחי בשר/עוף נפוצים במסמכים: חזה עוף פרוס, אנטריקוט פרוס דק קפוא, פרגית מקוצצת קפואה, פרגית פתוח טרי, טחון בקר קפוא, קרפצ'ו, שפונדרה ללא עצם בקר, אונטריב, גולש בקר — שמור איות ומילות מפתח (פרוס, קפוא, טרי) כפי שמודפס.
- קרא לאט שורה־שורה; אם אות עמומה — בחר את האיות שמתאים **למוצר מזון** ולמקט באותה שורה, לא מילה אקראית.
`

const SUPPLIER_SYSTEM = `אתה מומחה לניתוח חשבוניות ומחירוני ספקי מזון ומשקאות בישראל.
${SUPPLIER_KNOWLEDGE}
${SUPPLIER_HEBREW_ACCURACY}
חוקים:
name = תוכן עמודת "תאור מוצר" / "תיאור מוצר" / "שם פריט" / "תיאור" / "פירוט" / "מוצר" — זהו שם המוצר בלבד, לא המק"ט!
sku = תוכן עמודת "מק"ט" / "ברקוד" / "קוד" — קוד מספרי.
price = מחיר נטו ליחידה (אחרי הנחה). מחשב: מחיר ליחידה × (1 - הנחה%/100).
qty = תוכן עמודת "כמות" — מספר היחידות.
unit = יחידת מידה (יח', בקבוק, קג, ליטר...).
שם ספק = שם החברה בראש המסמך (לדוגמה: "הכרם - משקאות חריפים", "היכל היין", "תנובה").
דוגמה: שורה=1, מק"ט=15914000, תאור מוצר=גי"ג ג'י וויסקי..., כמות=12, מחיר=109.50, הנחה=27% → name:"גי"ג ג'י וויסקי לונדון דריי ג'ין 1 ליטר", sku:"15914000", price:109.50, qty:12, unit:"יח'"
תעודת משלוח (ללא מחירים): אם אין עמודת מחיר, החזר no_prices:true ועם name, sku, unit, qty, price:0 לכל פריט.
החזר JSON בלבד: {"supplier_name":"...","invoice_date":"DD/MM/YYYY","no_prices":false,"items":[{"name":"...","sku":"מקט או null","price":0.00,"unit":"יחידה","qty":0}]}`

/** הודעת משתמש לחילוץ ספק — מדגישה שורה=שם+מקט ודיוק עברית */
const SUPPLIER_EXTRACT_USER_MESSAGE = `נתח את המסמך (חשבונית / הצעת מחיר / מחירון / תעודת משלוח).

אם מופיע "מחירון" או "הצעת מחיר": לכל שורת טבלה — sku מעמודת "מפתח פריט" או "מק״ט"; name מעמודת "שם פריט" / "תיאור" **בדיוק כפי שמודפס**, באותה שורה כמו ה-sku; qty מעמודת כמות; price מעמודת מחיר ליחידה (או עמודת מחיר אם אין הפרדה).
אם חשבונית סטנדרטית: price = מחיר נטו ליחידה אחרי הנחה; qty = כמות.

חובה: אל תערבב שורות — כל פריט ב-JSON חייב להתאים לשורה אחת בטבלה (שם ומקט מאותה שורה).
שמות בעברית: קרא שוב את הוראות "דיוק שמות בעברית" במערכת — העתק מילולי, בלי להחליף במילים דומות.

אם אין מחירים כלל — no_prices:true. אחרת no_prices:false.
החזר JSON בלבד.`

/** Sonnet מדייק יותר ב-OCR עברית במסמכי ספק (תמונה/PDF/טקסט) מול Haiku */
const CLAUDE_SUPPLIER_EXTRACT_MODEL = "claude-sonnet-4-20250514"
const CLAUDE_DEFAULT_EXTRACT_MODEL = "claude-haiku-4-5-20251001"

const MENU_KNOWLEDGE = `
קטגוריות נפוצות בתפריטים ישראליים: ראשונות, סלטים, מרקים, אנטיפסטי, מנות עיקריות, עיקריות, בשרים, דגים, פסטות, פיצות, קינוחים, משקאות, תוספות, מנות ילדים, מנות משפחתיות.
מחירים: זהה ₪ ש״ח שקלים NIS — המר למספר. דלג על "מחיר לפי משקל" או "לפי בקשה".
מבנה: תפריטים לרוב בשתי עמודות — שם מנה | מחיר. כותרות קטגוריה (ראשונות, עיקריות) אינן מנות.
מנות ישראליות טיפוסיות ורכיביהן (כמויות למנה): חומוס→גרגרי חומוס 80ג, טחינה 80ג, לימון 20ג, שמן 15ג; פלאפל→גרגרי חומוס 100ג, פטרוזיליה 15ג, שום 5ג; שווארמה→בשר עוף 150ג, פיתה 80ג, טחינה 80ג; שניצל→חזה עוף 150ג, פירורי לחם 30ג, ביצה 1 יח; קבב→בשר טחון 150ג, בצל 30ג, פטרוזיליה 10ג; סלמון→דג סלמון 180ג, לימון 20ג, שמן 15ג; פסטה→פסטה 120ג, רוטב 80ג, שום 5ג; המבורגר→בשר טחון 200ג, לחמניה 80ג, ירקות 50ג; סלט קיסר→חסה 80ג, פרמזן 20ג, קרוטונים 30ג; פיצה→בצק 200ג, עגבניות 50ג, מוצרלה 80ג; ברוסקטה→לחם 60ג, עגבניות 50ג, שום 5ג; טרטר→בשר נא 120ג, חלמון 1 יח; סטייק→בשר בקר 250ג, תבלינים 5ג; דניס→דג דניס 200ג, לימון 20ג; ריזוטו→אורז 80ג, יין 50מ"ל, פרמזן 30ג; מרק→ירקות 150ג או בשר 10ג, תבלינים; חומוס ביתי→גרגרי חומוס 100ג, טחינה 80ג, לימון 30ג; פלאפל→גרגרי חומוס 90ג, שום 5ג, פטרוזיליה 10ג; סלט ירקות→חסה 50ג, עגבניה 50ג, מלפפון 40ג, בצל 20ג; צ'יפס→תפוחי אדמה 150ג, שמן 15ג; פלאפל בפיתה→חמוצים 30ג, פלאפל 80ג, סלט 40ג; חומוס מלא→חומוס 150ג, ביצה 1 יח, פלאפל 30ג.
דוגמאות נוספות (להרחבת מגוון תפריט): סביח, שקשוקה, מעורב ירושלמי, קציצות דגים, קארי עוף, נודלס ירקות, פרגית על הפלנצ'ה, סלט טונה, ניוקי שמנת פטריות, מוסקה, פוקאצ'ה, טוסט גבינות, כנפיים ברוטב, פיש אנד צ'יפס, מוקפץ בקר, פאד תאי, סשימי סלמון, עראיס, קרפצ'יו סלק, כנאפה, מלבי, מוזלי, לימונדה, מוחיטו, אפרול שפריץ, מרגריטה.
מיפוי שמות חלופיים נפוצים: פרגית=שווארמה הודו/עוף פרוס; חומוס=גרגרי חומוס; תפוא=תפוח אדמה; קולה=קוקה קולה/קולה; סודה=מי סודה; מוצרלה=גבינת מוצרלה; בולונז=רוטב בשר טחון; סינטה/אנטריקוט=בשר בקר.
`

/** העדפת שפת שמות מנות בחילוץ AI — נשלח לפרומפט */
export type MenuDishNameLanguage = "he" | "original" | "en"

const DISH_NAME_RULES: Record<MenuDishNameLanguage, string> = {
  he: `שמות מנה (שדה name): כתוב **בעברית** כשהמקור בעברית, תפריט ישראלי טיפוסי, או ערבוב עברית/ערבית. אסור לתרגם שמות לאנגלית (לא Burger, Caesar Salad — השתמש במילים כמו המבורגר, סלט קיסר). אם מנה מופיעה במסמך **רק** באנגלית — שמור באנגלית.`,
  original: `שמות מנה (שדה name): **העתק מדויק** מהמסמך — אותה שפה ואותו ניסוח, ללא תרגום וללא תיקון.`,
  en: `שמות מנה (שדה name): כתוב שמות **באנגלית** (תרגום תקני וקצר כשהמקור בעברית). אם המסמך כבר באנגלית — שמור כפי שמופיע.`,
}

/** מערכת הודעות לחילוץ מנות — לפי העדפת שפת שמות */
export function buildDishExtractionSystem(lang: MenuDishNameLanguage = "he"): string {
  const nameRule = DISH_NAME_RULES[lang] ?? DISH_NAME_RULES.he
  return `אתה מנתח תפריטי מסעדות בישראל. חלץ מנות, מחירים, קטגוריות.
${MENU_KNOWLEDGE}
חשוב: לכל מנה ישייך רכיבים וכמויות לפי הבנתך — השתמש בכמויות הטיפוסיות מהרשימה למעלה. אם אין התאמה — השער כמויות סבירות (מנה עיקרית: 150–250ג בשר/דג, מנה קטנה: 50–100ג).
רכיבים: עד 8 למנה. יחידות: גרם/קג/יחידה/מ"ל.

**שפה וקטגוריות (חובה):**
- שדה category חייב להיות **אחת** מהמחרוזות הבאות **בעברית בלבד**: עיקריות, ראשונות, סלטים, קינוחים, משקאות, משקאות אלכוהוליים, תוספות, אחר. אסור לכתוב קטגוריה באנגלית (לא Main dishes וכו').
- ${nameRule}

החזר JSON בלבד: {"items":[{"name":"שם מנה","price":0,"category":"עיקריות","ingredients":[{"name":"שם רכיב","qty":100,"unit":"גרם"}]}]}`
}

const SALES_SYSTEM = `אתה מנתח דוחות מכירות למסעדות (POS, Excel, יומן מכירות).
חלץ לכל שורת מנה: name (שם המנה כפי שבדוח), qty (כמות יחידות שנמכרו בתקופת הדוח), price (מחיר ליחידה **לפני מע"מ** אם מופיע — אחרת 0).
דלג: סיכומי מע"מ, הנחות כלליות, כותרות בלבד.

קבע sales_report_period לפי הכותרת/טווח תאריכים בדוח:
- daily — דוח יומי, "היום", תאריך יום אחד, סגירת יום
- weekly — שבוע, טווח 7 ימים
- monthly — דוח חודשי, חודש/שנה, "בחודש"
- unknown — לא ברור

חלץ טווח תאריכים של הדוח אם מופיע במסמך (כותרת, עמודת תאריך, "מתאריך עד"):
- sales_report_date_from, sales_report_date_to בפורמט YYYY-MM-DD בלבד (למשל 2025-03-01).
- דוח ליום אחד: אותו תאריך בשתי השדות, או תאריך אחד ב-from ו-null ב-to.
- חודש שלם בלי יום: השתמש ביום הראשון והאחרון של החודש (למשל 2025-03-01 ו-2025-03-31).
- אם אין תאריך במסמך — null בשני השדות.

החזר JSON בלבד:
{"sales_report_period":"daily"|"monthly"|"weekly"|"unknown","sales_report_date_from":"YYYY-MM-DD"|null,"sales_report_date_to":"YYYY-MM-DD"|null,"items":[{"name":"...","qty":0,"price":0}]}`

const DISH_FROM_SALES_LINES_SYSTEM = `אתה מומחה למטבח ולתפריטי מסעדות בישראל.
${MENU_KNOWLEDGE}
תקבל רשימת שורות מדוח מכירות: לכל שורה name (שם המנה כפי שמופיע בדוח), quantity (כמות נמכרה), revenue (סה"כ הכנסה בשקלים).
לכל שורה החזר אובייקט ב-dishes עם: category (קטגוריה מתאימה), ingredients (עד 8 רכיבים) עם כמויות טיפוסיות למנה — יחידות: גרם, קג, יחידה, מ"ל.
suggested_selling_price_ils = מחיר מכירה משוער למנה אחת **כולל מע"מ** בשקלים: אם אפשר לחשב מ-revenue/quantity (כש-quantity>0) — השתמש ב-max(חישוב, הערכה); אחרת הערכה סבירה או 0.
חשוב: בכל אובייקט ב-dishes השדה name חייב להיות **זהה תו-בתו** לשדה name של אותה שורה בקלט — ללא שינוי, קיצור או תרגום.
החזר JSON בלבד: {"dishes":[{"name":"...","category":"עיקריות","suggested_selling_price_ils":0,"ingredients":[{"name":"שם רכיב","qty":100,"unit":"גרם"}]}]}`

const DISH_FROM_SALES_LINES_PANTRY_SYSTEM = `אתה מומחה למטבח ולתפריטי מסעדות בישראל.
${MENU_KNOWLEDGE}
תקבל שתי רשימות: (א) רכיבים זמינים במסעדה עם מחיר ויחידה — **חובה** להשתמש רק בשמות רכיבים מהרשימה הזו, **בדיוק** כפי שכתובים (תו-בתו, כולל רווחים). אסור להמציא רכיב שלא מופיע ברשימה.
(ב) שורות מדוח מכירות: לכל שורה name, quantity, revenue.
לכל שורה החזר ב-dishes: category מתאימה, ingredients (עד 8) — רק מהרשימה (א), כמויות סבירות למנה, יחידות תואמות לרשימה (גרם, קג, יחידה, מ"ל).
suggested_selling_price_ils: מחיר מכירה למנה כולל מע"מ — העדף חישוב מ-revenue/quantity כשאפשר.
השדה name בכל dish חייב להיות **זהה תו-בתו** לשדה name של אותה שורה בקלט.
החזר JSON בלבד: {"dishes":[{"name":"...","category":"עיקריות","suggested_selling_price_ils":0,"ingredients":[{"name":"שם רכיב","qty":100,"unit":"גרם"}]}]}`

/** פורמטים נתמכים — PDF, Excel, CSV, RTF, תמונות */
export const SUPPORTED_EXTENSIONS = ["pdf", "xlsx", "xls", "csv", "rtf", "png", "jpg", "jpeg", "gif", "webp"] as const

export function getFileExtension(file: File): string {
  return (file.name.split(".").pop()?.toLowerCase() ?? "").trim()
}

export function isSupportedFormat(file: File): boolean {
  return SUPPORTED_EXTENSIONS.includes(getFileExtension(file) as (typeof SUPPORTED_EXTENSIONS)[number])
}

const SALES_PERIOD_SET = new Set<SalesReportPeriod>(["daily", "monthly", "weekly", "unknown"])

const SALES_ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** נרמול מחרוזת תאריך מדוח מכירות ל-YYYY-MM-DD */
export function normalizeSalesReportDateField(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined
  if (typeof v !== "string") return undefined
  const s = v.trim()
  if (!s || s.toLowerCase() === "null") return undefined
  if (SALES_ISO_DATE_RE.test(s)) return s
  const m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/)
  if (m) {
    const d = m[1].padStart(2, "0")
    const mo = m[2].padStart(2, "0")
    const y = m[3]
    return `${y}-${mo}-${d}`
  }
  return undefined
}

/** נרמול תשובת AI לדוח מכירות — תומך גם בפורמט ישן בלי sales_report_period */
export function normalizeSalesExtractResult(parsed: unknown): ExtractResult {
  const o = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {}
  const rawItems = o.items
  const items = Array.isArray(rawItems) ? (rawItems as ExtractedItem[]) : []
  const raw = (o.sales_report_period ?? o.report_period) as string | undefined
  let sales_report_period: SalesReportPeriod | undefined
  if (typeof raw === "string") {
    const k = raw.toLowerCase().trim() as SalesReportPeriod
    if (SALES_PERIOD_SET.has(k)) sales_report_period = k
  }
  const fromRaw = o.sales_report_date_from ?? o.report_date_from ?? o.date_from
  const toRaw = o.sales_report_date_to ?? o.report_date_to ?? o.date_to
  const sales_report_date_from = normalizeSalesReportDateField(fromRaw)
  const sales_report_date_to = normalizeSalesReportDateField(toRaw)
  return { items, sales_report_period, sales_report_date_from, sales_report_date_to }
}

function normalizeDishExtractResult(parsed: unknown): ExtractResult {
  const o = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {}
  const raw = Array.isArray(o.items) ? o.items : Array.isArray(o.dishes) ? o.dishes : []
  const items: ExtractedDishItem[] = []
  for (const row of raw) {
    if (!row || typeof row !== "object") continue
    const r = row as Record<string, unknown>
    const name = typeof r.name === "string" ? r.name.trim() : ""
    if (!name) continue
    let price = 0
    if (typeof r.price === "number" && !Number.isNaN(r.price)) price = Math.max(0, r.price)
    else if (typeof r.suggested_selling_price_ils === "number" && !Number.isNaN(r.suggested_selling_price_ils))
      price = Math.max(0, r.suggested_selling_price_ils)
    const category = normalizeDishCategoryToHebrew(
      typeof r.category === "string" ? r.category : undefined
    )
    let ingredients: ExtractedDishItem["ingredients"]
    if (Array.isArray(r.ingredients)) {
      const ingList = r.ingredients
        .filter((ing): ing is Record<string, unknown> => !!ing && typeof ing === "object")
        .map((ing) => ({
          name: typeof ing.name === "string" ? ing.name.trim() : "",
          qty:
            typeof ing.qty === "number" && !Number.isNaN(ing.qty)
              ? ing.qty
              : typeof ing.qty === "string"
                ? parseFloat(ing.qty.replace(/,/g, ".")) || 0
                : 0,
          unit: typeof ing.unit === "string" && ing.unit.trim() ? ing.unit.trim() : "גרם",
        }))
        .filter((ing) => ing.name.length > 0)
      if (ingList.length > 0) ingredients = ingList
    }
    const description = typeof r.description === "string" ? r.description.trim() : undefined
    const preparation = typeof r.preparation === "string" ? r.preparation.trim() : undefined
    items.push({
      name,
      price,
      category,
      ingredients,
      description: description || undefined,
      preparation: preparation || undefined,
    })
  }
  return { items }
}

function finishExtractResult(type: ExtractType, parsed: unknown): ExtractResult {
  if (type === "s") return normalizeSalesExtractResult(parsed)
  if (type === "d") return normalizeDishExtractResult(parsed)
  return parsed as ExtractResult
}

/** אותו אובייקט File בזרימת העלאה → זיהוי ואז מודאל; מונע קריאת XLSX/CSV כפולה */
const spreadsheetRowsCache = new WeakMap<File, Promise<Record<string, unknown>[]>>()

function loadSpreadsheetRowsCached(file: File, ext: string): Promise<Record<string, unknown>[]> {
  let p = spreadsheetRowsCache.get(file)
  if (!p) {
    p = parseSpreadsheet(file, ext)
    spreadsheetRowsCache.set(file, p)
  }
  return p
}

/**
 * זיהוי מקומי מהיר לגיליונות — רק כשהכותרות ברורות; אחרת null → Haiku כמו קודם.
 * ממוקד בחשבוניות ספק (המקרה הנפוץ) כדי לחסוך קריאת API בלי לסכן תפריט/דוח מכירות.
 */
function quickDetectSheetDocType(rows: Record<string, unknown>[]): DetectedDocType | null {
  if (rows.length < 1) return null
  const keySet = new Set<string>()
  for (let i = 0; i < Math.min(5, rows.length); i++) {
    for (const k of Object.keys(rows[i] || {})) keySet.add(String(k).toLowerCase())
  }
  const keysStr = [...keySet].join(" ")

  const hasSkuCol = /מק״ט|מק"ט|מקט|ברקוד|barcode|קוד\s*פריט|item\s*code|sku\b/i.test(keysStr)
  const hasDescCol = /תיאור|תאור|שם\s*פריט|תיאור\s*מוצר|description|פירוט|פריט|item\s*name|product/i.test(
    keysStr
  )
  const hasQtyCol = /כמות|qty|quantity/i.test(keysStr)
  const hasPriceCol = /מחיר|price|נטו|net|הנחה|discount|מחירון/i.test(keysStr)
  const hasTotalCol = /סה״כ|סה"כ|total|line\s*total/i.test(keysStr)

  let invoiceSignals = 0
  if (hasSkuCol) invoiceSignals++
  if (hasDescCol) invoiceSignals++
  if (hasQtyCol) invoiceSignals++
  if (hasPriceCol) invoiceSignals++
  if (hasTotalCol) invoiceSignals++

  if (hasSkuCol && hasDescCol && invoiceSignals >= 4) return "invoice"
  if (hasSkuCol && hasDescCol && hasQtyCol && invoiceSignals >= 3) return "invoice"

  const salesStrong =
    /דוח\s*מכיר|מכירות\s*לפי|revenue|יומן\s*מכיר|pos\s*summary|סיכום\s*מכיר|כמות\s*נמכר|qty\s*sold/i.test(
      keysStr
    )
  if (salesStrong && invoiceSignals <= 2) return "sales"

  const menuStrong =
    /(^|\s)(קטגוריה|קטגוריות|category)(\s|$)/i.test(keysStr) &&
    /מנה|dish|תפריט|menu|מחיר\s*לצרכן|מחיר\s*למנה/i.test(keysStr)
  if (menuStrong && !hasSkuCol) return "menu"

  return null
}

async function rtfToPlainText(file: File): Promise<string> {
  const raw = await file.text()
  let out = raw
    .replace(/\\u(\d+)\s?/g, (_, n) => String.fromCodePoint(parseInt(n, 10)))
    .replace(/\\'([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\[a-z]+\d*\s?/g, " ")
    .replace(/\{[^}]*\}/g, " ")
    .replace(/[{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  return out || raw.slice(0, 5000)
}

export async function detectDocumentType(file: File): Promise<DetectedDocType> {
  const ext = getFileExtension(file)
  const isImage = ["png", "jpg", "jpeg", "gif", "webp"].includes(ext)
  const isPdf = ext === "pdf"
  const isSheet = ["xlsx", "xls", "csv"].includes(ext)
  const isRtf = ext === "rtf"

  if (isRtf) {
    const text = await rtfToPlainText(file)
    const preview = text.slice(0, 2000)
    const data = await callClaude({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 100,
      system: DETECT_SYSTEM,
      messages: [{ role: "user", content: [{ type: "text", text: `טקסט מהמסמך:\n${preview}\n\nמה סוג המסמך? החזר JSON בלבד.` }] }],
    })
    const out = data.content?.map((b) => b.text ?? "").join("") ?? ""
    const clean = out.replace(/```json|```/g, "").trim()
    try {
      const parsed = JSON.parse(clean) as { type?: string }
      const t = (parsed.type || "unknown").toLowerCase()
      if (t === "menu" || t === "sales" || t === "invoice") return t
    } catch {}
    return "unknown"
  }

  if (isImage || isPdf) {
    const base64 = await fileToBase64(file)
    const mediaType = isPdf ? "application/pdf" : `image/${ext === "jpg" ? "jpeg" : ext}`
    const mediaBlock =
      isPdf
        ? { type: "document" as const, source: { type: "base64" as const, media_type: "application/pdf" as const, data: base64 } }
        : { type: "image" as const, source: { type: "base64" as const, media_type: mediaType as "image/jpeg" | "image/png" | "image/webp" | "image/gif", data: base64 } }
    const data = await callClaude({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 100,
      system: DETECT_SYSTEM,
      messages: [{ role: "user", content: [mediaBlock, { type: "text" as const, text: "מה סוג המסמך? החזר JSON בלבד." }] }],
    })
    const text = data.content?.map((b) => b.text ?? "").join("") ?? ""
    const clean = text.replace(/```json|```/g, "").trim()
    try {
      const parsed = JSON.parse(clean) as { type?: string }
      const t = (parsed.type || "unknown").toLowerCase()
      if (t === "menu" || t === "sales" || t === "invoice") return t
    } catch {}
    return "unknown"
  }

  if (isSheet) {
    const rows = await loadSpreadsheetRowsCached(file, ext)
    const quick = quickDetectSheetDocType(rows)
    if (quick) return quick
    const preview = JSON.stringify(rows.slice(0, 15))
    const data = await callClaude({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 100,
      system: DETECT_SYSTEM,
      messages: [{ role: "user", content: [{ type: "text", text: `הנתונים:\n${preview}\n\nמה סוג המסמך? החזר JSON בלבד.` }] }],
    })
    const text = data.content?.map((b) => b.text ?? "").join("") ?? ""
    const clean = text.replace(/```json|```/g, "").trim()
    try {
      const parsed = JSON.parse(clean) as { type?: string }
      const t = (parsed.type || "unknown").toLowerCase()
      if (t === "menu" || t === "sales" || t === "invoice") return t
    } catch {}
    return "unknown"
  }

  return "unknown"
}

function sheetRowsFromAoA(raw: unknown[][]): Record<string, unknown>[] {
  let headerRowIdx = 0
  for (let i = 0; i < Math.min(raw.length, 5); i++) {
    const row = raw[i] || []
    const strCells = row.filter((v) => v !== null && v !== "" && (typeof v !== "number" || isNaN(v)))
    if (strCells.length >= 2) {
      headerRowIdx = i
      break
    }
  }
  const h = ((raw[headerRowIdx] || []) as unknown[]).map((v) => (v != null ? String(v).trim() : ""))
  const rows = raw.slice(headerRowIdx + 1).map((row) => {
    const o: Record<string, unknown> = {}
    ;(row || []).forEach((v, i) => {
      o[h[i] || `col${i}`] = v !== null && v !== undefined ? v : ""
    })
    return o
  })
  return rows.filter((row) => Object.values(row).some((v) => v !== "" && v != null))
}

export async function parseSpreadsheet(file: File, ext: string): Promise<Record<string, unknown>[]> {
  if (ext === "csv") {
    return new Promise((resolve) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (r: { data: unknown }) =>
          resolve(Array.isArray(r.data) ? (r.data as Record<string, unknown>[]) : []),
      })
    })
  }
  if (ext === "xlsx") {
    const parsed = await readXlsxFile(file)
    const raw: unknown[][] = parsed.map((row) =>
      row.map((cell) => (cell === undefined ? null : cell)) as unknown[]
    )
    return sheetRowsFromAoA(raw)
  }
  // .xls בלבד — ספריית xlsx (פחות מומלץ מבחינת אבטחה; העדף ייצוא מחדש כ־xlsx)
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, {
    type: "array",
    cellFormula: false,
    cellNF: false,
    cellStyles: false,
    sheetStubs: true,
  })
  const ws = wb.Sheets[wb.SheetNames[0]] || {}
  const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null }) as unknown[][]
  return sheetRowsFromAoA(raw)
}

/** חשבונית מ־Excel/CSV: לא לחתוך ל־30 שורות — עד תקרת תווים לבקשה אחת ל־Claude */
const SUPPLIER_SHEET_JSON_CHAR_BUDGET = 95_000

function sliceRowsForSupplierSheetPreview(rows: Record<string, unknown>[]): {
  json: string
  used: number
  total: number
} {
  const total = rows.length
  if (total === 0) return { json: "[]", used: 0, total: 0 }
  let lo = 1
  let hi = total
  let best = 1
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2)
    const j = JSON.stringify(rows.slice(0, mid))
    if (j.length <= SUPPLIER_SHEET_JSON_CHAR_BUDGET) {
      best = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return { json: JSON.stringify(rows.slice(0, best)), used: best, total }
}

export async function extractWithAI(
  file: File,
  type: ExtractType,
  supplierName?: string,
  options?: { menuDishLanguage?: MenuDishNameLanguage }
): Promise<ExtractResult> {
  const menuDishLang: MenuDishNameLanguage = options?.menuDishLanguage ?? "he"
  const dishSystem = buildDishExtractionSystem(menuDishLang)
  const ext = getFileExtension(file)
  if (!ext || !SUPPORTED_EXTENSIONS.includes(ext as (typeof SUPPORTED_EXTENSIONS)[number])) {
    throw new Error(
      `פורמט לא נתמך (${ext || "ללא סיומת"}). השתמש ב-PDF, Excel (.xlsx/.xls), CSV, RTF או תמונה (PNG/JPG).`
    )
  }
  const isImage = ["png", "jpg", "jpeg", "gif", "webp"].includes(ext)
  const isPdf = ext === "pdf"
  const isSheet = ["xlsx", "xls", "csv"].includes(ext)
  const isRtf = ext === "rtf"

  if (isRtf) {
    const text = await rtfToPlainText(file)
    const system =
      type === "p"
        ? SUPPLIER_SYSTEM + (supplierName ? ` שם הספק: "${supplierName}".` : "")
        : type === "d"
          ? dishSystem
          : SALES_SYSTEM
    const userContent =
      type === "p"
        ? SUPPLIER_EXTRACT_USER_MESSAGE
        : type === "d"
          ? "חלץ מנות ומחירים מהתפריט. לכל מנה ישייך רכיבים לפי הבנתך (בשר, ירקות, קמח וכו') — גם אם לא מופיעים בתפריט. עקוב אחרי כללי שפת שמות המנות בהוראות המערכת. JSON בלבד."
          : "חלץ דוח מכירות לפי SALES_SYSTEM — כולל sales_report_period, sales_report_date_from, sales_report_date_to. JSON בלבד."
    const data = await callClaude({
      model: type === "p" ? CLAUDE_SUPPLIER_EXTRACT_MODEL : CLAUDE_DEFAULT_EXTRACT_MODEL,
      max_tokens: 8000,
      system,
      messages: [{ role: "user", content: [{ type: "text", text: `טקסט מהמסמך:\n\n${text}\n\n${userContent}` }] }],
    })
    const out = data.content?.map((b) => b.text ?? "").join("") ?? ""
    let clean = out.replace(/```json|```/g, "").trim()
    clean = clean.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/,\s*}/g, '}').replace(/,\s*]/g, ']')
    try {
      return finishExtractResult(type, JSON.parse(clean))
    } catch (e) {
      // נסיון שני — חלץ JSON אגרסיבי
      const attempts = [
        clean,
        clean.replace(/[\u2018\u2019\u201C\u201D]/g, '"'),
        (clean.match(/\{[\s\S]*\}/) || [])[0] || '',
      ].filter(Boolean)
      for (const attempt of attempts) {
        try {
          const c2 = attempt.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']')
          return finishExtractResult(type, JSON.parse(c2))
        } catch {}
      }
      if (clean.includes('"no_prices":true') && !clean.includes('"items":[{')) {
        const supMatch = clean.match(/supplier_name[^:]*:[^"]*"([^"]+)"/)
        const dateMatch = clean.match(/invoice_date[^:]*:[^"]*"([^"]+)"/)
        return { supplier_name: supMatch?.[1]?.trim() || '', invoice_date: dateMatch?.[1]?.trim() || null, no_prices: true, items: [] }
      }
      throw new Error(`שגיאה בפענוח תשובת AI — נסה שוב או השתמש בקובץ Excel`)
    }
  }

  if (isImage || isPdf) {
    const base64 = await fileToBase64(file)
    const mediaType = isPdf ? "application/pdf" : `image/${ext === "jpg" ? "jpeg" : ext}`
    const system =
      type === "p"
        ? SUPPLIER_SYSTEM + (supplierName ? ` שם הספק: "${supplierName}".` : "")
        : type === "d"
          ? dishSystem
          : SALES_SYSTEM
    const userContent =
      type === "p"
        ? SUPPLIER_EXTRACT_USER_MESSAGE
        : type === "d"
          ? "חלץ מנות ומחירים מהתפריט. לכל מנה ישייך רכיבים לפי הבנתך (בשר, ירקות, קמח וכו') — גם אם לא מופיעים בתפריט. עקוב אחרי כללי שפת שמות המנות בהוראות המערכת. JSON בלבד."
          : "חלץ דוח מכירות לפי SALES_SYSTEM — כולל sales_report_period, sales_report_date_from, sales_report_date_to. JSON בלבד."
    const mediaBlock =
      isPdf
        ? { type: "document" as const, source: { type: "base64" as const, media_type: "application/pdf" as const, data: base64 } }
        : { type: "image" as const, source: { type: "base64" as const, media_type: mediaType as "image/jpeg" | "image/png" | "image/webp" | "image/gif", data: base64 } }
    const data = await callClaude({
      model: type === "p" ? CLAUDE_SUPPLIER_EXTRACT_MODEL : CLAUDE_DEFAULT_EXTRACT_MODEL,
      max_tokens: 8000,
      system,
      messages: [{ role: "user", content: [mediaBlock, { type: "text" as const, text: userContent }] }],
    })
    const text = data.content?.map((b) => b.text ?? "").join("") ?? ""
    let clean = text.replace(/```json|```/g, "").trim()
    // תיקון: הסר תווים בעייתיים שגורמים לשגיאות JSON
    clean = clean.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/,\s*}/g, '}').replace(/,\s*]/g, ']')
    try {
      return finishExtractResult(type, JSON.parse(clean))
    } catch (e) {
      // נסיון שני — חלץ JSON אגרסיבי
      const attempts = [
        clean,
        clean.replace(/[\u2018\u2019\u201C\u201D]/g, '"'),
        (clean.match(/\{[\s\S]*\}/) || [])[0] || '',
      ].filter(Boolean)
      for (const attempt of attempts) {
        try {
          const c2 = attempt.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']')
          return finishExtractResult(type, JSON.parse(c2))
        } catch {}
      }
      if (clean.includes('"no_prices":true') && !clean.includes('"items":[{')) {
        const supMatch = clean.match(/supplier_name[^:]*:[^"]*"([^"]+)"/)
        const dateMatch = clean.match(/invoice_date[^:]*:[^"]*"([^"]+)"/)
        return { supplier_name: supMatch?.[1]?.trim() || '', invoice_date: dateMatch?.[1]?.trim() || null, no_prices: true, items: [] }
      }
      throw new Error(`שגיאה בפענוח תשובת AI — נסה שוב או השתמש בקובץ Excel`)
    }
  }

  if (isSheet) {
    const rows = await loadSpreadsheetRowsCached(file, ext)
    const menuSalesPreview = JSON.stringify(rows.slice(0, 30))
    const supplierPreview =
      type === "p" ? sliceRowsForSupplierSheetPreview(rows) : { json: menuSalesPreview, used: 0, total: rows.length }
    const preview = type === "p" ? supplierPreview.json : menuSalesPreview
    const system =
      type === "p"
        ? SUPPLIER_SYSTEM + (supplierName ? ` שם הספק: "${supplierName}".` : "")
        : type === "d"
          ? dishSystem
          : SALES_SYSTEM
    const sheetUserText =
      type === "d"
        ? `הנתונים:\n${preview}\n\nחלץ מנות ומחירים. לכל מנה ישייך רכיבים וכמויות לפי הבנתך. עקוב אחרי כללי שפת שמות המנות בהוראות המערכת. JSON בלבד.`
        : type === "p"
          ? `הנתונים מהגיליון (שורות כטבלה)${supplierPreview.used < supplierPreview.total ? ` — ${supplierPreview.used} שורות מתוך ${supplierPreview.total} (גיליון ראשון בלבד; חלץ הכל ממה שנשלח)` : ""}:\n${preview}\n\n${SUPPLIER_EXTRACT_USER_MESSAGE}`
          : `הנתונים:\n${preview}\n\nחלץ דוח מכירות לפי SALES_SYSTEM — כולל sales_report_period, sales_report_date_from, sales_report_date_to. JSON בלבד.`
    const supplierRowCount = type === "p" ? supplierPreview.used : 0
    const data = await callClaude({
      model: type === "p" ? CLAUDE_SUPPLIER_EXTRACT_MODEL : CLAUDE_DEFAULT_EXTRACT_MODEL,
      max_tokens:
        type === "p" ? (supplierRowCount > 45 ? 12_000 : 8000) : type === "s" ? 4000 : 2000,
      system,
      messages: [{ role: "user", content: [{ type: "text", text: sheetUserText }] }],
    })
    const text = data.content?.map((b) => b.text ?? "").join("") ?? ""
    let clean = text.replace(/```json|```/g, "").trim()
    clean = clean.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/,\s*}/g, "}").replace(/,\s*]/g, "]")
    try {
      return finishExtractResult(type, JSON.parse(clean))
    } catch {
      const jsonMatch = clean.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        try {
          return finishExtractResult(type, JSON.parse(jsonMatch[0]))
        } catch {}
      }
      throw new Error(`שגיאה בפענוח תשובת AI — נסה שוב או השתמש בקובץ Excel`)
    }
  }

  throw new Error(`פורמט לא נתמך (${ext}). השתמש ב-PDF, Excel, CSV, RTF או תמונה.`)
}

/** הצעת רכיבים וקטגוריה למנה לפי שם + נתוני מכירה מהדוח */
export interface SuggestedDishFromSalesLine {
  name: string
  category: string
  suggested_selling_price_ils: number
  ingredients: Array<{ name: string; qty: number; unit: string }>
}

/**
 * קריאת AI אחת לכל השורות החסרות — מחזיר מפה לפי name מהדוח.
 * אם מועבר `pantry` (רכיבי מסעדה), ה-AI מחויב לרשימה וגם מסננים שוב בקוד רק שמות שמופיעים ב־pantry.
 */
export async function suggestDishesFromSalesLines(
  lines: { name: string; quantity: number; revenue: number }[],
  pantry?: IngredientForSuggestion[]
): Promise<Map<string, SuggestedDishFromSalesLine>> {
  const map = new Map<string, SuggestedDishFromSalesLine>()
  if (lines.length === 0) return map
  const pantryList = Array.isArray(pantry) && pantry.length > 0 ? pantry : null
  const hasPantry = pantryList != null
  const allowedNames = hasPantry ? new Set(pantryList.map((p) => p.name)) : null
  try {
    const system = hasPantry ? DISH_FROM_SALES_LINES_PANTRY_SYSTEM : DISH_FROM_SALES_LINES_SYSTEM
    const userText = hasPantry
      ? `רכיבים זמינים במסעדה (השתמש רק בשמות האלה, תו-בתו):\n${pantryList
          .slice(0, 120)
          .map((i) => `${i.name} — ${i.price} ש"ח/${i.unit}${i.stock != null ? ` (מלאי: ${i.stock})` : ""}`)
          .join("\n")}\n\nשורות מדוח המכירות:\n${JSON.stringify({ lines })}\n\nהחזר JSON בלבד.`
      : `שורות מהדוח (JSON). הצע רכיבים וקטגוריה לכל מנה:\n${JSON.stringify({ lines })}\n\nהחזר JSON בלבד.`

    const data = await callClaude({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 8000,
      system,
      messages: [{ role: "user", content: [{ type: "text", text: userText }] }],
    })
    const out = data.content?.map((b) => b.text ?? "").join("") ?? ""
    let clean = out.replace(/```json|```/g, "").trim()
    clean = clean.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/,\s*}/g, "}").replace(/,\s*]/g, "]")
    const parsed = JSON.parse(clean) as { dishes?: SuggestedDishFromSalesLine[] }
    const dishes = Array.isArray(parsed.dishes) ? parsed.dishes : []
    for (const d of dishes) {
      if (!d?.name?.trim()) continue
      const key = d.name.trim()
      let ingredients = Array.isArray(d.ingredients)
        ? d.ingredients
            .filter((ing) => ing?.name?.trim())
            .map((ing) => ({
              name: String(ing.name).trim(),
              qty: typeof ing.qty === "number" && !Number.isNaN(ing.qty) ? Math.max(0, ing.qty) : 0,
              unit: typeof ing.unit === "string" && ing.unit.trim() ? ing.unit.trim() : "גרם",
            }))
            .slice(0, 8)
        : []
      if (allowedNames) {
        ingredients = ingredients.filter((ing) => allowedNames.has(ing.name))
      }
      map.set(key, {
        name: key,
        category: normalizeDishCategoryToHebrew(
          typeof d.category === "string" && d.category.trim() ? d.category.trim() : undefined
        ),
        suggested_selling_price_ils:
          typeof d.suggested_selling_price_ils === "number" && !Number.isNaN(d.suggested_selling_price_ils)
            ? Math.max(0, d.suggested_selling_price_ils)
            : 0,
        ingredients,
      })
    }
  } catch (e) {
    console.error("suggestDishesFromSalesLines:", e)
  }
  return map
}

export interface IngredientForSuggestion {
  name: string
  price: number
  unit: string
  supplier?: string
  stock?: number
}

const SUGGEST_DISH_MODEL = "claude-sonnet-4-20250514"

const SUGGEST_DISH_SYSTEM = `אתה שף, ברמן ומנהל תפריט מקצועי. בהתבסס על רשימת הרכיבים שיש למסעדה (מזון, משקאות, משקאות חריפים, מיקסרים וכו' — עם מחירים ויחידות מהספקים), הצע פריט אחד מתאים.
שאף לגיוון תפריט: בחר רעיון ריאלי שמתאים לחומרי הגלם הזמינים ויכול להשתלב בתפריט ישראלי מודרני (אוכל, קינוח או משקה), לא רק מנות בסיס חוזרות.

חוקים — רכיבים ו-JSON:
- בשדה ingredients בלבד: שם רכיב **זהה תו-בתו** לשם כפי שמופיע ברשימה (כולל רווחים) — אין לשנות איות.
- ingredients: כמויות מדויקות לפי יחידות ברשימה (גרם, קג, יחידה, מ"ל, כף, כפית, בקבוק וכו').
- אם ברשימה יש משקאות חריפים, מיקסרים, מיץ, סודה, סירופ, לימון — מותר ורצוי **קוקטייל או משקה אלכוהולי** עם מתכון (כמויות במ"ל לנוזלים).
- אם מתאים למטבח — **מנה** (עיקריות, ראשונות, סלטים, קינוחים וכו').
- תעדיף שימוש ברכיבים עם מלאי קיים (stock>0) ובעלות סבירה; הימנע מרכיב יקר מאוד אם יש חלופה זמינה ברשימה.
- category: אחת מ: עיקריות, ראשונות, סלטים, קינוחים, משקאות, משקאות אלכוהוליים, תוספות, אחר
- sellingPrice: מספר — מחיר מכירה סביר **כולל מע"מ**.

**עברית תקנית ב-description וב-preparationSteps (חובה):**
- כתוב בעברית תקנית וברורה; בדוק כל משפט לפני החזרה — ללא טעויות הקלדה שנשמעות כמו מילים אחרות.
- preparationSteps: **מערך מחרוזות** (לפחות 4 שלבים). כל שלב = הוראה בלשון ציווי נכונה: חתוך, חמם, הנח, קלה/יטוגנו, ערבב, **הגש** (עם ה" אם מתחיל ב"ו" — "והגש"), צלו, טגנו.
- דוגמאות לטעויות **אסור** לחזור עליהן: "וניתח" (לא נכון — נכון "וחתוך"); "וגש" במשמעות הגשה (נכון "**והגש**"); שימוש ב"הטוסט" כפועל (נכון "קלו"/"טוסנו"/"השחימו את הפרוסות"); "עד שתימצא צבע זהוב" (לא תקין — נכון "עד שיזהיבו" / "עד שיקבלו גוון זהוב" / "עד להשחמה קלה").
- פעלים בגוף רבים כשהנושא הוא "הפרוסות"/"המרכיבים": "יזהיבו", "יקבלו", לא בגוף יחיד שגוי.

**שמות ברשימה מול טקסט קולינרי:**
- לעיתים שם הרכיב ברשימה ארוך או טכני (מק"ט, אריזה, ספק). ב-description וב-preparationSteps השתמש **בניסוח קולינרי קצר וטבעי** (למשל "פרוסות בריוש", "לחם בריוש") — **אל** תעתיק טקסט אריזה או שם מסחרי מסורבל כמו שזה. בשדה ingredients עדיין השם המדויק מהרשימה בלבד.

**מתכון:** preparationSteps — מערך מחרוזות; אסור לשבור שורה בתוך מחרוזת JSON — רק מערך או מחרוזת אחת עם \\n.

**חשוב:** החזר אובייקט JSON **תקין לחלוטין** — בלי טקסט לפני או אחרי, בלי markdown.

המבנה המדויק:
{"name":"שם","category":"...","description":"...","sellingPrice":0,"preparationSteps":["שלב 1","שלב 2","שלב 3","שלב 4"],"ingredients":[{"name":"שם רכיב","qty":0,"unit":"גרם"}]}`

/** מוצא את אובייקט ה-JSON הראשון בתשובה (מתעלם מטקסט מסביב; מכבד מחרוזות עם סוגריים) */
function extractFirstJsonObject(raw: string): string | null {
  const s = raw.replace(/```(?:json)?/gi, "").replace(/```/g, "").trim()
  const start = s.indexOf("{")
  if (start < 0) return null
  let depth = 0
  let inString = false
  let i = start
  while (i < s.length) {
    const c = s[i]
    if (inString) {
      if (c === "\\") {
        i += 1
        if (i < s.length) i += 1
        continue
      }
      if (c === '"') inString = false
      i += 1
      continue
    }
    if (c === '"') {
      inString = true
      i += 1
      continue
    }
    if (c === "{") depth += 1
    else if (c === "}") {
      depth -= 1
      if (depth === 0) return s.slice(start, i + 1)
    }
    i += 1
  }
  return null
}

function parseSuggestDishSellingPrice(v: unknown): number {
  if (typeof v === "number" && !Number.isNaN(v)) return Math.max(0, v)
  if (typeof v === "string") {
    const n = parseFloat(v.replace(/,/g, ".").replace(/[^\d.-]/g, ""))
    return !Number.isNaN(n) && n >= 0 ? n : 0
  }
  return 0
}

function parseSuggestDishQty(v: unknown): number {
  if (typeof v === "number" && !Number.isNaN(v)) return v
  if (typeof v === "string") {
    const n = parseFloat(v.replace(/,/g, "."))
    return !Number.isNaN(n) ? n : 0
  }
  return 0
}

export async function suggestDishFromIngredients(
  ingredients: IngredientForSuggestion[],
  options?: { chefStyle?: string; variantHint?: string; allowedRecipeNames?: string[] }
): Promise<ExtractedDishItem | null> {
  if (ingredients.length === 0) return null
  const list = ingredients
    .slice(0, 80)
    .map((i) => `${i.name} — ${i.price} ש"ח/${i.unit}${i.stock != null ? ` (מלאי: ${i.stock})` : ""}`)
    .join("\n")
  const chefStyle = (options?.chefStyle || "").trim()
  const variantHint = (options?.variantHint || "").trim()
  const chefPrompt = chefStyle && chefStyle !== "ללא העדפת שף"
    ? `סגנון שף מועדף להצעה: ${chefStyle}. שמור על פרשנות קולינרית בסגנון זה, אך השתמש רק ברכיבים הזמינים ברשימה.`
    : "אין העדפת שף ספציפי — בחר סגנון ישראלי מודרני מאוזן, ואם רלוונטי ציין שף השראה מתאים; אם לא, השאר suggestedByChef ריק."
  const variationPrompt = variantHint
    ? `וריאציית יצירה: ${variantHint}. הקפד שהרעיון יהיה שונה מרעיונות בסיסיים נפוצים.`
    : ""
  const recipeScope = Array.isArray(options?.allowedRecipeNames) && options!.allowedRecipeNames!.length > 0
    ? `רעיונות מועדפים למסעדה: ${options!.allowedRecipeNames!.slice(0, 60).join(", ")}. העדף להציע מנה מתוך הרשימה או וריאציה קרובה לה.`
    : ""
  const data = await callClaude({
    model: SUGGEST_DISH_MODEL,
    max_tokens: 4000,
    system: SUGGEST_DISH_SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `רשימת הרכיבים במסעדה:\n${list}\n\n${chefPrompt}\n${variationPrompt}\n${recipeScope}\n\nהצע מנה או משקה עם description, preparationSteps (מערך של לפחות 4 שלבים בעברית תקנית), ו-ingredients (שמות רכיבים זהים לרשימה).\nהחזר גם שדה suggestedByChef: שם שף מתאים אם יש התאמה טובה; אם אין התאמה טובה, החזר suggestedByChef כמחרוזת ריקה.\nלפני סיום: קרא בקול את description וכל preparationSteps — תקן כל שגיאת דקדוק או מילה שגויה.\nהחזר **רק** JSON תקין — ללא הסבר לפני או אחרי.`,
          },
        ],
      },
    ],
  })
  const out = data.content?.map((b) => b.text ?? "").join("") ?? ""
  const jsonSlice = extractFirstJsonObject(out) ?? out.replace(/```json|```/g, "").trim()
  let parsed: {
    name?: string
    category?: string
    sellingPrice?: unknown
    description?: string
    preparation?: string
    preparationSteps?: unknown
    ingredients?: Array<{ name: string; qty?: unknown; unit?: string }>
  }
  try {
    parsed = JSON.parse(jsonSlice) as typeof parsed
  } catch (e) {
    console.warn("suggestDishFromIngredients: JSON.parse failed", e)
    return null
  }
  if (!parsed?.name || typeof parsed.name !== "string" || !parsed.name.trim()) return null
  if (!Array.isArray(parsed.ingredients)) return null

  const normalize = (n: string) => n.trim().replace(/\s+/g, " ")
  const allowed = new Set(ingredients.map((i) => i.name))
  const byNormalized = new Map<string, string>()
  for (const i of ingredients) {
    byNormalized.set(normalize(i.name), i.name)
  }
  const resolveCanonicalName = (raw: string): string | null => {
    if (allowed.has(raw)) return raw
    return byNormalized.get(normalize(raw)) ?? null
  }
  const mappedIngredients = parsed.ingredients
    .map((ing) => {
      if (!ing || typeof ing.name !== "string") return null
      const canon = resolveCanonicalName(ing.name)
      if (!canon) return null
      return {
        name: canon,
        qty: parseSuggestDishQty(ing.qty),
        unit: (ing.unit as string) || "גרם",
      }
    })
    .filter((x): x is { name: string; qty: number; unit: string } => x !== null)

  let preparation: string | undefined
  if (Array.isArray(parsed.preparationSteps) && parsed.preparationSteps.length > 0) {
    preparation = parsed.preparationSteps
      .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
      .join("\n")
      .trim()
  }
  if (!preparation && typeof parsed.preparation === "string" && parsed.preparation.trim()) {
    preparation = parsed.preparation.trim()
  }

  return {
    name: parsed.name.trim(),
    price: parseSuggestDishSellingPrice(parsed.sellingPrice),
    category: normalizeDishCategoryToHebrew(
      typeof parsed.category === "string" && parsed.category.trim() ? parsed.category.trim() : undefined
    ),
    suggestedByChef:
      typeof (parsed as { suggestedByChef?: unknown }).suggestedByChef === "string"
        ? ((parsed as { suggestedByChef?: string }).suggestedByChef || "").trim() || undefined
        : (chefStyle && chefStyle !== "ללא העדפת שף" ? chefStyle : undefined),
    description: typeof parsed.description === "string" ? parsed.description.trim() : undefined,
    preparation: preparation || undefined,
    ingredients: mappedIngredients,
  }
}

/** מחיר מהאינטרנט — AI מחזיר מחיר טיפוסי וחנות בישראל */
export interface WebPriceResult {
  price: number
  store: string
  unit: string
}

const WEB_PRICE_SYSTEM = `אתה מומחה למחירי מוצרי מזון בישראל. לפי שם הרכיב, החזר:
- מחיר בשקלים (מספר) — מחיר טיפוסי בסופרמרקטים
- חנות/רשת (רמי לוי, שופרסל, ויקטורי, יוחננוף, מגה בעיר וכו') — איפה בדרך כלל הכי זול
- יחידה (קג, גרם, ליטר, יחידה)

החזר JSON בלבד: {"price":0,"store":"שם חנות","unit":"יחידה"}`

export async function fetchWebPriceForIngredient(ingredientName: string): Promise<WebPriceResult | null> {
  const data = await callClaude({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 500,
    system: WEB_PRICE_SYSTEM,
    messages: [{ role: "user", content: [{ type: "text", text: `מה המחיר הטיפוסי ל-${ingredientName} בסופרמרקטים בישראל? איפה הכי זול? החזר JSON בלבד: {"price":0,"store":"שם","unit":"יחידה"}` }] }],
  })
  const out = data.content?.map((b) => b.text ?? "").join("") ?? ""
  const clean = out.replace(/```json|```/g, "").trim()
  try {
    const parsed = JSON.parse(clean) as { price?: number; store?: string; unit?: string }
    if (typeof parsed?.price !== "number" || parsed.price <= 0) return null
    return {
      price: parsed.price,
      store: (parsed.store as string) || "לא צוין",
      unit: (parsed.unit as string) || "קג",
    }
  } catch {
    return null
  }
}
