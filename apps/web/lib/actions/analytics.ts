"use server";

import { prisma } from "@/lib/db";
import { getSession } from "@/lib/actions/auth";

// ─── Organizer types ──────────────────────────────────────────────────────────

export interface EventSalesSummary {
  event_id: string;
  title: string;
  starts_at: string;
  total_capacity: number;
  total_sold: number;
  revenue: number;
  sell_through: number; // 0–100 %
}

export interface DailySale {
  date: string;
  tickets: number;
  revenue: number;
}

export interface StatusBreakdown {
  status: string;
  count: number;
}

export interface OrganizerAnalytics {
  events: EventSalesSummary[];
  dailySales: DailySale[];
  statusBreakdown: StatusBreakdown[];
  totals: { revenue: number; sold: number; capacity: number; events: number };
}

// ─── Admin types ──────────────────────────────────────────────────────────────

export interface ScanEventRow {
  id: string;
  result: string;
  scanned_at: string;
  ticket_id: string;
  gatekeeper_email: string;
  gatekeeper_name: string;
}

export interface DailyScanCount {
  date: string;
  valid: number;
  duplicate: number;
  invalid: number;
}

export interface UserRow {
  id: string;
  email: string;
  full_name: string;
  role: string;
  created_at: string;
}

export interface AdminLogs {
  scanEvents: ScanEventRow[];
  dailyScans: DailyScanCount[];
  users: UserRow[];
  totals: { totalUsers: number; totalScans: number; validScans: number; todayScans: number };
}

export interface AdminEventRow {
  id: string;
  title: string;
  venue_name: string;
  starts_at: string;
  ends_at: string;
  organizer_name: string;
  total_capacity: number;
  total_sold: number;
  tier_count: number;
}

const VALID_ROLES = ["ADMIN", "ORGANIZER", "ATTENDEE", "GATEKEEPER"] as const;
type ValidRole = (typeof VALID_ROLES)[number];

async function requireAdmin() {
  const session = await getSession();
  if (!session) return { ok: false as const, error: "Not authenticated" };
  if (session.user.role !== "ADMIN") return { ok: false as const, error: "Admin access required" };
  return { ok: true as const, userId: session.user.id };
}

// ─── Organizer analytics ──────────────────────────────────────────────────────

export async function getOrganizerAnalytics(): Promise<
  { success: true; data: OrganizerAnalytics } | { success: false; error: string }
> {
  try {
    const session = await getSession();
    if (!session) return { success: false, error: "Not authenticated" };
    if (!["ORGANIZER", "ADMIN"].includes(session.user.role)) {
      return { success: false, error: "Access denied" };
    }

    const rawEvents = await prisma.event.findMany({
      where: { organizerId: session.user.id, deletedAt: null },
      orderBy: { startsAt: "desc" },
      select: {
        id: true,
        title: true,
        startsAt: true,
        ticketTiers: { select: { capacity: true } },
      },
    });
    const eventIds = rawEvents.map((e) => e.id);

    // Revenue + sold come from PAID orders — never from tier.sold, which now
    // includes reserved-but-unpaid inventory. Refunded orders (status REFUNDED)
    // are excluded, so both figures reflect real, retained sales.
    const paidOrders = eventIds.length
      ? await prisma.order.findMany({
          where: { status: "PAID", eventId: { in: eventIds } },
          select: { eventId: true, amount: true, paidAt: true, _count: { select: { tickets: true } } },
        })
      : [];

    const perEvent = new Map<string, { revenue: number; sold: number }>();
    for (const o of paidOrders) {
      const cur = perEvent.get(o.eventId) ?? { revenue: 0, sold: 0 };
      cur.revenue += Number(o.amount);
      cur.sold += o._count.tickets;
      perEvent.set(o.eventId, cur);
    }

    const events: EventSalesSummary[] = rawEvents.map((e) => {
      const total_capacity = e.ticketTiers.reduce((s, t) => s + t.capacity, 0);
      const agg = perEvent.get(e.id) ?? { revenue: 0, sold: 0 };
      return {
        event_id: e.id,
        title: e.title,
        starts_at: e.startsAt.toISOString(),
        total_capacity,
        total_sold: agg.sold,
        revenue: agg.revenue,
        sell_through: total_capacity > 0 ? Math.round((agg.sold / total_capacity) * 100) : 0,
      };
    });

    let statusBreakdown: StatusBreakdown[] = [];
    let dailySales: DailySale[] = [];

    if (eventIds.length > 0) {
      const grouped = await prisma.ticket.groupBy({
        by: ["status"],
        where: { eventId: { in: eventIds } },
        _count: { _all: true },
      });
      statusBreakdown = grouped.map((g) => ({ status: g.status, count: g._count._all }));

      // Daily paid sales (revenue + tickets) over the last 30 days, by paidAt.
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const byDay: Record<string, { tickets: number; revenue: number }> = {};
      for (const o of paidOrders) {
        if (!o.paidAt || o.paidAt < thirtyDaysAgo) continue;
        const day = o.paidAt.toISOString().slice(0, 10);
        if (!byDay[day]) byDay[day] = { tickets: 0, revenue: 0 };
        byDay[day].tickets += o._count.tickets;
        byDay[day].revenue += Number(o.amount);
      }
      dailySales = Object.entries(byDay)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, v]) => ({ date, ...v }));
    }

    const totals = {
      revenue: events.reduce((s, e) => s + e.revenue, 0),
      sold: events.reduce((s, e) => s + e.total_sold, 0),
      capacity: events.reduce((s, e) => s + e.total_capacity, 0),
      events: events.length,
    };

    return { success: true, data: { events, dailySales, statusBreakdown, totals } };
  } catch (err) {
    console.error("[getOrganizerAnalytics]", err);
    return { success: false, error: "Failed to load analytics" };
  }
}

// ─── Admin user management ────────────────────────────────────────────────────

export async function getAdminUsers(): Promise<
  { success: true; users: UserRow[] } | { success: false; error: string }
> {
  try {
    const admin = await requireAdmin();
    if (!admin.ok) return { success: false, error: admin.error };

    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      select: { id: true, email: true, name: true, role: true, createdAt: true },
    });

    return {
      success: true,
      users: users.map((u) => ({
        id: u.id,
        email: u.email,
        full_name: u.name,
        role: u.role,
        created_at: u.createdAt.toISOString(),
      })),
    };
  } catch (err) {
    console.error("[getAdminUsers]", err);
    return { success: false, error: "Failed to load users" };
  }
}

export async function updateUserRole(
  targetUserId: string,
  newRole: string
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!VALID_ROLES.includes(newRole as ValidRole)) {
      return { success: false, error: "Invalid role" };
    }

    const admin = await requireAdmin();
    if (!admin.ok) return { success: false, error: admin.error };
    if (admin.userId === targetUserId) {
      return { success: false, error: "Cannot change your own role" };
    }

    await prisma.user.update({
      where: { id: targetUserId },
      data: { role: newRole as ValidRole },
    });
    return { success: true };
  } catch (err) {
    console.error("[updateUserRole]", err);
    return { success: false, error: "Failed to update role" };
  }
}

export async function getAdminAllEvents(): Promise<
  { success: true; events: AdminEventRow[] } | { success: false; error: string }
> {
  try {
    const admin = await requireAdmin();
    if (!admin.ok) return { success: false, error: admin.error };

    const rows = await prisma.event.findMany({
      where: { deletedAt: null },
      orderBy: { startsAt: "desc" },
      include: {
        organizer: { select: { name: true } },
        ticketTiers: { select: { capacity: true, sold: true } },
      },
    });

    const events: AdminEventRow[] = rows.map((e) => ({
      id: e.id,
      title: e.title,
      venue_name: e.venueName,
      starts_at: e.startsAt.toISOString(),
      ends_at: e.endsAt.toISOString(),
      organizer_name: e.organizer?.name ?? "Unknown",
      total_capacity: e.ticketTiers.reduce((s, t) => s + t.capacity, 0),
      total_sold: e.ticketTiers.reduce((s, t) => s + t.sold, 0),
      tier_count: e.ticketTiers.length,
    }));

    return { success: true, events };
  } catch (err) {
    console.error("[getAdminAllEvents]", err);
    return { success: false, error: "Failed to load events" };
  }
}

export async function getAdminLogs(): Promise<
  { success: true; data: AdminLogs } | { success: false; error: string }
> {
  try {
    const admin = await requireAdmin();
    if (!admin.ok) return { success: false, error: admin.error };

    const scans = await prisma.checkInLog.findMany({
      orderBy: { scannedAt: "desc" },
      take: 200,
      include: { gatekeeper: { select: { email: true, name: true } } },
    });

    const scanEvents: ScanEventRow[] = scans.map((s) => ({
      id: s.id,
      result: s.result,
      scanned_at: s.scannedAt.toISOString(),
      ticket_id: s.ticketId,
      gatekeeper_email: s.gatekeeper?.email ?? "Unknown",
      gatekeeper_name: s.gatekeeper?.name ?? "Unknown",
    }));

    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
    const allScans = await prisma.checkInLog.findMany({
      where: { scannedAt: { gte: fourteenDaysAgo } },
      select: { result: true, scannedAt: true },
    });

    const byDay: Record<string, DailyScanCount> = {};
    for (const s of allScans) {
      const day = s.scannedAt.toISOString().slice(0, 10);
      if (!byDay[day]) byDay[day] = { date: day, valid: 0, duplicate: 0, invalid: 0 };
      const key = s.result.toLowerCase() as "valid" | "duplicate" | "invalid";
      if (key in byDay[day]) byDay[day][key]++;
    }
    const dailyScans = Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date));

    const rawUsers = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { id: true, email: true, name: true, role: true, createdAt: true },
    });
    const users: UserRow[] = rawUsers.map((u) => ({
      id: u.id,
      email: u.email,
      full_name: u.name,
      role: u.role,
      created_at: u.createdAt.toISOString(),
    }));

    const todayStr = new Date().toISOString().slice(0, 10);
    const todayScans = allScans.filter(
      (s) => s.scannedAt.toISOString().slice(0, 10) === todayStr
    ).length;
    const validScans = allScans.filter((s) => s.result === "VALID").length;

    const totals = {
      totalUsers: users.length,
      totalScans: scans.length,
      validScans,
      todayScans,
    };

    return { success: true, data: { scanEvents, dailyScans, users, totals } };
  } catch (err) {
    console.error("[getAdminLogs]", err);
    return { success: false, error: "Failed to load admin logs" };
  }
}
