import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";

import { auth } from "../../middleware/auth";
import { isSuperAdmin } from "../../middleware/roleCheck";
import { Organization } from "../../models/Organization";
import { Student } from "../../models/Student";
import { User } from "../../models/User";
import { asyncHandler } from "../../utils/asyncHandler";
import { generateUniqueOrgCode } from "../../utils/orgCode";
import { paginateArray, parsePaginationQuery } from "../../utils/paginate";

const organizationsRouter = Router();

organizationsRouter.get(
  "/",
  auth,
  isSuperAdmin,
  asyncHandler(async (req, res) => {
    const organizations = await Organization.aggregate([
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

organizationsRouter.put(
  "/:id",
  auth,
  isSuperAdmin,
  asyncHandler(async (req, res) => {
    const organization = await Organization.findByIdAndUpdate(req.params.id, req.body, {
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

export default organizationsRouter;
