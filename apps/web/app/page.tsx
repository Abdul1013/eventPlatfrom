import Link from "next/link";
import { Calendar, MapPin, Lock, Zap, WifiOff, ArrowRight, Shield, Users, Ticket } from "lucide-react";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/actions/auth";
import AppHeader from "@/components/AppHeader";

interface TicketTier {
  price: number;
  capacity: number;
  sold: number;
}

interface Event {
  id: string;
  title: string;
  banner_url: string | null;
  venue_name: string | null;
  starts_at: string;
  ticket_tiers: TicketTier[];
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-NG", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getMinPrice(tiers: TicketTier[]): string {
  if (!Array.isArray(tiers) || tiers.length === 0) return "Free";
  const min = Math.min(...tiers.map((t) => Number(t.price)));
  return min === 0 ? "Free" : `₦${min.toLocaleString()}`;
}

function isSoldOut(tiers: TicketTier[]): boolean {
  if (!Array.isArray(tiers) || tiers.length === 0) return false;
  return tiers.every((t) => t.sold >= t.capacity);
}

export default async function LandingPage() {
  const session = await getSession();
  const dashboardHref = session ? `/${session.user.role.toLowerCase()}` : null;

  const rawEvents = await prisma.event.findMany({
    where: { startsAt: { gte: new Date() }, deletedAt: null },
    orderBy: { startsAt: "asc" },
    take: 6,
    select: {
      id: true,
      title: true,
      bannerUrl: true,
      venueName: true,
      startsAt: true,
      ticketTiers: { select: { price: true, capacity: true, sold: true } },
    },
  });

  const featuredEvents: Event[] = rawEvents.map((e) => ({
    id: e.id,
    title: e.title,
    banner_url: e.bannerUrl,
    venue_name: e.venueName,
    starts_at: e.startsAt.toISOString(),
    ticket_tiers: e.ticketTiers.map((t) => ({
      price: Number(t.price),
      capacity: t.capacity,
      sold: t.sold,
    })),
  }));

  const features = [
    {
      icon: Lock,
      title: "AES-256-GCM Encryption",
      description:
        "Every ticket payload is encrypted with military-grade AES-256-GCM. Forgery is cryptographically impossible.",
    },
    {
      icon: Zap,
      title: "Dynamic QR Codes",
      description:
        "QR codes regenerate every 30 seconds with a timestamp TTL, eliminating screenshot fraud.",
    },
    {
      icon: WifiOff,
      title: "Offline Scanning",
      description:
        "Gatekeepers cache a validated hash list so scanning works even without internet.",
    },
    {
      icon: Shield,
      title: "Role-Based Access",
      description:
        "Separate dashboards for organisers, attendees, and gatekeepers with strict RBAC.",
    },
    {
      icon: Users,
      title: "Real-Time Analytics",
      description:
        "Organisers see live ticket sales, capacity usage, and scan activity in one view.",
    },
    {
      icon: Ticket,
      title: "Instant Issuance",
      description:
        "Tickets are issued and encrypted server-side the moment payment is confirmed.",
    },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <AppHeader title="" />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-primary/5 pointer-events-none" />
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-20 md:py-32 flex flex-col items-center text-center gap-6">
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/10 text-accent text-xs font-semibold uppercase tracking-wide">
            <Lock size={12} /> Encrypted Ticketing
          </span>

          <h1 className="text-4xl md:text-6xl font-extrabold text-foreground leading-tight max-w-3xl">
            Discover events.{" "}
            <span className="text-primary">Buy with confidence.</span>
          </h1>

          <p className="text-lg text-foreground/60 max-w-xl">
            EventMerge protects every ticket with AES-256-GCM encryption and
            dynamic QR codes that refresh every 30 seconds — so your entry is
            always authentic.
          </p>

          <div className="flex flex-wrap justify-center gap-3 mt-2">
            {dashboardHref ? (
              <Link
                href={dashboardHref}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition min-h-[44px]"
              >
                Go to Dashboard <ArrowRight size={16} />
              </Link>
            ) : (
              <>
                <Link
                  href="/register"
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition min-h-[44px]"
                >
                  Get Started <ArrowRight size={16} />
                </Link>
                <Link
                  href="/login"
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-accent/30 text-foreground font-semibold hover:bg-foreground/5 transition min-h-[44px]"
                >
                  Sign In
                </Link>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Featured Events */}
      <section className="max-w-7xl mx-auto px-4 md:px-8 py-16 w-full">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-foreground">
              Upcoming Events
            </h2>
            <p className="text-foreground/60 mt-1 text-sm">
              Discover what&apos;s happening near you
            </p>
          </div>
          <Link
            href="/events"
            className="hidden sm:inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline"
          >
            View all <ArrowRight size={14} />
          </Link>
        </div>

        {featuredEvents.length === 0 ? (
          <div className="text-center py-16 rounded-2xl border border-accent/20">
            <Ticket size={40} className="mx-auto text-foreground/25 mb-3" />
            <p className="text-foreground/60 text-sm">
              No upcoming events yet — check back soon.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {featuredEvents.map((event) => {
              const soldOut = isSoldOut(event.ticket_tiers);
              const minPrice = getMinPrice(event.ticket_tiers);

              return (
                <Link
                  key={event.id}
                  href={`/events/${event.id}`}
                  className="group block rounded-2xl border border-accent/20 overflow-hidden hover:border-accent/50 hover:shadow-lg transition bg-background"
                >
                  <div className="relative h-44 bg-foreground/5 overflow-hidden">
                    {event.banner_url ? (
                      <img
                        src={event.banner_url}
                        alt={event.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Ticket size={36} className="text-foreground/20" />
                      </div>
                    )}
                    {soldOut && (
                      <span className="absolute top-3 right-3 px-2 py-0.5 rounded-full bg-foreground/80 text-background text-xs font-semibold">
                        Sold Out
                      </span>
                    )}
                  </div>

                  <div className="p-4 space-y-3">
                    <h3 className="font-semibold text-foreground line-clamp-2 group-hover:text-primary transition">
                      {event.title}
                    </h3>

                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2 text-xs text-foreground/60">
                        <Calendar size={13} className="text-accent shrink-0" />
                        {formatDate(event.starts_at)}
                      </div>
                      {event.venue_name && (
                        <div className="flex items-center gap-2 text-xs text-foreground/60">
                          <MapPin size={13} className="text-accent shrink-0" />
                          <span className="truncate">{event.venue_name}</span>
                        </div>
                      )}
                    </div>

                    <div className="pt-1 flex items-center justify-between">
                      <span className="text-sm font-bold text-primary">
                        {minPrice}
                      </span>
                      <span className="text-xs text-foreground/40">
                        {event.ticket_tiers.length} tier
                        {event.ticket_tiers.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        <div className="mt-6 sm:hidden text-center">
          <Link
            href="/events"
            className="inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline"
          >
            View all events <ArrowRight size={14} />
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="border-y border-accent/20 py-16">
        <div className="max-w-7xl mx-auto px-4 md:px-8">
          <div className="text-center mb-12">
            <h2 className="text-2xl md:text-3xl font-bold text-foreground">
              Why EventMerge?
            </h2>
            <p className="text-foreground/60 mt-2 max-w-xl mx-auto text-sm">
              Built for organisers who can&apos;t afford fraud and attendees who
              demand a seamless experience.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map(({ icon: Icon, title, description }) => (
              <div
                key={title}
                className="p-6 rounded-2xl bg-background border border-accent/20 hover:border-accent/40 transition"
              >
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                  <Icon size={20} className="text-primary" />
                </div>
                <h3 className="font-semibold text-foreground mb-2">{title}</h3>
                <p className="text-sm text-foreground/60 leading-relaxed">
                  {description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-7xl mx-auto px-4 md:px-8 py-20 text-center w-full">
        <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-4">
          Ready to host or attend your next event?
        </h2>
        <p className="text-foreground/60 mb-8 max-w-md mx-auto text-sm">
          Join EventMerge — organisers, attendees, and gatekeepers all in one
          secure platform.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          {dashboardHref ? (
            <Link
              href={dashboardHref}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition min-h-[44px]"
            >
              Open Dashboard <ArrowRight size={16} />
            </Link>
          ) : (
            <>
              <Link
                href="/register"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition min-h-[44px]"
              >
                Create Account <ArrowRight size={16} />
              </Link>
              <Link
                href="/events"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-accent/30 text-foreground font-semibold hover:bg-foreground/5 transition min-h-[44px]"
              >
                Browse Events
              </Link>
            </>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-auto border-t border-accent/20 py-8">
        <div className="max-w-7xl mx-auto px-4 md:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm font-bold text-primary">EventMerge</p>
          <p className="text-xs text-foreground/40">
            AES-256-GCM encrypted ticketing. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
