export type BulkPreviewRowStatus = "valid" | "warning" | "error";

export interface BulkStudentPreviewRow {
  row: number;
  name: string;
  grade: string;
  parentName: string;
  parentPhone: string;
  address?: string;
  academicYear: string;
  status: BulkPreviewRowStatus;
  issues: string[];
}

export interface BulkStudentPreviewResponse {
  preview: BulkStudentPreviewRow[];
  summary: {
    total: number;
    valid: number;
    warnings: number;
    errors: number;
  };
  errors: Array<{ row: number; message: string }>;
}

export interface BulkStudentConfirmResult {
  created: number;
  skipped: number;
  failed: number;
  failures: Array<{ row: number; name: string; reason: string }>;
}
