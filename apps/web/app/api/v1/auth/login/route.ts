import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/password";
import { issueTokenPair } from "@/lib/auth/mobile";
import { ACCESS_TOKEN_TTL_SECONDS } from "@/lib/auth/jwt";

// POST /api/v1/auth/login — token-based login for the mobile scanner.
// Body: { email, password }. Returns { data: { tokens, user } }.

const Body = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: "BAD_REQUEST", message: "Email and password required" } },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
    if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "Invalid email or password" } },
        { status: 401 }
      );
    }

    const { accessToken, refreshToken } = await issueTokenPair(user.id, user.role);

    return NextResponse.json({
      success: true,
      data: {
        tokens: { accessToken, refreshToken, expiresIn: ACCESS_TOKEN_TTL_SECONDS },
        user: { id: user.id, email: user.email, name: user.name, role: user.role },
      },
    });
  } catch (error) {
    console.error("[/api/v1/auth/login]", (error as Error).message);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL", message: "Login failed" } },
      { status: 500 }
    );
  }
}
