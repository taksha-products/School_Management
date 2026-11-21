import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { getBackendUrl } from "./lib/backendUrl";
import {
  getRequiredRoleForPath,
  getRoleDashboardPath,
  type RouteRole
} from "./lib/routeAccess";

const protectedPrefixes = ["/admin", "/super", "/staff", "/parent", "/principal"];

interface MeResponseBody {
  user?: { role?: RouteRole };
  data?: { role?: RouteRole };
}

const appendSetCookies = (target: NextResponse, source: Response): void => {
  if (typeof source.headers.getSetCookie === "function") {
    for (const cookie of source.headers.getSetCookie()) {
      target.headers.append("Set-Cookie", cookie);
    }
    return;
  }

  const single = source.headers.get("set-cookie");
  if (single) {
    target.headers.append("Set-Cookie", single);
  }
};

const getSetCookies = (response: Response): string[] => {
  if (typeof response.headers.getSetCookie === "function") {
    return response.headers.getSetCookie();
  }

  const single = response.headers.get("set-cookie");
  return single ? [single] : [];
};

const mergeCookieHeader = (existing: string, setCookies: string[]): string => {
  const jar = new Map<string, string>();

  for (const part of existing.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) {
      continue;
    }
    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex <= 0) {
      continue;
    }
    jar.set(trimmed.slice(0, equalsIndex), trimmed.slice(equalsIndex + 1));
  }

  for (const setCookie of setCookies) {
    const pair = setCookie.split(";")[0]?.trim();
    if (!pair) {
      continue;
    }
    const equalsIndex = pair.indexOf("=");
    if (equalsIndex <= 0) {
      continue;
    }
    jar.set(pair.slice(0, equalsIndex), pair.slice(equalsIndex + 1));
  }

  return Array.from(jar.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
};

const parseRoleFromMe = (body: MeResponseBody): RouteRole | null =>
  body.user?.role ?? body.data?.role ?? null;

/**
 * Validates the session via /api/auth/me. When the access token expired,
 * silently refreshes using the refresh cookie and forwards new Set-Cookie headers.
 */
const resolveAuthenticatedRole = async (
  request: NextRequest
): Promise<{ role: RouteRole | null; cookieResponse: NextResponse | null }> => {
  const backendUrl = getBackendUrl();
  let cookieHeader = request.headers.get("cookie") ?? "";

  let meResponse = await fetch(`${backendUrl}/api/auth/me`, {
    headers: { cookie: cookieHeader },
    cache: "no-store"
  });

  let refreshResponse: Response | null = null;

  if (!meResponse.ok) {
    refreshResponse = await fetch(`${backendUrl}/api/auth/refresh`, {
      method: "POST",
      headers: { cookie: cookieHeader },
      cache: "no-store"
    });

    if (!refreshResponse.ok) {
      return { role: null, cookieResponse: null };
    }

    cookieHeader = mergeCookieHeader(cookieHeader, getSetCookies(refreshResponse));
    meResponse = await fetch(`${backendUrl}/api/auth/me`, {
      headers: { cookie: cookieHeader },
      cache: "no-store"
    });
  }

  if (!meResponse.ok) {
    return { role: null, cookieResponse: null };
  }

  const body = (await meResponse.json()) as MeResponseBody;
  const role = parseRoleFromMe(body);

  if (!refreshResponse) {
    return { role, cookieResponse: null };
  }

  const cookieResponse = NextResponse.next();
  appendSetCookies(cookieResponse, refreshResponse);
  return { role, cookieResponse };
};

/**
 * Next.js edge middleware — validates session by forwarding browser cookies to the API.
 * Calls the backend directly (middleware runs before Next.js rewrites).
 */
const loginPathForPrefix = (pathname: string): string =>
  pathname.startsWith("/parent") ? "/parent/login" : "/login";

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  // Public parent OTP login — must not require an authenticated session.
  if (pathname === "/parent/login" || pathname.startsWith("/parent/login/")) {
    return NextResponse.next();
  }

  if (!protectedPrefixes.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  try {
    const { role, cookieResponse } = await resolveAuthenticatedRole(request);

    if (!role) {
      return NextResponse.redirect(new URL(loginPathForPrefix(pathname), request.url));
    }

    if (pathname.startsWith("/principal")) {
      return NextResponse.redirect(new URL(getRoleDashboardPath(role), request.url));
    }

    const requiredRole = getRequiredRoleForPath(pathname);
    if (requiredRole && role !== requiredRole) {
      return NextResponse.redirect(new URL(getRoleDashboardPath(role), request.url));
    }

    return cookieResponse ?? NextResponse.next();
  } catch {
    return NextResponse.redirect(new URL(loginPathForPrefix(pathname), request.url));
  }
}

export const config = {
  matcher: ["/admin/:path*", "/super/:path*", "/staff/:path*", "/parent/:path*", "/principal/:path*"]
};
