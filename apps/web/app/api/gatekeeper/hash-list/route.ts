import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/actions/auth";

/**
 * GET /api/gatekeeper/hash-list
 *
 * Returns ACTIVE ticket IDs for events starting today (UTC) or later.
 * Requires GATEKEEPER or ADMIN. The client-side syncHashList() pre-populates
 * IndexedDB with these for offline validation.
 */
export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!["GATEKEEPER", "ADMIN"].includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const todayUTC = new Date();
    todayUTC.setUTCHours(0, 0, 0, 0);

    const tickets = await prisma.ticket.findMany({
      where: {
        status: "ACTIVE",
        event: { startsAt: { gte: todayUTC } },
      },
      select: { id: true, event: { select: { title: true } } },
      orderBy: { id: "asc" },
    });

    const now = Date.now();
    const hashList = tickets.map((t) => ({
      ticket_id: t.id,
      event_title: t.event?.title ?? "Unknown Event",
      synced_at: now,
    }));

    return NextResponse.json({ hashList, count: hashList.length, synced_at: now });
  } catch (error) {
    console.error("[/api/gatekeeper/hash-list]", (error as Error).message);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
