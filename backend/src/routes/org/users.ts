import { Router, type Response } from "express";
import bcrypt from "bcryptjs";
import { Types } from "mongoose";

import { auth, type AuthenticatedRequest } from "../../middleware/auth";
import { orgScope } from "../../middleware/orgScope";
import { isOrgAdmin } from "../../middleware/roleCheck";
import { Student } from "../../models/Student";
import { User, type IUser } from "../../models/User";
import { syncParentDetailsToLinkedStudents } from "../../services/parentProvisioning";
import { asyncHandler } from "../../utils/asyncHandler";
import { getScopedOrganizationId } from "../../utils/orgFilter";
import { paginate, parsePaginationQuery } from "../../utils/paginate";
import { normalizeIndianMobile } from "../../utils/phone";

const orgUsersRouter = Router();

const orgUserGuard = [auth, orgScope, isOrgAdmin] as const;

const sanitizeUser = (user: IUser) => {
  const obj = user.toObject();
  delete (obj as { passwordHash?: string }).passwordHash;
  return obj;
};

const orgFilterForUser = (req: AuthenticatedRequest, res: Response) => ({
  organizationId: new Types.ObjectId(getScopedOrganizationId(req, res)!)
});

orgUsersRouter.get(
  "/",
  ...orgUserGuard,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const { page, limit } = parsePaginationQuery(req.query, 30);
    const { data, pagination } = await paginate(User, orgFilterForUser(authReq, res), {
      page,
      limit,
      sort: { name: 1 }
    });

    res.json({
      success: true,
      data: data.map(sanitizeUser),
      pagination,
      message: "Organization users fetched successfully"
    });
  })
);

orgUsersRouter.get(
  "/staff",
  ...orgUserGuard,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const staff = await User.find({
      ...orgFilterForUser(authReq, res),
      role: "staff"
    }).select("name email staffPermissions isActive createdAt");

    res.json({
      success: true,
      data: staff,
      message: "Staff users fetched successfully"
    });
  })
);

orgUsersRouter.get(
  "/parents",
  ...orgUserGuard,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const parents = await User.find({
      ...orgFilterForUser(authReq, res),
      role: "parent"
    }).populate("parentStudentIds", "name grade");

    res.json({
      success: true,
      data: parents.map((p) => ({
        _id: p._id,
        name: p.name,
        email: p.email,
        phone: p.phone,
        isActive: p.isActive,
        students: p.parentStudentIds
      })),
      message: "Parent users fetched successfully"
    });
  })
);

orgUsersRouter.post(
  "/",
  ...orgUserGuard,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const orgId = getScopedOrganizationId(authReq, res)!;

    const { name, email, password, phone, role, staffPermissions, parentStudentIds } = req.body as {
      name?: string;
      email?: string;
      password?: string;
      phone?: string;
      role?: "staff" | "parent";
      staffPermissions?: IUser["staffPermissions"];
      parentStudentIds?: string[];
    };

    if (!name || !email || !password || !role) {
      res.status(400).json({
        success: false,
        data: null,
        message: "name, email, password, and role (staff|parent) are required"
      });
      return;
    }

    if (role !== "staff" && role !== "parent") {
      res.status(400).json({
        success: false,
        data: null,
        message: "role must be staff or parent"
      });
      return;
    }

    let normalizedPhone: string | undefined;
    if (role === "parent") {
      if (!phone) {
        res.status(400).json({
          success: false,
          data: null,
          message: "phone is required for parent accounts (mobile OTP login)"
        });
        return;
      }
      const parsed = normalizeIndianMobile(phone);
      if (!parsed) {
        res.status(400).json({
          success: false,
          data: null,
          message: "Enter a valid 10-digit Indian mobile number"
        });
        return;
      }
      normalizedPhone = parsed;

      const phoneTaken = await User.findOne({
        phone: normalizedPhone,
        organizationId: new Types.ObjectId(orgId)
      }).select("_id");
      if (phoneTaken) {
        res.status(400).json({
          success: false,
          data: null,
          message: "A user with this phone number already exists in this organization"
        });
        return;
      }
    }

    if (role === "parent" && parentStudentIds?.length) {
      const count = await Student.countDocuments({
        _id: { $in: parentStudentIds.map((id) => new Types.ObjectId(id)) },
        organizationId: orgId
      });
      if (count !== parentStudentIds.length) {
        res.status(400).json({
          success: false,
          data: null,
          message: "One or more parentStudentIds are invalid for this organization"
        });
        return;
      }
    }

    const user = await User.create({
      name,
      email: email.toLowerCase(),
      phone: normalizedPhone,
      passwordHash: await bcrypt.hash(password, 10),
      role,
      organizationId: new Types.ObjectId(orgId),
      staffPermissions: role === "staff" ? staffPermissions : undefined,
      parentStudentIds:
        role === "parent" && parentStudentIds
          ? parentStudentIds.map((id) => new Types.ObjectId(id))
          : []
    });

    res.status(201).json({
      success: true,
      data: sanitizeUser(user),
      message: "User created successfully"
    });
  })
);

orgUsersRouter.put(
  "/:id",
  ...orgUserGuard,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const updates = { ...req.body } as Record<string, unknown>;
    delete updates.passwordHash;
    delete updates.organizationId;
    delete updates.role;

    if (typeof updates.password === "string") {
      updates.passwordHash = await bcrypt.hash(updates.password, 10);
      delete updates.password;
    }

    if (typeof updates.phone === "string") {
      const parsed = normalizeIndianMobile(updates.phone);
      if (!parsed) {
        res.status(400).json({
          success: false,
          data: null,
          message: "Enter a valid 10-digit Indian mobile number"
        });
        return;
      }
      const orgId = getScopedOrganizationId(authReq, res)!;
      const phoneTaken = await User.findOne({
        phone: parsed,
        organizationId: new Types.ObjectId(orgId),
        _id: { $ne: req.params.id }
      }).select("_id");
      if (phoneTaken) {
        res.status(400).json({
          success: false,
          data: null,
          message: "A user with this phone number already exists in this organization"
        });
        return;
      }
      updates.phone = parsed;
    }

    const user = await User.findOneAndUpdate(
      { _id: req.params.id, ...orgFilterForUser(authReq, res) },
      updates,
      { new: true, runValidators: true }
    );

    if (!user) {
      res.status(404).json({
        success: false,
        data: null,
        message: "User not found in this organization"
      });
      return;
    }

    let studentsSynced = 0;
    if (user.role === "parent" && (updates.name || updates.phone)) {
      studentsSynced = await syncParentDetailsToLinkedStudents({
        parentUserId: user._id,
        parentName: typeof updates.name === "string" ? updates.name : user.name,
        parentPhone: typeof updates.phone === "string" ? String(updates.phone) : user.phone
      });
    }

    res.json({
      success: true,
      data: sanitizeUser(user),
      studentsSynced,
      message:
        user.role === "parent" && studentsSynced > 0
          ? `Parent updated; ${studentsSynced} linked student record(s) synced`
          : "User updated successfully"
    });
  })
);

orgUsersRouter.put(
  "/:id/status",
  ...orgUserGuard,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const { isActive } = req.body as { isActive?: boolean };

    if (typeof isActive !== "boolean") {
      res.status(400).json({
        success: false,
        data: null,
        message: "isActive (boolean) is required"
      });
      return;
    }

    const user = await User.findOneAndUpdate(
      { _id: req.params.id, ...orgFilterForUser(authReq, res) },
      { isActive },
      { new: true }
    );

    if (!user) {
      res.status(404).json({
        success: false,
        data: null,
        message: "User not found in this organization"
      });
      return;
    }

    res.json({
      success: true,
      data: sanitizeUser(user),
      message: `User ${isActive ? "activated" : "deactivated"} successfully`
    });
  })
);

orgUsersRouter.delete(
  "/:id",
  ...orgUserGuard,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;

    const user = await User.findOneAndUpdate(
      { _id: req.params.id, ...orgFilterForUser(authReq, res) },
      { isActive: false },
      { new: true }
    );

    if (!user) {
      res.status(404).json({
        success: false,
        data: null,
        message: "User not found in this organization"
      });
      return;
    }

    res.json({
      success: true,
      data: sanitizeUser(user),
      message: "User deactivated successfully"
    });
  })
);

export default orgUsersRouter;
