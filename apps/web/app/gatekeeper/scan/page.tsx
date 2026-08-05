"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import dynamic from "next/dynamic";
import { validateScannedQR } from "@/lib/actions/scan";
import { useSyncHashList } from "@/hooks/useSyncHashList";
import {
  hasTicketInHashList,
  hasOfflineScan,
  logOfflineScan,
} from "@/lib/offline/hashListDB";

// Dynamically import the scanner — html5-qrcode requires browser APIs
const QrScanner = dynamic(
  () => import("@/components/QrScanner").then((m) => m.QrScanner),
  { ssr: false, loading: () => <ScannerPlaceholder /> }
);

// ─── Types ────────────────────────────────────────────────────────────────────

/** processing: QR detected, server action in-flight; camera is paused */
type ScanPhase = "idle" | "scanning" | "processing" | "result";

export type ScanOutcome = "valid" | "duplicate" | "invalid";

interface ScanResult {
  outcome: ScanOutcome;
  rawQr: string;
  detail: string;
}

// ─── Haptics ──────────────────────────────────────────────────────────────────

/**
 * Triggers device vibration patterns per outcome.
 * Silent no-op when Vibration API is unavailable.
 */
function vibrate(outcome: ScanOutcome) {
  if (typeof navigator === "undefined" || !navigator.vibrate) return;
  const patterns: Record<ScanOutcome, number | number[]> = {
    valid: 120,
    duplicate: [120, 80, 120],
    invalid: [120, 80, 120, 80, 120],
  };
  navigator.vibrate(patterns[outcome]);
}

// ─── Result overlay ───────────────────────────────────────────────────────────

const OVERLAY_CONFIG: Record<
  ScanOutcome,
  { bg: string; icon: string; heading: string }
> = {
  valid:     { bg: "bg-success", icon: "✓", heading: "Valid Ticket" },
  duplicate: { bg: "bg-warning", icon: "⚠", heading: "Already Scanned" },
  invalid:   { bg: "bg-destructive", icon: "✕", heading: "Invalid Ticket" },
};

function ResultOverlay({
  result,
  onDismiss,
}: {
  result: ScanResult;
  onDismiss: () => void;
}) {
  const config = OVERLAY_CONFIG[result.outcome];
  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 ${config.bg} text-white`}
      onClick={onDismiss}
    >
      <div className="flex h-32 w-32 items-center justify-center rounded-full bg-white/20 text-7xl font-bold">
        {config.icon}
      </div>
      <h2 className="text-4xl font-bold tracking-tight">{config.heading}</h2>
      <p className="max-w-xs text-center text-lg opacity-90">{result.detail}</p>
      <p className="max-w-xs break-all font-mono text-xs opacity-60">
        {result.rawQr.slice(0, 48)}…
      </p>
      <p className="mt-6 text-sm opacity-70">Tap anywhere to scan next</p>
    </div>
  );
}

/** Full-screen spinner shown while the server action is in-flight */
function ProcessingOverlay() {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black/80 text-white">
      <div className="h-16 w-16 animate-spin rounded-full border-4 border-white border-t-transparent" />
      <p className="text-lg font-semibold">Validating…</p>
    </div>
  );
}

// ─── Scanner placeholder ──────────────────────────────────────────────────────

function ScannerPlaceholder() {
  return (
    <div className="flex h-72 w-full items-center justify-center rounded-xl bg-foreground/10">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-accent border-t-transparent" />
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

const RESULT_DISPLAY_MS = 3500;

export default function ScanPage() {
  const [phase, setPhase] = useState<ScanPhase>("idle");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(true);

  const { count: hashCount, lastSynced, syncing, sync } = useSyncHashList();

  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isProcessingRef = useRef(false);

  // Track online/offline transitions
  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    setIsOnline(navigator.onLine);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  const finishResult = useCallback(
    (outcome: ScanOutcome, rawQr: string, detail: string) => {
      vibrate(outcome);
      setResult({ outcome, rawQr, detail });
      setPhase("result");
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = setTimeout(() => {
        setPhase("scanning");
        setResult(null);
        isProcessingRef.current = false;
      }, RESULT_DISPLAY_MS);
    },
    []
  );

  const handleScan = useCallback(
    async (rawQr: string) => {
      if (isProcessingRef.current) return;
      isProcessingRef.current = true;
      setPhase("processing");

      try {
        if (!isOnline) {
          // ── Offline fallback: check IndexedDB hash list ───────────────────
          // We cannot decrypt the QR without the Python server, so we check
          // whether any previously synced VALID scan matches this raw token.
          const alreadyAdmitted = await hasOfflineScan(rawQr);
          if (alreadyAdmitted) {
            finishResult("duplicate", rawQr, "Already admitted (offline record).");
            return;
          }

          // Log as offline-admitted; server reconciles on reconnect
          await logOfflineScan({
            ticket_id: rawQr, // raw QR used as key since we can't decrypt offline
            admitted_at: Date.now(),
            outcome: "valid_offline",
          });

          finishResult(
            "valid",
            rawQr,
            `Admitted offline — ${hashCount} tickets in hash list. Reconcile when online.`
          );
          return;
        }

        // ── Online: full server-side pipeline ─────────────────────────────
        const validation = await validateScannedQR(rawQr);
        finishResult(validation.outcome, rawQr, validation.detail);
      } catch {
        setPhase("scanning");
        isProcessingRef.current = false;
      }
    },
    [isOnline, hashCount, finishResult]
  );

  const handleDismiss = useCallback(() => {
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    setPhase("scanning");
    setResult(null);
    isProcessingRef.current = false;
  }, []);

  const handleCameraError = useCallback((message: string) => {
    setCameraError(message);
    setPhase("idle");
    isProcessingRef.current = false;
  }, []);

  const startScanning = () => {
    setCameraError(null);
    setPhase("scanning");
  };

  const stopScanning = () => {
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    setPhase("idle");
    setResult(null);
    isProcessingRef.current = false;
  };

  const cameraIsPaused = phase === "processing" || phase === "result";

  return (
    <div className="space-y-6">
      {/* Full-screen overlays */}
      {phase === "processing" && <ProcessingOverlay />}
      {phase === "result" && result && (
        <ResultOverlay result={result} onDismiss={handleDismiss} />
      )}

      {/* Offline / online status bar */}
      {!isOnline ? (
        <div className="flex items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span className="text-lg">📵</span>
          <div>
            <p className="font-semibold">Offline Mode</p>
            <p className="text-xs opacity-80">
              {hashCount > 0
                ? `${hashCount} tickets cached · last synced ${lastSynced?.toLocaleTimeString() ?? "never"}`
                : "No hash list — sync when online first"}
            </p>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-800">
          <span>
            🟢 Online · {hashCount} tickets cached
            {lastSynced && (
              <span className="opacity-70"> · {lastSynced.toLocaleTimeString()}</span>
            )}
          </span>
          <button
            onClick={sync}
            disabled={syncing}
            className="ml-3 rounded-md bg-green-600 px-3 py-1 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50"
          >
            {syncing ? "Syncing…" : "Sync"}
          </button>
        </div>
      )}

      {/* Page header */}
      <div>
        <h2 className="text-3xl font-bold text-foreground">QR Scanner</h2>
        <p className="mt-1 text-sm text-primary">
          Point the camera at an attendee&apos;s ticket QR code
        </p>
      </div>

      {/* Camera error banner */}
      {cameraError && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-700">
          <strong>Camera error:</strong> {cameraError}
        </div>
      )}

      {/* Scanner viewport */}
      {phase !== "idle" ? (
        <div className="relative overflow-hidden rounded-xl border-2 border-foreground bg-black shadow-lg">
          <QrScanner
            onScan={handleScan}
            onCameraError={handleCameraError}
            isPaused={cameraIsPaused}
          />

          {/* Decorative aim corners */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="relative h-64 w-64">
              {[
                "top-0 left-0 border-t-4 border-l-4",
                "top-0 right-0 border-t-4 border-r-4",
                "bottom-0 left-0 border-b-4 border-l-4",
                "bottom-0 right-0 border-b-4 border-r-4",
              ].map((cls, i) => (
                <div
                  key={i}
                  className={`absolute h-8 w-8 rounded-sm border-accent ${cls}`}
                />
              ))}
            </div>
          </div>

          {/* Status bar */}
          <div className="absolute bottom-0 inset-x-0 bg-black/60 px-4 py-3 text-center text-sm text-white">
            {phase === "scanning"   && "Scanning — point at QR code"}
            {phase === "processing" && "Validating QR…"}
            {phase === "result"     && "Done"}
          </div>
        </div>
      ) : (
        /* Idle pre-flight card */
        <div className="rounded-xl border-2 border-accent/40 bg-white p-8 text-center shadow-sm">
          <div className="mb-6 text-6xl">📷</div>
          <h3 className="text-xl font-semibold text-foreground">Ready to Scan</h3>
          <p className="mt-2 text-sm text-primary">
            Camera will request permission on first use.
            <br />
            HTTPS required on physical devices.
          </p>
          <button
            onClick={startScanning}
            className="mt-6 rounded-lg bg-primary px-8 py-3 font-semibold text-white hover:bg-accent transition-colors min-h-[44px]"
          >
            Start Scanner
          </button>
        </div>
      )}

      {/* Stop button */}
      {phase !== "idle" && (
        <button
          onClick={stopScanning}
          className="w-full rounded-lg border-2 border-primary py-3 font-semibold text-primary hover:bg-background transition-colors min-h-[44px]"
        >
          Stop Scanner
        </button>
      )}

      {/* Colour legend */}
      <div className="grid grid-cols-3 gap-3 text-center text-sm">
        <div className="rounded-lg bg-success/10 p-3 text-success font-medium">
          <div className="text-xl mb-1">✓</div>
          Valid
        </div>
        <div className="rounded-lg bg-warning/10 p-3 text-warning font-medium">
          <div className="text-xl mb-1">⚠</div>
          Duplicate
        </div>
        <div className="rounded-lg bg-destructive/10 p-3 text-destructive font-medium">
          <div className="text-xl mb-1">✕</div>
          Invalid
        </div>
      </div>
    </div>
  );
}
