// ─── Shared API envelope types ────────────────────────────────────────────────

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/**
 * Standard success envelope — mirrors the backend sendSuccess() shape.
 * Use ApiSuccess / ApiError from index.ts for union discrimination.
 */
export interface ApiEnvelope<T> {
  success: true;
  data: T;
  meta?: PaginationMeta;
}

/** Paginated collection — data is always an array and meta is required. */
export interface PaginatedResponse<T> extends ApiEnvelope<T[]> {
  meta: PaginationMeta;
}
