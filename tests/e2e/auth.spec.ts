import { expect, test } from "@playwright/test";

import { clearSession, expectLoginError, loginAs, loginViaUi } from "../helpers/auth";

test.describe("Authentication", () => {
  test("superAdmin login redirects to /super/dashboard", async ({ page }) => {
    await loginViaUi(page, "superAdmin");
    await expect(page).toHaveURL(/\/super\/dashboard/);
  });

  test("orgAdmin login redirects to /admin/dashboard", async ({ page }) => {
    await loginViaUi(page, "orgAdmin");
    await expect(page).toHaveURL(/\/admin\/dashboard/);
  });

  test("staff login redirects to /staff/dashboard", async ({ page }) => {
    await loginViaUi(page, "staff");
    await expect(page).toHaveURL(/\/staff\/dashboard/);
  });

  test("parent login redirects to /parent/dashboard", async ({ page }) => {
    await loginViaUi(page, "parent");
    await expect(page).toHaveURL(/\/parent\/dashboard/);
  });

  test("wrong password shows error message", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[type="email"]', "admin@demoschool.com");
    await page.fill('input[type="password"]', "wrong-password");
    const [response] = await Promise.all([
      page.waitForResponse((res) => res.url().includes("/api/auth/login")),
      page.click('button[type="submit"]')
    ]);
    expect(response.status()).toBe(401);
    await expectLoginError(page);
  });

  test("non-existent email shows error message", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[type="email"]', "nobody@example.com");
    await page.fill('input[type="password"]', "password123");
    const [response] = await Promise.all([
      page.waitForResponse((res) => res.url().includes("/api/auth/login")),
      page.click('button[type="submit"]')
    ]);
    expect(response.status()).toBe(401);
    await expectLoginError(page);
  });

  test("accessing /admin/dashboard without login redirects to /login", async ({ page }) => {
    await clearSession(page);
    await page.goto("/admin/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("parent cannot access /admin/dashboard", async ({ page }) => {
    await loginAs(page, "parent");
    await page.goto("/admin/dashboard");
    await expect(page).toHaveURL(/\/login/, { timeout: 15000 });
  });
});
