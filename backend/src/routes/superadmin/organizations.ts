import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { Types } from "mongoose";

import { auth } from "../../middleware/auth";
import { invalidateOrgFeaturesCache } from "../../middleware/featureFlag";
import { isSuperAdmin } from "../../middleware/roleCheck";
import {
  ORGANIZATION_FEATURE_KEYS,
  Organization,
  type OrganizationFeatures
} from "../../models/Organization";
import { User } from "../../models/User";
import { RefreshToken } from "../../models/RefreshToken";
import { asyncHandler } from "../../utils/asyncHandler";
import { generateUniqueOrgCode } from "../../utils/orgCode";
import { paginateArray, parsePaginationQuery } from "../../utils/paginate";

const organizationsRouter = Router();

const notDeletedFilter = { deletedAt: { $exists: false } };

function buildFeatureUpdate(
  features: unknown
): { ok: true; update: Record<string, boolean> } | { ok: false; message: string } {
  if (typeof features !== "object" || features === null || Array.isArray(features)) {
    return { ok: false, message: "features must be an object of boolean flags" };
  }

  const update: Record<string, boolean> = {};

  for (const [key, value] of Object.entries(features)) {
    if (!ORGANIZATION_FEATURE_KEYS.includes(key as keyof OrganizationFeatures)) {
      return { ok: false, message: `Invalid feature key: ${key}` };
    }
    if (typeof value !== "boolean") {
      return { ok: false, message: `Feature "${key}" must be a boolean` };
    }
    update[key] = value;
  }

  if (Object.keys(update).length === 0) {
    return { ok: false, message: "At least one feature flag is required" };
  }

  return { ok: true, update };
}

function validateNewPassword(
  password: unknown
): { ok: true; password: string } | { ok: false; message: string } {
  if (typeof password !== "string" || password.length === 0) {
    return { ok: false, message: "newPassword is required" };
  }
  if (password.length < 8) {
    return { ok: false, message: "Password must be at least 8 characters" };
  }
  if (!/\d/.test(password)) {
    return { ok: false, message: "Password must contain at least one number" };
  }
  return { ok: true, password };
}

organizationsRouter.get(
  "/",
  auth,
  isSuperAdmin,
  asyncHandler(async (req, res) => {
    const organizations = await Organization.aggregate([
      { $match: notDeletedFilter },
      {
        $lookup: {
          from: "students",
          localField: "_id",
          foreignField: "organizationId",
          as: "students"
        }
      },
      {
        $project: {
          name: 1,
          code: 1,
          address: 1,
          phone: 1,
          email: 1,
          logo: 1,
          plan: 1,
          isActive: 1,
          features: 1,
          studentCount: { $size: "$students" },
          createdAt: 1,
          updatedAt: 1
        }
      },
      { $sort: { name: 1 } }
    ]);

    const { page, limit } = parsePaginationQuery(req.query, 20);
    const { data, pagination } = paginateArray(organizations, page, limit);

    res.json({
      success: true,
      data,
      pagination,
      message: "Organizations fetched successfully"
    });
  })
);

organizationsRouter.post(
  "/",
  auth,
  isSuperAdmin,
  asyncHandler(async (req, res) => {
    const { name, address, phone, email, plan } = req.body as {
      name?: string;
      address?: string;
      phone?: string;
      email?: string;
      plan?: "trial" | "basic" | "pro";
    };

    if (!name) {
      res.status(400).json({
        success: false,
        data: null,
        message: "name is required"
      });
      return;
    }

    const code = await generateUniqueOrgCode(name);
    const organization = await Organization.create({
      name,
      code,
      address,
      phone,
      email,
      plan: plan ?? "trial"
    });

    const slug = code.split("-").slice(0, -1).join("-") || code;
    const adminEmail = email || `admin@${slug}.local`;
    const temporaryPassword = crypto.randomBytes(4).toString("hex");

    const orgAdmin = await User.create({
      name: `${name} Admin`,
      email: adminEmail.toLowerCase(),
      passwordHash: await bcrypt.hash(temporaryPassword, 10),
      role: "orgAdmin",
      organizationId: organization._id,
      isActive: true
    });

    res.status(201).json({
      success: true,
      data: {
        organization,
        adminCredentials: {
          email: orgAdmin.email,
          temporaryPassword
        }
      },
      message: "Organization created successfully"
    });
  })
);

organizationsRouter.get(
  "/:id/admin",
  auth,
  isSuperAdmin,
  asyncHandler(async (req, res) => {
    const organization = await Organization.findById(req.params.id);
    if (!organization) {
      res.status(404).json({
        success: false,
        data: null,
        message: "Organization not found"
      });
      return;
    }

    const admin = await User.findOne({
      organizationId: organization._id,
      role: "orgAdmin"
    })
      .select("_id name email createdAt")
      .sort({ createdAt: 1 })
      .lean<{ _id: Types.ObjectId; name: string; email: string; createdAt: Date }>();

    if (!admin) {
      res.status(404).json({
        success: false,
        data: null,
        message: "Organization admin not found"
      });
      return;
    }

    res.json({
      success: true,
      data: {
        _id: admin._id,
        name: admin.name,
        email: admin.email,
        createdAt: admin.createdAt.toISOString()
      },
      message: "Organization admin fetched successfully"
    });
  })
);

organizationsRouter.post(
  "/:id/reset-password",
  auth,
  isSuperAdmin,
  asyncHandler(async (req, res) => {
    const { newPassword } = req.body as { newPassword?: unknown };
    const parsed = validateNewPassword(newPassword);

    if (!parsed.ok) {
      res.status(400).json({
        success: false,
        data: null,
        message: parsed.message
      });
      return;
    }

    const organization = await Organization.findById(req.params.id);
    if (!organization) {
      res.status(404).json({
        success: false,
        data: null,
        message: "Organization not found"
      });
      return;
    }

    const admin = await User.findOne({
      organizationId: organization._id,
      role: "orgAdmin"
    }).sort({ createdAt: 1 });

    if (!admin) {
      res.status(404).json({
        success: false,
        data: null,
        message: "Organization admin not found"
      });
      return;
    }

    admin.passwordHash = await bcrypt.hash(parsed.password, 12);
    await admin.save();
    await RefreshToken.deleteMany({ userId: admin._id });

    res.json({
      success: true,
      data: null,
      message: "Organization admin password reset successfully"
    });
  })
);

organizationsRouter.patch(
  "/:id/features",
  auth,
  isSuperAdmin,
  asyncHandler(async (req, res) => {
    const { features } = req.body as { features?: Partial<OrganizationFeatures> };
    const parsed = buildFeatureUpdate(features);

    if (!parsed.ok) {
      res.status(400).json({
        success: false,
        data: null,
        message: parsed.message
      });
      return;
    }

    const update: Record<string, boolean> = {};
    for (const [key, value] of Object.entries(parsed.update)) {
      update[`features.${key}`] = value;
    }

    const organization = await Organization.findByIdAndUpdate(req.params.id, update, {
      new: true,
      runValidators: true
    });

    if (!organization) {
      res.status(404).json({
        success: false,
        data: null,
        message: "Organization not found"
      });
      return;
    }

    await invalidateOrgFeaturesCache(String(organization._id));

    res.json({
      success: true,
      data: organization,
      message: "Organization features updated successfully"
    });
  })
);

organizationsRouter.put(
  "/:id",
  auth,
  isSuperAdmin,
  asyncHandler(async (req, res) => {
    const { features, name, address, phone, email, logo, plan, currentAcademicYear } =
      req.body as {
        features?: Partial<OrganizationFeatures>;
        name?: string;
        address?: string;
        phone?: string;
        email?: string;
        logo?: string;
        plan?: "trial" | "basic" | "pro";
        currentAcademicYear?: string;
      };

    const update: Record<string, unknown> = {};

    if (name !== undefined) update.name = name;
    if (address !== undefined) update.address = address;
    if (phone !== undefined) update.phone = phone;
    if (email !== undefined) update.email = email;
    if (logo !== undefined) update.logo = logo;
    if (plan !== undefined) update.plan = plan;
    if (currentAcademicYear !== undefined) update.currentAcademicYear = currentAcademicYear;

    if (features !== undefined) {
      const parsed = buildFeatureUpdate(features);
      if (!parsed.ok) {
        res.status(400).json({
          success: false,
          data: null,
          message: parsed.message
        });
        return;
      }
      for (const [key, value] of Object.entries(parsed.update)) {
        update[`features.${key}`] = value;
      }
    }

    const organization = await Organization.findByIdAndUpdate(req.params.id, update, {
      new: true,
      runValidators: true
    });

    if (!organization) {
      res.status(404).json({
        success: false,
        data: null,
        message: "Organization not found"
      });
      return;
    }

    if (features !== undefined) {
      await invalidateOrgFeaturesCache(String(organization._id));
    }

    res.json({
      success: true,
      data: organization,
      message: "Organization updated successfully"
    });
  })
);

organizationsRouter.put(
  "/:id/status",
  auth,
  isSuperAdmin,
  asyncHandler(async (req, res) => {
    const { isActive } = req.body as { isActive?: boolean };

    if (typeof isActive !== "boolean") {
      res.status(400).json({
        success: false,
        data: null,
        message: "isActive (boolean) is required"
      });
      return;
    }

    const organization = await Organization.findByIdAndUpdate(
      req.params.id,
      { isActive },
      { new: true, runValidators: true }
    );

    if (!organization) {
      res.status(404).json({
        success: false,
        data: null,
        message: "Organization not found"
      });
      return;
    }

    res.json({
      success: true,
      data: organization,
      message: `Organization ${isActive ? "activated" : "deactivated"} successfully`
    });
  })
);

organizationsRouter.delete(
  "/:id",
  auth,
  isSuperAdmin,
  asyncHandler(async (req, res) => {
    const organization = await Organization.findOne({
      _id: req.params.id,
      ...notDeletedFilter
    });

    if (!organization) {
      res.status(404).json({
        success: false,
        data: null,
        message: "Organization not found"
      });
      return;
    }

    organization.isActive = false;
    organization.deletedAt = new Date();
    organization.plan = "cancelled";
    await organization.save();

    await User.updateMany({ organizationId: organization._id }, { isActive: false });
    await RefreshToken.deleteMany({ organizationId: organization._id });
    await invalidateOrgFeaturesCache(String(organization._id));

    res.json({
      success: true,
      data: null,
      message: "Organization deactivated successfully"
    });
  })
);

export default organizationsRouter;
