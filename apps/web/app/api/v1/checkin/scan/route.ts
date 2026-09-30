import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { bearerClaims } from "@/lib/auth/mobile";
import { recordGatekeeperScan, type ScanOutcome } from "@/lib/checkin/validate";
import type { ScanResultCode } from "@/lib/checkin/types";

// POST /api/v1/checkin/scan — mobile gatekeeper scan.
// Body: { token, deviceInfo? }. Returns { data: { result, message } }.

const Body = z.object({
  token: z.string().min(1),
  deviceInfo: z.string().optional(),
});

// Map the shared check-in outcome to the mobile ScanResultCode contract.
const OUTCOME_TO_CODE: Record<ScanOutcome, ScanResultCode> = {
  valid: "VALID",
  duplicate: "ALREADY_USED",
  invalid: "INVALID_TOKEN",
};

export async function POST(req: NextRequest) {
  const claims = await bearerClaims(req);
  if (!claims) {
    return NextResponse.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "Missing or invalid token" } },
      { status: 401 }
    );
  }
  if (!["GATEKEEPER", "ADMIN"].includes(claims.role)) {
    return NextResponse.json(
      { success: false, error: { code: "FORBIDDEN", message: "Gatekeeper role required" } },
      { status: 403 }
    );
  }

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: { code: "BAD_REQUEST", message: "token required" } },
      { status: 400 }
    );
  }

  try {
    const result = await recordGatekeeperScan(
      parsed.data.token,
      claims.sub,
      parsed.data.deviceInfo ?? "EventMerge Staff App"
    );
    return NextResponse.json({
      success: true,
      data: { result: OUTCOME_TO_CODE[result.outcome], message: result.detail },
    });
  } catch (error) {
    console.error("[/api/v1/checkin/scan]", (error as Error).message);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL", message: "Scan service unavailable" } },
      { status: 500 }
    );
  }
}
