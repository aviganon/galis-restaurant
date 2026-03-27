import { test, expect } from "@playwright/test"

test("דף הבית נטען", async ({ page }) => {
  await page.goto("/")
  await expect(page).toHaveTitle(/Restaurant/i)
})
