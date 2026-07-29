// ─── Shared formatting utilities ──────────────────────────────────────────────
// Used across web-admin, web-attendee, and mobile. Import via @eventmerge/ui.

const LAGOS_TZ = 'Africa/Lagos';

// ─── Currency ─────────────────────────────────────────────────────────────────

/**
 * Formats a numeric amount as Nigerian Naira.
 * Returns "Free" for zero amounts.
 * Uses the correct ISO 4217 code: NGN (not NGR).
 */
export function formatNaira(amount: number): string {
  if (amount === 0) return 'Free';
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Parses a Prisma Decimal string and formats as Naira.
 * Convenience wrapper for API responses where price is a string like "5000.00".
 */
export function formatNairaFromString(price: string): string {
  return formatNaira(parseFloat(price));
}

// ─── Dates ────────────────────────────────────────────────────────────────────

/**
 * Formats an event date range.
 * Output: "Saturday, 8 March 2026 · 2:00 PM – 6:00 PM"
 * Always uses Africa/Lagos timezone.
 */
export function formatEventDate(startsAt: string, endsAt: string): string {
  const tz = LAGOS_TZ;
  const start = new Date(startsAt);
  const end = new Date(endsAt);

  const datePart = new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: tz,
  }).format(start);

  const timePart = (d: Date) =>
    new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: tz,
    }).format(d);

  return `${datePart} · ${timePart(start)} – ${timePart(end)}`;
}

/**
 * Short date format: "08 Mar 2026"
 */
export function formatDateShort(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: LAGOS_TZ,
  }).format(new Date(iso));
}

// ─── Relative time ────────────────────────────────────────────────────────────

/**
 * Formats an ISO timestamp as a human-readable relative time.
 * No external libraries — pure arithmetic.
 * Examples: "just now", "2 min ago", "1 hour ago", "3 days ago"
 */
export function formatRelativeTime(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const diffSec = Math.floor(diffMs / 1_000);

  if (diffSec < 60) return 'just now';
  if (diffSec < 3_600) {
    const m = Math.floor(diffSec / 60);
    return `${m} min ago`;
  }
  if (diffSec < 86_400) {
    const h = Math.floor(diffSec / 3_600);
    return `${h} hour${h !== 1 ? 's' : ''} ago`;
  }
  const d = Math.floor(diffSec / 86_400);
  return `${d} day${d !== 1 ? 's' : ''} ago`;
}

// ─── Seat ─────────────────────────────────────────────────────────────────────

/**
 * Formats seat information into a human-readable string.
 * Examples: "Row A, Seat 12 — VIP" or "Seat TBA"
 */
export function formatSeatInfo(
  seat?: { rowLabel: string; seatNumber: string; section?: string | null } | null,
): string {
  if (!seat) return 'Seat TBA';
  const base = `Row ${seat.rowLabel}, Seat ${seat.seatNumber}`;
  return seat.section ? `${base} — ${seat.section}` : base;
}
