"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const orgScope_1 = require("../middleware/orgScope");
const requireOrgScope_1 = require("../middleware/requireOrgScope");
const roleCheck_1 = require("../middleware/roleCheck");
const Student_1 = require("../models/Student");
const asyncHandler_1 = require("../utils/asyncHandler");
const validate_1 = require("../middleware/validate");
const orgFilter_1 = require("../utils/orgFilter");
const students_1 = require("../validators/students");
const paginate_1 = require("../utils/paginate");
const studentsRouter = (0, express_1.Router)();
const scopeMiddleware = [auth_1.auth, orgScope_1.orgScope, requireOrgScope_1.requireOrgScope, roleCheck_1.canAccessOrg];
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
studentsRouter.get("/", ...scopeMiddleware, allowStudentRead, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const authReq = req;
    const { busId, search, status } = req.query;
    const filter = {
        ...(0, orgFilter_1.orgFilter)(authReq, res),
        status: status || "active"
    };
    if (authReq.user?.role === "parent") {
        Object.assign(filter, (0, roleCheck_1.parentStudentFilter)(authReq));
    }
    if (busId) {
        filter.busId = busId;
    }
    if (search) {
        filter.name = { $regex: search, $options: "i" };
    }
    const { page, limit } = (0, paginate_1.parsePaginationQuery)(req.query, 50);
    const { data, pagination } = await (0, paginate_1.paginate)(Student_1.Student, filter, {
        page,
        limit,
        sort: { name: 1 },
        populate: "busId"
    });
    res.json({
        success: true,
        data,
        pagination,
        message: "Students fetched successfully"
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
    }).populate("busId", "busNumber routeName");
    if (!student) {
        res.status(404).json({ success: false, data: null, message: "Student not found" });
        return;
    }
    res.json({ success: true, data: student, message: "Student fetched successfully" });
}));
studentsRouter.post("/", ...scopeMiddleware, (0, roleCheck_1.isSuperAdminOrOrgStaff)("canManageStudents"), students_1.createStudentValidation, validate_1.validate, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const authReq = req;
    const student = await Student_1.Student.create({
        ...req.body,
        organizationId: (0, orgFilter_1.getScopedOrganizationId)(authReq, res)
    });
    res
        .status(201)
        .json({ success: true, data: student, message: "Student created successfully" });
}));
studentsRouter.put("/:id", ...scopeMiddleware, (0, roleCheck_1.isSuperAdminOrOrgStaff)("canManageStudents"), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const authReq = req;
    const student = await Student_1.Student.findOneAndUpdate({ _id: req.params.id, ...(0, orgFilter_1.orgFilter)(authReq, res) }, req.body, { new: true, runValidators: true });
    if (!student) {
        res.status(404).json({ success: false, data: null, message: "Student not found" });
        return;
    }
    res.json({ success: true, data: student, message: "Student updated successfully" });
}));
exports.default = studentsRouter;
