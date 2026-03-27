/**
 * קונפיגורציה להתחברות ל-Firestore
 *
 * מבנה: appState, config, ingredients, inviteCodes, invoiceLog, restaurants, users
 * - admin: מנהל מסעדה — רואה רק את המסעדה שלו (restaurantId), הרשאות מלאות + פאנל ניהול
 * - owner: בעלים — כמו מנהל, הרשאות מלאות + פאנל ניהול
 * - user: משתמש — גישה מוגבלת למסעדה
 *
 * פאנל מנהל: משתמשים ב-config/admins עם שדה "emails" (מערך כתובות) או "adminEmails"
 * וודא שהאימייל שלך ברשימה כדי לראות את פאנל הניהול.
 */

export const firestoreConfig = {
  usersCollection: "users",
  roleField: "role",
  restaurantIdField: "restaurantId",
  restaurantsCollection: "restaurants",
  restaurantFields: {
    name: "name",
    branch: "branch",
    emoji: "emoji",
  },
  adminRoleValue: "admin",
  adminsDocPath: { collection: "config", docId: "admins" },
  adminsEmailsField: "emails",
  permissionsField: "permissions",
  defaultPermissions: {
    canSeeDashboard: true,
    canSeeProductTree: true,
    canSeeIngredients: true,
    canSeeInventory: true,
    canSeeSuppliers: true,
    canSeePurchaseOrders: true,
    canSeeUpload: true,
    canSeeReports: false,
    canSeeCosts: false,
    canSeeSettings: false,
  },
  inviteCodesCollection: "inviteCodes",
  inviteCodeFields: {
    type: "type",
    restaurantId: "restaurantId",
    used: "used",
    createdAt: "createdAt",
    /** אימייל שחייב להתאים (הרשמה או השלמת הקמה אחרי יצירת משתמש על ידי בעלים) */
    allowedEmail: "allowedEmail",
  },
} as const
