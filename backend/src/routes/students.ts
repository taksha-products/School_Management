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
import { asyncHandler } from "../utils/asyncHandler";
import { validate } from "../middleware/validate";
import { getScopedOrganizationId, orgFilter } from "../utils/orgFilter";
import { createStudentValidation } from "../validators/students";
import { paginate, parsePaginationQuery } from "../utils/paginate";

const studentsRouter = Router();

const scopeMiddleware = [auth, orgScope, requireOrgScope, canAccessOrg] as const;

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
    const { busId, search, status, withTransport, academicYear } = req.query as {
      busId?: string;
      search?: string;
      status?: string;
      withTransport?: string;
      academicYear?: string;
    };

    const filter: Record<string, unknown> = {
      ...orgFilter(authReq, res),
      status: status || "active"
    };

    if (authReq.user?.role === "parent") {
      Object.assign(filter, parentStudentFilter(authReq));
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
    const { busId: _busId, monthlyFee: _monthlyFee, monthlyTransportFee: _mtf, ...body } =
      req.body as Record<string, unknown>;
    const student = await Student.create({
      ...body,
      organizationId: getScopedOrganizationId(authReq, res)
    });
    res
      .status(201)
      .json({ success: true, data: student, message: "Student created successfully" });
  })
);

studentsRouter.put(
  "/:id",
  ...scopeMiddleware,
  isSuperAdminOrOrgStaff("canManageStudents"),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const { busId: _busId, monthlyFee: _monthlyFee, monthlyTransportFee: _mtf, ...body } =
      req.body as Record<string, unknown>;
    const student = await Student.findOneAndUpdate(
      { _id: req.params.id, ...orgFilter(authReq, res) },
      body,
      { new: true, runValidators: true }
    );
    if (!student) {
      res.status(404).json({ success: false, data: null, message: "Student not found" });
      return;
    }
    res.json({ success: true, data: student, message: "Student updated successfully" });
  })
);

export default studentsRouter;
