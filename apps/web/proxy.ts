import { type NextRequest, NextResponse } from "next/server";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { ACCESS_COOKIE, REFRESH_COOKIE } from "@/lib/auth/constants";

/**
 * Edge middleware (Next.js 16 names it `proxy.ts`) for auth + role-based routing.
 *
 * Runs on the Edge, so it only verifies the access JWT via `jose` — no DB. If the
 * access token is expired but a refresh cookie is present, we let the request
 * through and defer to the server-side session layer (which rotates tokens).
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const publicRoutes = ["/", "/login", "/register"];

  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  const claims = accessToken ? await verifyAccessToken(accessToken) : null;
  const hasRefresh = Boolean(request.cookies.get(REFRESH_COOKIE)?.value);

  // Public routes: send authenticated users hitting "/" to their dashboard.
  if (publicRoutes.includes(pathname)) {
    if (pathname === "/" && claims) {
      return NextResponse.redirect(new URL(`/${claims.role.toLowerCase()}`, request.url));
    }
    return NextResponse.next();
  }

  // Protected routes.
  if (!claims) {
    // Access expired but refresh present → let server-side session refresh it.
    if (hasRefresh) return NextResponse.next();
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const role = claims.role.toLowerCase();
  const startsWith = (prefixes: string[]) => prefixes.some((p) => pathname.startsWith(p));

  if (startsWith(["/admin"]) && role !== "admin") {
    return NextResponse.redirect(new URL(`/${role}`, request.url));
  }
  if (startsWith(["/organizer"]) && !["organizer", "admin"].includes(role)) {
    return NextResponse.redirect(new URL(`/${role}`, request.url));
  }
  if (startsWith(["/gatekeeper"]) && !["gatekeeper", "admin"].includes(role)) {
    return NextResponse.redirect(new URL(`/${role}`, request.url));
  }
  if (startsWith(["/attendee"]) && ["admin", "organizer", "gatekeeper"].includes(role)) {
    return NextResponse.redirect(new URL(`/${role}`, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
