/**
 * Security Client: Bridge between Next.js and Python AES-256-GCM Security Engine
 *
 * This module provides type-safe functions to encrypt/validate QR codes
 * via the Python FastAPI security engine running at NEXT_PUBLIC_SECURITY_ENGINE_URL
 */

export interface EncryptPayload {
  ticket_id: string;
  user_id: string;
  timestamp_ms?: number;
}

export interface EncryptResponse {
  success: boolean;
  encrypted_qr: string | null;
  error: string | null;
  timestamp_ms: number | null;
}

export interface ValidatePayload {
  encrypted_qr: string;
  ttl_seconds?: number;
}

export interface ValidateResponse {
  valid: boolean;
  reason: string;
  ticket_id: string | null;
  user_hash: string | null;
  timestamp_ms: number | null;
}

export interface SecurityError {
  code: string;
  message: string;
}

// Server-side only — never imported by client components, so no NEXT_PUBLIC_ needed.
// Set SECURITY_ENGINE_URL in .env.local; the engine URL stays out of the browser bundle.
const SECURITY_ENGINE_URL = process.env.SECURITY_ENGINE_URL ?? process.env.NEXT_PUBLIC_SECURITY_ENGINE_URL ?? "http://localhost:8000";
const API_BASE = `${SECURITY_ENGINE_URL}/security/api/v1`;

/**
 * Fetch an encrypted QR payload from the security engine.
 *
 * This function is typically called from a Next.js Server Action
 * to securely encrypt ticket information without exposing the security engine URL to clients.
 *
 * @param ticketId - UUID of the ticket
 * @param userId - UUID of the ticket owner
 * @param timestamp_ms - Optional: milliseconds since epoch (auto-generated if omitted)
 * @returns Encrypted Base64url QR payload, or throws SecurityError
 *
 * @example
 * const encryptedQR = await fetchEncryptedToken('ticket-123', 'user-456');
 */
export async function fetchEncryptedToken(
  ticketId: string,
  userId: string,
  timestamp_ms?: number
): Promise<string> {
  const payload: EncryptPayload = {
    ticket_id: ticketId,
    user_id: userId,
    ...(timestamp_ms && { timestamp_ms }),
  };

  try {
    const response = await fetch(`${API_BASE}/encrypt`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data: EncryptResponse = await response.json();

    if (!data.success || !data.encrypted_qr) {
      throw new Error(data.error || "Encryption failed");
    }

    return data.encrypted_qr;
  } catch (error) {
    const err = error as Error;
    throw {
      code: "ENCRYPTION_FAILED",
      message: `Failed to encrypt ticket: ${err.message}`,
    } as SecurityError;
  }
}

/**
 * Validate an encrypted QR payload via the security engine.
 *
 * Verifies:
 * 1. AES-256-GCM authentication tag (detects tampering)
 * 2. 30-second time-to-live (TTL) timestamp
 * 3. Payload structure
 *
 * This function is typically called from a Gatekeeper scanning interface
 * and may use cached hash lists for offline validation in PWA mode.
 *
 * @param encryptedQr - Base64url encoded QR payload (nonce + ciphertext + tag)
 * @param ttl_seconds - Time-to-live in seconds (default 30)
 * @returns Validation result with ticket info if valid
 *
 * @example
 * const result = await validateEncryptedQR(scannedQRString);
 * if (result.valid) {
 *   console.log(`Valid ticket: ${result.ticket_id}`);
 * } else {
 *   console.log(`Invalid QR: ${result.reason}`);
 * }
 */
export async function validateEncryptedQR(
  encryptedQr: string,
  ttl_seconds: number = 30
): Promise<ValidateResponse> {
  const payload: ValidatePayload = {
    encrypted_qr: encryptedQr,
    ttl_seconds,
  };

  try {
    const response = await fetch(`${API_BASE}/validate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data: ValidateResponse = await response.json();
    return data;
  } catch (error) {
    const err = error as Error;
    throw {
      code: "VALIDATION_FAILED",
      message: `Failed to validate QR: ${err.message}`,
    } as SecurityError;
  }
}

/**
 * Check if the security engine is healthy.
 *
 * Useful for monitoring and debugging deployment issues.
 *
 * @returns True if engine is reachable and healthy
 */
export async function checkSecurityEngineHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${SECURITY_ENGINE_URL}/health`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });
    return response.ok;
  } catch {
    return false;
  }
}
