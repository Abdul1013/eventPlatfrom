import "server-only";
import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/notifications/email";
import { sendSms } from "@/lib/notifications/sms";

// Fires ticket/refund notifications after the DB commit. All sends are
// best-effort (Promise.allSettled) so a provider outage never affects orders.

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const BRAND_TEAL = "#0D9488";

function fmtNaira(n: number) {
  return `₦${n.toLocaleString("en-NG")}`;
}
function fmtDate(d: Date) {
  return d.toLocaleString("en-NG", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function shell(title: string, body: string): string {
  return `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;color:#0B1F1D">
    <div style="background:${BRAND_TEAL};color:#fff;padding:20px 24px;border-radius:12px 12px 0 0">
      <h1 style="margin:0;font-size:20px">EventMerge</h1>
    </div>
    <div style="border:1px solid #E7ECEA;border-top:none;border-radius:0 0 12px 12px;padding:24px">
      <h2 style="margin:0 0 12px;font-size:18px">${title}</h2>
      ${body}
    </div>
  </div>`;
}

function ticketEmail(o: {
  name: string;
  eventTitle: string;
  venue: string;
  when: string;
  count: number;
  amount: number;
  reference: string;
}): string {
  return shell(
    "Your tickets are confirmed 🎟️",
    `<p style="margin:0 0 8px">Hi ${o.name},</p>
     <p style="margin:0 0 16px">Your payment was successful and <strong>${o.count} ticket${o.count !== 1 ? "s" : ""}</strong> ${o.count !== 1 ? "are" : "is"} now in your wallet.</p>
     <table style="width:100%;font-size:14px;border-collapse:collapse">
       <tr><td style="padding:6px 0;color:#4B5A57">Event</td><td style="padding:6px 0;text-align:right"><strong>${o.eventTitle}</strong></td></tr>
       <tr><td style="padding:6px 0;color:#4B5A57">When</td><td style="padding:6px 0;text-align:right">${o.when}</td></tr>
       <tr><td style="padding:6px 0;color:#4B5A57">Venue</td><td style="padding:6px 0;text-align:right">${o.venue}</td></tr>
       <tr><td style="padding:6px 0;color:#4B5A57">Amount</td><td style="padding:6px 0;text-align:right">${fmtNaira(o.amount)}</td></tr>
       <tr><td style="padding:6px 0;color:#4B5A57">Ref</td><td style="padding:6px 0;text-align:right">${o.reference}</td></tr>
     </table>
     <a href="${APP_URL}/attendee/wallet" style="display:inline-block;margin-top:20px;background:${BRAND_TEAL};color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600">View My Tickets</a>
     <p style="margin:20px 0 0;font-size:12px;color:#9DB2AD">Your QR code refreshes every 30 seconds for anti-fraud protection — open the app at the gate.</p>`
  );
}

function refundEmail(o: { name: string; eventTitle: string; amount: number; reference: string }): string {
  return shell(
    "Your order was refunded",
    `<p style="margin:0 0 8px">Hi ${o.name},</p>
     <p style="margin:0 0 16px">Your order for <strong>${o.eventTitle}</strong> has been refunded and the tickets cancelled.</p>
     <table style="width:100%;font-size:14px;border-collapse:collapse">
       <tr><td style="padding:6px 0;color:#4B5A57">Amount refunded</td><td style="padding:6px 0;text-align:right"><strong>${fmtNaira(o.amount)}</strong></td></tr>
       <tr><td style="padding:6px 0;color:#4B5A57">Ref</td><td style="padding:6px 0;text-align:right">${o.reference}</td></tr>
     </table>
     <p style="margin:16px 0 0;font-size:12px;color:#9DB2AD">Refunds settle back to your payment method per your bank's timelines.</p>`
  );
}

/** Notify the buyer that their order is paid and tickets are issued. */
export async function notifyOrderPaid(orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      amount: true,
      reference: true,
      buyer: { select: { email: true, name: true, phone: true } },
      event: { select: { title: true, venueName: true, startsAt: true } },
      _count: { select: { tickets: true } },
    },
  });
  if (!order) return;

  const count = order._count.tickets;
  const when = fmtDate(order.event.startsAt);
  const html = ticketEmail({
    name: order.buyer.name,
    eventTitle: order.event.title,
    venue: order.event.venueName,
    when,
    count,
    amount: Number(order.amount),
    reference: order.reference,
  });

  const smsText = `EventMerge: ${count} ticket${count !== 1 ? "s" : ""} confirmed for ${order.event.title} (${when}). View: ${APP_URL}/attendee/wallet`;

  await Promise.allSettled([
    sendEmail({
      to: order.buyer.email,
      subject: `Your ${count} ticket${count !== 1 ? "s" : ""} for ${order.event.title}`,
      html,
    }),
    order.buyer.phone ? sendSms(order.buyer.phone, smsText) : Promise.resolve({ sent: false }),
  ]);
}

/** Notify the buyer that their order was refunded. */
export async function notifyOrderRefunded(orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      amount: true,
      reference: true,
      buyer: { select: { email: true, name: true, phone: true } },
      event: { select: { title: true } },
    },
  });
  if (!order) return;

  const html = refundEmail({
    name: order.buyer.name,
    eventTitle: order.event.title,
    amount: Number(order.amount),
    reference: order.reference,
  });
  const smsText = `EventMerge: your order for ${order.event.title} was refunded (${fmtNaira(Number(order.amount))}).`;

  await Promise.allSettled([
    sendEmail({ to: order.buyer.email, subject: `Refund for ${order.event.title}`, html }),
    order.buyer.phone ? sendSms(order.buyer.phone, smsText) : Promise.resolve({ sent: false }),
  ]);
}
