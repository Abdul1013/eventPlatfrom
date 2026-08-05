import "server-only";
import { prisma } from "@/lib/db";
import { notifyOrderPaid, notifyOrderRefunded } from "@/lib/notifications/dispatch";

export interface FulfillResult {
  ok: boolean;
  ticketIds: string[];
  alreadyFulfilled?: boolean;
  reason?: string;
}

/**
 * Fulfill a paid order: issue the tickets and mark it PAID. Idempotent and
 * concurrency-safe — called by BOTH the Paystack webhook and the callback page,
 * which may race. A guarded `updateMany(status: PENDING → PAID)` lets exactly one
 * caller "claim" the order; the loser returns the already-issued tickets.
 *
 * Capacity was already reserved when the order was created, so this only inserts
 * the ticket rows — it does not touch `sold`.
 */
export async function fulfillOrder(reference: string): Promise<FulfillResult> {
  // Set only when THIS call performs the fulfillment, so we notify exactly once
  // even when the webhook and callback race.
  let freshlyFulfilledOrderId: string | null = null;

  const result = await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { reference },
      include: { items: true },
    });
    if (!order) return { ok: false, ticketIds: [], reason: "Order not found" };

    // Atomically claim the order. Only the caller that flips PENDING→PAID issues.
    const claimed = await tx.order.updateMany({
      where: { reference, status: "PENDING" },
      data: { status: "PAID", paidAt: new Date() },
    });

    if (claimed.count === 0) {
      // Someone else already fulfilled it, or it isn't payable.
      const existing = await tx.ticket.findMany({
        where: { orderId: order.id },
        select: { id: true },
      });
      return {
        ok: order.status === "PAID",
        ticketIds: existing.map((t) => t.id),
        alreadyFulfilled: order.status === "PAID",
        reason: order.status === "PAID" ? undefined : `Order is ${order.status}`,
      };
    }

    // We won the claim — issue one ticket per unit across all items.
    const ticketIds: string[] = [];
    for (const item of order.items) {
      for (let i = 0; i < item.quantity; i++) {
        const ticket = await tx.ticket.create({
          data: {
            eventId: order.eventId,
            ticketTierId: item.ticketTierId,
            ownerId: order.buyerId,
            orderId: order.id,
            status: "ACTIVE",
          },
          select: { id: true },
        });
        ticketIds.push(ticket.id);
      }
    }

    freshlyFulfilledOrderId = order.id;
    return { ok: true, ticketIds };
  });

  // Fire-and-forget notifications after the commit (never blocks the webhook).
  if (freshlyFulfilledOrderId) {
    void notifyOrderPaid(freshlyFulfilledOrderId).catch((e) =>
      console.error("[fulfillOrder] notify", (e as Error).message)
    );
  }

  return result;
}

export interface ReverseResult {
  ok: boolean;
  cancelledTickets: number;
  alreadyReversed?: boolean;
  reason?: string;
}

/**
 * Reverse a PAID order after a refund: mark it REFUNDED, cancel its tickets, and
 * release the reserved capacity back to each tier. Idempotent and concurrency-
 * safe via a guarded PAID→REFUNDED claim (mirrors fulfillOrder).
 */
export async function reverseOrder(reference: string): Promise<ReverseResult> {
  let freshlyReversedOrderId: string | null = null;

  const result = await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { reference },
      include: { items: true },
    });
    if (!order) return { ok: false, cancelledTickets: 0, reason: "Order not found" };

    const claimed = await tx.order.updateMany({
      where: { reference, status: "PAID" },
      data: { status: "REFUNDED" },
    });
    if (claimed.count === 0) {
      return {
        ok: order.status === "REFUNDED",
        cancelledTickets: 0,
        alreadyReversed: order.status === "REFUNDED",
        reason: order.status === "REFUNDED" ? undefined : `Order is ${order.status}`,
      };
    }

    // Cancel the issued tickets.
    const cancelled = await tx.ticket.updateMany({
      where: { orderId: order.id, status: { not: "CANCELLED" } },
      data: { status: "CANCELLED" },
    });

    // Release the held capacity for each line item.
    for (const item of order.items) {
      await tx.$executeRaw`
        UPDATE "TicketTier" SET sold = GREATEST(0, sold - ${item.quantity}), "updatedAt" = NOW()
        WHERE id = ${item.ticketTierId}`;
    }

    freshlyReversedOrderId = order.id;
    return { ok: true, cancelledTickets: cancelled.count };
  });

  if (freshlyReversedOrderId) {
    void notifyOrderRefunded(freshlyReversedOrderId).catch((e) =>
      console.error("[reverseOrder] notify", (e as Error).message)
    );
  }

  return result;
}
