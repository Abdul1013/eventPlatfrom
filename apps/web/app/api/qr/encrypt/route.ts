import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/actions/auth";
import { fetchEncryptedToken } from "@/lib/api/security-client";

// ─── Fixed-window rate limiter ────────────────────────────────────────────────
// 10 requests per 60 s per authenticated user.
// In a multi-instance deployment swap this Map for a shared Redis store.

const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();

function checkRateLimit(userId: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const entry = rateLimitMap.get(userId);

  if (!entry || now - entry.windowStart >= RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(userId, { count: 1, windowStart: now });
    return { allowed: true };
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    const retryAfter = Math.ceil((RATE_LIMIT_WINDOW_MS - (now - entry.windowStart)) / 1000);
    return { allowed: false, retryAfter };
  }

  entry.count++;
  return { allowed: true };
}

/**
 * POST /api/qr/encrypt
 * Server-side proxy to Python AES-256-GCM engine.
 * Validates user session before forwarding to Python engine,
 * so the engine URL and AES key are never exposed to the client.
 * Rate-limited to 10 requests per 60 seconds per user.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;

    // Rate limit check — runs after auth so we key on user ID, not IP
    const { allowed, retryAfter } = checkRateLimit(userId);
    if (!allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please wait before refreshing." },
        {
          status: 429,
          headers: {
            "Retry-After": String(retryAfter),
            "X-RateLimit-Limit": String(RATE_LIMIT_MAX),
            "X-RateLimit-Window": "60",
          },
        }
      );
    }

    const body = await request.json();
    const { ticketId } = body as { ticketId?: string };

    if (!ticketId || typeof ticketId !== "string") {
      return NextResponse.json({ error: "ticketId is required" }, { status: 400 });
    }

    // Verify the ticket belongs to the requesting user before encrypting
    const ticket = await prisma.ticket.findFirst({
      where: { id: ticketId, ownerId: userId },
      select: { status: true },
    });

    if (!ticket) {
      return NextResponse.json({ error: "Ticket not found or access denied" }, { status: 403 });
    }

    if (ticket.status !== "ACTIVE") {
      return NextResponse.json({ error: "Ticket is not active" }, { status: 403 });
    }

    const encryptedQr = await fetchEncryptedToken(ticketId, userId);

    return NextResponse.json({ encryptedQr }, { status: 200 });
  } catch (error) {
    const err = error as Error;
    console.error("[/api/qr/encrypt]", err.message);
    return NextResponse.json({ error: "Failed to generate QR code" }, { status: 500 });
  }
}
