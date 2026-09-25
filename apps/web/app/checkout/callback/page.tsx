"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { verifyAndFulfillOrder } from "@/lib/actions/payments";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";

type Status = "verifying" | "paid" | "failed";

function CallbackInner() {
  const reference = useSearchParams().get("reference");
  const [status, setStatus] = useState<Status>("verifying");
  const [ticketCount, setTicketCount] = useState(0);

  useEffect(() => {
    if (!reference) {
      setStatus("failed");
      return;
    }
    let cancelled = false;
    verifyAndFulfillOrder(reference).then((res) => {
      if (cancelled) return;
      if (res.status === "paid") {
        setTicketCount(res.ticketIds?.length ?? 0);
        setStatus("paid");
      } else if (res.status === "failed") {
        setStatus("failed");
      } else {
        // Still pending (webhook may not have landed) — retry once shortly.
        setTimeout(() => {
          verifyAndFulfillOrder(reference).then((r2) => {
            if (cancelled) return;
            setStatus(r2.status === "paid" ? "paid" : r2.status === "failed" ? "failed" : "failed");
            if (r2.status === "paid") setTicketCount(r2.ticketIds?.length ?? 0);
          });
        }, 3000);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [reference]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-accent/5 border border-accent/20 rounded-2xl p-8 text-center space-y-4">
        {status === "verifying" && (
          <>
            <Loader2 size={48} className="mx-auto text-primary animate-spin" />
            <h1 className="text-xl font-bold text-foreground">Confirming your payment…</h1>
            <p className="text-foreground/60 text-sm">This only takes a moment.</p>
          </>
        )}

        {status === "paid" && (
          <>
            <CheckCircle size={48} className="mx-auto text-success" />
            <h1 className="text-xl font-bold text-foreground">Payment confirmed</h1>
            <p className="text-foreground/60 text-sm">
              {ticketCount} ticket{ticketCount !== 1 ? "s" : ""} issued to your wallet.
            </p>
            <Link
              href="/attendee/wallet"
              className="inline-block rounded-xl bg-primary text-primary-foreground px-6 py-3 font-semibold hover:bg-primary/90 transition"
            >
              View My Tickets
            </Link>
          </>
        )}

        {status === "failed" && (
          <>
            <XCircle size={48} className="mx-auto text-destructive" />
            <h1 className="text-xl font-bold text-foreground">Payment not completed</h1>
            <p className="text-foreground/60 text-sm">
              You weren&apos;t charged, or the payment was cancelled. You can try again.
            </p>
            <Link
              href="/events"
              className="inline-block rounded-xl border border-accent/30 text-foreground px-6 py-3 font-semibold hover:bg-foreground/5 transition"
            >
              Back to Events
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

export default function CheckoutCallbackPage() {
  return (
    <Suspense fallback={null}>
      <CallbackInner />
    </Suspense>
  );
}
