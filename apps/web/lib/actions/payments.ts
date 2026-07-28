"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/actions/auth";
import { fulfillOrder, reverseOrder } from "@/lib/payments/fulfill";
import {
  initializeTransaction,
  verifyTransaction,
  refundTransaction,
  isPaystackConfigured,
  nairaToKobo,
} from "@/lib/api/paystack";

const CheckoutSchema = z.object({
  tierId: z.string().uuid("Invalid tier ID"),
  quantity: z.coerce.number().int().min(1).max(100),
});

export type InitiateCheckoutResult =
  | { success: true; mode: "redirect"; authorizationUrl: string; reference: string }
  | { success: true; mode: "free"; orderId: string; ticketIds: string[] }
  | { success: false; error: string };

const appUrl = () => process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

/** Reserve `qty` from a tier atomically. Returns true if reserved. */
async function reserveCapacity(tierId: string, qty: number): Promise<boolean> {
  const affected = await prisma.$executeRaw`
    UPDATE "TicketTier" SET sold = sold + ${qty}, "updatedAt" = NOW()
    WHERE id = ${tierId} AND sold + ${qty} <= capacity`;
  return affected > 0;
}

/** Release a previously-reserved `qty` back to a tier (never below zero). */
async function releaseCapacity(tierId: string, qty: number): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "TicketTier" SET sold = GREATEST(0, sold - ${qty}), "updatedAt" = NOW()
    WHERE id = ${tierId}`;
}

/**
 * Start checkout: reserve capacity, create a PENDING order, then either fulfill
 * immediately (free tier) or initialize a Paystack transaction and return the
 * hosted checkout URL. Reservation is released if anything fails.
 */
export async function initiateCheckout(input: {
  tierId: string;
  quantity: number;
}): Promise<InitiateCheckoutResult> {
  try {
    const session = await getSession();
    if (!session) return { success: false, error: "Not authenticated" };

    const { tierId, quantity } = CheckoutSchema.parse(input);

    const [user, tier] = await Promise.all([
      prisma.user.findUnique({ where: { id: session.user.id }, select: { email: true } }),
      prisma.ticketTier.findUnique({
        where: { id: tierId },
        select: {
          price: true,
          eventId: true,
          name: true,
          event: {
            select: {
              title: true,
              organizer: { select: { payoutAccount: { select: { subaccountCode: true } } } },
            },
          },
        },
      }),
    ]);
    if (!user || !tier) return { success: false, error: "Ticket tier not found" };

    const unitPrice = Number(tier.price);
    const amount = unitPrice * quantity;

    // Reserve inventory up front so a buyer who pays is guaranteed a seat.
    if (!(await reserveCapacity(tierId, quantity))) {
      const t = await prisma.ticketTier.findUnique({
        where: { id: tierId },
        select: { capacity: true, sold: true },
      });
      const remaining = t ? Math.max(0, t.capacity - t.sold) : 0;
      return { success: false, error: `Only ${remaining} ticket(s) remaining in this tier` };
    }

    const reference = `em_${crypto.randomUUID().replace(/-/g, "")}`;

    let order;
    try {
      order = await prisma.order.create({
        data: {
          buyerId: session.user.id,
          eventId: tier.eventId,
          amount,
          currency: "NGN",
          reference,
          items: { create: [{ ticketTierId: tierId, quantity, unitPrice }] },
        },
        select: { id: true },
      });
    } catch (e) {
      await releaseCapacity(tierId, quantity);
      throw e;
    }

    // Free tier → no payment needed; fulfill immediately.
    if (amount <= 0) {
      const result = await fulfillOrder(reference);
      if (!result.ok) {
        await releaseCapacity(tierId, quantity);
        return { success: false, error: "Could not issue free tickets" };
      }
      return { success: true, mode: "free", orderId: order.id, ticketIds: result.ticketIds };
    }

    if (!isPaystackConfigured()) {
      await failOrderInternal(reference);
      return { success: false, error: "Payments are not configured yet" };
    }

    try {
      const init = await initializeTransaction({
        email: user.email,
        amountKobo: nairaToKobo(amount),
        reference,
        callbackUrl: `${appUrl()}/checkout/callback?reference=${reference}`,
        metadata: { orderId: order.id, eventTitle: tier.event.title, tier: tier.name, quantity },
        // If the organizer has connected a payout account, split to their bank.
        subaccount: tier.event.organizer.payoutAccount?.subaccountCode ?? undefined,
      });
      return { success: true, mode: "redirect", authorizationUrl: init.authorization_url, reference };
    } catch (e) {
      await failOrderInternal(reference);
      console.error("[initiateCheckout] paystack init", (e as Error).message);
      return { success: false, error: "Could not start payment. Please try again." };
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues[0]?.message || "Validation failed" };
    }
    console.error("[initiateCheckout]", error);
    return { success: false, error: "An unexpected error occurred" };
  }
}

/** Mark a PENDING order FAILED and release its reserved inventory (idempotent). */
async function failOrderInternal(reference: string): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { reference },
    include: { items: true },
  });
  if (!order) return;
  const claimed = await prisma.order.updateMany({
    where: { reference, status: "PENDING" },
    data: { status: "FAILED" },
  });
  if (claimed.count > 0) {
    for (const item of order.items) await releaseCapacity(item.ticketTierId, item.quantity);
  }
}

/**
 * Verify a transaction with Paystack and fulfill it. Called from the callback
 * page as a fallback to the webhook. Only the buyer may verify their own order.
 */
export async function verifyAndFulfillOrder(
  reference: string
): Promise<{ status: "paid" | "failed" | "pending"; ticketIds?: string[]; error?: string }> {
  try {
    const session = await getSession();
    if (!session) return { status: "pending", error: "Not authenticated" };

    const order = await prisma.order.findUnique({
      where: { reference },
      select: { buyerId: true, status: true },
    });
    if (!order || order.buyerId !== session.user.id) {
      return { status: "pending", error: "Order not found" };
    }
    if (order.status === "PAID") {
      const tickets = await prisma.ticket.findMany({
        where: { order: { reference } },
        select: { id: true },
      });
      return { status: "paid", ticketIds: tickets.map((t) => t.id) };
    }

    const verified = await verifyTransaction(reference);
    if (verified.status === "success") {
      const result = await fulfillOrder(reference);
      return { status: "paid", ticketIds: result.ticketIds };
    }

    // Not successful — fail the order and release inventory.
    await failOrderInternal(reference);
    return { status: "failed" };
  } catch (error) {
    console.error("[verifyAndFulfillOrder]", (error as Error).message);
    return { status: "pending", error: "Could not verify payment yet" };
  }
}

/**
 * Refund a PAID order (organizer of the event, or admin). Refunds via Paystack
 * when configured, then reverses locally: order → REFUNDED, tickets cancelled,
 * capacity released. Reversal is idempotent.
 */
export async function refundOrder(
  orderId: string
): Promise<{ success: boolean; error?: string; refundedTickets?: number }> {
  try {
    const session = await getSession();
    if (!session) return { success: false, error: "Not authenticated" };

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { reference: true, status: true, event: { select: { organizerId: true } } },
    });
    if (!order) return { success: false, error: "Order not found" };

    const authorized = order.event.organizerId === session.user.id || session.user.role === "ADMIN";
    if (!authorized) return { success: false, error: "Not authorized to refund this order" };
    if (order.status !== "PAID") return { success: false, error: `Order is ${order.status}; cannot refund` };

    // Real money moves through Paystack when configured; dev falls back to a
    // local reversal (self-signed test orders have no real Paystack charge).
    if (isPaystackConfigured()) {
      try {
        await refundTransaction(order.reference);
      } catch (e) {
        console.error("[refundOrder] paystack", (e as Error).message);
        return { success: false, error: "Paystack refund failed" };
      }
    }

    const result = await reverseOrder(order.reference);
    if (!result.ok && !result.alreadyReversed) {
      return { success: false, error: result.reason || "Refund reversal failed" };
    }
    return { success: true, refundedTickets: result.cancelledTickets };
  } catch (error) {
    console.error("[refundOrder]", (error as Error).message);
    return { success: false, error: "Could not process refund" };
  }
}

export async function getMyOrders() {
  try {
    const session = await getSession();
    if (!session) return { success: false as const, error: "Not authenticated" };

    const orders = await prisma.order.findMany({
      where: { buyerId: session.user.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        reference: true,
        status: true,
        amount: true,
        currency: true,
        createdAt: true,
        event: { select: { title: true } },
        _count: { select: { tickets: true } },
      },
    });

    return {
      success: true as const,
      orders: orders.map((o) => ({
        id: o.id,
        reference: o.reference,
        status: o.status,
        amount: Number(o.amount),
        currency: o.currency,
        created_at: o.createdAt.toISOString(),
        event_title: o.event.title,
        ticket_count: o._count.tickets,
      })),
    };
  } catch (error) {
    console.error("[getMyOrders]", error);
    return { success: false as const, error: "Failed to load orders" };
  }
}
