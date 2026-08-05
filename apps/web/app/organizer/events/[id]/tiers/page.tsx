"use client";

import { useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { createTicketTier, getEventWithTiers } from "@/lib/actions/events";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { useEffect } from "react";

export default function CreateTicketTiersPage() {
  const params = useParams();
  const eventId = params.id as string;
  const router = useRouter();

  const [event, setEvent] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tiers, setTiers] = useState<Array<{ tierName: string; price: string; capacity: string }>>([
    { tierName: "", price: "", capacity: "" },
  ]);

  useEffect(() => {
    async function loadEvent() {
      const result = await getEventWithTiers(eventId);
      if (result.success) {
        setEvent(result.event);
      }
    }
    loadEvent();
  }, [eventId]);

  const handleTierChange = (
    index: number,
    field: string,
    value: string
  ) => {
    const newTiers = [...tiers];
    newTiers[index] = { ...newTiers[index], [field]: value };
    setTiers(newTiers);
  };

  const addTier = () => {
    setTiers([...tiers, { tierName: "", price: "", capacity: "" }]);
  };

  const removeTier = (index: number) => {
    if (tiers.length > 1) {
      setTiers(tiers.filter((_, i) => i !== index));
    }
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      // Validate all tiers
      const validTiers = tiers.filter((t) => t.tierName && t.price && t.capacity);
      if (validTiers.length === 0) {
        setError("Please add at least one ticket tier");
        setLoading(false);
        return;
      }

      // Create all tiers
      const results = await Promise.all(
        validTiers.map((tier) =>
          createTicketTier({
            eventId,
            tierName: tier.tierName,
            price: parseFloat(tier.price),
            capacity: parseInt(tier.capacity),
          })
        )
      );

      if (!results.every((r) => r.success)) {
        setError("Failed to create some ticket tiers");
        setLoading(false);
        return;
      }

      router.push("/organizer");
    } catch (err) {
      setError("An unexpected error occurred");
      console.error("[createTicketTiers] error:", (err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  if (!event) {
    return <div className="text-center py-12">Loading...</div>;
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-primary mb-2">Create Ticket Tiers</h1>
        <p className="text-foreground/70">for {event.title}</p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-6 bg-accent/5 border border-accent/20 rounded-lg p-6">
        {error && (
          <div className="bg-destructive/10 border border-destructive text-destructive px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        {/* Tiers */}
        <div className="space-y-4">
          {tiers.map((tier, index) => (
            <div key={index} className="p-4 border border-accent/20 rounded-lg space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-medium">Tier {index + 1}</h3>
                {tiers.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeTier(index)}
                    className="text-sm text-destructive hover:underline"
                  >
                    Remove
                  </button>
                )}
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1">Tier Name</label>
                  <Input
                    type="text"
                    placeholder="e.g., VIP"
                    value={tier.tierName}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      handleTierChange(index, "tierName", e.target.value)
                    }
                    disabled={loading}
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium mb-1">Price (₦)</label>
                  <Input
                    type="number"
                    placeholder="0.00"
                    step="0.01"
                    min="0"
                    value={tier.price}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      handleTierChange(index, "price", e.target.value)
                    }
                    disabled={loading}
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium mb-1">Capacity</label>
                  <Input
                    type="number"
                    placeholder="100"
                    min="1"
                    step="1"
                    value={tier.capacity}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      handleTierChange(index, "capacity", e.target.value)
                    }
                    disabled={loading}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Add Tier Button */}
        <Button
          type="button"
          onClick={addTier}
          variant="outline"
          className="w-full"
          disabled={loading}
        >
          + Add Another Tier
        </Button>

        {/* Submit Buttons */}
        <div className="flex gap-3 pt-4">
          <Button
            type="submit"
            disabled={loading}
            className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {loading ? "Creating..." : "Publish Event"}
          </Button>
          <Link href="/organizer" className="flex-1">
            <Button type="button" variant="outline" className="w-full">
              Cancel
            </Button>
          </Link>
        </div>
      </form>

      {/* Info Box */}
      <div className="bg-accent/5 border border-accent/20 rounded-lg p-4 text-sm text-foreground/70">
        <p className="font-medium mb-2">Ticket Tier Tips:</p>
        <ul className="list-disc list-inside space-y-1 text-xs">
          <li>Create different tiers for VIP, Regular, Student, etc.</li>
          <li>Capacity is locked after event creation (use SELECT...FOR UPDATE)</li>
          <li>Prices must be non-negative decimal values</li>
          <li>You can add more tiers after event creation</li>
        </ul>
      </div>
    </div>
  );
}
