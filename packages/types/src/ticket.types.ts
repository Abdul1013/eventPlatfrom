// ─── Ticket shapes used by web and mobile apps ────────────────────────────────

export type TicketStatus = 'ACTIVE' | 'USED' | 'CANCELLED' | 'TRANSFERRED';

export interface TicketSeat {
  rowLabel: string;
  seatNumber: string;
  section?: string;
}

export interface TicketEvent {
  id: string;
  title: string;
  startsAt: string;
  bannerUrl?: string | null;
  venue: { name: string; address: string };
}

/** Lightweight ticket shape used in list responses (no qrToken). */
export interface Ticket {
  id: string;
  status: TicketStatus;
  issuedAt: string;
  checkInAt?: string | null;
  event: TicketEvent;
  seat?: TicketSeat | null;
  ticketType: { name: string; price: string };
}

/** Full ticket detail — only returned by GET /tickets/:id. */
export interface TicketDetail extends Ticket {
  qrToken: string;
  qrDataUrl: string;
}

/** Request body for POST /tickets. */
export interface PurchaseTicketDto {
  eventId: string;
  ticketTypeId: string;
  preferences?: {
    groupSize?: number;
    needsAccessible?: boolean;
  };
}

/** Request body for POST /tickets/:id/transfer. */
export interface TransferTicketDto {
  toEmail: string;
}

/** Response shape for POST /tickets/:id/transfer. */
export interface TicketTransferResult {
  ticket: Ticket;
  previousOwnerId: string;
  newOwner: { id: string; email: string; name: string };
}
