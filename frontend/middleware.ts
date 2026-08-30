import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { getBackendUrl } from "./lib/backendUrl";

const protectedPrefixes = ["/admin", "/super", "/staff", "/parent", "/principal"];

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

/**
 * Validates the session via /api/auth/me. When the access token expired,
 * silently refreshes using the refresh cookie and forwards new Set-Cookie headers.
 */
const ensureAuthenticatedSession = async (
  request: NextRequest
): Promise<NextResponse | null> => {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const backendUrl = getBackendUrl();

  const meResponse = await fetch(`${backendUrl}/api/auth/me`, {
    headers: { cookie: cookieHeader },
    cache: "no-store"
  });

  if (meResponse.ok) {
    return null;
  }

  const refreshResponse = await fetch(`${backendUrl}/api/auth/refresh`, {
    method: "POST",
    headers: { cookie: cookieHeader },
    cache: "no-store"
  });

  if (!refreshResponse.ok) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const response = NextResponse.next();
  appendSetCookies(response, refreshResponse);
  return response;
};

/**
 * Next.js edge middleware — validates session by forwarding browser cookies to the API.
 * Calls the backend directly (middleware runs before Next.js rewrites).
 */
export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  if (!protectedPrefixes.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  try {
    const sessionResponse = await ensureAuthenticatedSession(request);
    if (sessionResponse) {
      return sessionResponse;
    }
  } catch {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/super/:path*", "/staff/:path*", "/parent/:path*", "/principal/:path*"]
};
