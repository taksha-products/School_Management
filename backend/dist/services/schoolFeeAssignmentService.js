"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.previewAssignFeeStructure = previewAssignFeeStructure;
exports.executeAssignFeeStructure = executeAssignFeeStructure;
const mongoose_1 = require("mongoose");
const FeeStructure_1 = require("../models/FeeStructure");
const Student_1 = require("../models/Student");
const StudentFeeAssignment_1 = require("../models/StudentFeeAssignment");
const schoolFeeLedger_1 = require("../utils/schoolFeeLedger");
function parseAssignRequest(body) {
    const { feeStructureId, academicYear, grades, studentIds } = body;
    if (!feeStructureId || !mongoose_1.Types.ObjectId.isValid(feeStructureId)) {
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
            if (typeof id !== "string" || !mongoose_1.Types.ObjectId.isValid(id)) {
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
async function loadFeeStructure(organizationId, feeStructureId) {
    return FeeStructure_1.FeeStructure.findOne({
        _id: new mongoose_1.Types.ObjectId(feeStructureId),
        organizationId,
        isActive: true
    });
}
async function resolveTargetStudentIds(organizationId, input) {
    if (input.studentIds && input.studentIds.length > 0) {
        const objectIds = input.studentIds.map((id) => new mongoose_1.Types.ObjectId(id));
        const ownedCount = await Student_1.Student.countDocuments({
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
    const students = await Student_1.Student.find({
        organizationId,
        status: "active",
        ...gradeFilter
    }).select("_id");
    return { ok: true, studentIds: students.map((student) => student._id) };
}
async function partitionByExistingAssignment(organizationId, academicYear, studentIds) {
    if (studentIds.length === 0) {
        return { eligible: [], skipped: 0 };
    }
    const existing = await StudentFeeAssignment_1.StudentFeeAssignment.find({
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
async function previewAssignFeeStructure(organizationId, body) {
    const parsed = parseAssignRequest(body);
    if (!parsed.ok) {
        return { ok: false, message: parsed.message, status: 400 };
    }
    const orgObjectId = new mongoose_1.Types.ObjectId(organizationId);
    const feeStructure = await loadFeeStructure(orgObjectId, parsed.data.feeStructureId);
    if (!feeStructure) {
        return { ok: false, message: "Active fee structure not found", status: 404 };
    }
    const targets = await resolveTargetStudentIds(orgObjectId, parsed.data);
    if (!targets.ok) {
        return { ok: false, message: targets.message, status: 400 };
    }
    const { eligible, skipped } = await partitionByExistingAssignment(orgObjectId, parsed.data.academicYear, targets.studentIds);
    return {
        ok: true,
        preview: {
            total: targets.studentIds.length,
            toAssign: eligible.length,
            skipped
        }
    };
}
async function executeAssignFeeStructure(organizationId, body) {
    const parsed = parseAssignRequest(body);
    if (!parsed.ok) {
        return { ok: false, message: parsed.message, status: 400 };
    }
    const orgObjectId = new mongoose_1.Types.ObjectId(organizationId);
    const feeStructure = await loadFeeStructure(orgObjectId, parsed.data.feeStructureId);
    if (!feeStructure) {
        return { ok: false, message: "Active fee structure not found", status: 404 };
    }
    const targets = await resolveTargetStudentIds(orgObjectId, parsed.data);
    if (!targets.ok) {
        return { ok: false, message: targets.message, status: 400 };
    }
    const { eligible, skipped } = await partitionByExistingAssignment(orgObjectId, parsed.data.academicYear, targets.studentIds);
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
        const assignedResult = await (0, schoolFeeLedger_1.assignFeeStructureToStudents)(orgObjectId, feeStructure, eligible, parsed.data.academicYear);
        return {
            ok: true,
            result: {
                assigned: eligible.length,
                skipped,
                ledgerEntriesCreated: assignedResult.ledgerEntries
            }
        };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Failed to assign fee structure to students";
        return { ok: false, message, status: 500 };
    }
}
