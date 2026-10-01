import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { bearerClaims } from "@/lib/auth/mobile";

// GET /api/v1/events — scannable events for the mobile scanner's event picker.
// Returns PUBLISHED + ONGOING events. Bearer-authed (staff).

export async function GET(req: NextRequest) {
  const claims = await bearerClaims(req);
  if (!claims) {
    return NextResponse.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "Missing or invalid token" } },
      { status: 401 }
    );
  }

  const events = await prisma.event.findMany({
    where: { deletedAt: null, status: { in: ["PUBLISHED", "ONGOING"] } },
    orderBy: { startsAt: "asc" },
    take: 50,
    select: { id: true, title: true, status: true },
  });

  return NextResponse.json({ success: true, data: { events } });
}
