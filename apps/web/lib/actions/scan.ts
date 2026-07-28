"use server";

import { z } from "zod";
import { getSession } from "@/lib/actions/auth";
import { recordGatekeeperScan, type ScanOutcome } from "@/lib/checkin/validate";

const ScanInputSchema = z.object({
  rawQr: z.string().min(1, "QR payload cannot be empty"),
});

export type ValidationOutcome = ScanOutcome;

export interface ScanValidationResult {
  outcome: ValidationOutcome;
  detail: string;
  ticketId?: string;
}

/**
 * Validate a QR code scanned by a Gatekeeper (web). Authenticates via the
 * cookie session, asserts GATEKEEPER/ADMIN, then delegates to the shared
 * check-in core (also used by the mobile scanner route).
 */
export async function validateScannedQR(rawQr: string): Promise<ScanValidationResult> {
  try {
    const session = await getSession();
    if (!session) return { outcome: "invalid", detail: "Not authenticated" };
    if (!["GATEKEEPER", "ADMIN"].includes(session.user.role)) {
      return { outcome: "invalid", detail: "Access denied. Gatekeeper role required." };
    }

    const { rawQr: qr } = ScanInputSchema.parse({ rawQr });
    return await recordGatekeeperScan(qr, session.user.id, "EventMerge Web Gatekeeper");
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { outcome: "invalid", detail: "Malformed QR code" };
    }
    console.error("[validateScannedQR]", (error as Error).message);
    return { outcome: "invalid", detail: "Validation service unavailable" };
  }
}
