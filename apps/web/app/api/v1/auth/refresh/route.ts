import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { rotateTokenPair } from "@/lib/auth/mobile";
import { ACCESS_TOKEN_TTL_SECONDS } from "@/lib/auth/jwt";

// POST /api/v1/auth/refresh — rotate the mobile refresh token.
// Body: { refreshToken }. Returns { data: { accessToken, refreshToken } }.

const Body = z.object({ refreshToken: z.string().min(1) });

export async function POST(req: NextRequest) {
  try {
    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: "BAD_REQUEST", message: "refreshToken required" } },
        { status: 400 }
      );
    }

    const pair = await rotateTokenPair(parsed.data.refreshToken);
    if (!pair) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "Invalid refresh token" } },
        { status: 401 }
      );
    }

    return NextResponse.json({
      success: true,
      data: { ...pair, expiresIn: ACCESS_TOKEN_TTL_SECONDS },
    });
  } catch (error) {
    console.error("[/api/v1/auth/refresh]", (error as Error).message);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL", message: "Refresh failed" } },
      { status: 500 }
    );
  }
}
