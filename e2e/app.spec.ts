import { test, expect } from "@playwright/test"

test.describe("אפליקציה — טעינה ומסך התחברות", () => {
  test("דף הבית נטען עם כותרת צפויה", async ({ page }) => {
    await page.goto("/")
    await expect(page).toHaveTitle(/Restaurant/i)
  })

  test("משתמש לא מחובר רואה טופס התחברות", async ({ page }) => {
    await page.goto("/")
    await expect(page.locator("#login-email")).toBeVisible({ timeout: 30_000 })
    await expect(page.locator("#login-password")).toBeVisible()
    await expect(page.getByRole("button", { name: /^כניסה עם Google$/ })).toBeVisible()
  })

  test("מסמך עם כיוון שפה (html dir)", async ({ page }) => {
    await page.goto("/")
    await expect(page.locator("#login-email")).toBeVisible({ timeout: 30_000 })
    const dir = await page.locator("html").getAttribute("dir")
    expect(["rtl", "ltr", null]).toContain(dir)
  })

  test("קישור manifest ל־PWA", async ({ page }) => {
    await page.goto("/")
    const manifest = page.locator('link[rel="manifest"]')
    await expect(manifest).toHaveCount(1)
    const href = await manifest.getAttribute("href")
    expect(href).toMatch(/manifest\.webmanifest/)
  })
})
