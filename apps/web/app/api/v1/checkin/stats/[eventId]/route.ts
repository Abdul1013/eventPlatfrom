import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { bearerClaims } from "@/lib/auth/mobile";
import type { CheckInStats } from "@/lib/checkin/types";

// GET /api/v1/checkin/stats/:eventId — live check-in stats for the scanner bar.
// Bearer-authed. (Next 16: route params are async.)

export async function GET(req: NextRequest, ctx: { params: Promise<{ eventId: string }> }) {
  const claims = await bearerClaims(req);
  if (!claims) {
    return NextResponse.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "Missing or invalid token" } },
      { status: 401 }
    );
  }

  const { eventId } = await ctx.params;

  const [totalTickets, checkedIn, errorCount, recent] = await Promise.all([
    prisma.ticket.count({ where: { eventId } }),
    prisma.ticket.count({ where: { eventId, status: "USED" } }),
    prisma.checkInLog.count({ where: { ticket: { eventId }, result: { in: ["DUPLICATE", "INVALID"] } } }),
    prisma.checkInLog.findMany({
      where: { ticket: { eventId } },
      orderBy: { scannedAt: "desc" },
      take: 5,
      select: {
        id: true,
        result: true,
        scannedAt: true,
        ticket: { select: { owner: { select: { name: true } } } },
      },
    }),
  ]);

  const stats: CheckInStats = {
    totalTickets,
    checkedIn,
    remaining: Math.max(0, totalTickets - checkedIn),
    checkInRate: totalTickets > 0 ? (checkedIn / totalTickets) * 100 : 0,
    errorCount,
    recentScans: recent.map((r) => ({
      id: r.id,
      attendeeName: r.ticket?.owner?.name ?? "Unknown",
      result: r.result,
      scannedAt: r.scannedAt.toISOString(),
    })),
    cacheHit: false,
  };

  return NextResponse.json({ success: true, data: stats });
}
