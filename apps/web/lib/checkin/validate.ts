import "server-only";
import { prisma } from "@/lib/db";
import { validateEncryptedQR } from "@/lib/api/security-client";

export type ScanOutcome = "valid" | "duplicate" | "invalid";

export interface ScanValidationResult {
  outcome: ScanOutcome;
  detail: string;
  ticketId?: string;
}

/**
 * Core gate check-in used by BOTH the web gatekeeper server action and the
 * mobile scanner API route. Callers authenticate the gatekeeper first (cookie
 * session on web, Bearer token on mobile) and pass the gatekeeper's user id.
 *
 * Pipeline: decrypt+TTL-verify the QR via the security engine → anti-replay
 * against CheckInLog → first valid scan logs VALID + marks ticket USED;
 * subsequent scans log DUPLICATE; bad crypto logs nothing.
 */
export async function recordGatekeeperScan(
  rawQr: string,
  gatekeeperId: string,
  deviceInfo?: string
): Promise<ScanValidationResult> {
  const pyResult = await validateEncryptedQR(rawQr);
  if (!pyResult.valid || !pyResult.ticket_id) {
    return { outcome: "invalid", detail: pyResult.reason || "QR code is invalid or expired" };
  }

  const ticketId = pyResult.ticket_id;

  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { id: true },
  });
  if (!ticket) {
    return { outcome: "invalid", detail: "Ticket not found" };
  }

  const existing = await prisma.checkInLog.findFirst({
    where: { ticketId, result: "VALID" },
    orderBy: { scannedAt: "asc" },
    select: { scannedAt: true },
  });

  if (existing) {
    await prisma.checkInLog.create({
      data: { ticketId, gatekeeperId, result: "DUPLICATE", deviceInfo: deviceInfo ?? null },
    });
    const t = existing.scannedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return { outcome: "duplicate", detail: `Already admitted at ${t}. Do not allow entry.`, ticketId };
  }

  await prisma.$transaction([
    prisma.checkInLog.create({
      data: { ticketId, gatekeeperId, result: "VALID", deviceInfo: deviceInfo ?? null },
    }),
    prisma.ticket.update({
      where: { id: ticketId },
      data: { status: "USED", checkInAt: new Date() },
    }),
  ]);

  return { outcome: "valid", detail: "Ticket verified. Allow entry.", ticketId };
}
