import jwt from "jsonwebtoken";

import type { IUser } from "../models/User";

export const signUserToken = (user: IUser): string => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT secret is not configured");
  }

  return jwt.sign(
    {
      userId: user._id.toString(),
      role: user.role,
      organizationId: user.organizationId ? user.organizationId.toString() : null,
      name: user.name,
      staffPermissions: user.staffPermissions,
      parentStudentIds: user.parentStudentIds?.map((id) => id.toString())
    },
    secret,
    { expiresIn: "7d" }
  );
};
