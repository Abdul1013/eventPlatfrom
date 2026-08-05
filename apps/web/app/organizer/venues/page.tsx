import Link from "next/link";
import { getVenues } from "@/lib/actions/venues";
import { Button } from "@/components/ui/button";

export default async function VenuesPage() {
  const res = await getVenues();

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-primary mb-1">Venues</h1>
          <p className="text-foreground/70">
            Reusable seat maps for reserved-seating events
          </p>
        </div>
        <Link href="/organizer/venues/new">
          <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
            New Venue
          </Button>
        </Link>
      </div>

      {!res.success ? (
        <div className="bg-destructive/10 border border-destructive text-destructive px-4 py-3 rounded-lg text-sm">
          {res.error}
        </div>
      ) : res.venues.length === 0 ? (
        <div className="bg-accent/5 border border-accent/20 rounded-lg p-8 text-center text-foreground/70">
          No venues yet. Create one to enable intelligent seat allocation.
        </div>
      ) : (
        <ul className="space-y-3">
          {res.venues.map((v) => (
            <li
              key={v.id}
              className="bg-accent/5 border border-accent/20 rounded-lg p-4 flex items-center justify-between"
            >
              <div>
                <p className="font-semibold">{v.name}</p>
                <p className="text-sm text-foreground/60">
                  {v.city} · {v.address}
                </p>
              </div>
              <span className="text-sm font-medium text-primary">
                {v.total_capacity} seats
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
