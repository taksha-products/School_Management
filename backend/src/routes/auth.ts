import { Router } from "express";
import bcrypt from "bcryptjs";

import { auth, type AuthenticatedRequest } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { Organization } from "../models/Organization";
import { User } from "../models/User";
import { asyncHandler } from "../utils/asyncHandler";
import { signUserToken } from "../utils/jwt";
import { loginValidation } from "../validators/auth";

const authRouter = Router();

authRouter.post(
  "/login",
  loginValidation,
  validate,
  asyncHandler(async (req, res) => {
    const { email, password } = req.body as { email: string; password: string };

    const user = await User.findOne({ email });
    if (!user || !user.isActive) {
      res.status(401).json({
        success: false,
        data: null,
        message: "Invalid credentials"
      });
      return;
    }

    const passwordMatched = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatched) {
      res.status(401).json({
        success: false,
        data: null,
        message: "Invalid credentials"
      });
      return;
    }

    if (user.organizationId) {
      const organization = await Organization.findById(user.organizationId);
      if (!organization?.isActive) {
        res.status(401).json({
          success: false,
          data: null,
          message: "Invalid credentials"
        });
        return;
      }
    }

    let token: string;
    try {
      token = signUserToken(user);
    } catch {
      res.status(500).json({
        success: false,
        data: null,
        message: "JWT secret is not configured"
      });
      return;
    }

    res.json({
      success: true,
      data: {
        token,
        role: user.role,
        name: user.name,
        organizationId: user.organizationId ? user.organizationId.toString() : null,
        staffPermissions: user.staffPermissions,
        parentStudentIds: user.parentStudentIds?.map((id) => id.toString())
      }
    });
  })
);

authRouter.post(
  "/me",
  auth,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;

    if (!authReq.user) {
      res.status(401).json({
        success: false,
        data: null,
        message: "Unauthorized"
      });
      return;
    }

    res.json({
      success: true,
      data: authReq.user
    });
  })
);

export default authRouter;
