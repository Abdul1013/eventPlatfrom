// ─── Shared API types (used by web apps and mobile to type API responses) ─────

export type Role = 'ADMIN' | 'ORGANIZER' | 'GATEKEEPER' | 'ATTENDEE';
export type EventStatus = 'DRAFT' | 'PUBLISHED' | 'ONGOING' | 'ENDED' | 'CANCELLED';
import type { TicketStatus } from './ticket.types.js';
export type { TicketStatus };

export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta?: { page: number; total: number; limit: number };
}

export interface ApiError {
  success: false;
  error: { code: string; message: string; details?: Record<string, string[]> };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export interface UserDto {
  id: string;
  name: string;
  email: string;
  role: Role;
  phone?: string;
  createdAt: string;
}

export interface EventDto {
  id: string;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
  status: EventStatus;
  bannerUrl?: string;
  venue: { id: string; name: string; city: string };
}

export interface TicketTypeDto {
  id: string;
  name: string;
  price: string;
  quantityTotal: number;
  quantitySold: number;
  description?: string;
}

export interface TicketDto {
  id: string;
  qrToken: string;
  status: TicketStatus;
  issuedAt: string;
  event: Pick<EventDto, 'id' | 'title' | 'startsAt' | 'venue'>;
  ticketType: Pick<TicketTypeDto, 'name' | 'price'>;
  seat?: { rowLabel: string; seatNumber: string; section?: string };
}

// ─── Check-in types ───────────────────────────────────────────────────────────
export type {
  ScanResultCode,
  ScanResult,
  RecentScan,
  CheckInStats,
  QueuedScan,
} from './checkin.types.js';

// ─── Auth types ───────────────────────────────────────────────────────────────
export type { AuthTokens, JwtPayload, AuthUser, LoginResponseData } from './auth.types.js';

// ─── API envelope types ───────────────────────────────────────────────────────
export type { PaginationMeta, ApiEnvelope, PaginatedResponse } from './api.types.js';

// ─── Event / admin types ──────────────────────────────────────────────────────
export type {
  EventRow,
  AdminStats,
  VenueSummary,
  TicketTypeAggregate,
  AdminEventListItem,
  EventDetail,
} from './event.types.js';

// ─── Ticket types ─────────────────────────────────────────────────────────────
export type {
  TicketSeat,
  TicketEvent,
  Ticket,
  TicketDetail,
  PurchaseTicketDto,
  TransferTicketDto,
  TicketTransferResult,
} from './ticket.types.js';

// ─── Analytics types ──────────────────────────────────────────────────────────
export type {
  SalesDataPoint,
  CheckInDataPoint,
  TicketTypeBreakdown,
  CapacityStats,
  AllocationHistoryEntry,
  EventAnalytics,
} from './analytics.types.js';
