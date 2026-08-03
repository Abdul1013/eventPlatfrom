"use client";

import { useEffect, useRef } from "react";

const SCANNER_ELEMENT_ID = "html5qr-reader";

interface QrScannerProps {
  onScan: (rawQr: string) => void;
  onCameraError: (message: string) => void;
  isPaused: boolean;
}

/**
 * Camera-based QR scanner using html5-qrcode.
 * Dynamically imported to avoid SSR (navigator/window are browser-only).
 * Pausing/resuming is handled externally via the `isPaused` prop so the
 * parent can halt scanning while the result overlay is visible.
 */
export function QrScanner({ onScan, onCameraError, isPaused }: QrScannerProps) {
  const scannerRef = useRef<any>(null);
  const onScanRef = useRef(onScan);
  const onCameraErrorRef = useRef(onCameraError);

  // Keep refs current without restarting the scanner on every render
  useEffect(() => { onScanRef.current = onScan; }, [onScan]);
  useEffect(() => { onCameraErrorRef.current = onCameraError; }, [onCameraError]);

  // Pause / resume without restarting the camera stream
  useEffect(() => {
    const scanner = scannerRef.current;
    if (!scanner) return;
    try {
      if (isPaused) {
        scanner.pause(true);
      } else {
        scanner.resume();
      }
    } catch {
      // pause/resume can throw if the scanner is not yet started; safe to ignore
    }
  }, [isPaused]);

  // Mount once — start camera, clean up on unmount
  useEffect(() => {
    let isMounted = true;

    async function startScanner() {
      const { Html5Qrcode } = await import("html5-qrcode");

      const scanner = new Html5Qrcode(SCANNER_ELEMENT_ID, { verbose: false });
      scannerRef.current = scanner;

      try {
        await scanner.start(
          { facingMode: "environment" },
          {
            fps: 10,
            qrbox: { width: 260, height: 260 },
            aspectRatio: 1.0,
          },
          (decodedText: string) => {
            if (isMounted) onScanRef.current(decodedText);
          },
          () => {
            // Per-frame scan errors are expected and should not surface to the user
          }
        );
      } catch (err) {
        if (isMounted) {
          const message =
            err instanceof Error && err.message.includes("Permission")
              ? "Camera permission denied. Please allow camera access and reload."
              : "Could not start camera. Make sure the page is served over HTTPS.";
          onCameraErrorRef.current(message);
        }
      }
    }

    startScanner();

    return () => {
      isMounted = false;
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
        scannerRef.current = null;
      }
    };
  }, []); // intentionally empty — camera lifecycle tied to component mount

  return (
    <div className="w-full overflow-hidden rounded-xl">
      <div id={SCANNER_ELEMENT_ID} className="w-full" />
    </div>
  );
}
