import { expect, test } from "@playwright/test";

import { loginAs } from "../helpers/auth";

test.describe.configure({ mode: "serial" });

test.describe("School fee collection", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, "orgAdmin");
  });

  test("fee structure page loads", async ({ page }) => {
    await page.goto("/admin/fees/structure");
    await expect(
      page.getByRole("heading", { name: "Fee Structure", exact: true })
    ).toBeVisible({
      timeout: 10000
    });
    await expect(page.getByRole("button", { name: "Create" })).toBeVisible();
    await expect(page).toHaveURL(/fees\/structure/);
  });

  test("fee structure can be created with multiple fee heads", async ({ page }) => {
    await page.goto("/admin/fees/structure");

    await page.waitForLoadState("networkidle");
    await page.waitForSelector(
      'button:has-text("Create"), button:has-text("New Fee Structure")',
      { timeout: 15000 }
    );

    const uniqueName = `E2E Structure ${Date.now()}`;

    await page.click('button:has-text("Create"), button:has-text("New Fee Structure")');

    // Inline create panel (no modal) — wait for form to render
    await expect(page.getByRole("heading", { name: "Create Fee Structure" })).toBeVisible({
      timeout: 8000
    });
    await page.waitForTimeout(300);

    const formPanel = page
      .getByRole("heading", { name: "Create Fee Structure" })
      .locator("xpath=ancestor::div[contains(@class,'space-y')]");

    const nameInput = page
      .locator(
        [
          'input[placeholder="Structure name"]',
          'input[name="name"]',
          'input[placeholder*="structure name" i]',
          'input[placeholder*="name" i]'
        ].join(", ")
      )
      .first();

    await expect(nameInput).toBeVisible({ timeout: 5000 });
    await nameInput.click();
    await nameInput.fill(uniqueName);

    const yearInput = page
      .locator(
        [
          'input[name="academicYear"]',
          'input[placeholder*="academic" i]',
          'input[placeholder*="2025" i]'
        ].join(", ")
      )
      .first();

    if ((await yearInput.count()) > 0) {
      await yearInput.fill("2025-26");
    }

    const existingRows = formPanel.locator(
      '[data-testid="fee-head-row"], .fee-head-row, tbody tr'
    );
    const rowCount = await existingRows.count();

    if (rowCount === 0) {
      const addHeadBtn = page
        .locator(
          'button:has-text("Add row"), button:has-text("Add fee head"), button:has-text("Add Head")'
        )
        .first();
      await addHeadBtn.click();
      await page.waitForTimeout(200);
    }

    const loadCommonBtn = page.getByRole("button", { name: "Load common heads" });
    if ((await loadCommonBtn.count()) > 0) {
      await loadCommonBtn.click();
      await page.waitForTimeout(200);
    } else {
      const feeHeadRows = formPanel.locator("tbody tr");
      const feeHeadNameInput = feeHeadRows.first().locator("td").first().locator("input");
      await feeHeadNameInput.fill("Tuition Fee");
      await feeHeadRows.first().locator('input[type="number"]').first().fill("3000");
      const freqSelect = feeHeadRows.first().locator("select").first();
      if ((await freqSelect.count()) > 0) {
        await freqSelect.selectOption("monthly");
      }
    }

    const saveBtn = page
      .locator(
        [
          'button:has-text("Save Structure")',
          'button:has-text("Save")',
          'button[type="submit"]'
        ].join(", ")
      )
      .first();

    await expect(saveBtn).toBeEnabled({ timeout: 5000 });
    await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes("/api/fee-structure") && r.request().method() === "POST" && r.ok(),
        { timeout: 25000 }
      ),
      saveBtn.click()
    ]);

    await expect(page.getByText("Fee structure saved")).toBeVisible({ timeout: 8000 });
    await expect(page.getByText(uniqueName)).toBeVisible({ timeout: 8000 });
  });

  test("fee structure can be assigned to students by grade", async ({ page }) => {
    test.setTimeout(90000);
    await page.goto("/admin/fees/structure");
    await page
      .locator("ul.space-y-2 > li")
      .filter({ hasText: "Standard Fee Structure 2025-26" })
      .click();

    await expect(page.getByRole("heading", { name: "Assign to Students" })).toBeVisible();
    const assignBlock = page.locator("div.mt-8.border-t").filter({ hasText: "Assign to Students" });
    await assignBlock.locator("select").selectOption({ label: "Grade 1" });
    await page.waitForResponse(
      (res) => res.url().includes("/api/students") && res.request().method() === "GET" && res.ok(),
      { timeout: 15000 }
    );

    const checkboxes = assignBlock.locator('label input[type="checkbox"]');
    await expect(checkboxes.first()).toBeVisible({ timeout: 10000 });
    await checkboxes.first().check();

    const assignBtn = assignBlock.getByRole("button", { name: /Assign to 1 student/ });
    await expect(assignBtn).toBeEnabled({ timeout: 10000 });
    await assignBtn.click();
    await expect(page.getByText("Fee structure assigned to students")).toBeVisible({
      timeout: 90000
    });
  });

  test("school fees collection page loads and student search works", async ({ page }) => {
    await page.goto("/admin/fees");
    await expect(page.getByRole("button", { name: /School fees/i })).toBeVisible({
      timeout: 10000
    });

    const searchInput = page.getByPlaceholder("Search student by name to collect fees...");
    await expect(searchInput).toBeVisible();
    await searchInput.fill("Student 1");
    await page.waitForTimeout(400);
    await expect(page.getByRole("button", { name: /Student 1/ }).first()).toBeVisible({
      timeout: 10000
    });
  });

  test("collect fees creates receipt", async ({ page, context }) => {
    await page.goto("/admin/fees");
    await page.getByPlaceholder("Search student by name to collect fees...").fill("Student 1");
    const resultBtn = page
      .locator(".absolute.z-20 button")
      .filter({ hasText: /^Student 1\b/ })
      .first();
    await expect(resultBtn).toBeVisible({ timeout: 10000 });
    await resultBtn.click();

    await expect(page.getByRole("heading", { name: "Student 1", level: 3 })).toBeVisible();
    await expect(page.getByText("Fee Ledger")).toBeVisible();
    await expect(page.locator('tbody input[type="checkbox"]').first()).toBeVisible({
      timeout: 15000
    });

    await page.locator('tbody input[type="checkbox"]').first().check();
    const popupPromise = context.waitForEvent("page");
    await page.getByRole("button", { name: "Collect & Print Receipt" }).click();
    const receiptPage = await popupPromise;
    await receiptPage.waitForLoadState("networkidle");

    await expect(receiptPage.getByText("BusTrack")).toBeVisible();
    await expect(receiptPage.getByText(/RCP-/)).toBeVisible();
  });

  test("outstanding page shows students with pending dues", async ({ page }) => {
    await page.goto("/admin/fees/outstanding");
    await expect(page.getByRole("heading", { name: "Outstanding School Fees" })).toBeVisible();
    await expect(page.getByText(/Total outstanding:/)).toBeVisible();

    const tableRows = page.locator("tbody tr");
    const rowCount = await tableRows.count();
    if (rowCount > 0) {
      await expect(tableRows.first()).toBeVisible();
    } else {
      await expect(page.getByText(/students with balance/i)).toBeVisible();
    }
  });
});
