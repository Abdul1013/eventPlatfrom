import "server-only";
import { cookies } from "next/headers";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { signAccessToken, verifyAccessToken, ACCESS_TOKEN_TTL_SECONDS } from "@/lib/auth/jwt";
import { ACCESS_COOKIE, REFRESH_COOKIE } from "@/lib/auth/constants";

// Cookie-based sessions with refresh rotation. Access = short-lived JWT.
// Refresh = opaque random token, stored only as a SHA-256 hash in Postgres
// (RefreshToken table). Rotating on every use limits replay if a token leaks.

export { ACCESS_COOKIE, REFRESH_COOKIE };

const REFRESH_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

export interface SessionUser {
  id: string;
  role: Role;
}
export interface Session {
  user: SessionUser;
}

const baseCookie = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

// SHA-256 via Web Crypto — works in both Node and Edge runtimes.
async function hashToken(raw: string): Promise<string> {
  const data = new TextEncoder().encode(raw);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function randomToken(): string {
  return crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");
}

async function issueRefreshToken(userId: string): Promise<string> {
  const raw = randomToken();
  const tokenHash = await hashToken(raw);
  const expiresAt = new Date(Date.now() + REFRESH_TTL_SECONDS * 1000);
  await prisma.refreshToken.create({ data: { userId, tokenHash, expiresAt } });
  return raw;
}

/**
 * Create a fresh session for a user: sign an access JWT, mint + persist a
 * refresh token, and set both cookies. Call after a successful login/register.
 */
export async function createSession(userId: string, role: Role): Promise<void> {
  const accessToken = await signAccessToken({ sub: userId, role });
  const rawRefresh = await issueRefreshToken(userId);

  const store = await cookies();
  store.set(ACCESS_COOKIE, accessToken, { ...baseCookie, maxAge: ACCESS_TOKEN_TTL_SECONDS });
  store.set(REFRESH_COOKIE, rawRefresh, { ...baseCookie, maxAge: REFRESH_TTL_SECONDS });
}

/**
 * Resolve the current session. Fast path: a valid access JWT. Slow path: access
 * expired but a valid refresh token exists → rotate and re-issue cookies.
 * Returns null when unauthenticated.
 */
export async function getSession(): Promise<Session | null> {
  const store = await cookies();

  const access = store.get(ACCESS_COOKIE)?.value;
  if (access) {
    const claims = await verifyAccessToken(access);
    if (claims) return { user: { id: claims.sub, role: claims.role } };
  }

  // Access missing/expired — try refresh rotation.
  const rawRefresh = store.get(REFRESH_COOKIE)?.value;
  if (!rawRefresh) return null;

  const tokenHash = await hashToken(rawRefresh);
  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash } });
  if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: stored.userId },
    select: { id: true, role: true },
  });
  if (!user) return null;

  // Rotate: revoke old, mint new, re-issue cookies (best-effort — cookie writes
  // throw inside a Server Component render, which we ignore; the proxy/actions
  // refresh on the next mutation).
  try {
    await prisma.refreshToken.update({
      where: { tokenHash },
      data: { revokedAt: new Date() },
    });
    const newAccess = await signAccessToken({ sub: user.id, role: user.role });
    const newRefresh = await issueRefreshToken(user.id);
    store.set(ACCESS_COOKIE, newAccess, { ...baseCookie, maxAge: ACCESS_TOKEN_TTL_SECONDS });
    store.set(REFRESH_COOKIE, newRefresh, { ...baseCookie, maxAge: REFRESH_TTL_SECONDS });
  } catch {
    // Read-only context; the request is still authenticated for this pass.
  }

  return { user: { id: user.id, role: user.role } };
}

/**
 * Full current-user record (email/name/etc.) for profile/header use.
 */
export async function getCurrentUser() {
  const session = await getSession();
  if (!session) return null;
  return prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, name: true, role: true, avatarUrl: true },
  });
}

/**
 * Revoke the active refresh token and clear cookies.
 */
export async function destroySession(): Promise<void> {
  const store = await cookies();
  const rawRefresh = store.get(REFRESH_COOKIE)?.value;
  if (rawRefresh) {
    const tokenHash = await hashToken(rawRefresh);
    await prisma.refreshToken
      .updateMany({ where: { tokenHash }, data: { revokedAt: new Date() } })
      .catch(() => undefined);
  }
  store.delete(ACCESS_COOKIE);
  store.delete(REFRESH_COOKIE);
}
