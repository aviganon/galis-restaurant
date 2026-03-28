# הוספת שפות נוספות

המערכת תומכת בהוספת שפות חדשות. השלבים:

## 1. `lib/translations/`

- **`types.ts`**: הרחב את `Locale` (למשל `"he" | "en" | "ar"`) ואת `SUPPORTED_LOCALES`.
- **`xx-core.ts`**: אובייקט `xxCore` — אותו מבנה כמו `heCore` / `enCore` (`common`, `nav`, `login`, `authErrors`, `app`).
- **`xx-pages.ts`**: אובייקט `xxPages` — אותו מבנה כמו `hePages` / `enPages` (תוכן תחת `pages` במילון המלא).
- **`index.ts`**: הוסף את השפה ל־`translations` (מיזוג `core` + `pages`) ועדכן את `getTranslation` אם נדרש fallback נוסף.

## 2. `contexts/language-context.tsx`

- אם השפה החדשה היא RTL (עברית, ערבית): הוסף ל־`RTL_LOCALES` (למשל `["he", "ar"]`).

## 3. `components/language-switcher.tsx`

- כרגע: מתג בינארי EN/עב
- עבור 3+ שפות: החלף ל-dropdown או רשימת כפתורים שמציגים את כל `supportedLocales` מהקונטקסט

## 4. `app/layout.tsx`

- הסקריפט ב־`<head>` כבר מעדכן `dir` ו־`lang` לפי השפה הנבחרת

## דוגמה — הוספת ערבית (ar)

```ts
// lib/translations/types.ts
export type Locale = "he" | "en" | "ar"
export const SUPPORTED_LOCALES: Locale[] = ["he", "en", "ar"]
```

```ts
// lib/translations/ar-core.ts + ar-pages.ts — כמו he/en
// lib/translations/index.ts
export const translations = {
  he: { ...heCore, pages: hePages },
  en: { ...enCore, pages: enPages },
  ar: { ...arCore, pages: arPages },
} as const
```

```ts
// contexts/language-context.tsx
const RTL_LOCALES: Locale[] = ["he", "ar"]
```
