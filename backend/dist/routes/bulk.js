"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const mongoose_1 = require("mongoose");
const auth_1 = require("../middleware/auth");
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
const StudentFeeAssignment_1 = require("../models/StudentFeeAssignment");
const asyncHandler_1 = require("../utils/asyncHandler");
const excelParser_1 = require("../utils/excelParser");
const orgFilter_1 = require("../utils/orgFilter");
const schoolFeeLedger_1 = require("../utils/schoolFeeLedger");
const bulkRouter = (0, express_1.Router)();
const bulkGuard = [
    auth_1.auth,
    orgScope_1.orgScope,
    requireOrgScope_1.requireOrgScope,
    roleCheck_1.canAccessOrg,
    (0, roleCheck_1.isOrgAdminOrStaff)("canManageStudents")
];
const validGrades = new Set([
    "1",
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
    "10",
    "11",
    "12",
    "KG1",
    "KG2",
    "Nursery"
]);
const studentTemplateHeaders = [
    { key: "name", header: "Name", example: "Rahul Sharma" },
    { key: "grade", header: "Grade", example: "6" },
    { key: "parentName", header: "Parent Name", example: "Suresh Sharma" },
    { key: "parentPhone", header: "Parent Phone", example: "9876543210" },
    { key: "address", header: "Address", example: "123 MG Road, Bengaluru" },
    { key: "busNumber", header: "Bus Number", example: "Bus 1" },
    { key: "monthlyBusFee", header: "Monthly Bus Fee", example: "1500" },
    { key: "academicYear", header: "Academic Year", example: "2025-26" }
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
const parseStudentImportRow = (row, rowNumber, busMap) => {
    const name = trimString(row.Name);
    const grade = trimString(row.Grade);
    const parentName = trimString(row["Parent Name"]);
    const parentPhone = trimString(row["Parent Phone"]);
    const address = trimString(row.Address);
    const busNumber = trimString(row["Bus Number"]);
    const monthlyFeeRaw = trimString(row["Monthly Bus Fee"]);
    const academicYear = trimString(row["Academic Year"]);
    if (!name || name.length > 100) {
        throw new Error("Name is required and must be less than 100 characters");
    }
    if (!grade || !validGrades.has(grade)) {
        throw new Error("Grade must be one of 1-12, KG1, KG2, Nursery");
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
    const monthlyBusFee = monthlyFeeRaw ? Number(monthlyFeeRaw) : 1500;
    if (Number.isNaN(monthlyBusFee) || monthlyBusFee < 0) {
        throw new Error("Monthly Bus Fee must be a number >= 0");
    }
    if (busNumber && !busMap.has(busNumber)) {
        throw new Error(`${busNumber} not found`);
    }
    return {
        row: rowNumber,
        name,
        grade,
        parentName,
        parentPhone,
        address: address || undefined,
        busNumber: busNumber || undefined,
        busId: busNumber ? busMap.get(busNumber) : undefined,
        monthlyBusFee,
        academicYear
    };
};
const getOrgName = async (orgId) => {
    const org = await Organization_1.Organization.findById(orgId).select("name");
    return org?.name ? `${org.name} (${toDateStamp()})` : `BusTrack Export (${toDateStamp()})`;
};
bulkRouter.get("/templates/students", (0, asyncHandler_1.asyncHandler)(async (_req, res) => {
    const file = (0, excelParser_1.generateTemplate)(studentTemplateHeaders, "Students Template");
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
    const buses = await Bus_1.Bus.find({ organizationId: new mongoose_1.Types.ObjectId(orgId) }).select("busNumber");
    const busMap = new Map(buses.map((bus) => [bus.busNumber, bus._id.toString()]));
    const parsed = (0, excelParser_1.parseExcelBuffer)(authReq.file.buffer, (row, rowIndex) => parseStudentImportRow(row, rowIndex, busMap));
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
    const buses = await Bus_1.Bus.find({ organizationId: new mongoose_1.Types.ObjectId(orgId) }).select("busNumber");
    const busMap = new Map(buses.map((bus) => [bus.busNumber, bus._id.toString()]));
    const eligibleRows = rows.filter((row) => row.status === "valid" || (!skipWarnings && row.status === "warning"));
    const failures = [];
    const toInsert = eligibleRows
        .map((row) => {
        try {
            const validated = parseStudentImportRow({
                Name: row.name,
                Grade: row.grade,
                "Parent Name": row.parentName,
                "Parent Phone": row.parentPhone,
                Address: row.address ?? "",
                "Bus Number": row.busNumber ?? "",
                "Monthly Bus Fee": String(row.monthlyBusFee),
                "Academic Year": academicYear
            }, row.row, busMap);
            return {
                organizationId: new mongoose_1.Types.ObjectId(orgId),
                name: validated.name,
                grade: validated.grade,
                parentName: validated.parentName,
                parentPhone: validated.parentPhone,
                address: validated.address,
                busId: validated.busId ? new mongoose_1.Types.ObjectId(validated.busId) : undefined,
                monthlyFee: validated.monthlyBusFee,
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
    const { studentIds, busId } = req.body;
    if (!Array.isArray(studentIds) || studentIds.length === 0 || !busId) {
        res.status(400).json({ success: false, data: null, message: "studentIds[] and busId are required" });
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
    const failed = objectIds.filter((id) => !foundIds.has(id.toString())).length;
    const result = await Student_1.Student.updateMany({ _id: { $in: students.map((student) => student._id) }, organizationId: new mongoose_1.Types.ObjectId(orgId) }, { $set: { busId: bus._id } });
    res.json({
        success: true,
        data: {
            updated: result.modifiedCount,
            failed
        },
        message: "Bus assignment completed"
    });
}));
bulkRouter.post("/students/assign-bus-by-grade", ...bulkGuard, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const authReq = req;
    const orgId = (0, orgFilter_1.getScopedOrganizationId)(authReq, res);
    const { grade, busId } = req.body;
    if (!grade || !busId || !mongoose_1.Types.ObjectId.isValid(busId)) {
        res.status(400).json({ success: false, data: null, message: "grade and valid busId are required" });
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
    const result = await Student_1.Student.updateMany({
        organizationId: new mongoose_1.Types.ObjectId(orgId),
        status: "active",
        grade
    }, { $set: { busId: bus._id } });
    res.json({ success: true, data: { updated: result.modifiedCount } });
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
    const { grade, busId, status, academicYear } = req.query;
    const filter = { ...(0, orgFilter_1.orgFilter)(authReq, res) };
    if (grade)
        filter.grade = grade;
    if (busId && mongoose_1.Types.ObjectId.isValid(busId))
        filter.busId = new mongoose_1.Types.ObjectId(busId);
    if (status)
        filter.status = status;
    if (academicYear)
        filter.academicYear = academicYear;
    const students = await Student_1.Student.find(filter).populate("busId", "busNumber");
    const rows = students.map((student) => ({
        // Student busId is ObjectId in schema, but may be populated doc here.
        bus: student.busId?.busNumber ??
            "",
        name: student.name,
        grade: student.grade,
        parentName: student.parentName,
        parentPhone: student.parentPhone,
        address: student.address ?? "",
        monthlyBusFee: student.monthlyFee,
        status: student.status,
        academicYear: student.academicYear
    }));
    const headers = [
        { key: "name", header: "Name", example: "" },
        { key: "grade", header: "Grade", example: "" },
        { key: "bus", header: "Bus", example: "" },
        { key: "parentName", header: "Parent Name", example: "" },
        { key: "parentPhone", header: "Parent Phone", example: "" },
        { key: "address", header: "Address", example: "" },
        { key: "monthlyBusFee", header: "Monthly Bus Fee", example: "" },
        { key: "status", header: "Status", example: "" },
        { key: "academicYear", header: "Academic Year", example: "" }
    ];
    const file = (0, excelParser_1.generateTemplate)(headers, "Students", rows, await getOrgName(orgId));
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="bustrack_students_${toDateStamp()}.xlsx"`);
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
        .populate("studentId", "name grade monthlyFee")
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
    res.setHeader("Content-Disposition", `attachment; filename="bustrack_fees_${toDateStamp()}.xlsx"`);
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
    res.setHeader("Content-Disposition", `attachment; filename="bustrack_school_fees_outstanding_${toDateStamp()}.xlsx"`);
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
    res.setHeader("Content-Disposition", `attachment; filename="bustrack_expenses_${toDateStamp()}.xlsx"`);
    res.send(file);
}));
exports.default = bulkRouter;
