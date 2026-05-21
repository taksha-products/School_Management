import { expect, type Page } from "@playwright/test";

export type LoginRole = "superAdmin" | "orgAdmin" | "staff" | "parent";

const API_URL = process.env.API_URL ?? "http://localhost:5000";

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

/** Re-activate Demo School if a prior E2E run deactivated it. */
async function ensureDemoSchoolActive(page: Page): Promise<void> {
  const loginRes = await page.request.post(`${API_URL}/api/auth/login`, {
    data: credentials.superAdmin
  });
  if (!loginRes.ok()) {
    return;
  }
  const loginBody = (await loginRes.json()) as { data: { token: string } };
  const token = loginBody.data.token;
  const orgsRes = await page.request.get(`${API_URL}/api/superadmin/organizations`, {
    headers: { Authorization: `Bearer ${token}` },
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
    await page.request.put(`${API_URL}/api/superadmin/organizations/${demo._id}/status`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { isActive: true }
    });
  }
}

/** Fast login via API token (used in beforeEach hooks). */
export async function loginAs(page: Page, role: LoginRole): Promise<void> {
  if (role === "orgAdmin" || role === "staff") {
    await ensureDemoSchoolActive(page);
  }

  const response = await page.request.post(`${API_URL}/api/auth/login`, {
    data: credentials[role]
  });
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as { data: { token: string } };
  const token = body.data.token;

  await page.goto("/login");
  await page.evaluate((t) => localStorage.setItem("bustrack_token", t), token);
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
  await page.goto("/login");
  await page.evaluate(() => localStorage.removeItem("bustrack_token"));
}
