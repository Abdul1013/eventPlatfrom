import { NextRequest, NextResponse } from "next/server";
import { verifyWebhookSignature } from "@/lib/api/paystack";
import { fulfillOrder } from "@/lib/payments/fulfill";

// POST /api/webhooks/paystack — Paystack sends payment events here.
// We MUST verify the x-paystack-signature (HMAC-SHA512 of the raw body) before
// trusting anything, then fulfill on charge.success. Fulfillment is idempotent,
// so Paystack retries are safe.

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-paystack-signature");

  if (!verifyWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: { event?: string; data?: { reference?: string } };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  try {
    if (event.event === "charge.success" && event.data?.reference) {
      await fulfillOrder(event.data.reference);
    }
  } catch (error) {
    // Log but still 200 — Paystack retries on non-2xx, and fulfillment is
    // idempotent, so a transient error will be resolved on retry or callback.
    console.error("[paystack webhook]", (error as Error).message);
  }

  // Always acknowledge receipt of a validly-signed event.
  return NextResponse.json({ received: true });
}
