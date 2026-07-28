import type { Role } from './index.js';

// ─── Auth contracts shared between API and web/mobile clients ─────────────────

export interface AuthTokens {
  /** JWT access token — short-lived (15 min) */
  accessToken: string;
  /** Seconds until access token expires */
  expiresIn: number;
}

export interface JwtPayload {
  /** User UUID */
  userId: string;
  email: string;
  role: Role;
}

/** Safe user object — no Prisma types leak out */
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export interface LoginResponseData {
  tokens: AuthTokens;
  user: AuthUser;
}
