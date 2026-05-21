import { expect, test } from "@playwright/test";

import { clearSession, loginAs, loginAsOrgAdmin } from "../helpers/auth";

test.describe.configure({ mode: "serial" });

test.describe("Role-based access control", () => {
  test("staff with canCollectFees=false cannot see Fees in sidebar", async ({ page }) => {
    await loginAsOrgAdmin(page);
    await page.goto("/admin/staff");
    await page.getByRole("button", { name: "Edit" }).first().click();
    await page.getByLabel("Collect Fees").uncheck();
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Staff saved")).toBeVisible();

    await clearSession(page);
    await loginAs(page, "staff");
    await expect(page.getByRole("link", { name: "Bus Fees" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "School Fees" })).toHaveCount(0);

    await clearSession(page);
    await loginAsOrgAdmin(page);
    await page.goto("/admin/staff", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Edit" }).first().click();
    await page.getByLabel("Collect Fees").check();
    await page.getByRole("button", { name: "Save" }).click();
  });

  test("staff with canCollectFees=true can access school fees page", async ({ page }) => {
    await loginAs(page, "staff");
    await page.getByRole("link", { name: "School Fees" }).click();
    await expect(page).toHaveURL(/\/staff\/school-fees/);
    await expect(page.getByPlaceholder("Search student by name to collect fees...")).toBeVisible();
  });

  test("parent can only see their linked children", async ({ page }) => {
    await loginAs(page, "parent");
    await expect(page.getByText("Student 1-1")).toBeVisible();
    await expect(page.getByText("Student 1-2")).toBeVisible();
    await expect(page.getByText("Student 1-3")).toHaveCount(0);
  });

  test("parent cannot access /admin/* routes — redirected to login", async ({ page }) => {
    await loginAs(page, "parent");
    await page.goto("/admin/fees");
    await expect(page).toHaveURL(/\/login/);
  });

  test("orgAdmin cannot access /super/* routes", async ({ page }) => {
    await loginAs(page, "orgAdmin");
    await page.goto("/super/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("staff cannot access /admin/fee-structure page", async ({ page }) => {
    await loginAs(page, "staff");
    await page.goto("/admin/fee-structure");
    await expect(page).toHaveURL(/\/login/);
  });
});
