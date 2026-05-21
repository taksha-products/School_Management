"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";

import { BulkProgressStepper } from "@/components/shared/BulkProgressStepper";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { TableSkeleton } from "@/components/ui/TableSkeleton";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api";
import { downloadFromApi, downloadCsv } from "@/lib/fileDownload";
import type {
  BulkStudentConfirmResult,
  BulkStudentPreviewResponse,
  BulkStudentPreviewRow
} from "@/types/bulk";

const STEPS = ["Download & Upload", "Preview & Validate", "Import Results"];

const templateColumns = [
  { column: "Name", required: "Yes", format: "Text", example: "Rahul Sharma" },
  { column: "Grade", required: "Yes", format: "1-12/KG1/KG2/Nursery", example: "6" },
  { column: "Parent Name", required: "Yes", format: "Text", example: "Suresh Sharma" },
  { column: "Parent Phone", required: "Yes", format: "10 digits", example: "9876543210" },
  { column: "Address", required: "No", format: "Text", example: "123 MG Road, Bengaluru" },
  { column: "Academic Year", required: "Yes", format: "YYYY-YY", example: "2025-26" }
];

const UploadStudentsPage = (): JSX.Element => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { showToast } = useToast();

  const [step, setStep] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [previewData, setPreviewData] = useState<BulkStudentPreviewResponse | null>(null);
  const [confirmResult, setConfirmResult] = useState<BulkStudentConfirmResult | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [isConfirmLoading, setIsConfirmLoading] = useState(false);
  const [isTemplateLoading, setIsTemplateLoading] = useState(false);
  const [showValidRows, setShowValidRows] = useState(false);
  const [includeWarnings, setIncludeWarnings] = useState<Record<number, boolean>>({});

  const warningRows = useMemo(
    () => previewData?.preview.filter((row) => row.status === "warning") ?? [],
    [previewData]
  );
  const validRows = useMemo(
    () => previewData?.preview.filter((row) => row.status === "valid") ?? [],
    [previewData]
  );
  const errorRows = useMemo(
    () =>
      previewData?.preview.filter((row) => row.status === "error") ??
      previewData?.errors.map((e) => ({
        row: e.row,
        name: "—",
        issues: [e.message]
      })) ??
      [],
    [previewData]
  );

  const selectedWarningRows = warningRows.filter((row) => includeWarnings[row.row]);
  const rowsToConfirm = [...validRows, ...selectedWarningRows];

  const handleTemplateDownload = async (): Promise<void> => {
    try {
      setIsTemplateLoading(true);
      await downloadFromApi(
        "/api/bulk/templates/students",
        "student_upload_template.xlsx"
      );
      showToast("success", "Template downloaded");
    } catch {
      showToast("error", "Failed to download template");
    } finally {
      setIsTemplateLoading(false);
    }
  };

  const handleFileSelect = (nextFile: File | null): void => {
    if (!nextFile) return;
    const ext = nextFile.name.split(".").pop()?.toLowerCase();
    if (!ext || !["xlsx", "xls", "csv"].includes(ext)) {
      showToast("error", "Only .xlsx, .xls, .csv files are allowed");
      return;
    }
    if (nextFile.size > 5 * 1024 * 1024) {
      showToast("error", "Max file size is 5MB");
      return;
    }
    setFile(nextFile);
    setPreviewData(null);
    setConfirmResult(null);
    setIncludeWarnings({});
  };

  const previewUpload = async (): Promise<void> => {
    if (!file) {
      showToast("error", "Please select a file first");
      return;
    }
    try {
      setIsPreviewLoading(true);
      const formData = new FormData();
      formData.append("file", file);
      const res = await api.post<{ data: BulkStudentPreviewResponse }>(
        "/api/bulk/students/preview",
        formData,
        { headers: { "Content-Type": "multipart/form-data" } }
      );
      setPreviewData(res.data.data);
      setIncludeWarnings(
        Object.fromEntries(
          (res.data.data.preview ?? [])
            .filter((row) => row.status === "warning")
            .map((row) => [row.row, true])
        )
      );
      setStep(2);
      showToast("success", "Preview generated");
    } catch {
      showToast("error", "Preview failed. Please check file format.");
    } finally {
      setIsPreviewLoading(false);
    }
  };

  const confirmImport = async (): Promise<void> => {
    if (rowsToConfirm.length === 0) {
      showToast("error", "No valid rows selected for import");
      return;
    }
    const academicYear = rowsToConfirm[0]?.academicYear;
    if (!academicYear) {
      showToast("error", "Academic year missing in selected rows");
      return;
    }
    try {
      setIsConfirmLoading(true);
      const res = await api.post<{ data: BulkStudentConfirmResult }>(
        "/api/bulk/students/confirm",
        {
          rows: rowsToConfirm,
          skipWarnings: false,
          academicYear
        }
      );
      setConfirmResult(res.data.data);
      setStep(3);
      showToast("success", "Import completed");
    } catch {
      showToast("error", "Import failed");
    } finally {
      setIsConfirmLoading(false);
    }
  };

  const resetFlow = (): void => {
    setStep(1);
    setFile(null);
    setPreviewData(null);
    setConfirmResult(null);
    setIncludeWarnings({});
    setShowValidRows(false);
  };

  const downloadFailureReport = (): void => {
    if (!confirmResult?.failures.length) return;
    downloadCsv(
      `student_import_failures_${new Date().toISOString().slice(0, 10)}.csv`,
      ["Row", "Name", "Reason"],
      confirmResult.failures.map((f) => [f.row, f.name, f.reason])
    );
  };

  return (
    <PageWrapper title="Bulk Student Upload">
      <p className="mb-4 text-sm text-slate-600">
        Student uploads no longer include bus assignment. To register students for bus transport after
        upload, use Bulk Operations → Assign Buses or Manage Transport on each student.
      </p>
      <BulkProgressStepper steps={STEPS} currentStep={step} />

      {step === 1 && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card title="Download Template">
            <p className="mb-4 text-sm text-slate-600">
              Download the Excel template, fill it with your student data, and upload
              it here.
            </p>
            <Button onClick={handleTemplateDownload} disabled={isTemplateLoading}>
              {isTemplateLoading ? "Downloading..." : "Download Student Template"}
            </Button>

            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="text-left text-slate-500">
                  <tr>
                    <th>Column</th>
                    <th>Required</th>
                    <th>Format</th>
                    <th>Example</th>
                  </tr>
                </thead>
                <tbody>
                  {templateColumns.map((col) => (
                    <tr key={col.column} className="border-t border-slate-100">
                      <td className="py-2 font-medium">{col.column}</td>
                      <td>{col.required}</td>
                      <td>{col.format}</td>
                      <td>{col.example}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card title="Upload File">
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".xlsx,.xls,.csv"
              onChange={(event) => handleFileSelect(event.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              className="w-full rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 px-6 py-14 text-center"
              onClick={() => fileInputRef.current?.click()}
              onDrop={(e) => {
                e.preventDefault();
                handleFileSelect(e.dataTransfer.files?.[0] ?? null);
              }}
              onDragOver={(e) => e.preventDefault()}
            >
              <p className="text-sm font-medium text-slate-700">
                Drag & drop your Excel or CSV file here, or click to browse
              </p>
              <p className="mt-2 text-xs text-slate-500">
                Max 5MB · Up to 500 students
              </p>
            </button>

            {file && (
              <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
                <p className="font-medium text-slate-800">{file.name}</p>
                <p className="text-xs text-slate-600">
                  {(file.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
            )}

            <div className="mt-4">
              <Button onClick={previewUpload} disabled={!file || isPreviewLoading}>
                {isPreviewLoading ? "Validating rows..." : "Preview"}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {step === 2 && (
        <>
          {!previewData ? (
            <TableSkeleton rows={6} />
          ) : (
            <>
              <div className="grid gap-3 md:grid-cols-4">
                <Card>
                  <p className="text-xs uppercase text-slate-500">Total Rows</p>
                  <p className="text-2xl font-bold text-slate-900">{previewData.summary.total}</p>
                </Card>
                <Card>
                  <p className="text-xs uppercase text-slate-500">Valid</p>
                  <p className="text-2xl font-bold text-emerald-600">{previewData.summary.valid}</p>
                </Card>
                <Card>
                  <p className="text-xs uppercase text-slate-500">Warnings</p>
                  <p className="text-2xl font-bold text-amber-600">{previewData.summary.warnings}</p>
                </Card>
                <Card>
                  <p className="text-xs uppercase text-slate-500">Errors</p>
                  <p className="text-2xl font-bold text-rose-600">{previewData.summary.errors}</p>
                </Card>
              </div>

              {errorRows.length > 0 && (
                <Card title="Error Rows (will be skipped)">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[560px] text-sm">
                      <thead className="text-left text-slate-500">
                        <tr>
                          <th>Row</th>
                          <th>Name</th>
                          <th>Error</th>
                        </tr>
                      </thead>
                      <tbody>
                        {errorRows.map((row, idx) => (
                          <tr key={`${row.row}-${idx}`} className="border-t border-rose-100 bg-rose-50">
                            <td className="py-2">{row.row}</td>
                            <td>{"name" in row ? row.name : "—"}</td>
                            <td>{row.issues.join(", ")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}

              {warningRows.length > 0 && (
                <Card title="Warning Rows">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[680px] text-sm">
                      <thead className="text-left text-slate-500">
                        <tr>
                          <th>Include</th>
                          <th>Row</th>
                          <th>Name</th>
                          <th>Warning</th>
                        </tr>
                      </thead>
                      <tbody>
                        {warningRows.map((row) => (
                          <tr key={row.row} className="border-t border-primary-100 bg-primary-50">
                            <td className="py-2">
                              <input
                                type="checkbox"
                                checked={!!includeWarnings[row.row]}
                                onChange={(e) =>
                                  setIncludeWarnings((prev) => ({
                                    ...prev,
                                    [row.row]: e.target.checked
                                  }))
                                }
                              />
                            </td>
                            <td>{row.row}</td>
                            <td>{row.name}</td>
                            <td>{row.issues.join(", ")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}

              <Card>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-emerald-700">
                    {validRows.length} rows ready to import
                  </p>
                  <Button variant="secondary" onClick={() => setShowValidRows((v) => !v)}>
                    {showValidRows ? "Hide Valid Rows" : "Show Valid Rows"}
                  </Button>
                </div>
                {showValidRows && (
                  <div className="mt-3 max-h-72 overflow-auto rounded-lg border border-slate-200">
                    <table className="w-full min-w-[680px] text-sm">
                      <thead className="text-left text-slate-500">
                        <tr>
                          <th className="px-3 py-2">Row</th>
                          <th>Name</th>
                          <th>Grade</th>
                          <th>Parent</th>
                          <th>Phone</th>
                        </tr>
                      </thead>
                      <tbody>
                        {validRows.map((row) => (
                          <tr key={row.row} className="border-t border-slate-100">
                            <td className="px-3 py-2">{row.row}</td>
                            <td>{row.name}</td>
                            <td>{row.grade}</td>
                            <td>{row.parentName}</td>
                            <td>{row.parentPhone}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>

              <Card>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-slate-700">
                    Skip {errorRows.length} error rows and import {rowsToConfirm.length} students
                  </p>
                  <div className="flex gap-2">
                    <Button variant="secondary" onClick={() => setStep(1)}>
                      Back
                    </Button>
                    <Button onClick={confirmImport} disabled={rowsToConfirm.length === 0 || isConfirmLoading}>
                      {isConfirmLoading
                        ? "Importing..."
                        : `Import ${rowsToConfirm.length} students`}
                    </Button>
                  </div>
                </div>
              </Card>
            </>
          )}
        </>
      )}

      {step === 3 && confirmResult && (
        <Card>
          <h2 className="text-xl font-bold text-emerald-700">
            ✓ {confirmResult.created} students imported successfully
          </h2>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="text-xs uppercase text-slate-500">Created</p>
              <p className="text-2xl font-bold text-emerald-600">{confirmResult.created}</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="text-xs uppercase text-slate-500">Skipped</p>
              <p className="text-2xl font-bold text-amber-600">{confirmResult.skipped}</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="text-xs uppercase text-slate-500">Failed</p>
              <p className="text-2xl font-bold text-rose-600">{confirmResult.failed}</p>
            </div>
          </div>

          {confirmResult.failures.length > 0 && (
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="text-left text-slate-500">
                  <tr>
                    <th>Row</th>
                    <th>Name</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {confirmResult.failures.map((failure) => (
                    <tr key={`${failure.row}-${failure.name}`} className="border-t border-slate-100">
                      <td className="py-2">{failure.row}</td>
                      <td>{failure.name}</td>
                      <td>{failure.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-5 flex flex-wrap gap-2">
            <Button onClick={resetFlow}>Import More Students</Button>
            <Link href="/admin/students">
              <Button variant="secondary">View All Students</Button>
            </Link>
            {confirmResult.failures.length > 0 && (
              <Button variant="secondary" onClick={downloadFailureReport}>
                Download Failure Report
              </Button>
            )}
          </div>
        </Card>
      )}
    </PageWrapper>
  );
};

export default UploadStudentsPage;
