"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createEvent, EVENT_CATEGORIES, type CreateEventInput } from "@/lib/actions/events";
import { getVenues } from "@/lib/actions/venues";
import { uploadEventBanner } from "@/lib/actions/storage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";

interface VenueOption {
  id: string;
  name: string;
  city: string;
  total_capacity: number;
}

export default function CreateEventPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [bannerUrl, setBannerUrl] = useState("");

  const [venues, setVenues] = useState<VenueOption[]>([]);
  const [venueId, setVenueId] = useState(""); // "" = general admission

  const [formData, setFormData] = useState({
    title: "",
    description: "",
    venueLocation: "",
    city: "",
    category: "OTHER",
    startsAt: "",
    endsAt: "",
  });

  useEffect(() => {
    getVenues().then((res) => {
      if (res.success) setVenues(res.venues as VenueOption[]);
    });
  }, []);

  async function handleBannerUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingBanner(true);
    try {
      const result = await uploadEventBanner(file);
      if (result.success && result.url) {
        setBannerUrl(result.url);
        setError("");
      } else {
        setError(result.error || "Banner upload failed");
      }
    } finally {
      setUploadingBanner(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await createEvent({
        ...formData,
        startsAt: new Date(formData.startsAt),
        endsAt: new Date(formData.endsAt),
        bannerUrl: bannerUrl || undefined,
        venueId: venueId || undefined,
        isSeated: Boolean(venueId),
        category: formData.category as CreateEventInput["category"],
      });

      if (!result.success) {
        setError(result.error || "Failed to create event");
        return;
      }

      router.push(`/organizer/events/${result.eventId}/tiers`);
    } catch (err) {
      setError("An unexpected error occurred");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-primary mb-2">Create New Event</h1>
        <p className="text-foreground/70">Set up your event and ticket tiers</p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-6 bg-accent/5 border border-accent/20 rounded-lg p-6">
        {/* Error */}
        {error && (
          <div className="bg-destructive/10 border border-destructive text-destructive px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        {/* Banner Upload */}
        <div>
          <label className="block text-sm font-medium mb-2">Event Banner</label>
          <div className="border-2 border-dashed border-accent/30 rounded-lg p-6 text-center">
            {bannerUrl ? (
              <div className="space-y-2">
                <div className="w-full h-32 bg-foreground/5 rounded-lg overflow-hidden flex items-center justify-center">
                  <img src={bannerUrl} alt="Event banner" className="max-h-full max-w-full object-cover" />
                </div>
                <button
                  type="button"
                  onClick={() => setBannerUrl("")}
                  className="text-sm text-accent hover:underline"
                >
                  Remove
                </button>
              </div>
            ) : (
              <div>
                <input
                  type="file"
                  accept="image/jpeg,image/png"
                  onChange={handleBannerUpload}
                  disabled={uploadingBanner}
                  className="hidden"
                  id="banner-upload"
                />
                <label htmlFor="banner-upload" className="cursor-pointer">
                  <p className="text-foreground/70 mb-2">
                    {uploadingBanner ? "Uploading..." : "Click to upload banner"}
                  </p>
                  <p className="text-xs text-foreground/50">PNG or JPG, max 5MB</p>
                </label>
              </div>
            )}
          </div>
        </div>

        {/* Title */}
        <div>
          <label className="block text-sm font-medium mb-2">Event Title</label>
          <Input
            type="text"
            placeholder="e.g., Summer Music Festival 2026"
            value={formData.title}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setFormData({ ...formData, title: e.target.value })
            }
            required
            disabled={loading}
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium mb-2">Description</label>
          <textarea
            placeholder="Describe your event..."
            value={formData.description}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
              setFormData({ ...formData, description: e.target.value })
            }
            required
            disabled={loading}
            className="flex w-full rounded-lg border border-foreground/20 bg-background px-3 py-2 text-base placeholder:text-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary disabled:cursor-not-allowed disabled:opacity-50 md:text-sm min-h-24"
          />
        </div>

        {/* Venue Location */}
        <div>
          <label className="block text-sm font-medium mb-2">Venue Location</label>
          <Input
            type="text"
            placeholder="e.g., Eko Convention Centre, Lagos"
            value={formData.venueLocation}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setFormData({ ...formData, venueLocation: e.target.value })
            }
            required
            disabled={loading}
          />
        </div>

        {/* Category + City (discovery filters) */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Category</label>
            <select
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              disabled={loading}
              className="flex w-full rounded-lg border border-foreground/20 bg-background px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary disabled:opacity-50 md:text-sm"
            >
              {EVENT_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">City</label>
            <Input
              type="text"
              placeholder="e.g., Lagos"
              value={formData.city}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setFormData({ ...formData, city: e.target.value })
              }
              disabled={loading}
            />
          </div>
        </div>

        {/* Seating: general admission vs a venue with a seat map */}
        <div>
          <label className="block text-sm font-medium mb-2">Seating</label>
          <select
            value={venueId}
            onChange={(e) => setVenueId(e.target.value)}
            disabled={loading}
            className="flex w-full rounded-lg border border-foreground/20 bg-background px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary disabled:opacity-50 md:text-sm"
          >
            <option value="">General admission (no seat map)</option>
            {venues.map((v) => (
              <option key={v.id} value={v.id}>
                Reserved seating — {v.name} ({v.city}, {v.total_capacity} seats)
              </option>
            ))}
          </select>
          <p className="text-xs text-foreground/50 mt-1">
            Choose a venue to enable intelligent seat allocation.{" "}
            <Link href="/organizer/venues/new" className="text-accent hover:underline">
              Create a venue
            </Link>
            .
          </p>
        </div>

        {/* Dates */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Start Date & Time</label>
            <Input
              type="datetime-local"
              value={formData.startsAt}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setFormData({ ...formData, startsAt: e.target.value })
              }
              required
              disabled={loading}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">End Date & Time</label>
            <Input
              type="datetime-local"
              value={formData.endsAt}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setFormData({ ...formData, endsAt: e.target.value })
              }
              required
              disabled={loading}
            />
          </div>
        </div>

        {/* Buttons */}
        <div className="flex gap-3 pt-4">
          <Button
            type="submit"
            disabled={loading}
            className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {loading ? "Creating..." : "Create Event"}
          </Button>
          <Link href="/organizer" className="flex-1">
            <Button type="button" variant="outline" className="w-full">
              Cancel
            </Button>
          </Link>
        </div>
      </form>
    </div>
  );
}
