# הוספת שפות נוספות

המערכת תומכת בהוספת שפות חדשות. השלבים:

## 1. `lib/translations.ts`
- הרחב את `Locale`: `export type Locale = "he" | "en" | "ar" | "ru"`
- הוסף את השפה ל-`SUPPORTED_LOCALES`: `["he", "en", "ar"]`
- הוסף אובייקט תרגומים מלא באותו מבנה כמו `he` ו-`en`

## 2. `contexts/language-context.tsx`
- אם השפה החדשה היא RTL (עברית, ערבית): הוסף ל-`RTL_LOCALES`: `["he", "ar"]`

## 3. `components/language-switcher.tsx`
- כרגע: מתג בינארי EN/עב
- עבור 3+ שפות: החלף ל-dropdown או רשימת כפתורים שמציגים את כל `supportedLocales` מהקונטקסט

## 4. `app/layout.tsx`
- הסקריפט ב-`<head>` כבר מעדכן `dir` ו-`lang` לפי השפה הנבחרת

## דוגמה — הוספת ערבית (ar)
```ts
// lib/translations.ts
export type Locale = "he" | "en" | "ar"
export const SUPPORTED_LOCALES: Locale[] = ["he", "en", "ar"]

// הוסף ar: { common: {...}, nav: {...}, ... }
```

```ts
// contexts/language-context.tsx
const RTL_LOCALES: Locale[] = ["he", "ar"]
```
