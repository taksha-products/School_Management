import { Router } from "express";
import { Types } from "mongoose";

import { auth, type AuthenticatedRequest } from "../middleware/auth";
import { isSuperAdminOrOrgAdmin } from "../middleware/isSuperAdminOrOrgAdmin";
import { orgScope } from "../middleware/orgScope";
import { requireOrgScope } from "../middleware/requireOrgScope";
import { canAccessOrg } from "../middleware/roleCheck";
import { FeeStructure } from "../models/FeeStructure";
import { Student } from "../models/Student";
import { asyncHandler } from "../utils/asyncHandler";
import { validate } from "../middleware/validate";
import { getScopedOrganizationId, orgFilter } from "../utils/orgFilter";
import { createFeeStructureValidation } from "../validators/feeStructure";
import { assignFeeStructureToStudents } from "../utils/schoolFeeLedger";

const feeStructureRouter = Router();

const guard = [auth, orgScope, requireOrgScope, canAccessOrg, isSuperAdminOrOrgAdmin] as const;

feeStructureRouter.get(
  "/",
  ...guard,
  asyncHandler(async (req, res) => {
    const structures = await FeeStructure.find(orgFilter(req as AuthenticatedRequest, res)).sort({
      academicYear: -1,
      name: 1
    });
    res.json({
      success: true,
      data: structures,
      message: "Fee structures fetched successfully"
    });
  })
);

feeStructureRouter.post(
  "/",
  ...guard,
  createFeeStructureValidation,
  validate,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const structure = await FeeStructure.create({
      ...req.body,
      organizationId: getScopedOrganizationId(authReq, res)
    });
    res.status(201).json({
      success: true,
      data: structure,
      message: "Fee structure created successfully"
    });
  })
);

feeStructureRouter.put(
  "/:id",
  ...guard,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const structure = await FeeStructure.findOneAndUpdate(
      { _id: req.params.id, ...orgFilter(authReq, res) },
      req.body,
      { new: true, runValidators: true }
    );
    if (!structure) {
      res.status(404).json({ success: false, data: null, message: "Fee structure not found" });
      return;
    }
    res.json({
      success: true,
      data: structure,
      message: "Fee structure updated successfully"
    });
  })
);

feeStructureRouter.delete(
  "/:id",
  ...guard,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const structure = await FeeStructure.findOneAndUpdate(
      { _id: req.params.id, ...orgFilter(authReq, res) },
      { isActive: false },
      { new: true }
    );
    if (!structure) {
      res.status(404).json({ success: false, data: null, message: "Fee structure not found" });
      return;
    }
    res.json({
      success: true,
      data: structure,
      message: "Fee structure deactivated successfully"
    });
  })
);

feeStructureRouter.post(
  "/:id/assign",
  ...guard,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const orgId = getScopedOrganizationId(authReq, res)!;
    const { studentIds, academicYear } = req.body as {
      studentIds?: string[];
      academicYear?: string;
    };

    if (!Array.isArray(studentIds) || studentIds.length === 0 || !academicYear) {
      res.status(400).json({
        success: false,
        data: null,
        message: "studentIds[] and academicYear are required"
      });
      return;
    }

    const structure = await FeeStructure.findOne({
      _id: req.params.id,
      ...orgFilter(authReq, res),
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
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));

    const students = await Student.find({
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

    const result = await assignFeeStructureToStudents(
      new Types.ObjectId(orgId),
      structure,
      eligible.map((s) => s._id),
      academicYear
    );

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
  })
);

export default feeStructureRouter;
