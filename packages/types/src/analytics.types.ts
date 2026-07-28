export interface SalesDataPoint {
  date: string; // YYYY-MM-DD
  count: number;
}

export interface CheckInDataPoint {
  hour: string; // ISO timestamp truncated to hour
  count: number;
}

export interface TicketTypeBreakdown {
  name: string;
  sold: number;
  total: number;
  revenue: number;
}

export interface CapacityStats {
  totalSeats: number;
  allocatedSeats: number;
  soldSeats: number;
  checkedInSeats: number;
}

export interface AllocationHistoryEntry {
  id: string;
  algorithmUsed: string;
  utilizationRate: number;
  runAt: string;
}

export interface EventAnalytics {
  salesOverTime: SalesDataPoint[];
  checkInOverTime: CheckInDataPoint[];
  ticketTypeBreakdown: TicketTypeBreakdown[];
  revenueTotal: number;
  capacityStats: CapacityStats;
  allocationHistory: AllocationHistoryEntry[];
}
