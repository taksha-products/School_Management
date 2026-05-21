import { expect, test, type Page } from "@playwright/test";

import { loginAs } from "../helpers/auth";

/** Seed creates transport fee rows for Apr–Aug 2025 (not the current calendar month). */
const SEEDED_MONTHS = ["2025-04", "2025-05", "2025-06", "2025-07", "2025-08"];

async function openTransportFeesTab(page: Page): Promise<void> {
  await page.goto("/admin/fees?tab=transport");
  await expect(page.getByRole("heading", { name: "Fees" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Transport fees/i })).toBeVisible();
  await page.waitForSelector('input[type="month"]', { timeout: 15000 });
}

async function selectTransportMonth(page: Page, month: string): Promise<void> {
  const monthInput = page.locator('input[type="month"]');
  await monthInput.fill(month);
  await expect(monthInput).toHaveValue(month);
  await page.waitForSelector("table tbody tr", { timeout: 15000 });
}

/** Pick a seeded month that has at least one unpaid transport fee row. */
async function selectMonthWithUnpaidFees(page: Page): Promise<string | null> {
  for (const month of SEEDED_MONTHS) {
    await selectTransportMonth(page, month);
    if ((await unpaidRow(page).count()) > 0) {
      return month;
    }
  }
  return null;
}

function unpaidRow(page: Page) {
  return page.locator("tbody tr").filter({
    has: page.locator("span.bg-gray-100, span.bg-red-100")
  });
}

async function firstUnpaidRow(page: Page) {
  const row = unpaidRow(page).first();
  await expect(row).toBeVisible();
  return row;
}

/** Paid and partial payments both enable Print Receipt (see TransportFeesView). */
function receiptEnabledRow(page: Page) {
  return page.locator("tbody tr").filter({
    has: page.locator('button:has-text("Print Receipt"):not(.cursor-not-allowed)')
  });
}

test.describe("Transport fee collection", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, "orgAdmin");
    await openTransportFeesTab(page);
  });

  test("transport fees tab loads with month selector", async ({ page }) => {
    const month = SEEDED_MONTHS[SEEDED_MONTHS.length - 1];
    await selectTransportMonth(page, month);
    const monthInput = page.locator('input[type="month"]');
    await expect(monthInput).toBeVisible();
    await expect(monthInput).toHaveValue(month);
    await expect(
      page.getByText(new RegExp(`Showing transport-registered students for ${month}`, "i"))
    ).toBeVisible();
  });

  test("transport fees page shows student list", async ({ page }) => {
    await selectTransportMonth(page, SEEDED_MONTHS[0]);
    const rows = page.locator("table tbody tr");
    await expect(rows.first()).toBeVisible();
    expect(await rows.count()).toBeGreaterThan(0);
  });

  test("mark student as paid updates status to Paid", async ({ page }) => {
    if (!(await selectMonthWithUnpaidFees(page))) {
      test.skip();
    }
    const row = await firstUnpaidRow(page);
    const studentName = (await row.locator("td").first().innerText()).trim();

    await row.getByRole("button", { name: "Mark as Paid" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.locator('[role="dialog"] input[type="number"]').fill("1500");
    await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes("/api/fees/record") && r.request().method() === "POST" && r.ok()
      ),
      page.getByRole("dialog").getByRole("button", { name: "Submit" }).click()
    ]);
    await expect(page.getByText("Payment recorded")).toBeVisible();
    await expect(page.getByRole("dialog")).toBeHidden({ timeout: 10000 });
    await expect(
      page.getByRole("row", { name: new RegExp(`${studentName}.*paid`, "i") }).first()
    ).toBeVisible({ timeout: 15000 });
  });

  test("partial payment shows Partial badge", async ({ page }) => {
    if (!(await selectMonthWithUnpaidFees(page))) {
      test.skip();
    }
    const row = await firstUnpaidRow(page);
    const studentName = (await row.locator("td").first().innerText()).trim();

    await row.getByRole("button", { name: "Mark as Paid" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.locator('[role="dialog"] input[type="number"]').fill("750");
    await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes("/api/fees/record") && r.request().method() === "POST" && r.ok()
      ),
      page.getByRole("dialog").getByRole("button", { name: "Submit" }).click()
    ]);
    await expect(page.getByText("Payment recorded")).toBeVisible();
    await expect(page.getByRole("dialog")).toBeHidden({ timeout: 10000 });
    await expect(
      page.getByRole("row", { name: new RegExp(`${studentName}.*750.*partial`, "i") }).first()
    ).toBeVisible({ timeout: 15000 });
  });

  test("print receipt button disabled for pending students", async ({ page }) => {
    if (!(await selectMonthWithUnpaidFees(page))) {
      test.skip();
    }
    const row = await firstUnpaidRow(page);

    const receiptBtn = row.getByRole("button", { name: "Print Receipt" });
    await expect(receiptBtn).toHaveClass(/cursor-not-allowed/);
  });

  test("print receipt button enabled for paid students", async ({ page }) => {
    for (const month of SEEDED_MONTHS) {
      await selectTransportMonth(page, month);
      if ((await receiptEnabledRow(page).count()) > 0) {
        break;
      }
    }
    const row = receiptEnabledRow(page).first();
    if ((await row.count()) === 0) {
      test.skip();
    }

    const receiptBtn = row.getByRole("button", { name: "Print Receipt" });
    await expect(receiptBtn).toHaveClass(/bg-primary/);
    await expect(receiptBtn).not.toHaveClass(/cursor-not-allowed/);
  });

  test("receipt page shows correct student info", async ({ page, context }) => {
    for (const month of SEEDED_MONTHS) {
      await selectTransportMonth(page, month);
      if ((await receiptEnabledRow(page).count()) > 0) {
        break;
      }
    }
    const row = receiptEnabledRow(page).first();
    if ((await row.count()) === 0) {
      test.skip();
    }

    const studentName = (await row.locator("td").first().innerText()).trim();

    const [receiptPage] = await Promise.all([
      context.waitForEvent("page"),
      row.getByRole("button", { name: "Print Receipt" }).click()
    ]);

    await receiptPage.waitForLoadState("networkidle");
    await expect(receiptPage.getByText(studentName)).toBeVisible();
    await expect(receiptPage.getByText("BusTrack")).toBeVisible();
  });

  test("bus filter narrows student list", async ({ page }) => {
    await selectTransportMonth(page, SEEDED_MONTHS[0]);
    const allRows = await page.locator("table tbody tr").count();
    expect(allRows).toBeGreaterThan(0);

    await page.locator("select").first().selectOption({ label: "Bus 1" });
    await page.waitForTimeout(800);

    const filteredRows = await page.locator("table tbody tr").count();
    expect(filteredRows).toBeGreaterThan(0);
    expect(filteredRows).toBeLessThanOrEqual(allRows);
  });
});
