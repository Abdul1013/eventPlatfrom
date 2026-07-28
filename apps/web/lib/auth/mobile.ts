import "server-only";
import type { NextRequest } from "next/server";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { signAccessToken, verifyAccessToken, type AccessTokenClaims } from "@/lib/auth/jwt";

// Token-based auth for the native mobile scanner. Unlike the web (httpOnly
// cookies), the Expo app stores tokens in secure storage and sends the access
// token as `Authorization: Bearer <jwt>`. Refresh tokens are opaque, stored
// hashed in Postgres, and rotated on use — same model as the web session layer.

const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days (scanner shifts / kiosks)

async function hashToken(raw: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function randomToken(): string {
  return crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/** Issue a fresh access + refresh token pair for a user (login). */
export async function issueTokenPair(userId: string, role: Role): Promise<TokenPair> {
  const accessToken = await signAccessToken({ sub: userId, role });
  const rawRefresh = randomToken();
  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: await hashToken(rawRefresh),
      expiresAt: new Date(Date.now() + REFRESH_TTL_SECONDS * 1000),
      deviceInfo: "mobile",
    },
  });
  return { accessToken, refreshToken: rawRefresh };
}

/** Rotate a refresh token: validate, revoke old, mint a new pair. Null if invalid. */
export async function rotateTokenPair(rawRefresh: string): Promise<TokenPair | null> {
  const tokenHash = await hashToken(rawRefresh);
  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash } });
  if (!stored || stored.revokedAt || stored.expiresAt < new Date()) return null;

  const user = await prisma.user.findUnique({
    where: { id: stored.userId },
    select: { id: true, role: true },
  });
  if (!user) return null;

  await prisma.refreshToken.update({ where: { tokenHash }, data: { revokedAt: new Date() } });
  return issueTokenPair(user.id, user.role);
}

/** Verify the Bearer access token on a request. Returns claims or null. */
export async function bearerClaims(req: NextRequest): Promise<AccessTokenClaims | null> {
  const header = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!header?.startsWith("Bearer ")) return null;
  return verifyAccessToken(header.slice(7).trim());
}
