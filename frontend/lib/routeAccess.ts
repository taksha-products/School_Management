export type RouteRole = "superAdmin" | "orgAdmin" | "staff" | "parent";

export const getRequiredRoleForPath = (pathname: string): RouteRole | null => {
  if (pathname.startsWith("/super")) {
    return "superAdmin";
  }
  if (pathname.startsWith("/admin")) {
    return "orgAdmin";
  }
  if (pathname.startsWith("/staff")) {
    return "staff";
  }
  if (pathname.startsWith("/parent")) {
    return "parent";
  }
  return null;
};

export const getRoleDashboardPath = (role: RouteRole): string => {
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
