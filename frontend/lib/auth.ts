export type UserRole = "superAdmin" | "orgAdmin" | "staff" | "parent";

export interface StaffPermissions {
  canCollectFees: boolean;
  canManageStudents: boolean;
  canViewReports: boolean;
  canManageBuses: boolean;
}

export interface AuthUser {
  userId: string;
  name: string;
  email?: string;
  role: UserRole;
  organizationId: string | null;
  staffPermissions?: StaffPermissions;
  parentStudentIds?: string[];
}

interface ApiUserPayload {
  id: string;
  name: string;
  email?: string;
  role: UserRole;
  organizationId: string | null;
  permissions?: StaffPermissions;
  parentStudentIds?: string[];
}

interface MeResponse {
  data?: AuthUser;
  user?: ApiUserPayload;
}

let currentUser: AuthUser | null = null;

/**
 * Returns the in-memory authenticated user (never reads tokens from storage).
 */
export const getUser = (): AuthUser | null => currentUser;

/**
 * Stores the authenticated user in memory after login or session refresh.
 */
export const setUser = (user: AuthUser | null): void => {
  currentUser = user;
};

/**
 * Clears the in-memory user without calling the logout API.
 */
export const clearUser = (): void => {
  currentUser = null;
};

const mapApiUser = (user: ApiUserPayload): AuthUser => ({
  userId: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  organizationId: user.organizationId,
  staffPermissions: user.permissions,
  parentStudentIds: user.parentStudentIds
});

const mapMeData = (data: AuthUser): AuthUser => ({
  userId: data.userId,
  name: data.name,
  role: data.role,
  organizationId: data.organizationId ?? null,
  staffPermissions: data.staffPermissions,
  parentStudentIds: data.parentStudentIds
});

/**
 * Hydrates the session from the server using httpOnly cookies.
 * Call on app load and in protected layouts after a page refresh.
 */
export const bootstrapSession = async (): Promise<AuthUser | null> => {
  if (currentUser) {
    return currentUser;
  }

  const { api } = await import("./api");

  try {
    const response = await api.get<MeResponse>("/api/auth/me");
    const payload = response.data;

    if (payload.user) {
      const user = mapApiUser(payload.user);
      setUser(user);
      return user;
    }

    if (payload.data) {
      const user = mapMeData(payload.data);
      setUser(user);
      return user;
    }

    return null;
  } catch {
    clearUser();
    return null;
  }
};

/**
 * Applies login response user payload to in-memory session state.
 */
export const applyLoginUser = (user: ApiUserPayload): AuthUser => {
  const mapped = mapApiUser(user);
  setUser(mapped);
  return mapped;
};

/**
 * Revokes the server session and redirects to the login page.
 */
export const getLoginPathForRole = (role?: UserRole | null): string =>
  role === "parent" ? "/parent/login" : "/login";

export const logout = async (): Promise<void> => {
  const { api } = await import("./api");
  const role = currentUser?.role;

  try {
    await api.post("/api/auth/logout");
  } catch {
    // Still clear local state if the network call fails.
  } finally {
    clearUser();
    if (typeof window !== "undefined") {
      window.location.href = getLoginPathForRole(role);
    }
  }
};

/**
 * Returns the dashboard path for a given role.
 */
export const getRoleDashboardPath = (role: UserRole): string => {
  switch (role) {
    case "superAdmin":
      return "/super/dashboard";
    case "orgAdmin":
      return "/admin/dashboard";
    case "staff":
      return "/staff/dashboard";
    case "parent":
      return "/parent/dashboard";
    default:
      return "/login";
  }
};

/** @returns true when the current user is a super admin. */
export const isSuperAdmin = (): boolean => getUser()?.role === "superAdmin";

/** @returns true when the current user is an organization admin. */
export const isOrgAdmin = (): boolean => getUser()?.role === "orgAdmin";

/** @returns true when the current user is staff. */
export const isStaff = (): boolean => getUser()?.role === "staff";

/** @returns true when the current user is a parent. */
export const isParent = (): boolean => getUser()?.role === "parent";

/**
 * Checks whether the current user has a staff permission (admins always pass).
 */
export const canDo = (permission: keyof StaffPermissions): boolean => {
  const user = getUser();
  if (!user) {
    return false;
  }
  if (user.role === "superAdmin" || user.role === "orgAdmin") {
    return true;
  }
  if (user.role === "staff") {
    return !!user.staffPermissions?.[permission];
  }
  return false;
};
