"use server";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/actions/auth";

const num = (d: Prisma.Decimal | number): number => Number(d);
const iso = (d: Date): string => d.toISOString();

// Ticket purchase now goes through the payment flow (lib/actions/payments.ts:
// initiateCheckout → Paystack or free-tier fulfillment). This module keeps the
// wallet read queries below.

export async function getAttendeeTickets() {
  try {
    const session = await getSession();
    if (!session) return { success: false, error: "Not authenticated" };

    const tickets = await prisma.ticket.findMany({
      where: { ownerId: session.user.id },
      orderBy: { issuedAt: "desc" },
      include: {
        event: {
          select: {
            title: true,
            venueName: true,
            startsAt: true,
            bannerUrl: true,
            organizer: { select: { name: true } },
          },
        },
        ticketTier: { select: { name: true, price: true } },
      },
    });

    const mapped = tickets.map((t) => ({
      id: t.id,
      status: t.status,
      issued_at: iso(t.issuedAt),
      event: {
        title: t.event.title,
        venue_name: t.event.venueName,
        starts_at: iso(t.event.startsAt),
        banner_url: t.event.bannerUrl,
        organizer_name: t.event.organizer?.name ?? "Unknown",
      },
      tier: { name: t.ticketTier.name, price: num(t.ticketTier.price) },
    }));

    return { success: true, tickets: mapped };
  } catch (error) {
    console.error("[getAttendeeTickets]", error);
    return { success: false, error: "Failed to fetch tickets" };
  }
}

export async function getTicketDetail(ticketId: string) {
  try {
    const session = await getSession();
    if (!session) return { success: false, error: "Not authenticated" };

    const t = await prisma.ticket.findFirst({
      where: { id: ticketId, ownerId: session.user.id },
      include: {
        event: {
          select: {
            title: true,
            description: true,
            venueName: true,
            startsAt: true,
            endsAt: true,
            bannerUrl: true,
            organizer: { select: { name: true } },
          },
        },
        ticketTier: { select: { name: true, price: true } },
      },
    });

    if (!t) return { success: false, error: "Ticket not found or access denied" };

    return {
      success: true,
      ticket: {
        id: t.id,
        status: t.status,
        issued_at: iso(t.issuedAt),
        // Live rotating QR is generated on demand (see useDynamicQR); no stored payload.
        qr_payload_encrypted: null,
        event: {
          title: t.event.title,
          description: t.event.description,
          venue_name: t.event.venueName,
          starts_at: iso(t.event.startsAt),
          ends_at: iso(t.event.endsAt),
          banner_url: t.event.bannerUrl,
          organizer_name: t.event.organizer?.name ?? "Unknown",
        },
        tier: { name: t.ticketTier.name, price: num(t.ticketTier.price) },
      },
    };
  } catch (error) {
    console.error("[getTicketDetail]", error);
    return { success: false, error: "Failed to fetch ticket" };
  }
}
