"use server";

import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/actions/auth";

// The web UI (ported from TruffleEvents) reads snake_case fields, so these
// actions map Prisma's camelCase results back into snake_case shapes. This keeps
// the data-layer swap (Supabase → Neon/Prisma) invisible to the UI components.

const num = (d: Prisma.Decimal | number): number => Number(d);
const iso = (d: Date): string => d.toISOString();

const CreateEventSchema = z
  .object({
    title: z.string().min(3, "Title must be at least 3 characters").max(255),
    description: z.string().min(10, "Description must be at least 10 characters").max(2000),
    venueLocation: z.string().min(3, "Venue location must be at least 3 characters").max(255),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    bannerUrl: z.string().url("Banner URL must be valid").optional(),
    venueId: z.string().uuid("Invalid venue ID").optional(),
    isSeated: z.coerce.boolean().optional(),
    city: z.string().max(80).optional(),
    category: z
      .enum([
        "MUSIC", "CONFERENCE", "COMEDY", "NIGHTLIFE", "SPORTS", "FESTIVAL",
        "WORKSHOP", "RELIGIOUS", "FOOD_DRINK", "THEATRE", "OTHER",
      ])
      .optional(),
  })
  .refine((data) => data.startsAt < data.endsAt, {
    message: "Event must end after it starts",
    path: ["endsAt"],
  });

export type CreateEventInput = z.infer<typeof CreateEventSchema>;

export async function createEvent(
  input: CreateEventInput
): Promise<{ success: boolean; eventId?: string; error?: string }> {
  try {
    const session = await getSession();
    if (!session) return { success: false, error: "Not authenticated" };
    if (!["ORGANIZER", "ADMIN"].includes(session.user.role)) {
      return { success: false, error: "Only organizers can create events" };
    }

    const data = CreateEventSchema.parse(input);

    const event = await prisma.event.create({
      data: {
        organizerId: session.user.id,
        title: data.title,
        description: data.description,
        venueName: data.venueLocation,
        startsAt: data.startsAt,
        endsAt: data.endsAt,
        bannerUrl: data.bannerUrl ?? null,
        venueId: data.venueId ?? null,
        isSeated: data.isSeated ?? Boolean(data.venueId),
        city: data.city?.trim() || null,
        category: data.category ?? "OTHER",
        status: "PUBLISHED",
      },
      select: { id: true },
    });

    return { success: true, eventId: event.id };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues[0]?.message || "Validation failed" };
    }
    console.error("[createEvent]", error);
    return { success: false, error: "An unexpected error occurred" };
  }
}

const CreateTicketTierSchema = z.object({
  eventId: z.string().uuid("Invalid event ID"),
  tierName: z.string().min(2, "Tier name must be at least 2 characters").max(50),
  price: z.coerce.number().min(0, "Price must be non-negative").max(99999.99),
  capacity: z.coerce.number().int().min(1, "Capacity must be at least 1").max(100000),
});

export type CreateTicketTierInput = z.infer<typeof CreateTicketTierSchema>;

export async function createTicketTier(
  input: CreateTicketTierInput
): Promise<{ success: boolean; tierId?: string; error?: string }> {
  try {
    const session = await getSession();
    if (!session) return { success: false, error: "Not authenticated" };

    const data = CreateTicketTierSchema.parse(input);

    const event = await prisma.event.findUnique({
      where: { id: data.eventId },
      select: { organizerId: true },
    });
    if (!event) return { success: false, error: "Event not found" };
    if (event.organizerId !== session.user.id && session.user.role !== "ADMIN") {
      return { success: false, error: "You can only manage your own events" };
    }

    const tier = await prisma.ticketTier.create({
      data: {
        eventId: data.eventId,
        name: data.tierName,
        price: data.price,
        capacity: data.capacity,
      },
      select: { id: true },
    });

    return { success: true, tierId: tier.id };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues[0]?.message || "Validation failed" };
    }
    console.error("[createTicketTier]", error);
    return { success: false, error: "An unexpected error occurred" };
  }
}

// Shared shape → keeps the UI's snake_case expectations.
function toEventShape(e: {
  id: string;
  title: string;
  description: string;
  venueName: string;
  city?: string | null;
  category?: string;
  startsAt: Date;
  endsAt: Date;
  bannerUrl: string | null;
  organizerId: string;
  organizer?: { name: string; email?: string } | null;
  ticketTiers?: { id: string; name?: string; price: Prisma.Decimal; capacity: number; sold: number }[];
}) {
  return {
    id: e.id,
    title: e.title,
    description: e.description,
    venue_name: e.venueName,
    city: e.city ?? null,
    category: e.category ?? "OTHER",
    starts_at: iso(e.startsAt),
    ends_at: iso(e.endsAt),
    banner_url: e.bannerUrl,
    organizer_id: e.organizerId,
    profiles: e.organizer
      ? { full_name: e.organizer.name, email: e.organizer.email }
      : null,
    ticket_tiers: (e.ticketTiers ?? []).map((t) => ({
      id: t.id,
      name: t.name,
      price: num(t.price),
      capacity: t.capacity,
      sold: t.sold,
    })),
  };
}

// Categories shown in discovery + the create form (label ↔ enum value).
export const EVENT_CATEGORIES = [
  { value: "MUSIC", label: "Music & Concerts" },
  { value: "CONFERENCE", label: "Conferences" },
  { value: "COMEDY", label: "Comedy" },
  { value: "NIGHTLIFE", label: "Parties & Nightlife" },
  { value: "SPORTS", label: "Sports" },
  { value: "FESTIVAL", label: "Festivals" },
  { value: "WORKSHOP", label: "Workshops" },
  { value: "RELIGIOUS", label: "Religious" },
  { value: "FOOD_DRINK", label: "Food & Drink" },
  { value: "THEATRE", label: "Theatre & Arts" },
  { value: "OTHER", label: "Other" },
] as const;

const CATEGORY_VALUES = EVENT_CATEGORIES.map((c) => c.value);

export interface DiscoverFilters {
  query?: string;
  category?: string;
  city?: string;
  page?: number;
  pageSize?: number;
}

/**
 * Unified discovery: filter events by free-text query, category, and city, with
 * pagination. Also returns the distinct cities present (for the city filter).
 */
export async function discoverEvents(filters: DiscoverFilters = {}) {
  try {
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 12;
    const skip = (page - 1) * pageSize;

    const where: Prisma.EventWhereInput = { deletedAt: null };
    if (filters.query && filters.query.trim().length >= 2) {
      where.title = { contains: filters.query.trim(), mode: "insensitive" };
    }
    if (filters.category && CATEGORY_VALUES.includes(filters.category as (typeof CATEGORY_VALUES)[number])) {
      where.category = filters.category as Prisma.EnumEventCategoryFilter["equals"];
    }
    if (filters.city && filters.city.trim()) {
      where.city = { equals: filters.city.trim(), mode: "insensitive" };
    }

    const [events, totalCount, cityRows] = await Promise.all([
      prisma.event.findMany({
        where,
        include: {
          organizer: { select: { name: true } },
          ticketTiers: { select: { id: true, price: true, capacity: true, sold: true } },
        },
        orderBy: { startsAt: "asc" },
        skip,
        take: pageSize,
      }),
      prisma.event.count({ where }),
      prisma.event.findMany({
        where: { deletedAt: null, city: { not: null } },
        select: { city: true },
        distinct: ["city"],
        orderBy: { city: "asc" },
      }),
    ]);

    return {
      success: true as const,
      events: events.map(toEventShape),
      totalCount,
      currentPage: page,
      pageSize,
      totalPages: Math.ceil(totalCount / pageSize),
      cities: cityRows.map((r) => r.city).filter((c): c is string => Boolean(c)),
    };
  } catch (error) {
    console.error("[discoverEvents]", error);
    return { success: false as const, error: "Failed to load events" };
  }
}

export async function getEventWithTiers(eventId: string) {
  try {
    const event = await prisma.event.findFirst({
      where: { id: eventId, deletedAt: null },
      include: {
        organizer: { select: { name: true, email: true } },
        ticketTiers: {
          select: { id: true, name: true, price: true, capacity: true, sold: true },
        },
      },
    });
    if (!event) return { success: false, error: "Event not found" };
    return { success: true, event: toEventShape(event) };
  } catch (error) {
    console.error("[getEventWithTiers]", error);
    return { success: false, error: "Failed to fetch event" };
  }
}

export async function getAllEvents(page = 1, pageSize = 10) {
  try {
    const skip = (page - 1) * pageSize;
    const [events, totalCount] = await Promise.all([
      prisma.event.findMany({
        where: { deletedAt: null },
        include: {
          organizer: { select: { name: true } },
          ticketTiers: { select: { id: true, price: true, capacity: true, sold: true } },
        },
        orderBy: { startsAt: "desc" },
        skip,
        take: pageSize,
      }),
      prisma.event.count({ where: { deletedAt: null } }),
    ]);

    return {
      success: true,
      events: events.map(toEventShape),
      totalCount,
      pageSize,
      currentPage: page,
      totalPages: Math.ceil(totalCount / pageSize),
    };
  } catch (error) {
    console.error("[getAllEvents]", error);
    return { success: false, error: "Failed to fetch events" };
  }
}

export interface OrganizerEventSummary {
  id: string;
  title: string;
  venue_name: string;
  starts_at: string;
  ends_at: string;
  banner_url: string | null;
  is_seated: boolean;
  tier_count: number;
  total_capacity: number;
  total_sold: number;
}

export async function getOrganizerEvents(): Promise<
  { success: true; events: OrganizerEventSummary[] } | { success: false; error: string }
> {
  try {
    const session = await getSession();
    if (!session) return { success: false, error: "Not authenticated" };

    const events = await prisma.event.findMany({
      where: { organizerId: session.user.id, deletedAt: null },
      include: { ticketTiers: { select: { capacity: true, sold: true } } },
      orderBy: { startsAt: "desc" },
    });

    return {
      success: true,
      events: events.map((e) => ({
        id: e.id,
        title: e.title,
        venue_name: e.venueName,
        starts_at: iso(e.startsAt),
        ends_at: iso(e.endsAt),
        banner_url: e.bannerUrl,
        is_seated: e.isSeated,
        tier_count: e.ticketTiers.length,
        total_capacity: e.ticketTiers.reduce((s, t) => s + t.capacity, 0),
        total_sold: e.ticketTiers.reduce((s, t) => s + t.sold, 0),
      })),
    };
  } catch (error) {
    console.error("[getOrganizerEvents]", error);
    return { success: false, error: "Failed to load events" };
  }
}

export async function searchEvents(query: string, page = 1, pageSize = 10) {
  try {
    if (!query || query.length < 2) {
      return { success: false, error: "Search query must be at least 2 characters" };
    }

    const skip = (page - 1) * pageSize;
    const where: Prisma.EventWhereInput = {
      deletedAt: null,
      title: { contains: query, mode: "insensitive" },
    };

    const [events, totalCount] = await Promise.all([
      prisma.event.findMany({
        where,
        include: {
          organizer: { select: { name: true } },
          ticketTiers: { select: { id: true, price: true, capacity: true, sold: true } },
        },
        orderBy: { startsAt: "desc" },
        skip,
        take: pageSize,
      }),
      prisma.event.count({ where }),
    ]);

    return {
      success: true,
      events: events.map(toEventShape),
      totalCount,
      pageSize,
      currentPage: page,
      totalPages: Math.ceil(totalCount / pageSize),
    };
  } catch (error) {
    console.error("[searchEvents]", error);
    return { success: false, error: "Search failed" };
  }
}
