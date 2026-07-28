"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import {
  createSession,
  destroySession,
  getSession as _getSession,
  type Session,
} from "@/lib/auth/session";

export interface AuthResponse {
  success: boolean;
  error?: string;
  message?: string;
}

const CredentialsSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

/**
 * Sign in with email + password. On success, sets the session cookies.
 */
export async function signIn(email: string, password: string): Promise<AuthResponse> {
  try {
    const parsed = CredentialsSchema.safeParse({ email, password });
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message };
    }

    const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
    if (!user) return { success: false, error: "Invalid email or password" };

    const ok = await verifyPassword(parsed.data.password, user.passwordHash);
    if (!ok) return { success: false, error: "Invalid email or password" };

    await createSession(user.id, user.role);
    return { success: true, message: "Signed in successfully" };
  } catch (error) {
    console.error("[signIn]", error);
    return { success: false, error: "An unexpected error occurred" };
  }
}

/**
 * Register a new attendee, then sign them in (no email confirmation in Phase 1).
 */
export async function signUp(
  email: string,
  password: string,
  fullName?: string
): Promise<AuthResponse> {
  try {
    const parsed = CredentialsSchema.safeParse({ email, password });
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message };
    }

    const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } });
    if (existing) return { success: false, error: "An account with this email already exists" };

    const passwordHash = await hashPassword(parsed.data.password);
    const user = await prisma.user.create({
      data: {
        email: parsed.data.email,
        passwordHash,
        name: fullName?.trim() || parsed.data.email.split("@")[0]!,
        role: "ATTENDEE",
      },
      select: { id: true, role: true },
    });

    await createSession(user.id, user.role);
    return { success: true, message: "Account created" };
  } catch (error) {
    console.error("[signUp]", error);
    return { success: false, error: "An unexpected error occurred" };
  }
}

/**
 * Sign out: revoke refresh token, clear cookies, redirect to login.
 */
export async function signOut(): Promise<void> {
  try {
    await destroySession();
  } catch (error) {
    console.error("[signOut]", error);
  }
  redirect("/login");
}

/**
 * Current session ({ user: { id, role } }) or null. Re-exported so existing
 * server actions can keep importing it from "@/lib/actions/auth".
 */
export async function getSession(): Promise<Session | null> {
  return _getSession();
}

/**
 * Look up a user's role.
 */
export async function getUserRole(userId: string): Promise<string | null> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    return user?.role ?? null;
  } catch (error) {
    console.error("[getUserRole]", error);
    return null;
  }
}
