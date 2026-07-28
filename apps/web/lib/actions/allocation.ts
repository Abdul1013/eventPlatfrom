"use server";

import { prisma } from "@/lib/db";
import { getSession } from "@/lib/actions/auth";
import {
  saoClient,
  type SaoAlgorithm,
  type SaoSeat,
  type SaoAttendee,
} from "@/lib/api/sao-client";

/**
 * Seat allocation — bridges the organizer UI to the Python SAO engine, then
 * applies the returned assignments to tickets. Authorization is enforced here in
 * the app layer (no RLS on Neon): only the event's organizer or an admin may run it.
 */

interface EventForAllocation {
  id: string;
  organizerId: string;
  venueId: string | null;
}

async function loadEventOwnedByCaller(
  eventId: string
): Promise<{ ok: true; event: EventForAllocation } | { ok: false; error: string }> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Not authenticated" };

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true, organizerId: true, venueId: true },
  });
  if (!event) return { ok: false, error: "Event not found" };

  if (event.organizerId !== session.user.id && session.user.role !== "ADMIN") {
    return { ok: false, error: "You can only allocate seats for your own events" };
  }
  return { ok: true, event };
}

async function gatherAllocationInputs(
  event: EventForAllocation
): Promise<
  { ok: true; seats: SaoSeat[]; attendees: SaoAttendee[] } | { ok: false; error: string }
> {
  if (!event.venueId) {
    return { ok: false, error: "This event has no venue/seat map. Attach a venue first." };
  }

  const [seats, tickets] = await Promise.all([
    prisma.seat.findMany({
      where: { venueId: event.venueId },
      select: {
        id: true,
        rowLabel: true,
        seatNumber: true,
        section: true,
        xCoord: true,
        yCoord: true,
        isAccessible: true,
      },
    }),
    prisma.ticket.findMany({
      where: { eventId: event.id, status: "ACTIVE" },
      select: { id: true, ownerId: true },
    }),
  ]);

  if (seats.length === 0) return { ok: false, error: "No seats found for this venue" };
  if (tickets.length === 0) return { ok: false, error: "No active tickets to allocate yet" };

  return {
    ok: true,
    seats: seats.map((s) => ({
      id: s.id,
      row_label: s.rowLabel,
      seat_number: s.seatNumber,
      section: s.section,
      x_coord: s.xCoord,
      y_coord: s.yCoord,
      is_accessible: s.isAccessible,
    })),
    attendees: tickets.map((t) => ({
      user_id: t.ownerId,
      ticket_id: t.id,
      group_size: 1,
      needs_accessible: false,
    })),
  };
}

export interface AllocationSummary {
  algorithmUsed: string;
  utilizationRate: number;
  adjacencyScore: number;
  seatsAssigned: number;
  seatsTotal: number;
  unassigned: number;
  durationMs: number;
}

export async function runAllocation(
  eventId: string,
  algorithm: SaoAlgorithm = "kmeans_greedy"
): Promise<{ success: boolean; summary?: AllocationSummary; error?: string }> {
  try {
    const loaded = await loadEventOwnedByCaller(eventId);
    if (!loaded.ok) return { success: false, error: loaded.error };

    const inputs = await gatherAllocationInputs(loaded.event);
    if (!inputs.ok) return { success: false, error: inputs.error };

    const result = await saoClient.run({
      event_id: eventId,
      seats: inputs.seats,
      attendees: inputs.attendees,
      algorithm,
    });

    // Apply seats atomically: clear existing assignments for the event first
    // (re-runs permute seats among the same tickets; the (eventId, seatId) unique
    // index is checked per-statement, so nulling first avoids transient collisions).
    await prisma.$transaction(async (tx) => {
      await tx.ticket.updateMany({
        where: { eventId, seatId: { not: null } },
        data: { seatId: null },
      });
      for (const a of result.assignments) {
        await tx.ticket.update({
          where: { id: a.ticket_id },
          data: { seatId: a.seat_id },
        });
      }
      await tx.allocation.create({
        data: {
          eventId,
          algorithmUsed: result.algorithm_used,
          utilizationRate: result.utilization_rate,
          seatMapJson: result as unknown as object,
        },
      });
    });

    return {
      success: true,
      summary: {
        algorithmUsed: result.algorithm_used,
        utilizationRate: result.utilization_rate,
        adjacencyScore: result.adjacency_score,
        seatsAssigned: result.seats_assigned,
        seatsTotal: result.seats_total,
        unassigned: result.unassigned_ticket_ids.length,
        durationMs: result.duration_ms,
      },
    };
  } catch (error) {
    console.error("[runAllocation]", error);
    return { success: false, error: "Seat allocation service unavailable. Try again shortly." };
  }
}

export interface ComparisonSummary {
  saoUtilizationRate: number;
  baselineUtilizationRate: number;
  improvementPercentage: number;
  hypothesisH1Passed: boolean;
}

export async function compareAllocation(
  eventId: string
): Promise<{ success: boolean; comparison?: ComparisonSummary; error?: string }> {
  try {
    const loaded = await loadEventOwnedByCaller(eventId);
    if (!loaded.ok) return { success: false, error: loaded.error };

    const inputs = await gatherAllocationInputs(loaded.event);
    if (!inputs.ok) return { success: false, error: inputs.error };

    const result = await saoClient.compare({
      event_id: eventId,
      seats: inputs.seats,
      attendees: inputs.attendees,
    });

    return {
      success: true,
      comparison: {
        saoUtilizationRate: result.sao_utilization_rate,
        baselineUtilizationRate: result.baseline_utilization_rate,
        improvementPercentage: result.improvement_percentage,
        hypothesisH1Passed: result.hypothesis_h1_passed,
      },
    };
  } catch (error) {
    console.error("[compareAllocation]", error);
    return { success: false, error: "Comparison service unavailable. Try again shortly." };
  }
}

export async function getAllocationHistory(eventId: string) {
  try {
    const loaded = await loadEventOwnedByCaller(eventId);
    if (!loaded.ok) return { success: false as const, error: loaded.error };

    const rows = await prisma.allocation.findMany({
      where: { eventId },
      orderBy: { runAt: "desc" },
      select: { id: true, algorithmUsed: true, utilizationRate: true, runAt: true },
    });

    return {
      success: true as const,
      allocations: rows.map((r) => ({
        id: r.id,
        algorithm_used: r.algorithmUsed,
        utilization_rate: r.utilizationRate,
        run_at: r.runAt.toISOString(),
      })),
    };
  } catch (error) {
    console.error("[getAllocationHistory]", error);
    return { success: false as const, error: "Failed to load allocation history" };
  }
}
