import { expect, test, type Page } from "@playwright/test";

import { clearSession, expectLoginError, loginAs, loginAsSuperAdmin } from "../helpers/auth";

async function closeCredentialsModal(page: Page): Promise<void> {
  const heading = page.getByRole("heading", { name: "Org Admin Credentials" });
  if (await heading.isVisible().catch(() => false)) {
    const dialog = page.getByRole("dialog").filter({ has: heading });
    await dialog.getByRole("button", { name: "Close", exact: true }).last().click();
    await expect(heading).toBeHidden({ timeout: 5000 });
  }
}

async function createTestOrganization(
  page: Page,
  orgName: string,
  adminEmail: string
): Promise<void> {
  await page.goto("/super/organizations");
  await page.waitForSelector("table tbody tr", { timeout: 15000 });
  await page.getByRole("button", { name: "Add Organization" }).click();
  const addDialog = page.getByRole("dialog").filter({
    has: page.getByRole("heading", { name: "Add Organization" })
  });
  await expect(addDialog).toBeVisible();
  await addDialog.getByPlaceholder("Name").fill(orgName);
  await addDialog.getByPlaceholder("Address").fill("123 Test Street");
  await addDialog.getByPlaceholder("Phone").fill("9876543210");
  await addDialog.getByPlaceholder("Email").fill(adminEmail);
  const [createResponse] = await Promise.all([
    page.waitForResponse(
      (res) =>
        res.url().includes("/api/superadmin/organizations") &&
        res.request().method() === "POST"
    ),
    addDialog.getByRole("button", { name: "Create" }).click()
  ]);
  expect(createResponse.ok()).toBeTruthy();
  await expect(page.getByRole("heading", { name: "Org Admin Credentials" })).toBeVisible({
    timeout: 10000
  });
  await closeCredentialsModal(page);
}

test.describe("Super admin", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, "superAdmin");
  });

  test("can create a new organization", async ({ page }) => {
    const orgName = `Test School ${Date.now()}`;
    await createTestOrganization(page, orgName, `admin${Date.now()}@testschool.com`);
  });

  test("new organization admin credentials are shown after creation", async ({ page }) => {
    const adminEmail = `cred${Date.now()}@test.com`;
    await page.goto("/super/organizations");
    await page.getByRole("button", { name: "Add Organization" }).click();
    await page.getByPlaceholder("Name").fill(`Credential Test School ${Date.now()}`);
    await page.getByPlaceholder("Email").fill(adminEmail);
    await page
      .getByRole("dialog")
      .filter({ has: page.getByRole("heading", { name: "Add Organization" }) })
      .getByRole("button", { name: "Create" })
      .click();

    await expect(page.getByRole("heading", { name: "Org Admin Credentials" })).toBeVisible();
    await expect(page.getByText(adminEmail)).toBeVisible();
    await expect(page.getByText("Temporary password:")).toBeVisible();
    await expect(page.getByRole("button", { name: "Copy password" })).toBeVisible();
  });

  test("can deactivate an organization", async ({ page }) => {
    const orgName = `Test School Deactivate ${Date.now()}`;
    await createTestOrganization(page, orgName, `deact${Date.now()}@test.com`);

    await page.goto("/super/dashboard");
    const orgRow = page.locator("tbody tr", { hasText: orgName });
    await expect(orgRow).toBeVisible({ timeout: 10000 });

    await orgRow.getByRole("button", { name: "Deactivate" }).click();
    await expect(orgRow.getByRole("button", { name: "Activate" })).toBeVisible({
      timeout: 10000
    });

    await orgRow.getByRole("button", { name: "Activate" }).click();
    await expect(orgRow.getByRole("button", { name: "Deactivate" })).toBeVisible({
      timeout: 10000
    });
  });

  test("deactivated org admin cannot login", async ({ page }) => {
    const orgName = `E2E Inactive Org ${Date.now()}`;
    const adminEmail = `inactive-${Date.now()}@e2e.test`;
    let tempPassword = "";

    await page.goto("/super/organizations");
    await page.getByRole("button", { name: "Add Organization" }).click();
    await page.getByPlaceholder("Name").fill(orgName);
    await page.getByPlaceholder("Email").fill(adminEmail);
    await page
      .getByRole("dialog")
      .filter({ has: page.getByRole("heading", { name: "Add Organization" }) })
      .getByRole("button", { name: "Create" })
      .click();
    const passwordCode = page.locator("code");
    await expect(passwordCode).toBeVisible();
    tempPassword = (await passwordCode.innerText()).trim();
    await closeCredentialsModal(page);

    await page.goto("/super/dashboard");
    const orgRow = page.locator("tbody tr", { hasText: orgName });
    await orgRow.getByRole("button", { name: "Deactivate" }).click();
    await expect(orgRow.getByText("Inactive")).toBeVisible({ timeout: 10000 });

    await clearSession(page);
    await page.goto("/login");
    await page.fill('input[type="email"]', adminEmail);
    await page.fill('input[type="password"]', tempPassword);
    const [response] = await Promise.all([
      page.waitForResponse((res) => res.url().includes("/api/auth/login")),
      page.click('button[type="submit"]')
    ]);
    expect(response.status()).toBe(401);
    await expectLoginError(page);

    await loginAsSuperAdmin(page);
    await page.goto("/super/dashboard");
    await orgRow.getByRole("button", { name: "Activate" }).click();
  });

  test("can view all users across organizations", async ({ page }) => {
    const findEmailOnList = async (email: string): Promise<void> => {
      await page.goto("/super/users");
      await expect(page.locator("tbody tr").first()).toBeVisible({ timeout: 15000 });
      const nextBtn = page.getByRole("button", { name: "Next" });
      for (let pageNo = 0; pageNo < 10; pageNo += 1) {
        const cell = page.getByRole("cell", { name: email });
        if ((await cell.count()) > 0) {
          await expect(cell.first()).toBeVisible();
          return;
        }
        if (!(await nextBtn.isEnabled())) {
          break;
        }
        await nextBtn.click();
        await page.waitForTimeout(400);
      }
      await expect(page.getByRole("cell", { name: email })).toBeVisible();
    };

    await findEmailOnList("super@bustrack.com");
    await findEmailOnList("admin@demoschool.com");
  });
});
