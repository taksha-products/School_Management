import { Types } from "mongoose";

import type { IFeeStructure } from "../models/FeeStructure";
import { FeeStructure } from "../models/FeeStructure";
import { Student } from "../models/Student";
import { StudentFeeAssignment } from "../models/StudentFeeAssignment";
import { assignFeeStructureToStudents } from "../utils/schoolFeeLedger";

export interface AssignFeeStructureRequest {
  feeStructureId: string;
  academicYear: string;
  grades?: string[];
  studentIds?: string[];
}

export interface AssignFeeStructurePreviewResult {
  total: number;
  toAssign: number;
  skipped: number;
}

export interface AssignFeeStructureResult {
  assigned: number;
  skipped: number;
  ledgerEntriesCreated: number;
}

function parseAssignRequest(body: AssignFeeStructureRequest): {
  ok: true;
  data: AssignFeeStructureRequest;
} | { ok: false; message: string } {
  const { feeStructureId, academicYear, grades, studentIds } = body;

  if (!feeStructureId || !Types.ObjectId.isValid(feeStructureId)) {
    return { ok: false, message: "feeStructureId is required" };
  }
  if (!academicYear || typeof academicYear !== "string" || !academicYear.trim()) {
    return { ok: false, message: "academicYear is required" };
  }

  const hasStudentIds = Array.isArray(studentIds) && studentIds.length > 0;
  const hasGrades = Array.isArray(grades) && grades.length > 0;

  if (!hasStudentIds && !hasGrades) {
    return { ok: false, message: "Either grades[] or studentIds[] is required" };
  }

  if (hasStudentIds) {
    for (const id of studentIds) {
      if (typeof id !== "string" || !Types.ObjectId.isValid(id)) {
        return { ok: false, message: "All studentIds must be valid MongoDB ObjectId strings" };
      }
    }
  }

  if (hasGrades) {
    for (const grade of grades) {
      if (typeof grade !== "string" || !grade.trim()) {
        return { ok: false, message: "All grades must be non-empty strings" };
      }
    }
  }

  return {
    ok: true,
    data: {
      feeStructureId,
      academicYear: academicYear.trim(),
      grades: hasGrades ? grades.map((grade) => grade.trim()) : undefined,
      studentIds: hasStudentIds ? studentIds : undefined
    }
  };
}

async function loadFeeStructure(
  organizationId: Types.ObjectId,
  feeStructureId: string
): Promise<IFeeStructure | null> {
  return FeeStructure.findOne({
    _id: new Types.ObjectId(feeStructureId),
    organizationId,
    isActive: true
  });
}

async function resolveTargetStudentIds(
  organizationId: Types.ObjectId,
  input: AssignFeeStructureRequest
): Promise<{ ok: true; studentIds: Types.ObjectId[] } | { ok: false; message: string }> {
  if (input.studentIds && input.studentIds.length > 0) {
    const objectIds = input.studentIds.map((id) => new Types.ObjectId(id));
    const ownedCount = await Student.countDocuments({
      _id: { $in: objectIds },
      organizationId,
      status: "active"
    });

    if (ownedCount !== objectIds.length) {
      return {
        ok: false,
        message: "One or more student IDs are invalid or do not belong to your organization"
      };
    }

    return { ok: true, studentIds: objectIds };
  }

  const grades = input.grades ?? [];
  const useAllGrades = grades.some((grade) => grade.toLowerCase() === "all");
  const gradeFilter = useAllGrades ? {} : { grade: { $in: grades } };

  const students = await Student.find({
    organizationId,
    status: "active",
    ...gradeFilter
  }).select("_id");

  return { ok: true, studentIds: students.map((student) => student._id) };
}

async function partitionByExistingAssignment(
  organizationId: Types.ObjectId,
  academicYear: string,
  studentIds: Types.ObjectId[]
): Promise<{ eligible: Types.ObjectId[]; skipped: number }> {
  if (studentIds.length === 0) {
    return { eligible: [], skipped: 0 };
  }

  const existing = await StudentFeeAssignment.find({
    organizationId,
    academicYear,
    studentId: { $in: studentIds },
    isActive: true
  }).select("studentId");

  const existingSet = new Set(existing.map((row) => String(row.studentId)));
  const eligible = studentIds.filter((id) => !existingSet.has(String(id)));

  return {
    eligible,
    skipped: studentIds.length - eligible.length
  };
}

export async function previewAssignFeeStructure(
  organizationId: string,
  body: AssignFeeStructureRequest
): Promise<
  | { ok: true; preview: AssignFeeStructurePreviewResult }
  | { ok: false; message: string; status: number }
> {
  const parsed = parseAssignRequest(body);
  if (!parsed.ok) {
    return { ok: false, message: parsed.message, status: 400 };
  }

  const orgObjectId = new Types.ObjectId(organizationId);
  const feeStructure = await loadFeeStructure(orgObjectId, parsed.data.feeStructureId);
  if (!feeStructure) {
    return { ok: false, message: "Active fee structure not found", status: 404 };
  }

  const targets = await resolveTargetStudentIds(orgObjectId, parsed.data);
  if (!targets.ok) {
    return { ok: false, message: targets.message, status: 400 };
  }

  const { eligible, skipped } = await partitionByExistingAssignment(
    orgObjectId,
    parsed.data.academicYear,
    targets.studentIds
  );

  return {
    ok: true,
    preview: {
      total: targets.studentIds.length,
      toAssign: eligible.length,
      skipped
    }
  };
}

export async function executeAssignFeeStructure(
  organizationId: string,
  body: AssignFeeStructureRequest
): Promise<
  | { ok: true; result: AssignFeeStructureResult }
  | { ok: false; message: string; status: number }
> {
  const parsed = parseAssignRequest(body);
  if (!parsed.ok) {
    return { ok: false, message: parsed.message, status: 400 };
  }

  const orgObjectId = new Types.ObjectId(organizationId);
  const feeStructure = await loadFeeStructure(orgObjectId, parsed.data.feeStructureId);
  if (!feeStructure) {
    return { ok: false, message: "Active fee structure not found", status: 404 };
  }

  const targets = await resolveTargetStudentIds(orgObjectId, parsed.data);
  if (!targets.ok) {
    return { ok: false, message: targets.message, status: 400 };
  }

  const { eligible, skipped } = await partitionByExistingAssignment(
    orgObjectId,
    parsed.data.academicYear,
    targets.studentIds
  );

  if (eligible.length === 0) {
    return {
      ok: true,
      result: {
        assigned: 0,
        skipped,
        ledgerEntriesCreated: 0
      }
    };
  }

  try {
    const assignedResult = await assignFeeStructureToStudents(
      orgObjectId,
      feeStructure,
      eligible,
      parsed.data.academicYear
    );

    return {
      ok: true,
      result: {
        assigned: eligible.length,
        skipped,
        ledgerEntriesCreated: assignedResult.ledgerEntries
      }
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to assign fee structure to students";
    return { ok: false, message, status: 500 };
  }
}
