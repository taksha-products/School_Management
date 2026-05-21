"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const mongoose_1 = require("mongoose");
const auth_1 = require("../middleware/auth");
const isSuperAdminOrOrgAdmin_1 = require("../middleware/isSuperAdminOrOrgAdmin");
const orgScope_1 = require("../middleware/orgScope");
const requireOrgScope_1 = require("../middleware/requireOrgScope");
const roleCheck_1 = require("../middleware/roleCheck");
const FeeStructure_1 = require("../models/FeeStructure");
const Student_1 = require("../models/Student");
const asyncHandler_1 = require("../utils/asyncHandler");
const validate_1 = require("../middleware/validate");
const orgFilter_1 = require("../utils/orgFilter");
const feeStructure_1 = require("../validators/feeStructure");
const schoolFeeLedger_1 = require("../utils/schoolFeeLedger");
const feeStructureRouter = (0, express_1.Router)();
const guard = [auth_1.auth, orgScope_1.orgScope, requireOrgScope_1.requireOrgScope, roleCheck_1.canAccessOrg, isSuperAdminOrOrgAdmin_1.isSuperAdminOrOrgAdmin];
feeStructureRouter.get("/", ...guard, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const structures = await FeeStructure_1.FeeStructure.find((0, orgFilter_1.orgFilter)(req, res)).sort({
        academicYear: -1,
        name: 1
    });
    res.json({
        success: true,
        data: structures,
        message: "Fee structures fetched successfully"
    });
}));
feeStructureRouter.post("/", ...guard, feeStructure_1.createFeeStructureValidation, validate_1.validate, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const authReq = req;
    const structure = await FeeStructure_1.FeeStructure.create({
        ...req.body,
        organizationId: (0, orgFilter_1.getScopedOrganizationId)(authReq, res)
    });
    res.status(201).json({
        success: true,
        data: structure,
        message: "Fee structure created successfully"
    });
}));
feeStructureRouter.put("/:id", ...guard, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const authReq = req;
    const structure = await FeeStructure_1.FeeStructure.findOneAndUpdate({ _id: req.params.id, ...(0, orgFilter_1.orgFilter)(authReq, res) }, req.body, { new: true, runValidators: true });
    if (!structure) {
        res.status(404).json({ success: false, data: null, message: "Fee structure not found" });
        return;
    }
    res.json({
        success: true,
        data: structure,
        message: "Fee structure updated successfully"
    });
}));
feeStructureRouter.delete("/:id", ...guard, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const authReq = req;
    const structure = await FeeStructure_1.FeeStructure.findOneAndUpdate({ _id: req.params.id, ...(0, orgFilter_1.orgFilter)(authReq, res) }, { isActive: false }, { new: true });
    if (!structure) {
        res.status(404).json({ success: false, data: null, message: "Fee structure not found" });
        return;
    }
    res.json({
        success: true,
        data: structure,
        message: "Fee structure deactivated successfully"
    });
}));
feeStructureRouter.post("/:id/assign", ...guard, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const authReq = req;
    const orgId = (0, orgFilter_1.getScopedOrganizationId)(authReq, res);
    const { studentIds, academicYear } = req.body;
    if (!Array.isArray(studentIds) || studentIds.length === 0 || !academicYear) {
        res.status(400).json({
            success: false,
            data: null,
            message: "studentIds[] and academicYear are required"
        });
        return;
    }
    const structure = await FeeStructure_1.FeeStructure.findOne({
        _id: req.params.id,
        ...(0, orgFilter_1.orgFilter)(authReq, res),
        isActive: true
    });
    if (!structure) {
        res.status(404).json({
            success: false,
            data: null,
            message: "Active fee structure not found"
        });
        return;
    }
    if (structure.academicYear !== academicYear) {
        res.status(400).json({
            success: false,
            data: null,
            message: "academicYear must match the fee structure's academic year"
        });
        return;
    }
    const objectIds = studentIds
        .filter((id) => mongoose_1.Types.ObjectId.isValid(id))
        .map((id) => new mongoose_1.Types.ObjectId(id));
    const students = await Student_1.Student.find({
        _id: { $in: objectIds },
        organizationId: orgId,
        status: "active"
    });
    const eligible = students.filter((s) => {
        if (!structure.applicableGrades?.length) {
            return true;
        }
        return structure.applicableGrades.includes(s.grade);
    });
    if (eligible.length === 0) {
        res.status(400).json({
            success: false,
            data: null,
            message: "No eligible students found for this fee structure"
        });
        return;
    }
    const result = await (0, schoolFeeLedger_1.assignFeeStructureToStudents)(new mongoose_1.Types.ObjectId(orgId), structure, eligible.map((s) => s._id), academicYear);
    res.json({
        success: true,
        data: {
            assignedCount: result.assignments,
            ledgerEntriesCreated: result.ledgerEntries,
            studentsProcessed: eligible.map((s) => ({ id: s._id, name: s.name, grade: s.grade })),
            skippedExistingLedger: result.skipped
        },
        message: "Fee structure assigned successfully"
    });
}));
exports.default = feeStructureRouter;
