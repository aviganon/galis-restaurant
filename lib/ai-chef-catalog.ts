export const AI_CHEF_STYLES = [
  "אייל שני",
  "מאיר אדוני",
  "חיים כהן",
  "ישראל אהרוני",
  "אסף גרניט",
  "יובל בן נריה",
  "רותי ברודו",
] as const

const BASE_RECIPE_IDEAS = [
  "חומוס", "פלאפל", "שווארמה", "שניצל", "קבב", "סלמון", "פסטה", "המבורגר", "סלט קיסר", "פיצה",
  "ברוסקטה", "טרטר", "סטייק", "דניס", "ריזוטו", "מרק", "סלט ירקות", "צ'יפס", "פלאפל בפיתה", "חומוס מלא",
  "סביח", "שקשוקה", "מעורב ירושלמי", "קציצות דגים", "קארי עוף", "נודלס ירקות", "פרגית על הפלנצ'ה",
  "סלט טונה", "ניוקי שמנת פטריות", "מוסקה", "פוקאצ'ה", "טוסט גבינות", "כנפיים ברוטב", "פיש אנד צ'יפס",
  "מוקפץ בקר", "פאד תאי", "סשימי סלמון", "עראיס", "קרפצ'יו סלק", "כנאפה", "מלבי", "מוזלי", "לימונדה",
  "מוחיטו", "אפרול שפריץ", "מרגריטה",
] as const

const MAIN_PARTS = ["עוף", "בקר", "דג", "טופו", "עדשים", "חומוס", "ירקות", "פטריות", "פסטה", "אורז", "קינואה", "תפוחי אדמה"] as const
const TECHNIQUES = ["צלוי", "מטוגן", "על הפלנצ'ה", "בגריל", "בתנור", "מוקפץ", "בקרם", "ברוטב עגבניות", "בטחינה", "בלימון", "בצ'ילי", "בשום"] as const
const STYLES = ["ישראלי", "ים תיכוני", "אסיאתי", "איטלקי", "מרוקאי", "טבעוני", "גלילי", "ירושלמי", "מודרני", "קלאסי"] as const
const FORMS = ["סלט", "קערה", "כריך", "מנה חמה", "טוסט", "פיתה", "פסטה", "תבשיל", "קציצה", "מוקפץ"] as const

function buildLargeRecipeIdeas(): string[] {
  const set = new Set<string>(BASE_RECIPE_IDEAS)
  for (const form of FORMS) {
    for (const part of MAIN_PARTS) {
      for (const tech of TECHNIQUES) {
        set.add(`${form} ${part} ${tech}`)
      }
    }
  }
  for (const style of STYLES) {
    for (const part of MAIN_PARTS) {
      for (const tech of TECHNIQUES) {
        set.add(`${part} ${tech} בסגנון ${style}`)
      }
    }
  }
  return Array.from(set).slice(0, 1200)
}

export const AI_KNOWN_RECIPE_IDEAS = buildLargeRecipeIdeas()

