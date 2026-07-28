"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/actions/auth";

/**
 * Venue + seat-map management (organizer/admin). A venue owns seats laid out on
 * an (x, y) grid — the coordinates the SAO engine's K-means clustering uses.
 */

const SectionSchema = z.object({
  name: z.string().min(1).max(40),
  rows: z.coerce.number().int().min(1).max(26),
  seatsPerRow: z.coerce.number().int().min(1).max(100),
  accessibleFrontRows: z.coerce.number().int().min(0).max(26).default(0),
});

const CreateVenueSchema = z.object({
  name: z.string().min(2, "Venue name must be at least 2 characters").max(120),
  address: z.string().min(3, "Address is required").max(255),
  city: z.string().min(2, "City is required").max(80),
  sections: z.array(SectionSchema).min(1, "Add at least one section"),
});

export type CreateVenueInput = z.infer<typeof CreateVenueSchema>;

const ROW_LABELS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

interface GeneratedSeat {
  rowLabel: string;
  seatNumber: string;
  section: string;
  xCoord: number;
  yCoord: number;
  isAccessible: boolean;
}

function generateSeats(sections: CreateVenueInput["sections"]): GeneratedSeat[] {
  const seats: GeneratedSeat[] = [];
  let yOffset = 0;
  for (const section of sections) {
    for (let r = 0; r < section.rows; r++) {
      const rowLabel = ROW_LABELS[r]!;
      const isAccessibleRow = r < section.accessibleFrontRows;
      for (let s = 0; s < section.seatsPerRow; s++) {
        seats.push({
          rowLabel,
          seatNumber: String(s + 1),
          section: section.name,
          xCoord: s,
          yCoord: yOffset + r,
          isAccessible: isAccessibleRow,
        });
      }
    }
    yOffset += section.rows + 2;
  }
  return seats;
}

async function assertOrganizer(): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Not authenticated" };
  if (!["ORGANIZER", "ADMIN"].includes(session.user.role)) {
    return { ok: false, error: "Only organizers can manage venues" };
  }
  return { ok: true, userId: session.user.id };
}

export async function createVenueWithSeats(
  input: CreateVenueInput
): Promise<{ success: boolean; venueId?: string; seatCount?: number; error?: string }> {
  try {
    const auth = await assertOrganizer();
    if (!auth.ok) return { success: false, error: auth.error };

    const validated = CreateVenueSchema.parse(input);
    const seats = generateSeats(validated.sections);

    const venue = await prisma.venue.create({
      data: {
        name: validated.name,
        address: validated.address,
        city: validated.city,
        totalCapacity: seats.length,
        layoutJson: { sections: validated.sections },
        seats: { create: seats },
      },
      select: { id: true },
    });

    return { success: true, venueId: venue.id, seatCount: seats.length };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues[0]?.message || "Validation failed" };
    }
    console.error("[createVenueWithSeats]", error);
    return { success: false, error: "An unexpected error occurred" };
  }
}

export async function getVenues() {
  try {
    const venues = await prisma.venue.findMany({
      select: { id: true, name: true, address: true, city: true, totalCapacity: true },
      orderBy: { name: "asc" },
    });
    // Map to snake_case for UI consistency.
    return {
      success: true as const,
      venues: venues.map((v) => ({
        id: v.id,
        name: v.name,
        address: v.address,
        city: v.city,
        total_capacity: v.totalCapacity,
      })),
    };
  } catch (error) {
    console.error("[getVenues]", error);
    return { success: false as const, error: "Failed to load venues" };
  }
}

export async function getVenueWithSeats(venueId: string) {
  try {
    const venue = await prisma.venue.findUnique({
      where: { id: venueId },
      include: {
        seats: {
          orderBy: [{ yCoord: "asc" }, { xCoord: "asc" }],
          select: {
            id: true,
            rowLabel: true,
            seatNumber: true,
            section: true,
            xCoord: true,
            yCoord: true,
            isAccessible: true,
          },
        },
      },
    });
    if (!venue) return { success: false as const, error: "Venue not found" };

    return {
      success: true as const,
      venue: {
        id: venue.id,
        name: venue.name,
        address: venue.address,
        city: venue.city,
        total_capacity: venue.totalCapacity,
        layout_json: venue.layoutJson,
      },
      seats: venue.seats.map((s) => ({
        id: s.id,
        row_label: s.rowLabel,
        seat_number: s.seatNumber,
        section: s.section,
        x_coord: s.xCoord,
        y_coord: s.yCoord,
        is_accessible: s.isAccessible,
      })),
    };
  } catch (error) {
    console.error("[getVenueWithSeats]", error);
    return { success: false as const, error: "Failed to load venue" };
  }
}
