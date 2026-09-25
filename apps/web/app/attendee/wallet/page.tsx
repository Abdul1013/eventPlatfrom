"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { getAttendeeTickets } from "@/lib/actions/checkout";
import { FeedbackToast } from "@/components/FeedbackToast";

interface Ticket {
  id: string;
  status: "ACTIVE" | "USED" | "CANCELLED";
  issued_at: string;
  event: {
    title: string;
    venue_name: string;
    starts_at: string;
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

export default function WalletPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<{
    state: "valid" | "warning" | "invalid";
    message: string;
  } | null>(null);

  useEffect(() => {
    async function loadTickets() {
      try {
        const result = await getAttendeeTickets();
        if (result.success && result.tickets) {
          setTickets(result.tickets as Ticket[]);
        } else {
          setFeedback({
            state: "invalid",
            message: result.error || "Failed to load tickets",
          });
        }
      } catch (error) {
        setFeedback({
          state: "invalid",
          message: "An error occurred while loading tickets",
        });
      } finally {
        setLoading(false);
      }
    }

    loadTickets();
  }, []);

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case "ACTIVE":
        return "bg-success text-white";
      case "USED":
        return "bg-primary text-white";
      case "CANCELLED":
        return "bg-destructive text-white";
      default:
        return "bg-gray-300 text-gray-800";
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b-2 border-foreground bg-white px-4 py-4 sm:px-6 sm:py-6">
        <h1 className="text-3xl font-bold text-foreground">My Wallet</h1>
        <p className="mt-2 text-sm text-primary">View and manage your tickets</p>
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
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="rounded-lg border-2 border-foreground/10 bg-white overflow-hidden animate-pulse">
                <div className="h-40 bg-foreground/10" />
                <div className="p-4 space-y-3">
                  <div className="h-4 bg-foreground/10 rounded w-3/4" />
                  <div className="h-3 bg-foreground/10 rounded w-1/2" />
                  <div className="h-3 bg-foreground/10 rounded w-1/3" />
                  <div className="border-t border-background pt-3 space-y-1">
                    <div className="h-3 bg-foreground/10 rounded w-2/3" />
                    <div className="h-3 bg-foreground/10 rounded w-1/2" />
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <div className="h-5 bg-foreground/10 rounded w-16" />
                    <div className="h-5 bg-foreground/10 rounded w-10" />
                  </div>
                  <div className="h-10 bg-foreground/10 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : tickets.length === 0 ? (
          <div className="rounded-lg border-2 border-accent bg-white p-8 text-center">
            <p className="text-primary">No tickets yet</p>
            <p className="mt-2 text-sm text-accent">Explore events and purchase tickets to get started</p>
            <Link
              href="/events"
              className="mt-4 inline-block rounded-lg bg-primary px-6 py-3 font-semibold text-white hover:bg-accent transition-colors"
            >
              Browse Events
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {tickets.map((ticket) => (
              <Link
                key={ticket.id}
                href={`/attendee/wallet/${ticket.id}`}
                className="group rounded-lg border-2 border-foreground bg-white hover:shadow-lg transition-shadow overflow-hidden"
              >
                {/* Banner Image */}
                {ticket.event.banner_url && (
                  <div className="relative h-40 w-full overflow-hidden bg-primary">
                    <img
                      src={ticket.event.banner_url}
                      alt={ticket.event.title}
                      className="h-full w-full object-cover group-hover:scale-105 transition-transform"
                    />
                  </div>
                )}

                {/* Card Content */}
                <div className="p-4">
                  {/* Event Title */}
                  <h3 className="font-bold text-foreground line-clamp-2 group-hover:text-accent">
                    {ticket.event.title}
                  </h3>

                  {/* Tier & Organizer */}
                  <p className="mt-2 text-sm text-primary">{ticket.tier.name}</p>
                  <p className="text-xs text-accent">{ticket.event.organizer_name}</p>

                  {/* Venue & Date */}
                  <div className="mt-3 space-y-1 border-t border-background pt-3">
                    <p className="text-xs text-primary">
                      📍 {ticket.event.venue_name}
                    </p>
                    <p className="text-xs text-primary">
                      📅 {formatDate(ticket.event.starts_at)}
                    </p>
                  </div>

                  {/* Status Badge */}
                  <div className="mt-3 flex items-center justify-between">
                    <span className={`text-xs font-semibold px-2 py-1 rounded ${getStatusBadgeColor(ticket.status)}`}>
                      {ticket.status}
                    </span>
                    <span className="text-sm font-bold text-primary">₦{ticket.tier.price.toLocaleString()}</span>
                  </div>

                  {/* CTA */}
                  <button
                    className="mt-3 w-full rounded-lg bg-primary py-2.5 font-semibold text-white hover:bg-accent transition-colors"
                    onClick={(e) => {
                      e.preventDefault();
                    }}
                  >
                    View Ticket
                  </button>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
