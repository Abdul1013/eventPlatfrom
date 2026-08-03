/**
 * SAO Client: bridge between Next.js and the Python Seat-Allocation (SAO) engine.
 *
 * Server-side only — never import from a client component. The engine URL and
 * shared secret (X-Api-Secret) stay out of the browser bundle.
 *
 * Payloads use snake_case throughout, which matches BOTH the engine's Pydantic
 * schemas AND our Supabase column names, so no key transformation is needed.
 *
 * Ported retry/backoff from EventFlow's saoClient: Render free-tier services
 * hibernate after ~15 min idle, so the first request to a cold service returns
 * 502/503 while it spins up. We retry those (and 429) with backoff.
 */

const SAO_ENGINE_URL = process.env.SAO_ENGINE_URL ?? "http://localhost:8200";
const SAO_API_SECRET = process.env.SAO_API_SECRET ?? "";

const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);
const RETRY_DELAYS_MS = [3_000, 8_000, 15_000];
const MAX_RETRY_AFTER_MS = 60_000;
const REQUEST_TIMEOUT_MS = 45_000;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function parseRetryAfterMs(value: string | null): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  const seconds = Number(trimmed);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1_000, MAX_RETRY_AFTER_MS);
  }
  const date = Date.parse(trimmed);
  if (!Number.isNaN(date)) {
    return Math.min(Math.max(0, date - Date.now()), MAX_RETRY_AFTER_MS);
  }
  return null;
}

async function saoPost<TOut>(path: string, body: unknown): Promise<TOut> {
  if (!SAO_API_SECRET) {
    throw new Error("SAO_API_SECRET is not configured");
  }
  const url = `${SAO_ENGINE_URL}/api/v1${path}`;
  const payload = JSON.stringify(body);

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Secret": SAO_API_SECRET,
      },
      body: payload,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (response.ok) {
      return (await response.json()) as TOut;
    }

    const canRetry =
      RETRYABLE_STATUSES.has(response.status) && attempt < RETRY_DELAYS_MS.length;
    if (!canRetry) {
      const text = await response.text().catch(() => "");
      throw new Error(`SAO Engine error ${response.status}: ${text}`);
    }

    const retryAfterMs = parseRetryAfterMs(response.headers.get("retry-after"));
    const delay = retryAfterMs ?? RETRY_DELAYS_MS[attempt]!;
    console.warn(
      `[sao-client] retryable ${response.status} on ${path}; attempt ${attempt + 1}, waiting ${delay}ms`
    );
    await sleep(delay);
  }

  throw new Error("SAO Engine: exhausted retries");
}

// ─── Types (snake_case — matches engine + Supabase) ──────────────────────────

export interface SaoSeat {
  id: string;
  row_label: string;
  seat_number: string;
  section?: string | null;
  x_coord: number;
  y_coord: number;
  is_accessible: boolean;
}

export interface SaoAttendee {
  user_id: string;
  ticket_id: string;
  group_id?: string | null;
  group_size?: number;
  needs_accessible?: boolean;
}

export type SaoAlgorithm = "kmeans_greedy" | "manual_baseline";

export interface SaoAllocationRequest {
  event_id: string;
  seats: SaoSeat[];
  attendees: SaoAttendee[];
  algorithm?: SaoAlgorithm;
}

export interface SaoSeatAssignment {
  ticket_id: string;
  user_id: string;
  seat_id: string;
  row_label: string;
  seat_number: string;
  section?: string | null;
}

export interface SaoAllocationResult {
  event_id: string;
  algorithm_used: string;
  assignments: SaoSeatAssignment[];
  utilization_rate: number;
  adjacency_score: number;
  seats_assigned: number;
  seats_total: number;
  seats_accessible_used: number;
  unassigned_ticket_ids: string[];
  duration_ms: number;
}

export interface SaoComparisonResult {
  event_id: string;
  sao_utilization_rate: number;
  baseline_utilization_rate: number;
  sao_adjacency_score: number;
  baseline_adjacency_score: number;
  improvement_percentage: number;
  hypothesis_h1_passed: boolean;
}

// ─── Client ──────────────────────────────────────────────────────────────────

export const saoClient = {
  run(req: SaoAllocationRequest): Promise<SaoAllocationResult> {
    return saoPost<SaoAllocationResult>("/run", req);
  },
  compare(req: SaoAllocationRequest): Promise<SaoComparisonResult> {
    return saoPost<SaoComparisonResult>("/compare", req);
  },
};

export async function checkSaoEngineHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${SAO_ENGINE_URL}/health`, { method: "GET" });
    return res.ok;
  } catch {
    return false;
  }
}
