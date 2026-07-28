import { SignJWT, jwtVerify } from "jose";
import type { Role } from "@prisma/client";

// Access-token JWT via `jose` (works in both Node and Edge runtimes — needed
// because the proxy/middleware runs on the Edge). Refresh tokens are opaque
// random strings stored hashed in Postgres (see lib/auth/session.ts), following
// EventFlow's refresh-rotation model but without its Redis dependency.

export interface AccessTokenClaims {
  sub: string; // user id
  role: Role;
}

const ACCESS_TTL_SECONDS = 15 * 60; // 15 minutes

function accessSecret(): Uint8Array {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) throw new Error("JWT_ACCESS_SECRET is not set");
  return new TextEncoder().encode(secret);
}

export async function signAccessToken(claims: AccessTokenClaims): Promise<string> {
  return new SignJWT({ role: claims.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TTL_SECONDS}s`)
    .sign(accessSecret());
}

export async function verifyAccessToken(token: string): Promise<AccessTokenClaims | null> {
  try {
    const { payload } = await jwtVerify(token, accessSecret());
    if (!payload.sub || !payload.role) return null;
    return { sub: payload.sub, role: payload.role as Role };
  } catch {
    return null;
  }
}

export const ACCESS_TOKEN_TTL_SECONDS = ACCESS_TTL_SECONDS;
