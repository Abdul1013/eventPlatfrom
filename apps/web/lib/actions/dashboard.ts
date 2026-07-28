"use server";

import { prisma } from "@/lib/db";
import { getSession } from "@/lib/actions/auth";

// ─── Attendee overview ────────────────────────────────────────────────────────

export interface AttendeeStats {
  activeTickets: number;
  upcomingEvents: number;
  attendedEvents: number;
}

export interface FeaturedEvent {
  id: string;
  title: string;
  venue_name: string | null;
  starts_at: string;
  banner_url: string | null;
  fromPrice: number | null;
}

export interface AttendeeOverview {
  stats: AttendeeStats;
  featured: FeaturedEvent[];
}

export async function getAttendeeOverview(): Promise<
  { success: true; data: AttendeeOverview } | { success: false; error: string }
> {
  try {
    const session = await getSession();
    if (!session) return { success: false, error: "Not authenticated" };

    const now = new Date();

    const [tickets, events] = await Promise.all([
      prisma.ticket.findMany({
        where: { ownerId: session.user.id },
        select: { status: true, eventId: true, event: { select: { startsAt: true } } },
      }),
      prisma.event.findMany({
        where: { startsAt: { gte: now }, deletedAt: null },
        orderBy: { startsAt: "asc" },
        take: 3,
        select: {
          id: true,
          title: true,
          venueName: true,
          startsAt: true,
          bannerUrl: true,
          ticketTiers: { select: { price: true } },
        },
      }),
    ]);

    let activeTickets = 0;
    let attendedEvents = 0;
    const upcomingEventIds = new Set<string>();
    for (const t of tickets) {
      const startsMs = t.event?.startsAt ? t.event.startsAt.getTime() : 0;
      if (t.status === "ACTIVE") {
        activeTickets += 1;
        if (startsMs > now.getTime()) upcomingEventIds.add(t.eventId);
      } else if (t.status === "USED") {
        attendedEvents += 1;
      }
    }

    const featured: FeaturedEvent[] = events.map((e) => {
      const prices = e.ticketTiers.map((t) => Number(t.price)).filter((p) => !Number.isNaN(p));
      return {
        id: e.id,
        title: e.title,
        venue_name: e.venueName,
        starts_at: e.startsAt.toISOString(),
        banner_url: e.bannerUrl,
        fromPrice: prices.length > 0 ? Math.min(...prices) : null,
      };
    });

    return {
      success: true,
      data: {
        stats: { activeTickets, upcomingEvents: upcomingEventIds.size, attendedEvents },
        featured,
      },
    };
  } catch (err) {
    console.error("[getAttendeeOverview]", err);
    return { success: false, error: "Failed to load dashboard" };
  }
}

// ─── Admin overview ───────────────────────────────────────────────────────────

export interface AdminOverview {
  totalUsers: number;
  totalEvents: number;
  ticketsIssued: number;
  scansToday: number;
}

export async function getAdminOverview(): Promise<
  { success: true; data: AdminOverview } | { success: false; error: string }
> {
  try {
    const session = await getSession();
    if (!session) return { success: false, error: "Not authenticated" };
    if (session.user.role !== "ADMIN") return { success: false, error: "Admin access required" };

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const [totalUsers, totalEvents, ticketsIssued, scansToday] = await Promise.all([
      prisma.user.count(),
      prisma.event.count({ where: { deletedAt: null } }),
      prisma.ticket.count(),
      prisma.checkInLog.count({ where: { scannedAt: { gte: startOfToday } } }),
    ]);

    return { success: true, data: { totalUsers, totalEvents, ticketsIssued, scansToday } };
  } catch (err) {
    console.error("[getAdminOverview]", err);
    return { success: false, error: "Failed to load overview" };
  }
}

// ─── Gatekeeper overview ──────────────────────────────────────────────────────

export interface GatekeeperStats {
  validToday: number;
  duplicatesToday: number;
  rejectionsToday: number;
}

export async function getGatekeeperStats(): Promise<
  { success: true; data: GatekeeperStats } | { success: false; error: string }
> {
  try {
    const session = await getSession();
    if (!session) return { success: false, error: "Not authenticated" };

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const scans = await prisma.checkInLog.findMany({
      where: { gatekeeperId: session.user.id, scannedAt: { gte: startOfToday } },
      select: { result: true },
    });

    let validToday = 0;
    let duplicatesToday = 0;
    let rejectionsToday = 0;
    for (const s of scans) {
      if (s.result === "VALID") validToday += 1;
      else if (s.result === "DUPLICATE") duplicatesToday += 1;
      else if (s.result === "INVALID") rejectionsToday += 1;
    }

    return { success: true, data: { validToday, duplicatesToday, rejectionsToday } };
  } catch (err) {
    console.error("[getGatekeeperStats]", err);
    return { success: false, error: "Failed to load scan stats" };
  }
}
