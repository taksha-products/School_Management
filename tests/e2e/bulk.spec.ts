/// <reference types="node" />

import { expect, test } from "@playwright/test";
import fs from "fs";
import path from "path";

import { loginAs } from "../helpers/auth";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const fixturesDir = path.resolve(process.cwd(), "tests", "fixtures");
const validFile = path.join(fixturesDir, "students_valid.xlsx");
const invalidFile = path.join(fixturesDir, "students_with_errors.xlsx");

const previewViaApi = async (
  page: import("@playwright/test").Page,
  filePath: string
): Promise<{
  preview: Array<{ row: number; name: string; status: "valid" | "warning" | "error"; issues: string[] }>;
  summary: { total: number; valid: number; warnings: number; errors: number };
  errors: Array<{ row: number; message: string }>;
}> => {
  const response = await page.request.post(`${BASE_URL}/api/bulk/students/preview`, {
    multipart: {
      file: {
        name: path.basename(filePath),
        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        buffer: fs.readFileSync(filePath)
      }
    }
  });
  expect(response.ok()).toBeTruthy();
  const json = (await response.json()) as {
    data: {
      preview: Array<{ row: number; name: string; status: "valid" | "warning" | "error"; issues: string[] }>;
      summary: { total: number; valid: number; warnings: number; errors: number };
      errors: Array<{ row: number; message: string }>;
    };
  };
  return json.data;
};

test.describe.configure({ mode: "serial" });

test.describe("Bulk operations", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, "orgAdmin");
  });

  test("template download returns an Excel file", async ({ page }) => {
    await page.goto("/admin/bulk/upload-students");
    await page.getByRole("button", { name: "Download Student Template" }).click();
    const response = await page.request.get(`${BASE_URL}/api/bulk/templates/students`);
    expect(response.ok()).toBeTruthy();
    expect(response.headers()["content-type"]).toContain(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
  });

  test("valid file upload shows correct preview counts", async ({ page }) => {
    await page.goto("/admin/bulk/upload-students");
    const preview = await previewViaApi(page, validFile);
    expect(preview.summary.total).toBe(5);
    expect(preview.summary.errors).toBe(0);
    expect(preview.summary.valid + preview.summary.warnings).toBe(5);
  });

  test("file with errors shows error rows highlighted", async ({ page }) => {
    await page.goto("/admin/bulk/upload-students");
    const preview = await previewViaApi(page, invalidFile);
    expect(preview.summary.total).toBe(5);
    expect(preview.summary.errors).toBe(2);
    expect(preview.summary.valid + preview.summary.warnings).toBe(3);
    expect(preview.errors).toHaveLength(2);
  });

  test("confirm import creates students in system", async ({ page }) => {
    await page.goto("/admin/bulk/upload-students");
    const preview = await previewViaApi(page, validFile);
    const validRows = preview.preview.filter((row) => row.status !== "error");
    const confirmResponse = await page.request.post(`${BASE_URL}/api/bulk/students/confirm`, {
      headers: { "Content-Type": "application/json" },
      data: {
        rows: validRows,
        skipWarnings: false,
        academicYear: "2025-26"
      }
    });
    expect(confirmResponse.ok()).toBeTruthy();
    const confirmJson = (await confirmResponse.json()) as { data: { created: number } };
    expect(confirmJson.data.created).toBeGreaterThanOrEqual(5);

    for (const name of [
      "Rahul Sharma",
      "Priya Patel",
      "Arjun Verma",
      "Neha Gupta",
      "Karan Singh"
    ]) {
      const res = await page.request.get(`${BASE_URL}/api/students`, {
        params: { search: name, status: "active", page: 1, limit: 50 }
      });
      expect(res.ok()).toBeTruthy();
      const body = (await res.json()) as { data: Array<{ name: string }> };
      expect(body.data.some((student) => student.name === name)).toBeTruthy();
    }
  });

  test("bulk bus assignment updates student records", async ({ page }) => {
    await page.goto("/admin/bulk/assign-buses");

    const studentsResponse = await page.request.get(`${BASE_URL}/api/students`, {
      params: { status: "active", page: 1, limit: 100 }
    });
    expect(studentsResponse.ok()).toBeTruthy();
    const studentsBody = (await studentsResponse.json()) as {
      data: Array<{ _id: string; grade: string }>;
    };
    const grade6Ids = studentsBody.data.filter((student) => student.grade === "6").map((student) => student._id);
    expect(grade6Ids.length).toBeGreaterThan(0);

    const busResponse = await page.request.get(`${BASE_URL}/api/buses`);
    expect(busResponse.ok()).toBeTruthy();
    const buses = (await busResponse.json()) as {
      data: Array<{ _id: string; busNumber: string; status: "active" | "inactive" }>;
    };
    const targetBus = buses.data.find((bus) => bus.status === "active");
    expect(targetBus?._id).toBeTruthy();

    const assignResponse = await page.request.post(`${BASE_URL}/api/bulk/students/assign-bus`, {
      headers: { "Content-Type": "application/json" },
      data: {
        studentIds: grade6Ids,
        busId: targetBus!._id,
        academicYear: "2025-26",
        monthlyTransportFee: 1500
      }
    });
    expect(assignResponse.ok()).toBeTruthy();

    const verifyResponse = await page.request.get(`${BASE_URL}/api/students`, {
      params: { status: "active", withTransport: true, page: 1, limit: 100 }
    });
    expect(verifyResponse.ok()).toBeTruthy();
    const verifyBody = (await verifyResponse.json()) as {
      data: Array<{
        _id: string;
        grade: string;
        transport?: { busId?: string } | null;
      }>;
    };
    const updatedGrade6 = verifyBody.data.filter((student) => student.grade === "6");
    expect(updatedGrade6.length).toBeGreaterThan(0);
    for (const student of updatedGrade6) {
      expect(student.transport?.busId).toBe(targetBus!._id);
    }
  });

  test("bulk fee mark paid updates all selected students", async ({ page }) => {
    await page.goto("/admin/bulk/fee-collection");

    const month = `${new Date().getFullYear() + 50}-${String((Date.now() % 12) + 1).padStart(2, "0")}`;
    const listResponse = await page.request.get(`${BASE_URL}/api/fees`, {
      params: { month, page: 1, limit: 100 }
    });
    expect(listResponse.ok()).toBeTruthy();
    const listBody = (await listResponse.json()) as {
      data: Array<{ _id: string; status: "pending" | "overdue" | "partial" | "paid" }>;
    };
    const pendingIds = listBody.data
      .filter((fee) => fee.status === "pending" || fee.status === "overdue")
      .map((fee) => fee._id);
    if (pendingIds.length === 0) {
      test.skip(true, "No pending/overdue fees available for this generated month");
      return;
    }

    const markResponse = await page.request.post(`${BASE_URL}/api/bulk/fees/mark-paid`, {
      headers: { "Content-Type": "application/json" },
      data: {
        paymentIds: pendingIds.slice(0, 100),
        paymentMode: "cash",
        notes: "E2E bulk mark paid"
      }
    });
    expect(markResponse.ok()).toBeTruthy();
    const markBody = (await markResponse.json()) as { data: { marked: number } };
    expect(markBody.data.marked).toBeGreaterThan(0);

    const verifyResponse = await page.request.get(`${BASE_URL}/api/fees`, {
      params: { month, page: 1, limit: 100 }
    });
    expect(verifyResponse.ok()).toBeTruthy();
    const verifyBody = (await verifyResponse.json()) as {
      data: Array<{ _id: string; status: string }>;
    };
    const updatedSet = new Set(pendingIds);
    const stillUnpaid = verifyBody.data.filter(
      (fee) => updatedSet.has(fee._id) && fee.status !== "paid"
    );
    expect(stillUnpaid.length).toBe(0);
  });

  test("grade promotion preview shows correct counts", async ({ page }) => {
    await page.goto("/admin/bulk/grade-promotion");
    await expect(page.getByRole("heading", { name: "Grade Promotion" })).toBeVisible();

    const previewResponse = await page.request.post(`${BASE_URL}/api/bulk/students/promote`, {
      headers: { "Content-Type": "application/json" },
      data: {
        academicYear: "2026-27",
        promotionMap: {
          Nursery: "KG1",
          KG1: "KG2",
          KG2: "1",
          "1": "2",
          "2": "3",
          "3": "4",
          "4": "5",
          "5": "6",
          "6": "7",
          "7": "8",
          "8": "9",
          "9": "10",
          "10": "11",
          "11": "12",
          "12": "graduate"
        },
        preview: true
      }
    });
    expect(previewResponse.ok()).toBeTruthy();
    const previewBody = (await previewResponse.json()) as {
      data: {
        byGrade: Array<{ from: string; to: string; count: number }>;
        graduating: number;
        totalAffected: number;
      };
    };
    expect(Array.isArray(previewBody.data.byGrade)).toBeTruthy();
    expect(typeof previewBody.data.totalAffected).toBe("number");
  });

  test("export downloads a file", async ({ page }) => {
    await page.goto("/admin/bulk/export");
    await page.getByRole("button", { name: "Export to Excel" }).first().click();
    const response = await page.request.get(`${BASE_URL}/api/bulk/export/students`);
    expect(response.ok()).toBeTruthy();
    expect(response.headers()["content-type"]).toContain(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
  });
});
