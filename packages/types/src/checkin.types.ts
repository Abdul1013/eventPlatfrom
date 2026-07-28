// ─── Check-in / scan types shared between API, mobile, and web-admin ──────────

export type ScanResultCode =
  | 'VALID'
  | 'ALREADY_USED'
  | 'INVALID_TOKEN'
  | 'EVENT_NOT_ACTIVE'
  | 'TICKET_CANCELLED'
  | 'QUEUED';

/** Full scan response returned by POST /checkin/scan */
export interface ScanResult {
  result: ScanResultCode;
  message: string;
  attendeeName?: string;
  seatInfo?: string;
  ticketType?: string;
  eventTitle?: string;
}

export interface RecentScan {
  id: string;
  attendeeName: string;
  result: string;
  scannedAt: string;
}

/** Response shape for GET /checkin/stats/:eventId */
export interface CheckInStats {
  totalTickets: number;
  checkedIn: number;
  remaining: number;
  checkInRate: number;
  errorCount: number;
  recentScans: RecentScan[];
  /** True when the response was served from the Redis cache (academic report metric) */
  cacheHit: boolean;
}

/** A pending offline scan stored in SQLite */
export interface QueuedScan {
  id: string;
  token: string;
  eventId: string;
  scannedAt: string;
  synced: boolean;
}
