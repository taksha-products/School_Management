"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const mongoose_1 = require("mongoose");
const auth_1 = require("../middleware/auth");
const featureFlag_1 = require("../middleware/featureFlag");
const orgScope_1 = require("../middleware/orgScope");
const requireOrgScope_1 = require("../middleware/requireOrgScope");
const roleCheck_1 = require("../middleware/roleCheck");
const upload_1 = require("../middleware/upload");
const Bus_1 = require("../models/Bus");
const Expense_1 = require("../models/Expense");
const FeeLedger_1 = require("../models/FeeLedger");
const FeePayment_1 = require("../models/FeePayment");
const FeeStructure_1 = require("../models/FeeStructure");
const Organization_1 = require("../models/Organization");
const Student_1 = require("../models/Student");
const StudentTransport_1 = require("../models/StudentTransport");
const StudentFeeAssignment_1 = require("../models/StudentFeeAssignment");
const asyncHandler_1 = require("../utils/asyncHandler");
const busCapacity_1 = require("../utils/busCapacity");
const excelParser_1 = require("../utils/excelParser");
const orgFilter_1 = require("../utils/orgFilter");
const orgGradeConfig_1 = require("../utils/orgGradeConfig");
const schoolFeeLedger_1 = require("../utils/schoolFeeLedger");
const schoolFeeService_1 = require("../services/schoolFeeService");
const bulkRouter = (0, express_1.Router)();
const bulkGuard = [
    auth_1.auth,
    orgScope_1.orgScope,
    requireOrgScope_1.requireOrgScope,
    roleCheck_1.canAccessOrg,
    (0, featureFlag_1.requireFeature)("bulkOperations"),
    (0, roleCheck_1.isOrgAdminOrStaff)("canManageStudents")
];
const buildStudentTemplateHeaders = (orgConfig) => {
    const gradeExample = orgConfig.grades[0]?.label ?? "6";
    const includeSection = (0, orgGradeConfig_1.orgHasAnySections)(orgConfig);
    const headers = [
        { key: "name", header: "Name", example: "Rahul Sharma" },
        { key: "grade", header: "Grade", example: gradeExample },
        ...(includeSection
            ? [{ key: "section", header: "Section", example: orgConfig.grades[0]?.sections[0] ?? "A" }]
            : []),
        { key: "parentName", header: "Parent Name", example: "Suresh Sharma" },
        { key: "parentPhone", header: "Parent Phone", example: "9876543210" },
        { key: "address", header: "Address", example: "123 MG Road, Bengaluru" },
        { key: "academicYear", header: "Academic Year", example: "2025-26" }
    ];
    return headers;
};
const transportTemplateHeaders = [
    { key: "studentName", header: "Student Name", example: "Rahul Sharma" },
    { key: "grade", header: "Grade", example: "6" },
    { key: "busNumber", header: "Bus Number", example: "Bus 1" },
    { key: "pickupStop", header: "Pickup Stop", example: "Koramangala" },
    { key: "dropStop", header: "Drop Stop", example: "Koramangala" },
    { key: "monthlyFee", header: "Monthly Fee", example: "1500" },
    { key: "effectiveFrom", header: "Effective From", example: "2025-04-01" }
];
const trimString = (value) => String(value ?? "").trim();
const toDateStamp = () => new Date().toISOString().slice(0, 10);
const runUploadMemory = (req, res) => new Promise((resolve, reject) => {
    (0, upload_1.uploadMemory)(req, res, (error) => {
        if (error) {
            reject(error);
            return;
        }
        resolve();
    });
});
const getOrgGradeConfigById = async (orgId) => {
    const org = await Organization_1.Organization.findById(orgId).select("institutionType grades");
    if (!org) {
        throw new Error("Organization not found");
    }
    return (0, orgGradeConfig_1.resolveOrgGradeConfig)(org);
};
const parseStudentImportRow = (row, rowNumber, orgConfig) => {
    const validGrades = (0, orgGradeConfig_1.buildValidGradeSet)(orgConfig.grades);
    const name = trimString(row.Name);
    const grade = trimString(row.Grade);
    const section = trimString(row.Section);
    const parentName = trimString(row["Parent Name"]);
    const parentPhone = trimString(row["Parent Phone"]);
    const address = trimString(row.Address);
    const academicYear = trimString(row["Academic Year"]);
    if (!name || name.length > 100) {
        throw new Error("Name is required and must be less than 100 characters");
    }
    if (!grade || !validGrades.has(grade)) {
        throw new Error((0, orgGradeConfig_1.formatGradeValidationMessage)(orgConfig.grades));
    }
    const gradeSections = (0, orgGradeConfig_1.getSectionsForGrade)(orgConfig, grade);
    if (gradeSections.length > 0) {
        if (!section) {
            throw new Error(`Section is required for grade ${grade}`);
        }
        if (!gradeSections.includes(section)) {
            throw new Error((0, orgGradeConfig_1.formatSectionValidationMessage)(gradeSections));
        }
    }
    else if (section) {
        throw new Error(`Section is not used for grade ${grade}`);
    }
    if (!parentName) {
        throw new Error("Parent Name is required");
    }
    if (!/^\d{10}$/.test(parentPhone)) {
        throw new Error("Parent Phone must be 10 digits");
    }
    if (!/^\d{4}-\d{2}$/.test(academicYear)) {
        throw new Error("Academic Year must be in YYYY-YY format");
    }
    return {
        row: rowNumber,
        name,
        grade,
        section: gradeSections.length > 0 ? section : undefined,
        parentName,
        parentPhone,
        address: address || undefined,
        academicYear
    };
};
const parseTransportImportRow = (row, rowNumber, busMap, orgConfig) => {
    const validGrades = (0, orgGradeConfig_1.buildValidGradeSet)(orgConfig.grades);
    const studentName = trimString(row["Student Name"]);
    const grade = trimString(row.Grade);
    const busNumber = trimString(row["Bus Number"]);
    const pickupStop = trimString(row["Pickup Stop"]);
    const dropStop = trimString(row["Drop Stop"]);
    const monthlyFeeRaw = trimString(row["Monthly Fee"]);
    const effectiveFromRaw = trimString(row["Effective From"]);
    if (!studentName) {
        throw new Error("Student Name is required");
    }
    if (!grade || !validGrades.has(grade)) {
        throw new Error((0, orgGradeConfig_1.formatGradeValidationMessage)(orgConfig.grades));
    }
    if (!busNumber || !busMap.has(busNumber)) {
        throw new Error(busNumber ? `${busNumber} not found` : "Bus Number is required");
    }
    const monthlyFee = monthlyFeeRaw ? Number(monthlyFeeRaw) : 1500;
    if (Number.isNaN(monthlyFee) || monthlyFee < 0) {
        throw new Error("Monthly Fee must be a number >= 0");
    }
    let effectiveFrom = new Date().toISOString().slice(0, 10);
    if (effectiveFromRaw) {
        const parsed = new Date(effectiveFromRaw);
        if (Number.isNaN(parsed.getTime())) {
            throw new Error("Effective From must be a valid date");
        }
        effectiveFrom = parsed.toISOString().slice(0, 10);
    }
    return {
        row: rowNumber,
        studentName,
        grade,
        busNumber,
        busId: busMap.get(busNumber),
        pickupStop: pickupStop || undefined,
        dropStop: dropStop || undefined,
        monthlyFee,
        effectiveFrom
    };
};
const getOrgName = async (orgId) => {
    const org = await Organization_1.Organization.findById(orgId).select("name");
    return org?.name ? `${org.name} (${toDateStamp()})` : `TAKSHA Export (${toDateStamp()})`;
};
bulkRouter.get("/templates/students", ...bulkGuard, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const authReq = req;
    const orgId = (0, orgFilter_1.getScopedOrganizationId)(authReq, res);
    const orgConfig = await getOrgGradeConfigById(orgId);
    const file = (0, excelParser_1.generateTemplate)(buildStudentTemplateHeaders(orgConfig), "Students Template");
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", 'attachment; filename="student_upload_template.xlsx"');
    res.send(file);
}));
bulkRouter.post("/students/preview", ...bulkGuard, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    await runUploadMemory(req, res);
    const authReq = req;
    if (!authReq.file?.buffer) {
        res.status(400).json({ success: false, data: null, message: "File is required" });
        return;
    }
    const orgId = (0, orgFilter_1.getScopedOrganizationId)(authReq, res);
    const orgConfig = await getOrgGradeConfigById(orgId);
    const parsed = (0, excelParser_1.parseExcelBuffer)(authReq.file.buffer, (row, rowIndex) => parseStudentImportRow(row, rowIndex, orgConfig));
    const existingStudents = await Student_1.Student.find({
        organizationId: new mongoose_1.Types.ObjectId(orgId)
    }).select("name grade");
    const dbDuplicateSet = new Set(existingStudents.map((student) => `${student.name.toLowerCase()}|${student.grade}`));
    const fileDuplicateSet = new Set();
    const preview = parsed.rows.map((item) => {
        const duplicateKey = `${item.name.toLowerCase()}|${item.grade}|${item.parentPhone}`;
        const issues = [];
        let status = "valid";
        if (fileDuplicateSet.has(duplicateKey)) {
            status = "error";
            issues.push("Duplicate within file");
        }
        else {
            fileDuplicateSet.add(duplicateKey);
        }
        const dbKey = `${item.name.toLowerCase()}|${item.grade}`;
        if (dbDuplicateSet.has(dbKey) && status !== "error") {
            status = "warning";
            issues.push("Possible duplicate");
        }
        return {
            ...item,
            status,
            issues
        };
    });
    const errors = [
        ...parsed.errors,
        ...preview
            .filter((row) => row.status === "error")
            .map((row) => ({ row: row.row, message: row.issues.join(", ") }))
    ];
    const summary = {
        total: parsed.totalRows,
        valid: preview.filter((row) => row.status === "valid").length,
        warnings: preview.filter((row) => row.status === "warning").length,
        errors: errors.length
    };
    res.json({
        success: true,
        data: {
            preview,
            summary,
            errors
        }
    });
}));
bulkRouter.post("/students/confirm", ...bulkGuard, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const authReq = req;
    const orgId = (0, orgFilter_1.getScopedOrganizationId)(authReq, res);
    const { rows, skipWarnings, academicYear } = req.body;
    if (!Array.isArray(rows) || rows.length === 0 || !academicYear) {
        res.status(400).json({
            success: false,
            data: null,
            message: "rows[] and academicYear are required"
        });
        return;
    }
    const orgConfig = await getOrgGradeConfigById(orgId);
    const eligibleRows = rows.filter((row) => row.status === "valid" || (!skipWarnings && row.status === "warning"));
    const failures = [];
    const toInsert = eligibleRows
        .map((row) => {
        try {
            const validated = parseStudentImportRow({
                Name: row.name,
                Grade: row.grade,
                Section: row.section ?? "",
                "Parent Name": row.parentName,
                "Parent Phone": row.parentPhone,
                Address: row.address ?? "",
                "Academic Year": academicYear
            }, row.row, orgConfig);
            return {
                organizationId: new mongoose_1.Types.ObjectId(orgId),
                name: validated.name,
                grade: validated.grade,
                section: validated.section,
                parentName: validated.parentName,
                parentPhone: validated.parentPhone,
                address: validated.address,
                status: "active",
                academicYear
            };
        }
        catch (error) {
            failures.push({
                row: row.row,
                name: row.name,
                reason: error instanceof Error ? error.message : "Invalid row"
            });
            return null;
        }
    })
        .filter((item) => item !== null);
    if (toInsert.length === 0) {
        res.json({
            success: true,
            data: { created: 0, skipped: rows.length, failed: failures.length, failures }
        });
        return;
    }
    let insertedDocsCount = 0;
    try {
        const inserted = await Student_1.Student.insertMany(toInsert, { ordered: false });
        insertedDocsCount = inserted.length;
    }
    catch (error) {
        const bulkError = error;
        insertedDocsCount = bulkError.insertedDocs?.length ?? 0;
        for (const writeError of bulkError.writeErrors ?? []) {
            const payload = toInsert[writeError.index];
            failures.push({
                row: eligibleRows[writeError.index]?.row ?? writeError.index + 2,
                name: payload?.name ?? "Unknown",
                reason: writeError.err?.errmsg ?? writeError.errmsg ?? "Insert failed"
            });
        }
    }
    res.json({
        success: true,
        data: {
            created: insertedDocsCount,
            skipped: rows.length - eligibleRows.length,
            failed: failures.length,
            failures
        }
    });
}));
bulkRouter.post("/students/assign-bus", ...bulkGuard, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const authReq = req;
    const orgId = (0, orgFilter_1.getScopedOrganizationId)(authReq, res);
    const { studentIds, busId, academicYear, monthlyTransportFee, pickupStop, effectiveFrom } = req.body;
    if (!Array.isArray(studentIds) || studentIds.length === 0 || !busId || !academicYear) {
        res.status(400).json({
            success: false,
            data: null,
            message: "studentIds[], busId, and academicYear are required"
        });
        return;
    }
    if (studentIds.length > 200) {
        res.status(400).json({ success: false, data: null, message: "Maximum 200 students per request" });
        return;
    }
    if (!mongoose_1.Types.ObjectId.isValid(busId)) {
        res.status(400).json({ success: false, data: null, message: "Invalid busId" });
        return;
    }
    const bus = await Bus_1.Bus.findOne({
        _id: busId,
        organizationId: new mongoose_1.Types.ObjectId(orgId),
        status: "active"
    });
    if (!bus) {
        res.status(404).json({ success: false, data: null, message: "Active bus not found for organization" });
        return;
    }
    const objectIds = studentIds.filter(mongoose_1.Types.ObjectId.isValid).map((id) => new mongoose_1.Types.ObjectId(id));
    const students = await Student_1.Student.find({
        _id: { $in: objectIds },
        organizationId: new mongoose_1.Types.ObjectId(orgId)
    }).select("_id");
    const foundIds = new Set(students.map((student) => student._id.toString()));
    const notFound = objectIds.filter((id) => !foundIds.has(id.toString())).length;
    const activeOnBus = await (0, busCapacity_1.countActiveStudentsOnBus)(orgId, bus._id);
    const existingTransports = await StudentTransport_1.StudentTransport.find({
        organizationId: new mongoose_1.Types.ObjectId(orgId),
        studentId: { $in: students.map((student) => student._id) },
        status: "active"
    }).select("studentId");
    const studentsWithTransport = new Set(existingTransports.map((transport) => transport.studentId.toString()));
    const seatsNeeded = students.filter((student) => !studentsWithTransport.has(student._id.toString())).length;
    if ((0, busCapacity_1.wouldExceedBusCapacity)(bus.capacity, activeOnBus, seatsNeeded)) {
        res.status(400).json({
            success: false,
            data: null,
            message: (0, busCapacity_1.busCapacityExceededMessage)(bus.busNumber, bus.capacity, activeOnBus, seatsNeeded)
        });
        return;
    }
    const fee = Number(monthlyTransportFee ?? 1500);
    const effectiveFromDate = effectiveFrom ? new Date(effectiveFrom) : new Date();
    let created = 0;
    let skipped = 0;
    const failures = [];
    for (const student of students) {
        if (studentsWithTransport.has(student._id.toString())) {
            skipped += 1;
            failures.push({
                studentId: student._id.toString(),
                reason: "Student already has active transport"
            });
            continue;
        }
        await StudentTransport_1.StudentTransport.create({
            organizationId: new mongoose_1.Types.ObjectId(orgId),
            studentId: student._id,
            busId: bus._id,
            monthlyTransportFee: fee,
            pickupStop: pickupStop?.trim(),
            effectiveFrom: effectiveFromDate,
            effectiveTo: null,
            status: "active",
            academicYear,
            addedBy: authReq.user?.userId ? new mongoose_1.Types.ObjectId(authReq.user.userId) : undefined
        });
        created += 1;
    }
    res.json({
        success: true,
        data: {
            created,
            skipped,
            failed: notFound + failures.length,
            failures
        },
        message: "Transport assignment completed"
    });
}));
bulkRouter.post("/students/assign-bus-by-grade", ...bulkGuard, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const authReq = req;
    const orgId = (0, orgFilter_1.getScopedOrganizationId)(authReq, res);
    const { grade, section, busId, academicYear, monthlyTransportFee, pickupStop, effectiveFrom } = req.body;
    if (!grade || !busId || !academicYear || !mongoose_1.Types.ObjectId.isValid(busId)) {
        res.status(400).json({
            success: false,
            data: null,
            message: "grade, academicYear, and valid busId are required"
        });
        return;
    }
    const bus = await Bus_1.Bus.findOne({
        _id: busId,
        organizationId: new mongoose_1.Types.ObjectId(orgId),
        status: "active"
    });
    if (!bus) {
        res.status(404).json({ success: false, data: null, message: "Active bus not found" });
        return;
    }
    const studentFilter = {
        organizationId: new mongoose_1.Types.ObjectId(orgId),
        status: "active",
        grade
    };
    const sectionFilter = typeof section === "string" ? section.trim() : "";
    if (sectionFilter) {
        studentFilter.section = sectionFilter;
    }
    const gradeStudents = await Student_1.Student.find(studentFilter).select("_id");
    const activeOnBus = await (0, busCapacity_1.countActiveStudentsOnBus)(orgId, bus._id);
    const existingTransports = await StudentTransport_1.StudentTransport.find({
        organizationId: new mongoose_1.Types.ObjectId(orgId),
        studentId: { $in: gradeStudents.map((student) => student._id) },
        status: "active"
    }).select("studentId");
    const studentsWithTransport = new Set(existingTransports.map((transport) => transport.studentId.toString()));
    const seatsNeeded = gradeStudents.filter((student) => !studentsWithTransport.has(student._id.toString())).length;
    if ((0, busCapacity_1.wouldExceedBusCapacity)(bus.capacity, activeOnBus, seatsNeeded)) {
        res.status(400).json({
            success: false,
            data: null,
            message: (0, busCapacity_1.busCapacityExceededMessage)(bus.busNumber, bus.capacity, activeOnBus, seatsNeeded)
        });
        return;
    }
    const fee = Number(monthlyTransportFee ?? 1500);
    const effectiveFromDate = effectiveFrom ? new Date(effectiveFrom) : new Date();
    let created = 0;
    let skipped = 0;
    for (const student of gradeStudents) {
        if (studentsWithTransport.has(student._id.toString())) {
            skipped += 1;
            continue;
        }
        await StudentTransport_1.StudentTransport.create({
            organizationId: new mongoose_1.Types.ObjectId(orgId),
            studentId: student._id,
            busId: bus._id,
            monthlyTransportFee: fee,
            pickupStop: pickupStop?.trim(),
            effectiveFrom: effectiveFromDate,
            status: "active",
            academicYear
        });
        created += 1;
    }
    res.json({ success: true, data: { created, skipped } });
}));
bulkRouter.get("/templates/transport", (0, asyncHandler_1.asyncHandler)(async (_req, res) => {
    const file = (0, excelParser_1.generateTemplate)(transportTemplateHeaders, "Transport Template");
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", 'attachment; filename="transport_upload_template.xlsx"');
    res.send(file);
}));
bulkRouter.post("/transport/preview", ...bulkGuard, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    await runUploadMemory(req, res);
    const authReq = req;
    if (!authReq.file?.buffer) {
        res.status(400).json({ success: false, data: null, message: "File is required" });
        return;
    }
    const orgId = (0, orgFilter_1.getScopedOrganizationId)(authReq, res);
    const orgConfig = await getOrgGradeConfigById(orgId);
    const buses = await Bus_1.Bus.find({
        organizationId: new mongoose_1.Types.ObjectId(orgId),
        status: "active"
    }).select("busNumber");
    const busMap = new Map(buses.map((bus) => [bus.busNumber, bus._id.toString()]));
    const parsed = (0, excelParser_1.parseExcelBuffer)(authReq.file.buffer, (row, rowIndex) => parseTransportImportRow(row, rowIndex, busMap, orgConfig));
    const orgStudents = await Student_1.Student.find({
        organizationId: new mongoose_1.Types.ObjectId(orgId),
        status: "active"
    }).select("name grade _id");
    const activeTransports = await StudentTransport_1.StudentTransport.find({
        organizationId: new mongoose_1.Types.ObjectId(orgId),
        status: "active"
    }).select("studentId");
    const activeStudentIds = new Set(activeTransports.map((t) => String(t.studentId)));
    const preview = parsed.rows.map((item) => {
        const matches = orgStudents.filter((s) => s.name.toLowerCase() === item.studentName.toLowerCase() && s.grade === item.grade);
        const issues = [];
        let status = "valid";
        if (matches.length === 0) {
            status = "error";
            issues.push("Student not found");
        }
        else if (matches.length > 1) {
            status = "error";
            issues.push("Multiple students match, use student ID column to disambiguate");
        }
        else if (activeStudentIds.has(String(matches[0]._id))) {
            status = "warning";
            issues.push("Student already has active transport");
        }
        return {
            ...item,
            status,
            issues
        };
    });
    const errors = [
        ...parsed.errors,
        ...preview
            .filter((row) => row.status === "error")
            .map((row) => ({ row: row.row, message: row.issues.join(", ") }))
    ];
    res.json({
        success: true,
        data: {
            preview,
            summary: {
                total: parsed.totalRows,
                valid: preview.filter((row) => row.status === "valid").length,
                warnings: preview.filter((row) => row.status === "warning").length,
                errors: errors.length
            },
            errors
        }
    });
}));
bulkRouter.post("/transport/confirm", ...bulkGuard, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const authReq = req;
    const orgId = (0, orgFilter_1.getScopedOrganizationId)(authReq, res);
    const { rows, skipWarnings, academicYear } = req.body;
    if (!Array.isArray(rows) || rows.length === 0 || !academicYear) {
        res.status(400).json({
            success: false,
            data: null,
            message: "rows[] and academicYear are required"
        });
        return;
    }
    const eligibleRows = rows.filter((row) => row.status === "valid" || (!skipWarnings && row.status === "warning"));
    let created = 0;
    let skipped = 0;
    const failures = [];
    for (const row of eligibleRows) {
        const matches = await Student_1.Student.find({
            organizationId: new mongoose_1.Types.ObjectId(orgId),
            status: "active",
            name: new RegExp(`^${row.studentName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
            grade: row.grade
        });
        if (matches.length !== 1) {
            failures.push({
                row: row.row,
                name: row.studentName,
                reason: matches.length === 0
                    ? "Student not found"
                    : "Multiple students match, use student ID column to disambiguate"
            });
            continue;
        }
        const student = matches[0];
        const existing = await StudentTransport_1.StudentTransport.findOne({
            organizationId: new mongoose_1.Types.ObjectId(orgId),
            studentId: student._id,
            status: "active"
        });
        if (existing) {
            skipped += 1;
            continue;
        }
        if (!row.busId || !mongoose_1.Types.ObjectId.isValid(row.busId)) {
            failures.push({ row: row.row, name: row.studentName, reason: "Invalid bus" });
            continue;
        }
        await StudentTransport_1.StudentTransport.create({
            organizationId: new mongoose_1.Types.ObjectId(orgId),
            studentId: student._id,
            busId: new mongoose_1.Types.ObjectId(row.busId),
            monthlyTransportFee: row.monthlyFee,
            pickupStop: row.pickupStop,
            dropStop: row.dropStop,
            effectiveFrom: new Date(row.effectiveFrom),
            status: "active",
            academicYear,
            addedBy: authReq.user?.userId ? new mongoose_1.Types.ObjectId(authReq.user.userId) : undefined
        });
        created += 1;
    }
    res.json({
        success: true,
        data: {
            created,
            skipped: rows.length - eligibleRows.length + skipped,
            failed: failures.length,
            failures
        }
    });
}));
bulkRouter.post("/fees/mark-paid", ...bulkGuard, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const authReq = req;
    const orgId = (0, orgFilter_1.getScopedOrganizationId)(authReq, res);
    const { paymentIds, notes } = req.body;
    if (!Array.isArray(paymentIds) || paymentIds.length === 0) {
        res.status(400).json({ success: false, data: null, message: "paymentIds[] are required" });
        return;
    }
    if (paymentIds.length > 100) {
        res.status(400).json({ success: false, data: null, message: "Maximum 100 payments per request" });
        return;
    }
    const objectIds = paymentIds.filter(mongoose_1.Types.ObjectId.isValid).map((id) => new mongoose_1.Types.ObjectId(id));
    const payments = await FeePayment_1.FeePayment.find({
        _id: { $in: objectIds },
        organizationId: new mongoose_1.Types.ObjectId(orgId)
    });
    const alreadyPaidIds = new Set(payments
        .filter((payment) => payment.status === "paid")
        .map((payment) => payment._id.toString()));
    const markableIds = payments
        .filter((payment) => payment.status !== "paid")
        .map((payment) => payment._id);
    const result = await FeePayment_1.FeePayment.updateMany({ _id: { $in: markableIds } }, {
        $set: {
            status: "paid",
            paidAt: new Date(),
            collectedBy: authReq.user?.userId ? new mongoose_1.Types.ObjectId(authReq.user.userId) : undefined,
            notes
        }
    });
    for (const payment of payments) {
        if (!alreadyPaidIds.has(payment._id.toString())) {
            payment.amountPaid = payment.amount;
            await payment.save();
        }
    }
    res.json({
        success: true,
        data: {
            marked: result.modifiedCount,
            alreadyPaid: alreadyPaidIds.size
        }
    });
}));
bulkRouter.post("/fees/assign-structure", ...bulkGuard, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const authReq = req;
    const orgId = (0, orgFilter_1.getScopedOrganizationId)(authReq, res);
    const { feeStructureId, grades, academicYear, overwriteExisting } = req.body;
    if (!feeStructureId || !mongoose_1.Types.ObjectId.isValid(feeStructureId) || !academicYear || !Array.isArray(grades)) {
        res.status(400).json({
            success: false,
            data: null,
            message: "feeStructureId, grades[] and academicYear are required"
        });
        return;
    }
    const feeStructure = await FeeStructure_1.FeeStructure.findOne({
        _id: feeStructureId,
        ...(0, orgFilter_1.orgFilter)(authReq, res),
        isActive: true
    });
    if (!feeStructure) {
        res.status(404).json({ success: false, data: null, message: "Active fee structure not found" });
        return;
    }
    const students = await Student_1.Student.find({
        organizationId: new mongoose_1.Types.ObjectId(orgId),
        status: "active",
        grade: { $in: grades }
    }).select("_id");
    const existingAssignments = await StudentFeeAssignment_1.StudentFeeAssignment.find({
        organizationId: new mongoose_1.Types.ObjectId(orgId),
        studentId: { $in: students.map((student) => student._id) },
        academicYear
    }).select("studentId");
    const existingSet = new Set(existingAssignments.map((item) => item.studentId.toString()));
    const eligibleStudentIds = students
        .map((student) => student._id)
        .filter((studentId) => overwriteExisting || !existingSet.has(studentId.toString()));
    const skipped = students.length - eligibleStudentIds.length;
    const assignedResult = await (0, schoolFeeLedger_1.assignFeeStructureToStudents)(new mongoose_1.Types.ObjectId(orgId), feeStructure, eligibleStudentIds, academicYear);
    res.json({
        success: true,
        data: {
            assigned: assignedResult.assignments,
            skipped,
            ledgerEntriesCreated: assignedResult.ledgerEntries
        }
    });
}));
bulkRouter.post("/students/promote", ...bulkGuard, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const authReq = req;
    const orgId = (0, orgFilter_1.getScopedOrganizationId)(authReq, res);
    const { academicYear, promotionMap, preview } = req.body;
    if (!academicYear || !promotionMap) {
        res.status(400).json({ success: false, data: null, message: "academicYear and promotionMap are required" });
        return;
    }
    const students = await Student_1.Student.find({
        organizationId: new mongoose_1.Types.ObjectId(orgId),
        status: "active"
    }).select("_id grade");
    const byGrade = new Map();
    for (const student of students) {
        const nextGrade = promotionMap[student.grade];
        if (!nextGrade) {
            continue;
        }
        if (!byGrade.has(student.grade)) {
            byGrade.set(student.grade, []);
        }
        byGrade.get(student.grade).push(student._id);
    }
    const gradeSummary = Array.from(byGrade.entries()).map(([from, ids]) => ({
        from,
        to: promotionMap[from],
        count: ids.length
    }));
    const graduating = gradeSummary
        .filter((row) => row.to === "graduate")
        .reduce((acc, row) => acc + row.count, 0);
    const totalAffected = gradeSummary.reduce((acc, row) => acc + row.count, 0);
    if (preview) {
        res.json({
            success: true,
            data: {
                byGrade: gradeSummary,
                graduating,
                totalAffected
            }
        });
        return;
    }
    let promoted = 0;
    let graduated = 0;
    for (const [fromGrade, ids] of byGrade.entries()) {
        const toGrade = promotionMap[fromGrade];
        if (toGrade === "graduate") {
            const result = await Student_1.Student.updateMany({ _id: { $in: ids }, organizationId: new mongoose_1.Types.ObjectId(orgId) }, { $set: { status: "inactive", academicYear } });
            graduated += result.modifiedCount;
        }
        else {
            const result = await Student_1.Student.updateMany({ _id: { $in: ids }, organizationId: new mongoose_1.Types.ObjectId(orgId) }, { $set: { grade: toGrade, academicYear } });
            promoted += result.modifiedCount;
        }
    }
    res.json({
        success: true,
        data: {
            promoted,
            graduated
        }
    });
}));
bulkRouter.get("/export/students", ...bulkGuard, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const authReq = req;
    const orgId = (0, orgFilter_1.getScopedOrganizationId)(authReq, res);
    const { grade, section, busId, status, academicYear } = req.query;
    const filter = { ...(0, orgFilter_1.orgFilter)(authReq, res) };
    if (grade)
        filter.grade = grade;
    if (section)
        filter.section = section;
    if (status)
        filter.status = status;
    if (academicYear)
        filter.academicYear = academicYear;
    if (busId && mongoose_1.Types.ObjectId.isValid(busId)) {
        const transports = await StudentTransport_1.StudentTransport.find({
            ...(0, orgFilter_1.orgFilter)(authReq, res),
            busId: new mongoose_1.Types.ObjectId(busId),
            status: "active"
        }).select("studentId");
        filter._id = { $in: transports.map((t) => t.studentId) };
    }
    const students = await Student_1.Student.find(filter);
    const activeTransports = await StudentTransport_1.StudentTransport.find({
        ...(0, orgFilter_1.orgFilter)(authReq, res),
        studentId: { $in: students.map((s) => s._id) },
        status: "active"
    })
        .populate("busId", "busNumber")
        .select("studentId busId monthlyTransportFee pickupStop");
    const transportByStudent = new Map(activeTransports.map((t) => [String(t.studentId), t]));
    const feeStatusByYear = await (0, schoolFeeService_1.buildStudentFeeStatusMapsByYear)(orgId, students.map((student) => student.academicYear));
    const rows = students.map((student) => {
        const transport = transportByStudent.get(String(student._id));
        const bus = transport?.busId;
        const yearStatusMap = feeStatusByYear.get(student.academicYear) ?? {};
        const feeLabels = (0, schoolFeeService_1.formatStudentFeeStatusLabel)(yearStatusMap[String(student._id)]);
        return {
            admissionNo: student.admissionNo ?? "",
            name: student.name,
            grade: student.grade,
            section: student.section ?? "",
            status: student.status,
            academicYear: student.academicYear,
            parentName: student.parentName,
            parentPhone: student.parentPhone,
            address: student.address ?? "",
            bus: bus?.busNumber ?? "",
            pickupStop: transport?.pickupStop ?? "",
            monthlyBusFee: transport?.monthlyTransportFee ?? "",
            feeStatus: feeLabels.feeStatus,
            outstandingAmount: feeLabels.outstandingAmount
        };
    });
    const headers = [
        { key: "admissionNo", header: "Admission No", example: "" },
        { key: "name", header: "Name", example: "" },
        { key: "grade", header: "Grade", example: "" },
        { key: "section", header: "Section", example: "" },
        { key: "status", header: "Status", example: "" },
        { key: "academicYear", header: "Academic Year", example: "" },
        { key: "parentName", header: "Parent Name", example: "" },
        { key: "parentPhone", header: "Parent Phone", example: "" },
        { key: "address", header: "Address", example: "" },
        { key: "bus", header: "Bus", example: "" },
        { key: "pickupStop", header: "Pickup Stop", example: "" },
        { key: "monthlyBusFee", header: "Monthly Bus Fee", example: "" },
        { key: "feeStatus", header: "Fee Status", example: "" },
        { key: "outstandingAmount", header: "Outstanding Amount", example: "" }
    ];
    const file = (0, excelParser_1.generateTemplate)(headers, "Students", rows, await getOrgName(orgId));
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="taksha_students_${toDateStamp()}.xlsx"`);
    res.send(file);
}));
bulkRouter.get("/export/fees", ...bulkGuard, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const authReq = req;
    const orgId = (0, orgFilter_1.getScopedOrganizationId)(authReq, res);
    const { month, busId, status, academicYear } = req.query;
    const filter = { ...(0, orgFilter_1.orgFilter)(authReq, res) };
    if (month)
        filter.month = month;
    if (busId && mongoose_1.Types.ObjectId.isValid(busId))
        filter.busId = new mongoose_1.Types.ObjectId(busId);
    if (status)
        filter.status = status;
    if (academicYear)
        filter.academicYear = academicYear;
    const payments = await FeePayment_1.FeePayment.find(filter)
        .populate("studentId", "name grade")
        .populate("busId", "busNumber")
        .populate("collectedBy", "name");
    const rows = payments.map((payment) => ({
        studentName: payment.studentId?.name ?? "",
        grade: payment.studentId?.grade ?? "",
        bus: payment.busId?.busNumber ?? "",
        feeDue: payment.amount,
        amountPaid: payment.amountPaid,
        status: payment.status,
        paidDate: payment.paidAt ? payment.paidAt.toISOString().slice(0, 10) : "",
        collectedBy: payment.collectedBy?.name ??
            "",
        receiptNumber: payment._id.toString()
    }));
    const headers = [
        { key: "studentName", header: "Student Name", example: "" },
        { key: "grade", header: "Grade", example: "" },
        { key: "bus", header: "Bus", example: "" },
        { key: "feeDue", header: "Fee Due", example: "" },
        { key: "amountPaid", header: "Amount Paid", example: "" },
        { key: "status", header: "Status", example: "" },
        { key: "paidDate", header: "Paid Date", example: "" },
        { key: "collectedBy", header: "Collected By", example: "" },
        { key: "receiptNumber", header: "Receipt Number", example: "" }
    ];
    const file = (0, excelParser_1.generateTemplate)(headers, "Bus Fees", rows, await getOrgName(orgId));
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="taksha_fees_${toDateStamp()}.xlsx"`);
    res.send(file);
}));
bulkRouter.get("/export/school-fees-outstanding", ...bulkGuard, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const authReq = req;
    const orgId = (0, orgFilter_1.getScopedOrganizationId)(authReq, res);
    const { grade, academicYear } = req.query;
    const filter = {
        organizationId: new mongoose_1.Types.ObjectId(orgId),
        status: { $in: ["pending", "partial", "overdue"] }
    };
    if (academicYear)
        filter.academicYear = academicYear;
    const ledgers = await FeeLedger_1.FeeLedger.find(filter).populate("studentId", "name grade");
    const rows = ledgers
        .filter((ledger) => {
        const student = ledger.studentId;
        if (!grade)
            return true;
        return student?.grade === grade;
    })
        .map((ledger) => {
        const student = ledger.studentId;
        return {
            studentName: student?.name ?? "",
            grade: student?.grade ?? "",
            feeHead: ledger.feeHeadName,
            period: ledger.periodLabel,
            amountDue: ledger.amountDue,
            amountPaid: ledger.amountPaid,
            balance: Math.max(0, ledger.amountDue + ledger.lateFee - ledger.amountPaid),
            status: ledger.status,
            dueDate: ledger.dueDate ? ledger.dueDate.toISOString().slice(0, 10) : ""
        };
    });
    const headers = [
        { key: "studentName", header: "Student Name", example: "" },
        { key: "grade", header: "Grade", example: "" },
        { key: "feeHead", header: "Fee Head", example: "" },
        { key: "period", header: "Period", example: "" },
        { key: "amountDue", header: "Amount Due", example: "" },
        { key: "amountPaid", header: "Amount Paid", example: "" },
        { key: "balance", header: "Balance", example: "" },
        { key: "status", header: "Status", example: "" },
        { key: "dueDate", header: "Due Date", example: "" }
    ];
    const file = (0, excelParser_1.generateTemplate)(headers, "School Fees Outstanding", rows, await getOrgName(orgId));
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="taksha_school_fees_outstanding_${toDateStamp()}.xlsx"`);
    res.send(file);
}));
bulkRouter.get("/export/expenses", ...bulkGuard, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const authReq = req;
    const orgId = (0, orgFilter_1.getScopedOrganizationId)(authReq, res);
    const { month, busId, category, academicYear } = req.query;
    const filter = {
        organizationId: new mongoose_1.Types.ObjectId(orgId),
        deleted: { $ne: true }
    };
    if (busId && mongoose_1.Types.ObjectId.isValid(busId))
        filter.busId = new mongoose_1.Types.ObjectId(busId);
    if (category)
        filter.category = category;
    if (academicYear)
        filter.academicYear = academicYear;
    if (month) {
        const start = new Date(`${month}-01T00:00:00.000Z`);
        const end = new Date(start);
        end.setUTCMonth(end.getUTCMonth() + 1);
        filter.date = { $gte: start, $lt: end };
    }
    const expenses = await Expense_1.Expense.find(filter).populate("busId", "busNumber").populate("addedBy", "name");
    const rows = expenses.map((expense) => ({
        date: expense.date.toISOString().slice(0, 10),
        bus: expense.busId?.busNumber ?? "",
        category: expense.category,
        vendor: expense.vendor,
        amount: expense.amount,
        notes: expense.notes ?? "",
        addedBy: expense.addedBy?.name ?? ""
    }));
    const headers = [
        { key: "date", header: "Date", example: "" },
        { key: "bus", header: "Bus", example: "" },
        { key: "category", header: "Category", example: "" },
        { key: "vendor", header: "Vendor", example: "" },
        { key: "amount", header: "Amount", example: "" },
        { key: "notes", header: "Notes", example: "" },
        { key: "addedBy", header: "Added By", example: "" }
    ];
    const file = (0, excelParser_1.generateTemplate)(headers, "Expenses", rows, await getOrgName(orgId));
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="taksha_expenses_${toDateStamp()}.xlsx"`);
    res.send(file);
}));
exports.default = bulkRouter;
