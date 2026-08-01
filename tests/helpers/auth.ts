import { expect, type Page } from "@playwright/test";
import path from "path";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const speakeasy = require(path.join(process.cwd(), "backend", "node_modules", "speakeasy")) as {
  totp: (options: { secret: string; encoding: "base32" }) => string;
};

export type LoginRole = "superAdmin" | "orgAdmin" | "staff" | "parent";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

/** Seeded super-admin TOTP secret (see backend/src/seed.ts). */
const SUPER_ADMIN_TOTP_SECRET = "JBSWY3DPEHPK3PXP";

const credentials: Record<LoginRole, { email: string; password: string }> = {
  superAdmin: { email: "super@bustrack.com", password: "super123" },
  orgAdmin: { email: "admin@demoschool.com", password: "admin123" },
  staff: { email: "staff@demoschool.com", password: "staff123" },
  parent: { email: "parent@demoschool.com", password: "parent123" }
};

const dashboardPaths: Record<LoginRole, string> = {
  superAdmin: "/super/dashboard",
  orgAdmin: "/admin/dashboard",
  staff: "/staff/dashboard",
  parent: "/parent/dashboard"
};

const generateTotpCode = (secret: string): string =>
  speakeasy.totp({ secret, encoding: "base32" });

async function completeTwoFactorLogin(page: Page, role: LoginRole): Promise<void> {
  if (role !== "superAdmin") {
    return;
  }

  const code = generateTotpCode(SUPER_ADMIN_TOTP_SECRET);
  const verifyRes = await page.request.post(`${BASE_URL}/api/auth/verify-2fa`, {
    data: { code }
  });
  expect(verifyRes.ok()).toBeTruthy();
}

/** Re-activate Demo School if a prior E2E run deactivated it. */
async function ensureDemoSchoolActive(page: Page): Promise<void> {
  const loginRes = await page.request.post(`${BASE_URL}/api/auth/login`, {
    data: credentials.superAdmin
  });
  if (!loginRes.ok()) {
    return;
  }

  const loginBody = (await loginRes.json()) as { requires2FA?: boolean };
  if (loginBody.requires2FA) {
    await completeTwoFactorLogin(page, "superAdmin");
  }

  const orgsRes = await page.request.get(`${BASE_URL}/api/superadmin/organizations`, {
    params: { page: 1, limit: 100 }
  });
  if (!orgsRes.ok()) {
    return;
  }

  const orgsBody = (await orgsRes.json()) as {
    data: Array<{ _id: string; code: string; isActive: boolean }>;
  };
  const demo = orgsBody.data.find((o) => o.code === "demo-school");
  if (demo && !demo.isActive) {
    await page.request.put(`${BASE_URL}/api/superadmin/organizations/${demo._id}/status`, {
      data: { isActive: true }
    });
  }
}

/** Fast login via httpOnly session cookies (used in beforeEach hooks). */
export async function loginAs(page: Page, role: LoginRole): Promise<void> {
  if (role === "orgAdmin" || role === "staff") {
    await ensureDemoSchoolActive(page);
  }

  const response = await page.request.post(`${BASE_URL}/api/auth/login`, {
    data: credentials[role]
  });
  expect(response.ok()).toBeTruthy();

  const body = (await response.json()) as { requires2FA?: boolean };
  if (body.requires2FA) {
    await completeTwoFactorLogin(page, role);
  }

  await page.goto(dashboardPaths[role]);
  await expect(page).toHaveURL(new RegExp(dashboardPaths[role].replace(/\//g, "\\/")));
}

/** UI login flow with retry (used in auth redirect tests). */
export async function loginViaUi(page: Page, role: LoginRole): Promise<void> {
  const creds = credentials[role];
  const dashboardPath = dashboardPaths[role];
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await page.goto("/login");
      await page.waitForSelector('input[type="email"]', { timeout: 10000 });
      await page.fill('input[type="email"]', creds.email);
      await page.fill('input[type="password"]', creds.password);
      const [response] = await Promise.all([
        page.waitForResponse(
          (res) => res.url().includes("/api/auth/login") && res.request().method() === "POST"
        ),
        page.click('button[type="submit"]')
      ]);
      expect(response.ok()).toBeTruthy();

      const loginBody = (await response.json()) as { requires2FA?: boolean };
      if (loginBody.requires2FA) {
        await page.waitForSelector("#twofa-code", { timeout: 10000 });
        const code = generateTotpCode(SUPER_ADMIN_TOTP_SECRET);
        await page.fill("#twofa-code", code);
        const [verifyResponse] = await Promise.all([
          page.waitForResponse(
            (res) => res.url().includes("/api/auth/verify-2fa") && res.request().method() === "POST"
          ),
          page.click('button[type="submit"]')
        ]);
        expect(verifyResponse.ok()).toBeTruthy();
      }

      await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 15000 });
      await expect(page).toHaveURL(new RegExp(dashboardPath.replace(/\//g, "\\/")));
      return;
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError;
}

export async function loginAsOrgAdmin(page: Page): Promise<void> {
  await loginAs(page, "orgAdmin");
}

export async function loginAsSuperAdmin(page: Page): Promise<void> {
  await loginAs(page, "superAdmin");
}

/** Assert failed login via API (toast may disappear when axios interceptor redirects). */
export async function expectLoginError(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/login/);
}

export async function clearSession(page: Page): Promise<void> {
  await page.request.post(`${BASE_URL}/api/auth/logout`);
  await page.goto("/login");
}
