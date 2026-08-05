"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  getOrganizerAnalytics,
  type OrganizerAnalytics,
} from "@/lib/actions/analytics";

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-NG", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function OrganizerPage() {
  const [data, setData] = useState<OrganizerAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getOrganizerAnalytics().then((res) => {
      if (res.success) setData(res.data);
      else setError(res.error);
      setLoading(false);
    });
  }, []);

  const totals = data?.totals;
  const recentEvents = (data?.events ?? []).slice(0, 5);
  const stat = (value: number | undefined, currency = false) => {
    if (loading) return "…";
    const n = value ?? 0;
    return currency ? `₦${n.toLocaleString()}` : n.toLocaleString();
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-primary mb-2">Your Events</h2>
          <p className="text-foreground/70">
            Create, edit, and manage ticket sales for your events
          </p>
        </div>
        <Link href="/organizer/events/new">
          <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
            Create New Event
          </Button>
        </Link>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* KPI stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-accent/5 border border-accent/20 rounded-lg p-6">
          <p className="text-sm text-foreground/60 mb-2">Events</p>
          <p className="text-3xl font-bold text-primary">{stat(totals?.events)}</p>
          <p className="text-xs text-foreground/50 mt-2">Total created</p>
        </div>
        <div className="bg-success/5 border border-success/20 rounded-lg p-6">
          <p className="text-sm text-foreground/60 mb-2">Tickets Sold</p>
          <p className="text-3xl font-bold text-success">{stat(totals?.sold)}</p>
          <p className="text-xs text-foreground/50 mt-2">
            of {stat(totals?.capacity)} capacity
          </p>
        </div>
        <div className="bg-accent/5 border border-accent/20 rounded-lg p-6">
          <p className="text-sm text-foreground/60 mb-2">Revenue</p>
          <p className="text-3xl font-bold text-primary">{stat(totals?.revenue, true)}</p>
          <p className="text-xs text-foreground/50 mt-2">All events combined</p>
        </div>
        <div className="bg-accent/5 border border-accent/20 rounded-lg p-6">
          <p className="text-sm text-foreground/60 mb-2">Capacity</p>
          <p className="text-3xl font-bold text-primary">{stat(totals?.capacity)}</p>
          <p className="text-xs text-foreground/50 mt-2">Across all tiers</p>
        </div>
      </div>

      {/* Recent events */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-primary">Recent Events</h3>
          <Link href="/organizer/events" className="text-sm font-medium text-accent hover:underline">
            Manage all
          </Link>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="animate-pulse h-16 rounded-lg border border-accent/20 bg-accent/5" />
            ))}
          </div>
        ) : recentEvents.length === 0 ? (
          <div className="bg-accent/5 border border-accent/20 rounded-lg p-12 text-center">
            <p className="text-foreground/70 mb-4">You haven&apos;t created any events yet</p>
            <Link href="/organizer/events/new">
              <Button variant="outline">Get Started</Button>
            </Link>
          </div>
        ) : (
          <div className="rounded-lg border border-accent/20 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-accent/5 text-left text-xs font-semibold uppercase tracking-wider text-accent">
                <tr>
                  <th className="px-4 py-3">Event</th>
                  <th className="px-4 py-3 text-right">Sold</th>
                  <th className="px-4 py-3 text-right">Sell-Through</th>
                  <th className="px-4 py-3 text-right">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-accent/10">
                {recentEvents.map((e) => (
                  <tr key={e.event_id} className="hover:bg-accent/5">
                    <td className="px-4 py-3">
                      <Link
                        href={`/organizer/events/${e.event_id}/tiers`}
                        className="font-medium text-primary hover:underline"
                      >
                        {e.title}
                      </Link>
                      <span className="ml-2 text-xs text-foreground/50">
                        {fmtDate(e.starts_at)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {e.total_sold.toLocaleString()} / {e.total_capacity.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold">{e.sell_through}%</td>
                    <td className="px-4 py-3 text-right font-semibold text-primary">
                      ₦{e.revenue.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-accent/5 border border-accent/20 rounded-lg p-6">
          <h3 className="font-semibold text-primary mb-2">Event Setup</h3>
          <p className="text-sm text-foreground/70">
            Create events, set ticket tiers, and upload banners
          </p>
        </div>

        <div className="bg-accent/5 border border-accent/20 rounded-lg p-6">
          <h3 className="font-semibold text-primary mb-2">Ticket Management</h3>
          <p className="text-sm text-foreground/70">
            Track inventory, view sales, manage ticket releases
          </p>
        </div>

        <Link
          href="/organizer/analytics"
          className="bg-accent/5 border border-accent/20 rounded-lg p-6 hover:border-accent/50 transition-colors"
        >
          <h3 className="font-semibold text-primary mb-2">Analytics</h3>
          <p className="text-sm text-foreground/70">
            View detailed sales, revenue, and attendance charts
          </p>
        </Link>
      </div>
    </div>
  );
}
