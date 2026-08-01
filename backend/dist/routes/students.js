"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const mongoose_1 = require("mongoose");
const auth_1 = require("../middleware/auth");
const orgScope_1 = require("../middleware/orgScope");
const requireOrgScope_1 = require("../middleware/requireOrgScope");
const roleCheck_1 = require("../middleware/roleCheck");
const Student_1 = require("../models/Student");
const StudentTransport_1 = require("../models/StudentTransport");
const asyncHandler_1 = require("../utils/asyncHandler");
const validate_1 = require("../middleware/validate");
const orgFilter_1 = require("../utils/orgFilter");
const students_1 = require("../validators/students");
const paginate_1 = require("../utils/paginate");
const gradeSort_1 = require("../utils/gradeSort");
const studentsRouter = (0, express_1.Router)();
const scopeMiddleware = [auth_1.auth, orgScope_1.orgScope, requireOrgScope_1.requireOrgScope, roleCheck_1.canAccessOrg];
const MAX_BULK_DEACTIVATE = 500;
function parseBulkStudentIds(raw) {
    if (!Array.isArray(raw) || raw.length === 0) {
        return { ok: false, message: "studentIds must be a non-empty array" };
    }
    if (raw.length > MAX_BULK_DEACTIVATE) {
        return { ok: false, message: `Maximum ${MAX_BULK_DEACTIVATE} students per request` };
    }
    const ids = [];
    for (const id of raw) {
        if (typeof id !== "string" || !mongoose_1.Types.ObjectId.isValid(id)) {
            return { ok: false, message: "All studentIds must be valid MongoDB ObjectId strings" };
        }
        ids.push(new mongoose_1.Types.ObjectId(id));
    }
    return { ok: true, ids };
}
const allowStudentRead = (req, res, next) => {
    const authReq = req;
    if (authReq.user?.role === "superAdmin") {
        next();
        return;
    }
    if (authReq.user?.role === "parent") {
        (0, roleCheck_1.isParent)(req, res, next);
        return;
    }
    (0, roleCheck_1.isSuperAdminOrOrgStaffAny)("canManageStudents", "canCollectFees", "canViewReports")(req, res, next);
};
const formatTransport = (transport) => {
    if (!transport) {
        return null;
    }
    const bus = transport.busId;
    return {
        busId: bus?._id ?? transport.busId,
        busNumber: bus?.busNumber,
        routeName: bus?.routeName,
        monthlyTransportFee: transport.monthlyTransportFee,
        pickupStop: transport.pickupStop,
        status: transport.status
    };
};
studentsRouter.get("/", ...scopeMiddleware, allowStudentRead, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const authReq = req;
    const { busId, search, status, withTransport, academicYear, grade } = req.query;
    const filter = {
        ...(0, orgFilter_1.orgFilter)(authReq, res),
        status: status || "active"
    };
    if (authReq.user?.role === "parent") {
        Object.assign(filter, (0, roleCheck_1.parentStudentFilter)(authReq));
    }
    const gradeFilter = typeof grade === "string" ? grade.trim() : "";
    if (gradeFilter) {
        filter.grade = gradeFilter;
    }
    if (busId && mongoose_1.Types.ObjectId.isValid(busId)) {
        const transports = await StudentTransport_1.StudentTransport.find({
            ...(0, orgFilter_1.orgFilter)(authReq, res),
            busId: new mongoose_1.Types.ObjectId(busId),
            status: "active"
        }).select("studentId");
        filter._id = { $in: transports.map((t) => t.studentId) };
    }
    if (search) {
        filter.name = { $regex: search, $options: "i" };
    }
    const { page, limit } = (0, paginate_1.parsePaginationQuery)(req.query, 50);
    if (withTransport === "true") {
        const skip = (page - 1) * limit;
        const [students, total] = await Promise.all([
            Student_1.Student.find(filter).sort({ name: 1 }).skip(skip).limit(limit),
            Student_1.Student.countDocuments(filter)
        ]);
        const studentIds = students.map((s) => s._id);
        const transports = await StudentTransport_1.StudentTransport.find({
            ...(0, orgFilter_1.orgFilter)(authReq, res),
            studentId: { $in: studentIds },
            status: "active",
            ...(academicYear ? { academicYear } : {})
        }).populate("busId", "busNumber routeName");
        const transportByStudent = new Map(transports.map((t) => [String(t.studentId), t]));
        const data = students.map((student) => ({
            ...student.toObject(),
            transport: formatTransport(transportByStudent.get(String(student._id)) ?? null)
        }));
        res.json({
            success: true,
            data,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit) || 1
            },
            message: "Students fetched successfully"
        });
        return;
    }
    const { data, pagination } = await (0, paginate_1.paginate)(Student_1.Student, filter, {
        page,
        limit,
        sort: { name: 1 }
    });
    res.json({
        success: true,
        data,
        pagination,
        message: "Students fetched successfully"
    });
}));
studentsRouter.get("/grades", ...scopeMiddleware, allowStudentRead, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const authReq = req;
    const distinctGrades = await Student_1.Student.distinct("grade", (0, orgFilter_1.orgFilter)(authReq, res));
    const grades = (0, gradeSort_1.sortGrades)(distinctGrades.filter((grade) => typeof grade === "string" && grade.trim().length > 0));
    res.json({
        success: true,
        data: grades,
        message: "Student grades fetched successfully"
    });
}));
studentsRouter.post("/bulk-deactivate", ...scopeMiddleware, (0, roleCheck_1.isSuperAdminOrOrgStaff)("canManageStudents"), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const authReq = req;
    const orgId = (0, orgFilter_1.getScopedOrganizationId)(authReq, res);
    const { studentIds } = req.body;
    const parsed = parseBulkStudentIds(studentIds);
    if (!parsed.ok) {
        res.status(400).json({
            success: false,
            data: null,
            message: parsed.message
        });
        return;
    }
    const organizationId = new mongoose_1.Types.ObjectId(orgId);
    const ownedCount = await Student_1.Student.countDocuments({
        _id: { $in: parsed.ids },
        organizationId
    });
    if (ownedCount !== parsed.ids.length) {
        res.status(400).json({
            success: false,
            data: null,
            message: "One or more student IDs are invalid or do not belong to your organization"
        });
        return;
    }
    const result = await Student_1.Student.updateMany({ _id: { $in: parsed.ids }, organizationId }, { status: "inactive" });
    res.json({
        success: true,
        data: { deactivated: result.modifiedCount },
        message: `${result.modifiedCount} student(s) deactivated successfully`
    });
}));
studentsRouter.get("/:id", ...scopeMiddleware, allowStudentRead, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const authReq = req;
    if (authReq.user?.role === "parent" &&
        !authReq.user.parentStudentIds?.includes(String(req.params.id))) {
        res.status(404).json({ success: false, data: null, message: "Student not found" });
        return;
    }
    const student = await Student_1.Student.findOne({
        _id: req.params.id,
        ...(0, orgFilter_1.orgFilter)(authReq, res)
    });
    if (!student) {
        res.status(404).json({ success: false, data: null, message: "Student not found" });
        return;
    }
    const transport = await StudentTransport_1.StudentTransport.findOne({
        ...(0, orgFilter_1.orgFilter)(authReq, res),
        studentId: student._id,
        status: "active"
    }).populate("busId", "busNumber routeName");
    res.json({
        success: true,
        data: {
            ...student.toObject(),
            transport: formatTransport(transport)
        },
        message: "Student fetched successfully"
    });
}));
studentsRouter.post("/", ...scopeMiddleware, (0, roleCheck_1.isSuperAdminOrOrgStaff)("canManageStudents"), students_1.createStudentValidation, validate_1.validate, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const authReq = req;
    const { busId: _busId, monthlyFee: _monthlyFee, monthlyTransportFee: _mtf, ...body } = req.body;
    const student = await Student_1.Student.create({
        ...body,
        organizationId: (0, orgFilter_1.getScopedOrganizationId)(authReq, res)
    });
    res
        .status(201)
        .json({ success: true, data: student, message: "Student created successfully" });
}));
studentsRouter.put("/:id", ...scopeMiddleware, (0, roleCheck_1.isSuperAdminOrOrgStaff)("canManageStudents"), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const authReq = req;
    const { busId: _busId, monthlyFee: _monthlyFee, monthlyTransportFee: _mtf, ...body } = req.body;
    const student = await Student_1.Student.findOneAndUpdate({ _id: req.params.id, ...(0, orgFilter_1.orgFilter)(authReq, res) }, body, { new: true, runValidators: true });
    if (!student) {
        res.status(404).json({ success: false, data: null, message: "Student not found" });
        return;
    }
    res.json({ success: true, data: student, message: "Student updated successfully" });
}));
exports.default = studentsRouter;
