import { Router } from "express";
import bcrypt from "bcryptjs";
import { Types } from "mongoose";

import { auth } from "../../middleware/auth";
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

superAdminUsersRouter.put(
  "/:id",
  auth,
  isSuperAdmin,
  asyncHandler(async (req, res) => {
    const updates = { ...req.body } as Record<string, unknown>;
    delete updates.passwordHash;

    if (typeof updates.password === "string") {
      updates.passwordHash = await bcrypt.hash(updates.password, 10);
      delete updates.password;
    }

    const user = await User.findByIdAndUpdate(req.params.id, updates, {
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
