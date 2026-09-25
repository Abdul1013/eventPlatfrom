"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { getTicketDetail } from "@/lib/actions/checkout";
import { FeedbackToast } from "@/components/FeedbackToast";
import { useDynamicQR } from "@/hooks/useDynamicQR";

interface TicketDetail {
  id: string;
  status: "ACTIVE" | "USED" | "CANCELLED";
  issued_at: string;
  qr_payload_encrypted: string | null;
  event: {
    title: string;
    description: string;
    venue_name: string;
    starts_at: string;
    ends_at: string;
    banner_url?: string;
    organizer_name: string;
  };
  tier: {
    name: string;
    price: number;
  };
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const options: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    year: "numeric",
  };
  return date.toLocaleDateString("en-US", options);
}

function formatDateTime(dateString: string): string {
  const date = new Date(dateString);
  const options: Intl.DateTimeFormatOptions = {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  };
  return date.toLocaleDateString("en-US", options);
}

export default function TicketDetailPage() {
  const params = useParams();
  const router = useRouter();
  const ticketId = params.ticketId as string;

  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<{
    state: "valid" | "warning" | "invalid";
    message: string;
  } | null>(null);

  const isActive = ticket?.status === "ACTIVE";
  const { encryptedQr, loading: qrLoading, error: qrError, timeRemaining, isRefreshing } =
    useDynamicQR(ticketId, isActive);

  useEffect(() => {
    async function loadTicket() {
      try {
        const result = await getTicketDetail(ticketId);
        if (result.success && result.ticket) {
          setTicket(result.ticket as TicketDetail);
        } else {
          setFeedback({
            state: "invalid",
            message: result.error || "Failed to load ticket",
          });
        }
      } catch (error) {
        setFeedback({
          state: "invalid",
          message: "An error occurred while loading the ticket",
        });
      } finally {
        setLoading(false);
      }
    }

    loadTicket();
  }, [ticketId]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "ACTIVE":
        return "bg-success";
      case "USED":
        return "bg-primary";
      case "CANCELLED":
        return "bg-destructive";
      default:
        return "bg-gray-400";
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b-2 border-foreground bg-white px-4 py-4 sm:px-6 sm:py-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Your Ticket</h1>
            <p className="mt-2 text-sm text-primary">Event ticket details</p>
          </div>
          <button
            onClick={() => router.back()}
            className="rounded-lg bg-background px-4 py-2 font-semibold text-foreground hover:bg-accent hover:text-white transition-colors"
          >
            ← Back
          </button>
        </div>
      </div>

      {/* Feedback Toast */}
      {feedback && (
        <div className="m-4">
          <FeedbackToast state={feedback.state} message={feedback.message} />
        </div>
      )}

      {/* Content */}
      <div className="p-4 sm:p-6">
        {loading ? (
          <div className="max-w-2xl mx-auto animate-pulse space-y-6">
            <div className="h-64 rounded-lg bg-foreground/10" />
            <div className="rounded-lg border-2 border-foreground/10 bg-white p-6 space-y-4">
              <div className="flex items-start justify-between">
                <div className="space-y-2 flex-1 mr-4">
                  <div className="h-7 bg-foreground/10 rounded w-3/4" />
                  <div className="h-4 bg-foreground/10 rounded w-1/3" />
                </div>
                <div className="h-6 w-16 bg-foreground/10 rounded" />
              </div>
              <div className="grid gap-4 border-t-2 border-background pt-6 sm:grid-cols-2">
                <div className="space-y-2">
                  <div className="h-3 bg-foreground/10 rounded w-1/3" />
                  <div className="h-4 bg-foreground/10 rounded w-2/3" />
                </div>
                <div className="space-y-2">
                  <div className="h-3 bg-foreground/10 rounded w-1/4" />
                  <div className="h-4 bg-foreground/10 rounded w-1/2" />
                </div>
              </div>
              <div className="h-16 bg-foreground/10 rounded-lg" />
              <div className="h-48 bg-foreground/10 rounded-lg" />
            </div>
          </div>
        ) : ticket ? (
          <div className="max-w-2xl mx-auto">
            {/* Event Banner */}
            {ticket.event.banner_url && (
              <div className="relative h-64 w-full overflow-hidden rounded-lg border-2 border-foreground bg-primary">
                <img
                  src={ticket.event.banner_url}
                  alt={ticket.event.title}
                  className="h-full w-full object-cover"
                />
              </div>
            )}

            {/* Ticket Card */}
            <div className="mt-6 rounded-lg border-2 border-foreground bg-white p-6 sm:p-8">
              {/* Event Title & Status */}
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-3xl font-bold text-foreground">
                    {ticket.event.title}
                  </h2>
                  <p className="mt-2 text-accent">{ticket.event.organizer_name}</p>
                </div>
                <span
                  className={`${getStatusColor(
                    ticket.status
                  )} rounded px-3 py-1 text-sm font-semibold text-white`}
                >
                  {ticket.status}
                </span>
              </div>

              {/* Event Details Grid */}
              <div className="mt-6 grid gap-4 border-t-2 border-background pt-6 sm:grid-cols-2">
                <div>
                  <p className="text-sm text-accent">DATE & TIME</p>
                  <p className="mt-1 font-semibold text-foreground">
                    {formatDateTime(ticket.event.starts_at)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-accent">VENUE</p>
                  <p className="mt-1 font-semibold text-foreground">
                    {ticket.event.venue_name}
                  </p>
                </div>
              </div>

              {/* Ticket Tier & Price */}
              <div className="mt-6 rounded-lg bg-background p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-accent">TIER</p>
                    <p className="font-bold text-foreground">{ticket.tier.name}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-accent">PRICE</p>
                    <p className="text-2xl font-bold text-primary">
                      ₦{ticket.tier.price.toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>

              {/* Ticket ID */}
              <div className="mt-6 border-t-2 border-background pt-6">
                <p className="text-sm text-accent">TICKET ID</p>
                <p className="mt-1 break-all font-mono text-sm text-primary">
                  {ticketId}
                </p>
              </div>

              {/* Issued Date */}
              <div className="mt-4">
                <p className="text-sm text-accent">PURCHASED</p>
                <p className="mt-1 text-primary">
                  {formatDate(ticket.issued_at)}
                </p>
              </div>

              {/* Dynamic QR Code */}
              <div className="mt-6 rounded-lg border-2 border-accent bg-background p-6 text-center">
                <p className="text-sm font-semibold text-accent mb-4">
                  Dynamic QR Code
                </p>

                {!isActive && (
                  <div className="flex flex-col items-center gap-2 py-6">
                    <p className="text-sm font-semibold text-primary">
                      {ticket?.status === "USED" ? "Ticket already scanned" : "Ticket cancelled"}
                    </p>
                    <p className="text-xs text-primary/60">
                      QR codes are only available for active tickets
                    </p>
                  </div>
                )}

                {isActive && qrLoading && (
                  <div className="flex flex-col items-center gap-3 py-8">
                    <div className="h-12 w-12 animate-spin rounded-full border-4 border-accent border-t-transparent" />
                    <p className="text-xs text-primary">Generating secure QR...</p>
                  </div>
                )}

                {isActive && qrError && !qrLoading && (
                  <div className="rounded border border-red-300 bg-red-50 p-4">
                    <p className="text-sm text-red-600">Failed to load QR code</p>
                    <p className="text-xs text-red-400 mt-1">{qrError}</p>
                  </div>
                )}

                {isActive && encryptedQr && !qrLoading && (
                  <div className="flex flex-col items-center gap-4">
                    {/* QR with flash animation on refresh */}
                    <div
                      className="rounded-lg bg-white p-4 shadow-md transition-opacity duration-200"
                      style={{ opacity: isRefreshing ? 0.4 : 1 }}
                    >
                      <QRCodeSVG
                        value={encryptedQr}
                        size={220}
                        bgColor="#ffffff"
                        fgColor="#0B1F1D"
                        level="H"
                      />
                    </div>

                    {/* Countdown ring */}
                    <div className="flex items-center gap-2">
                      <svg width="24" height="24" viewBox="0 0 24 24">
                        <circle
                          cx="12" cy="12" r="10"
                          fill="none"
                          stroke="#E7ECEA"
                          strokeWidth="3"
                        />
                        <circle
                          cx="12" cy="12" r="10"
                          fill="none"
                          stroke="#FF6B4A"
                          strokeWidth="3"
                          strokeDasharray={`${2 * Math.PI * 10}`}
                          strokeDashoffset={`${2 * Math.PI * 10 * (1 - timeRemaining / 30)}`}
                          strokeLinecap="round"
                          transform="rotate(-90 12 12)"
                          className="transition-all duration-1000"
                        />
                      </svg>
                      <p className="text-xs text-primary">
                        Refreshes in <span className="font-semibold text-accent">{timeRemaining}s</span>
                      </p>
                    </div>

                    <p className="text-xs text-primary/60">
                      AES-256-GCM encrypted · 30-second TTL · Anti-screenshot
                    </p>
                  </div>
                )}
              </div>

              {/* Description */}
              {ticket.event.description && (
                <div className="mt-6 border-t-2 border-background pt-6">
                  <p className="text-sm text-accent">EVENT DESCRIPTION</p>
                  <p className="mt-2 text-primary line-clamp-4">
                    {ticket.event.description}
                  </p>
                </div>
              )}

              {/* CTA Buttons */}
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <button className="flex-1 rounded-lg bg-primary px-4 py-3 font-semibold text-white hover:bg-accent transition-colors">
                  Add to Wallet
                </button>
                <button className="flex-1 rounded-lg border-2 border-primary px-4 py-3 font-semibold text-primary hover:bg-background transition-colors">
                  Share Ticket
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border-2 border-accent bg-white p-8 text-center">
            <p className="text-primary">Ticket not found</p>
            <button
              onClick={() => router.push("/attendee/wallet")}
              className="mt-4 rounded-lg bg-primary px-6 py-2 font-semibold text-white hover:bg-accent transition-colors"
            >
              Back to Wallet
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
