"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getAttendeeOverview, type AttendeeOverview } from "@/lib/actions/dashboard";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-NG", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function AttendeePage() {
  const [overview, setOverview] = useState<AttendeeOverview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAttendeeOverview().then((res) => {
      if (res.success) setOverview(res.data);
      setLoading(false);
    });
  }, []);

  const show = (value: number | undefined) =>
    loading ? "…" : (value ?? 0).toLocaleString();
  const featured = overview?.featured ?? [];

  return (
    <div className="space-y-8">
      {/* Welcome */}
      <div>
        <h2 className="text-3xl font-bold text-primary mb-2">Welcome to EventMerge</h2>
        <p className="text-foreground/70">
          Discover amazing events, buy tickets, and manage your wallet
        </p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-accent/5 border border-accent/20 rounded-lg p-6">
          <p className="text-sm text-foreground/60 mb-2">Your Tickets</p>
          <p className="text-3xl font-bold text-primary">{show(overview?.stats.activeTickets)}</p>
          <p className="text-xs text-foreground/50 mt-2">Active tickets</p>
        </div>

        <div className="bg-success/5 border border-success/20 rounded-lg p-6">
          <p className="text-sm text-foreground/60 mb-2">Upcoming Events</p>
          <p className="text-3xl font-bold text-success">{show(overview?.stats.upcomingEvents)}</p>
          <p className="text-xs text-foreground/50 mt-2">Events you&apos;re attending</p>
        </div>

        <div className="bg-accent/5 border border-accent/20 rounded-lg p-6">
          <p className="text-sm text-foreground/60 mb-2">Events Attended</p>
          <p className="text-3xl font-bold text-primary">{show(overview?.stats.attendedEvents)}</p>
          <p className="text-xs text-foreground/50 mt-2">Tickets already used</p>
        </div>
      </div>

      {/* Featured Events */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-primary">Featured Events</h3>
          <Link href="/events" className="text-sm font-medium text-accent hover:underline">
            Browse all
          </Link>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="animate-pulse rounded-lg border border-accent/20 bg-accent/5 h-44" />
            ))}
          </div>
        ) : featured.length === 0 ? (
          <div className="bg-accent/5 border border-accent/20 rounded-lg p-12 text-center">
            <p className="text-foreground/70 mb-4">No upcoming events yet</p>
            <p className="text-sm text-foreground/60">Check back soon or browse all events</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {featured.map((event) => (
              <Link
                key={event.id}
                href={`/events/${event.id}`}
                className="group rounded-lg border border-accent/20 bg-accent/5 overflow-hidden hover:border-accent/50 transition-colors"
              >
                <div className="h-28 bg-primary/10 overflow-hidden">
                  {event.banner_url && (
                    <img
                      src={event.banner_url}
                      alt={event.title}
                      className="h-full w-full object-cover group-hover:scale-105 transition-transform"
                    />
                  )}
                </div>
                <div className="p-4">
                  <h4 className="font-semibold text-primary line-clamp-2">{event.title}</h4>
                  <p className="mt-1 text-xs text-foreground/60">
                    📅 {formatDate(event.starts_at)}
                    {event.venue_name ? ` · ${event.venue_name}` : ""}
                  </p>
                  {event.fromPrice !== null && (
                    <p className="mt-2 text-sm font-semibold text-primary">
                      From ₦{event.fromPrice.toLocaleString()}
                    </p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Features */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-accent/5 border border-accent/20 rounded-lg p-6">
          <h4 className="font-semibold text-primary mb-2">🎫 Dynamic QR Codes</h4>
          <p className="text-sm text-foreground/70">
            Your tickets update every 30 seconds with encrypted QR codes for security
          </p>
        </div>

        <div className="bg-accent/5 border border-accent/20 rounded-lg p-6">
          <h4 className="font-semibold text-primary mb-2">🔐 AES-256 Protection</h4>
          <p className="text-sm text-foreground/70">
            Military-grade encryption protects your ticket data
          </p>
        </div>

        <div className="bg-accent/5 border border-accent/20 rounded-lg p-6">
          <h4 className="font-semibold text-primary mb-2">📲 Mobile Wallet</h4>
          <p className="text-sm text-foreground/70">
            Scan QR codes with any device, works offline with pre-cached hashes
          </p>
        </div>

        <div className="bg-accent/5 border border-accent/20 rounded-lg p-6">
          <h4 className="font-semibold text-primary mb-2">⚡ Instant Validation</h4>
          <p className="text-sm text-foreground/70">
            Gatekeepers get instant feedback with color-coded validation states
          </p>
        </div>
      </div>
    </div>
  );
}
