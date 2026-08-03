// Local mirror of the mobile check-in contract (avoids a workspace dep on
// @eventmerge/types just for compile-time types). Keep in sync with
// packages/types/src/checkin.types.ts.

export type ScanResultCode =
  | "VALID"
  | "ALREADY_USED"
  | "INVALID_TOKEN"
  | "EVENT_NOT_ACTIVE"
  | "TICKET_CANCELLED"
  | "QUEUED";

export interface RecentScan {
  id: string;
  attendeeName: string;
  result: string;
  scannedAt: string;
}

export interface CheckInStats {
  totalTickets: number;
  checkedIn: number;
  remaining: number;
  checkInRate: number;
  errorCount: number;
  recentScans: RecentScan[];
  cacheHit: boolean;
}
