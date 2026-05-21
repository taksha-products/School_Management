import type { DecodedAuthUser } from "../middleware/auth";

declare global {
  namespace Express {
    interface Locals {
      organizationId?: string | null;
    }

    interface Request {
      user?: DecodedAuthUser;
    }
  }
}

export {};
