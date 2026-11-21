import { Router } from "express";
import { Types } from "mongoose";
import { auth, type AuthenticatedRequest } from "../middleware/auth";
import { orgScope } from "../middleware/orgScope";
import { requireOrgScope } from "../middleware/requireOrgScope";
import {
  canAccessOrg,
  isParent,
  isSuperAdminOrOrgStaff,
  isSuperAdminOrOrgStaffAny,
  parentStudentFilter
} from "../middleware/roleCheck";
import { Student } from "../models/Student";
import { StudentTransport } from "../models/StudentTransport";
import {
  ensureParentAccountForStudent,
  unlinkStudentFromParent
} from "../services/parentProvisioning";
import { asyncHandler } from "../utils/asyncHandler";
import { validate } from "../middleware/validate";
import { getScopedOrganizationId, orgFilter } from "../utils/orgFilter";
import { normalizeIndianMobile } from "../utils/phone";
import {
  createStudentValidation,
  updateStudentValidation
} from "../validators/students";
import { paginate, parsePaginationQuery } from "../utils/paginate";
import { sortGrades } from "../utils/gradeSort";

const studentsRouter = Router();

const scopeMiddleware = [auth, orgScope, requireOrgScope, canAccessOrg] as const;

const MAX_BULK_DEACTIVATE = 500;

function parseBulkStudentIds(
  raw: unknown
): { ok: true; ids: Types.ObjectId[] } | { ok: false; message: string } {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { ok: false, message: "studentIds must be a non-empty array" };
  }
  if (raw.length > MAX_BULK_DEACTIVATE) {
    return { ok: false, message: `Maximum ${MAX_BULK_DEACTIVATE} students per request` };
  }

  const ids: Types.ObjectId[] = [];
  for (const id of raw) {
    if (typeof id !== "string" || !Types.ObjectId.isValid(id)) {
      return { ok: false, message: "All studentIds must be valid MongoDB ObjectId strings" };
    }
    ids.push(new Types.ObjectId(id));
  }

  return { ok: true, ids };
}

const allowStudentRead = (
  req: import("express").Request,
  res: import("express").Response,
  next: import("express").NextFunction
): void => {
  const authReq = req as AuthenticatedRequest;
  if (authReq.user?.role === "superAdmin") {
    next();
    return;
  }
  if (authReq.user?.role === "parent") {
    isParent(req, res, next);
    return;
  }
  isSuperAdminOrOrgStaffAny(
    "canManageStudents",
    "canCollectFees",
    "canViewReports"
  )(req, res, next);
};

const formatTransport = (
  transport: {
    busId: unknown;
    monthlyTransportFee: number;
    pickupStop?: string;
    status: string;
  } | null
) => {
  if (!transport) {
    return null;
  }
  const bus = transport.busId as {
    _id?: Types.ObjectId;
    busNumber?: string;
    routeName?: string;
  } | null;
  return {
    busId: bus?._id ?? transport.busId,
    busNumber: bus?.busNumber,
    routeName: bus?.routeName,
    monthlyTransportFee: transport.monthlyTransportFee,
    pickupStop: transport.pickupStop,
    status: transport.status
  };
};

studentsRouter.get(
  "/",
  ...scopeMiddleware,
  allowStudentRead,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const { busId, search, status, withTransport, academicYear, grade, section } = req.query as {
      busId?: string;
      search?: string;
      status?: string;
      withTransport?: string;
      academicYear?: string;
      grade?: string;
      section?: string;
    };

    const filter: Record<string, unknown> = {
      ...orgFilter(authReq, res),
      status: status || "active"
    };

    if (authReq.user?.role === "parent") {
      Object.assign(filter, parentStudentFilter(authReq));
    }

    const gradeFilter = typeof grade === "string" ? grade.trim() : "";
    if (gradeFilter) {
      filter.grade = gradeFilter;
    }

    const sectionFilter = typeof section === "string" ? section.trim() : "";
    if (sectionFilter) {
      filter.section = sectionFilter;
    }

    if (busId && Types.ObjectId.isValid(busId)) {
      const transports = await StudentTransport.find({
        ...orgFilter(authReq, res),
        busId: new Types.ObjectId(busId),
        status: "active"
      }).select("studentId");
      filter._id = { $in: transports.map((t) => t.studentId) };
    }

    if (search) {
      filter.name = { $regex: search, $options: "i" };
    }

    const { page, limit } = parsePaginationQuery(req.query, 50);

    if (withTransport === "true") {
      const skip = (page - 1) * limit;
      const [students, total] = await Promise.all([
        Student.find(filter).sort({ name: 1 }).skip(skip).limit(limit),
        Student.countDocuments(filter)
      ]);

      const studentIds = students.map((s) => s._id);
      const transports = await StudentTransport.find({
        ...orgFilter(authReq, res),
        studentId: { $in: studentIds },
        status: "active",
        ...(academicYear ? { academicYear } : {})
      }).populate("busId", "busNumber routeName");

      const transportByStudent = new Map(
        transports.map((t) => [String(t.studentId), t])
      );

      const data = students.map((student) => ({
        ...student.toObject(),
        transport: formatTransport(transportByStudent.get(String(student._id)) ?? null)
      }));

      const totalPages = Math.ceil(total / limit) || 1;

      res.json({
        success: true,
        data,
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1
        },
        message: "Students fetched successfully"
      });
      return;
    }

    const { data, pagination } = await paginate(Student, filter, {
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
  })
);

studentsRouter.get(
  "/grades",
  ...scopeMiddleware,
  allowStudentRead,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const distinctGrades = await Student.distinct("grade", orgFilter(authReq, res));
    const grades = sortGrades(
      distinctGrades.filter((grade): grade is string => typeof grade === "string" && grade.trim().length > 0)
    );

    res.json({
      success: true,
      data: grades,
      message: "Student grades fetched successfully"
    });
  })
);

studentsRouter.post(
  "/bulk-deactivate",
  ...scopeMiddleware,
  isSuperAdminOrOrgStaff("canManageStudents"),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const orgId = getScopedOrganizationId(authReq, res)!;
    const { studentIds } = req.body as { studentIds?: unknown };
    const parsed = parseBulkStudentIds(studentIds);

    if (!parsed.ok) {
      res.status(400).json({
        success: false,
        data: null,
        message: parsed.message
      });
      return;
    }

    const organizationId = new Types.ObjectId(orgId);
    const ownedCount = await Student.countDocuments({
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

    const result = await Student.updateMany(
      { _id: { $in: parsed.ids }, organizationId },
      { status: "inactive" }
    );

    res.json({
      success: true,
      data: { deactivated: result.modifiedCount },
      message: `${result.modifiedCount} student(s) deactivated successfully`
    });
  })
);

studentsRouter.get(
  "/:id",
  ...scopeMiddleware,
  allowStudentRead,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    if (
      authReq.user?.role === "parent" &&
      !authReq.user.parentStudentIds?.includes(String(req.params.id))
    ) {
      res.status(404).json({ success: false, data: null, message: "Student not found" });
      return;
    }

    const student = await Student.findOne({
      _id: req.params.id,
      ...orgFilter(authReq, res)
    });
    if (!student) {
      res.status(404).json({ success: false, data: null, message: "Student not found" });
      return;
    }

    const transport = await StudentTransport.findOne({
      ...orgFilter(authReq, res),
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
  })
);

studentsRouter.post(
  "/",
  ...scopeMiddleware,
  isSuperAdminOrOrgStaff("canManageStudents"),
  createStudentValidation,
  validate,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const orgId = getScopedOrganizationId(authReq, res)!;
    const {
      busId: _busId,
      monthlyFee: _monthlyFee,
      monthlyTransportFee: _mtf,
      parentEmail,
      ...body
    } = req.body as Record<string, unknown> & {
      parentName?: string;
      parentPhone?: string;
      parentEmail?: string;
    };

    const parentPhone = normalizeIndianMobile(String(body.parentPhone ?? ""));
    if (!parentPhone || !body.parentName) {
      res.status(400).json({
        success: false,
        data: null,
        message: "parentName and a valid parentPhone are required"
      });
      return;
    }

    const student = await Student.create({
      ...body,
      parentName: String(body.parentName).trim(),
      parentPhone,
      organizationId: orgId
    });

    try {
      const parentAccount = await ensureParentAccountForStudent({
        organizationId: orgId,
        studentId: student._id,
        parentName: student.parentName,
        parentPhone: student.parentPhone,
        parentEmail: typeof parentEmail === "string" ? parentEmail : undefined
      });

      student.parentUserId = new Types.ObjectId(parentAccount.parentUserId);
      await student.save();

      res.status(201).json({
        success: true,
        data: student,
        parentAccount,
        message: parentAccount.created
          ? "Student created and parent account provisioned"
          : "Student created and linked to existing parent account"
      });
    } catch (error) {
      await Student.deleteOne({ _id: student._id });
      const statusCode =
        error && typeof error === "object" && "statusCode" in error
          ? Number((error as { statusCode?: number }).statusCode) || 500
          : 500;
      res.status(statusCode).json({
        success: false,
        data: null,
        message: error instanceof Error ? error.message : "Failed to provision parent account"
      });
    }
  })
);

studentsRouter.put(
  "/:id",
  ...scopeMiddleware,
  isSuperAdminOrOrgStaff("canManageStudents"),
  updateStudentValidation,
  validate,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const orgId = getScopedOrganizationId(authReq, res)!;
    const {
      busId: _busId,
      monthlyFee: _monthlyFee,
      monthlyTransportFee: _mtf,
      parentEmail,
      ...body
    } = req.body as Record<string, unknown> & {
      parentName?: string;
      parentPhone?: string;
      parentEmail?: string;
    };

    const existing = await Student.findOne({
      _id: req.params.id,
      ...orgFilter(authReq, res)
    });
    if (!existing) {
      res.status(404).json({ success: false, data: null, message: "Student not found" });
      return;
    }

    if (typeof body.parentPhone === "string") {
      const normalized = normalizeIndianMobile(body.parentPhone);
      if (!normalized) {
        res.status(400).json({
          success: false,
          data: null,
          message: "Enter a valid 10-digit Indian mobile number"
        });
        return;
      }
      body.parentPhone = normalized;
    }

    const previousPhone = existing.parentPhone;
    const previousParentUserId = existing.parentUserId;

    Object.assign(existing, body);
    await existing.save();

    const nextPhone = existing.parentPhone;
    const nextName = existing.parentName;
    const phoneChanged = previousPhone !== nextPhone;

    try {
      if (phoneChanged) {
        await unlinkStudentFromParent(previousParentUserId, existing._id);
      }

      const parentAccount = await ensureParentAccountForStudent({
        organizationId: orgId,
        studentId: existing._id,
        parentName: nextName,
        parentPhone: nextPhone,
        parentEmail: typeof parentEmail === "string" ? parentEmail : undefined
      });

      existing.parentUserId = new Types.ObjectId(parentAccount.parentUserId);
      await existing.save();

      res.json({
        success: true,
        data: existing,
        parentAccount,
        message: phoneChanged
          ? parentAccount.created
            ? "Student updated; new parent account provisioned"
            : "Student updated and re-linked to parent account"
          : "Student updated successfully"
      });
    } catch (error) {
      const statusCode =
        error && typeof error === "object" && "statusCode" in error
          ? Number((error as { statusCode?: number }).statusCode) || 500
          : 500;
      res.status(statusCode).json({
        success: false,
        data: existing,
        message: error instanceof Error ? error.message : "Failed to sync parent account"
      });
    }
  })
);

export default studentsRouter;
