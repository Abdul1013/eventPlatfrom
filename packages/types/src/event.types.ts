// ─── Dashboard / admin event shapes ───────────────────────────────────────────
// EventStatus is re-declared as a string union here to avoid a circular import:
// index.ts defines EventStatus AND re-exports from this file.

type EventStatusUnion =
  | 'DRAFT'
  | 'PUBLISHED'
  | 'ONGOING'
  | 'ENDED'
  | 'CANCELLED';

/**
 * Lightweight event row used in listings and the admin dashboard table.
 * Full event detail lives in EventDto (index.ts).
 */
export interface EventRow {
  id: string;
  title: string;
  startsAt: string;
  status: EventStatusUnion;
  venue: { name: string; city?: string } | null;
  ticketsSold?: number;
  ticketsTotal?: number;
}

/** Stats payload returned by GET /admin/stats */
export interface AdminStats {
  totalEvents: number;
  ticketsSold: number;
  todaysCheckIns: number;
  totalUsers: number;
}

/** Venue summary returned by GET /venues */
export interface VenueSummary {
  id: string;
  name: string;
  address: string;
  city: string;
  totalCapacity: number;
  createdAt: string;
}

/** Ticket type aggregate included in event list items */
export interface TicketTypeAggregate {
  quantityTotal: number;
  quantitySold: number;
}

/** Event item in the admin event list (includes ticket counts) */
export interface AdminEventListItem {
  id: string;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
  status: EventStatusUnion;
  bannerUrl: string | null;
  venue: { id: string; name: string; city: string } | null;
  ticketTypes: TicketTypeAggregate[];
}

/** Full event detail returned by GET /events/:id */
export interface EventDetail {
  id: string;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
  status: EventStatusUnion;
  bannerUrl: string | null;
  organizerId: string;
  venueId: string;
  createdAt: string;
  updatedAt: string;
  venue: {
    id: string;
    name: string;
    address: string;
    city: string;
    totalCapacity: number;
    layoutJson: unknown;
  };
  ticketTypes: {
    id: string;
    name: string;
    price: string;
    quantityTotal: number;
    quantitySold: number;
    description: string | null;
  }[];
  organizer: { id: string; name: string };
}
