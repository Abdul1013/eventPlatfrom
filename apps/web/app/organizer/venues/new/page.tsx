"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createVenueWithSeats } from "@/lib/actions/venues";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface SectionForm {
  name: string;
  rows: number;
  seatsPerRow: number;
  accessibleFrontRows: number;
}

const emptySection = (n: number): SectionForm => ({
  name: `Section ${n}`,
  rows: 10,
  seatsPerRow: 12,
  accessibleFrontRows: 1,
});

export default function NewVenuePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [venue, setVenue] = useState({ name: "", address: "", city: "" });
  const [sections, setSections] = useState<SectionForm[]>([emptySection(1)]);

  const totalSeats = sections.reduce((sum, s) => sum + s.rows * s.seatsPerRow, 0);

  function updateSection(i: number, patch: Partial<SectionForm>) {
    setSections((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }

  function addSection() {
    setSections((prev) => [...prev, emptySection(prev.length + 1)]);
  }

  function removeSection(i: number) {
    setSections((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await createVenueWithSeats({ ...venue, sections });
      if (!result.success) {
        setError(result.error || "Failed to create venue");
        return;
      }
      router.push("/organizer/venues");
    } catch (err) {
      console.error(err);
      setError("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-primary mb-2">New Venue</h1>
        <p className="text-foreground/70">
          Define sections and rows — we generate the seat map for allocation.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="space-y-6 bg-accent/5 border border-accent/20 rounded-lg p-6"
      >
        {error && (
          <div className="bg-destructive/10 border border-destructive text-destructive px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Venue Name</label>
            <Input
              value={venue.name}
              onChange={(e) => setVenue({ ...venue, name: e.target.value })}
              placeholder="e.g., Eko Convention Centre"
              required
              disabled={loading}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">City</label>
              <Input
                value={venue.city}
                onChange={(e) => setVenue({ ...venue, city: e.target.value })}
                placeholder="Lagos"
                required
                disabled={loading}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Address</label>
              <Input
                value={venue.address}
                onChange={(e) => setVenue({ ...venue, address: e.target.value })}
                placeholder="Victoria Island"
                required
                disabled={loading}
              />
            </div>
          </div>
        </div>

        {/* Sections */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Sections</h2>
            <span className="text-sm font-medium text-primary">
              {totalSeats} total seats
            </span>
          </div>

          {sections.map((s, i) => (
            <div
              key={i}
              className="border border-foreground/15 rounded-lg p-4 space-y-3"
            >
              <div className="flex items-center justify-between gap-3">
                <Input
                  value={s.name}
                  onChange={(e) => updateSection(i, { name: e.target.value })}
                  placeholder="Section name"
                  required
                  disabled={loading}
                />
                {sections.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeSection(i)}
                    className="text-sm text-destructive hover:underline shrink-0"
                    disabled={loading}
                  >
                    Remove
                  </button>
                )}
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-foreground/60 mb-1">
                    Rows (max 26)
                  </label>
                  <Input
                    type="number"
                    min={1}
                    max={26}
                    value={s.rows}
                    onChange={(e) =>
                      updateSection(i, { rows: Number(e.target.value) })
                    }
                    disabled={loading}
                  />
                </div>
                <div>
                  <label className="block text-xs text-foreground/60 mb-1">
                    Seats / row
                  </label>
                  <Input
                    type="number"
                    min={1}
                    max={100}
                    value={s.seatsPerRow}
                    onChange={(e) =>
                      updateSection(i, { seatsPerRow: Number(e.target.value) })
                    }
                    disabled={loading}
                  />
                </div>
                <div>
                  <label className="block text-xs text-foreground/60 mb-1">
                    Accessible front rows
                  </label>
                  <Input
                    type="number"
                    min={0}
                    max={s.rows}
                    value={s.accessibleFrontRows}
                    onChange={(e) =>
                      updateSection(i, {
                        accessibleFrontRows: Number(e.target.value),
                      })
                    }
                    disabled={loading}
                  />
                </div>
              </div>
              <p className="text-xs text-foreground/50">
                {s.rows * s.seatsPerRow} seats · rows A–
                {String.fromCharCode(64 + Math.min(26, Math.max(1, s.rows)))}
              </p>
            </div>
          ))}

          <Button
            type="button"
            variant="outline"
            onClick={addSection}
            className="w-full"
            disabled={loading}
          >
            + Add Section
          </Button>
        </div>

        <div className="flex gap-3 pt-2">
          <Button
            type="submit"
            disabled={loading || totalSeats === 0}
            className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {loading ? "Creating..." : `Create Venue (${totalSeats} seats)`}
          </Button>
          <Link href="/organizer/venues" className="flex-1">
            <Button type="button" variant="outline" className="w-full">
              Cancel
            </Button>
          </Link>
        </div>
      </form>
    </div>
  );
}

1st chroatuian verse 13