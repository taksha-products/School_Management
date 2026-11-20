import { Router } from "express";
import bcrypt from "bcryptjs";
import { Types } from "mongoose";

import { auth, type AuthenticatedRequest } from "../../middleware/auth";
import { isSuperAdmin } from "../../middleware/roleCheck";
import { User, type IUser, type UserRole } from "../../models/User";
import { asyncHandler } from "../../utils/asyncHandler";
import { paginate, parsePaginationQuery } from "../../utils/paginate";

const superAdminUsersRouter = Router();

const sanitizeUser = (user: IUser) => {
  const obj = user.toObject();
  delete (obj as { passwordHash?: string }).passwordHash;
  return obj;
};

superAdminUsersRouter.get(
  "/",
  auth,
  isSuperAdmin,
  asyncHandler(async (req, res) => {
    const { page, limit } = parsePaginationQuery(req.query, 30);
    const { data, pagination } = await paginate(User, {}, {
      page,
      limit,
      sort: { createdAt: -1 },
      populate: { path: "organizationId", select: "name code" }
    });

    res.json({
      success: true,
      data: data.map(sanitizeUser),
      pagination,
      message: "Users fetched successfully"
    });
  })
);

superAdminUsersRouter.post(
  "/",
  auth,
  isSuperAdmin,
  asyncHandler(async (req, res) => {
    const {
      name,
      email,
      password,
      role,
      organizationId,
      staffPermissions,
      parentStudentIds
    } = req.body as {
      name?: string;
      email?: string;
      password?: string;
      role?: UserRole;
      organizationId?: string | null;
      staffPermissions?: IUser["staffPermissions"];
      parentStudentIds?: string[];
    };

    if (!name || !email || !password || !role) {
      res.status(400).json({
        success: false,
        data: null,
        message: "name, email, password, and role are required"
      });
      return;
    }

    if (role === "superAdmin" && organizationId) {
      res.status(400).json({
        success: false,
        data: null,
        message: "superAdmin must not have an organizationId"
      });
      return;
    }

    if (role !== "superAdmin" && !organizationId) {
      res.status(400).json({
        success: false,
        data: null,
        message: "organizationId is required for non-superAdmin users"
      });
      return;
    }

    const user = await User.create({
      name,
      email: email.toLowerCase(),
      passwordHash: await bcrypt.hash(password, 10),
      role,
      organizationId: organizationId ? new Types.ObjectId(organizationId) : null,
      staffPermissions: role === "staff" ? staffPermissions : undefined,
      parentStudentIds:
        role === "parent" && parentStudentIds
          ? parentStudentIds.map((id) => new Types.ObjectId(id))
          : undefined
    });

    res.status(201).json({
      success: true,
      data: sanitizeUser(user),
      message: "User created successfully"
    });
  })
);

const SUPER_ADMIN_USER_UPDATE_FIELDS = new Set(["name", "email", "password", "isActive"]);

superAdminUsersRouter.put(
  "/:id",
  auth,
  isSuperAdmin,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const body = req.body as Record<string, unknown>;
    const unknownFields = Object.keys(body).filter(
      (field) => !SUPER_ADMIN_USER_UPDATE_FIELDS.has(field)
    );

    if (unknownFields.length > 0) {
      res.status(400).json({
        success: false,
        data: null,
        message: `Only name, email, password, and isActive may be updated (${unknownFields.join(", ")} rejected)`
      });
      return;
    }

    const existingUser = await User.findById(req.params.id);
    if (!existingUser) {
      res.status(404).json({
        success: false,
        data: null,
        message: "User not found"
      });
      return;
    }

    if (
      authReq.user?.userId === existingUser._id.toString() &&
      body.isActive === false
    ) {
      res.status(400).json({
        success: false,
        data: null,
        message: "You cannot deactivate your own account"
      });
      return;
    }

    const updates: Record<string, unknown> = {};

    if (typeof body.name === "string") {
      const name = body.name.trim();
      if (!name) {
        res.status(400).json({
          success: false,
          data: null,
          message: "name cannot be empty"
        });
        return;
      }
      updates.name = name;
    }

    if (typeof body.email === "string") {
      const email = body.email.trim().toLowerCase();
      if (!email) {
        res.status(400).json({
          success: false,
          data: null,
          message: "email cannot be empty"
        });
        return;
      }
      updates.email = email;
    }

    if (typeof body.password === "string") {
      if (body.password.length < 8) {
        res.status(400).json({
          success: false,
          data: null,
          message: "password must be at least 8 characters"
        });
        return;
      }
      updates.passwordHash = await bcrypt.hash(body.password, 10);
    }

    if (typeof body.isActive === "boolean") {
      updates.isActive = body.isActive;
    }

    if (Object.keys(updates).length === 0) {
      res.status(400).json({
        success: false,
        data: null,
        message: "No valid fields to update"
      });
      return;
    }

    const user = await User.findByIdAndUpdate(existingUser._id, updates, {
      new: true,
      runValidators: true
    }).populate("organizationId", "name code");

    if (!user) {
      res.status(404).json({
        success: false,
        data: null,
        message: "User not found"
      });
      return;
    }

    res.json({
      success: true,
      data: sanitizeUser(user),
      message: "User updated successfully"
    });
  })
);

export default superAdminUsersRouter;
