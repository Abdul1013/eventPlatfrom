"use client";

import { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
} from "recharts";
import {
  getOrganizerAnalytics,
  type OrganizerAnalytics,
} from "@/lib/actions/analytics";

// ─── Chart colors (Recharts needs literal hex — mirrors the Lagos Nightlife
// palette tokens in globals.css). ───────────────────────────────────────────

const C = {
  primary: "#0D9488", // teal
  accent: "#FF6B4A", // coral
  dark: "#0B1F1D", // foreground
  valid: "#10B981",
  warning: "#F59E0B",
  invalid: "#EF4444",
};

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: C.valid,
  USED: C.primary,
  CANCELLED: C.invalid,
  TRANSFERRED: C.accent,
};

// ─── Small helpers ────────────────────────────────────────────────────────────

function fmt(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function shortTitle(title: string, max = 18) {
  return title.length > max ? title.slice(0, max) + "…" : title;
}

// ─── KPI card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-accent/20 bg-accent/5 p-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-accent">
        {label}
      </p>
      <p className="mt-2 text-3xl font-bold text-foreground">{value}</p>
      {sub && <p className="mt-1 text-xs text-foreground/60">{sub}</p>}
    </div>
  );
}

// ─── Chart section wrapper ────────────────────────────────────────────────────

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-accent/20 bg-accent/5 p-6">
      <h3 className="mb-4 text-lg font-semibold text-foreground">{title}</h3>
      {children}
    </div>
  );
}

// ─── Skeleton loader ──────────────────────────────────────────────────────────

function Skeleton({ h = "h-40" }: { h?: string }) {
  return <div className={`animate-pulse rounded-lg bg-foreground/10 ${h}`} />;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function OrganizerAnalyticsPage() {
  const [data, setData] = useState<OrganizerAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getOrganizerAnalytics().then((res) => {
      if (res.success) setData(res.data);
      else setError(res.error);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} h="h-28" />)}
        </div>
        <Skeleton h="h-72" />
        <div className="grid gap-6 md:grid-cols-2">
          <Skeleton h="h-72" />
          <Skeleton h="h-72" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-6 text-destructive">
        {error}
      </div>
    );
  }

  if (!data) return null;

  const { events, dailySales, statusBreakdown, totals } = data;
  const sellThrough =
    totals.capacity > 0
      ? ((totals.sold / totals.capacity) * 100).toFixed(1)
      : "0.0";

  // Recharts dataset for bar chart (capacity vs sold)
  const capacityData = events.map((e) => ({
    name: shortTitle(e.title),
    Sold: e.total_sold,
    Remaining: Math.max(0, e.total_capacity - e.total_sold),
    Revenue: e.revenue,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-foreground">Analytics</h2>
        <p className="mt-1 text-sm text-primary">Sales and attendance for your events</p>
      </div>

      {/* ── KPI cards ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <KpiCard
          label="Total Revenue"
          value={`₦${fmt(totals.revenue)}`}
          sub="all events combined"
        />
        <KpiCard
          label="Tickets Sold"
          value={totals.sold.toLocaleString()}
          sub={`of ${totals.capacity.toLocaleString()} capacity`}
        />
        <KpiCard
          label="Sell-Through"
          value={`${sellThrough}%`}
          sub="across all tiers"
        />
        <KpiCard
          label="Events"
          value={totals.events.toString()}
          sub="total created"
        />
      </div>

      {/* ── Tickets sold vs remaining per event ──────────────────────────── */}
      {events.length > 0 ? (
        <Section title="Tickets Sold vs Remaining Capacity">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={capacityData} margin={{ top: 0, right: 16, left: 0, bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#0B1F1D11" />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 11, fill: C.dark }}
                angle={-30}
                textAnchor="end"
                interval={0}
              />
              <YAxis tick={{ fontSize: 11, fill: C.dark }} />
              <Tooltip
                contentStyle={{ borderColor: C.dark, borderRadius: 8 }}
                formatter={(v, name) => [Number(v ?? 0).toLocaleString(), String(name)]}
              />
              <Legend wrapperStyle={{ paddingTop: 16 }} />
              <Bar dataKey="Sold" stackId="a" fill={C.primary} radius={[0, 0, 0, 0]} />
              <Bar dataKey="Remaining" stackId="a" fill="#0B1F1D1A" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Section>
      ) : (
        <Section title="Tickets Sold vs Remaining Capacity">
          <div className="flex h-40 items-center justify-center text-foreground/50">
            No events yet — create one to see sales data.
          </div>
        </Section>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        {/* ── Daily ticket sales (last 30 days)  */}
        <Section title="Daily Ticket Sales (Last 30 Days)">
          {dailySales.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={dailySales} margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={C.primary} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={C.primary} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#0B1F1D11" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: C.dark }}
                  tickFormatter={(d) => d.slice(5)}
                  interval="preserveStartEnd"
                />
                <YAxis tick={{ fontSize: 11, fill: C.dark }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ borderColor: C.dark, borderRadius: 8 }}
                  formatter={(v) => [Number(v ?? 0), "Tickets"]}
                  labelFormatter={(l) => `Date: ${l}`}
                />
                <Area
                  type="monotone"
                  dataKey="tickets"
                  stroke={C.primary}
                  strokeWidth={2}
                  fill="url(#salesGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-40 items-center justify-center text-foreground/50">
              No sales in the last 30 days.
            </div>
          )}
        </Section>

        {/* ── Ticket status breakdown (donut) ────────────────────────────── */}
        <Section title="Ticket Status Breakdown">
          {statusBreakdown.length > 0 ? (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width="60%" height={200}>
                <PieChart>
                  <Pie
                    data={statusBreakdown}
                    dataKey="count"
                    nameKey="status"
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={3}
                  >
                    {statusBreakdown.map((entry) => (
                      <Cell
                        key={entry.status}
                        fill={STATUS_COLORS[entry.status] ?? C.accent}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ borderColor: C.dark, borderRadius: 8 }}
                    formatter={(v, name) => [Number(v ?? 0), String(name)]}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 text-sm">
                {statusBreakdown.map((s) => (
                  <div key={s.status} className="flex items-center gap-2">
                    <span
                      className="inline-block h-3 w-3 rounded-full"
                      style={{ background: STATUS_COLORS[s.status] ?? C.accent }}
                    />
                    <span className="font-medium text-foreground">{s.status}</span>
                    <span className="text-foreground/60">{s.count}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex h-40 items-center justify-center text-foreground/50">
              No ticket data yet.
            </div>
          )}
        </Section>
      </div>

      {/* ── Per-event revenue table ───────────────────────────────────────── */}
      {events.length > 0 && (
        <Section title="Revenue by Event">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-foreground/10 text-left text-xs font-semibold uppercase tracking-wider text-accent">
                  <th className="pb-3 pr-4">Event</th>
                  <th className="pb-3 pr-4 text-right">Sold</th>
                  <th className="pb-3 pr-4 text-right">Capacity</th>
                  <th className="pb-3 pr-4 text-right">Sell-Through</th>
                  <th className="pb-3 text-right">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-foreground/10">
                {events.map((e) => (
                  <tr key={e.event_id} className="hover:bg-primary/5">
                    <td className="py-3 pr-4 font-medium text-foreground">
                      {e.title}
                      <span className="ml-2 text-xs text-foreground/50">
                        {new Date(e.starts_at).toLocaleDateString()}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-right">{e.total_sold}</td>
                    <td className="py-3 pr-4 text-right">{e.total_capacity}</td>
                    <td className="py-3 pr-4 text-right">
                      <span
                        className={`font-semibold ${
                          e.sell_through >= 80
                            ? "text-success"
                            : e.sell_through >= 40
                            ? "text-warning"
                            : "text-destructive"
                        }`}
                      >
                        {e.sell_through}%
                      </span>
                    </td>
                    <td className="py-3 text-right font-semibold text-primary">
                      ₦{fmt(e.revenue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}
    </div>
  );
}
