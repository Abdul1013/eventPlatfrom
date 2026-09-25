"use client";

import { useState, useEffect, useRef, useCallback } from "react";

const QR_TTL_MS = 30_000;

interface DynamicQRState {
  encryptedQr: string | null;
  loading: boolean;
  error: string | null;
  /** Seconds remaining until the current QR expires (0–30) */
  timeRemaining: number;
  /** True for ~400ms after a refresh — drives the visual flash animation */
  isRefreshing: boolean;
}

/**
 * Manages a 30-second rotating AES-256-GCM encrypted QR payload.
 *
 * Fetches a fresh payload from `/api/qr/encrypt` on mount and
 * every 30 seconds thereafter. Exposes a countdown timer so the
 * UI can render a progress ring.
 *
 * @param ticketId - UUID of the ticket to generate a QR for
 * @param enabled  - Only fetch when true (pass `ticket.status === "ACTIVE"`)
 * @returns Current encrypted QR string, loading/error state, countdown, and refresh flag
 */
export function useDynamicQR(ticketId: string, enabled = true): DynamicQRState {
  const [state, setState] = useState<DynamicQRState>({
    encryptedQr: null,
    loading: enabled,
    error: null,
    timeRemaining: 30,
    isRefreshing: false,
  });

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const refreshTimeRef = useRef<number>(Date.now());
  const isMountedRef = useRef(true);

  const fetchQR = useCallback(async (isInitial = false) => {
    if (!isMountedRef.current) return;

    if (!isInitial) {
      setState((prev) => ({ ...prev, isRefreshing: true }));
    }

    try {
      const response = await fetch("/api/qr/encrypt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketId }),
      });

      if (!response.ok) {
        if (response.status === 429) {
          const retryAfter = response.headers.get("Retry-After");
          throw new Error(`Rate limit reached. Try again in ${retryAfter ?? 60}s.`);
        }
        const { error } = await response.json();
        throw new Error(error || `HTTP ${response.status}`);
      }

      const { encryptedQr } = await response.json();

      if (!isMountedRef.current) return;

      refreshTimeRef.current = Date.now();

      setState({
        encryptedQr,
        loading: false,
        error: null,
        timeRemaining: 30,
        isRefreshing: true,
      });

      // Clear the flash after 400ms
      setTimeout(() => {
        if (isMountedRef.current) {
          setState((prev) => ({ ...prev, isRefreshing: false }));
        }
      }, 400);
    } catch (err) {
      if (!isMountedRef.current) return;
      const message = (err as Error).message || "Failed to load QR code";
      setState((prev) => ({
        ...prev,
        loading: false,
        error: message,
        isRefreshing: false,
      }));
    }
  }, [ticketId]);

  useEffect(() => {
    isMountedRef.current = true;

    if (!enabled) {
      setState({ encryptedQr: null, loading: false, error: null, timeRemaining: 30, isRefreshing: false });
      return;
    }

    // Initial fetch
    fetchQR(true);

    // Refresh every 30 seconds
    intervalRef.current = setInterval(() => fetchQR(false), QR_TTL_MS);

    // Countdown timer — ticks every second
    countdownRef.current = setInterval(() => {
      if (!isMountedRef.current) return;
      const elapsed = (Date.now() - refreshTimeRef.current) / 1000;
      const remaining = Math.max(0, Math.ceil(30 - elapsed));
      setState((prev) => ({ ...prev, timeRemaining: remaining }));
    }, 1000);

    return () => {
      isMountedRef.current = false;
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [fetchQR, enabled]);

  return state;
}
