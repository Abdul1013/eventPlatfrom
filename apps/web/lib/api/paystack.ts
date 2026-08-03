import "server-only";
import crypto from "node:crypto";

/**
 * Paystack client (server-only). Amounts are handled in kobo (NGN × 100) at the
 * Paystack boundary; the rest of the app uses NGN major units.
 * Docs: https://paystack.com/docs/api/
 */

const PAYSTACK_BASE = "https://api.paystack.co";

function secretKey(): string {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new Error("PAYSTACK_SECRET_KEY is not set");
  return key;
}

export function isPaystackConfigured(): boolean {
  return Boolean(process.env.PAYSTACK_SECRET_KEY);
}

export const nairaToKobo = (naira: number): number => Math.round(naira * 100);
export const koboToNaira = (kobo: number): number => kobo / 100;

async function paystackFetch<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(`${PAYSTACK_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secretKey()}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const json = (await res.json()) as { status: boolean; message: string; data: T };
  if (!res.ok || !json.status) {
    throw new Error(`Paystack ${path} failed: ${json.message || res.statusText}`);
  }
  return json.data;
}

export interface InitializeParams {
  email: string;
  amountKobo: number;
  reference: string;
  callbackUrl: string;
  metadata?: Record<string, unknown>;
  /** Paystack subaccount code (SUB_xxx) to split the payment to the organizer. */
  subaccount?: string;
}

export interface InitializeResult {
  authorization_url: string;
  access_code: string;
  reference: string;
}

/** Initialize a transaction → returns the hosted checkout URL. */
export function initializeTransaction(params: InitializeParams): Promise<InitializeResult> {
  return paystackFetch<InitializeResult>("/transaction/initialize", {
    method: "POST",
    body: JSON.stringify({
      email: params.email,
      amount: params.amountKobo,
      reference: params.reference,
      callback_url: params.callbackUrl,
      currency: "NGN",
      metadata: params.metadata,
      // When a subaccount is set, Paystack splits the payment; the subaccount
      // (organizer) bears Paystack's fee so the platform keeps its full %.
      ...(params.subaccount ? { subaccount: params.subaccount, bearer: "subaccount" } : {}),
    }),
  });
}

// ─── Subaccounts (organizer payouts via split) ────────────────────────────────

export interface CreateSubaccountParams {
  businessName: string;
  bankCode: string;
  accountNumber: string;
  percentageCharge: number; // platform fee %
}

export interface SubaccountResult {
  subaccount_code: string;
  account_name?: string;
}

/** Create a Paystack subaccount for an organizer's bank account. */
export function createSubaccount(p: CreateSubaccountParams): Promise<SubaccountResult> {
  return paystackFetch<SubaccountResult>("/subaccount", {
    method: "POST",
    body: JSON.stringify({
      business_name: p.businessName,
      bank_code: p.bankCode,
      account_number: p.accountNumber,
      percentage_charge: p.percentageCharge,
    }),
  });
}

export interface Bank {
  name: string;
  code: string;
}

/** List Nigerian banks (for the payout-account bank picker). */
export function listBanks(): Promise<Bank[]> {
  return paystackFetch<Bank[]>("/bank?currency=NGN", { method: "GET" });
}

// ─── Refunds ──────────────────────────────────────────────────────────────────

export interface RefundResult {
  status: string;
  transaction: { reference: string };
}

/** Refund a transaction by reference (full refund when amountKobo omitted). */
export function refundTransaction(reference: string, amountKobo?: number): Promise<RefundResult> {
  return paystackFetch<RefundResult>("/refund", {
    method: "POST",
    body: JSON.stringify({ transaction: reference, ...(amountKobo ? { amount: amountKobo } : {}) }),
  });
}

export interface VerifyResult {
  status: string; // "success" | "failed" | "abandoned" | ...
  reference: string;
  amount: number; // kobo
  currency: string;
  paid_at: string | null;
}

/** Verify a transaction by reference (source of truth for fulfillment). */
export function verifyTransaction(reference: string): Promise<VerifyResult> {
  return paystackFetch<VerifyResult>(`/transaction/verify/${encodeURIComponent(reference)}`, {
    method: "GET",
  });
}

/**
 * Verify the `x-paystack-signature` header: HMAC-SHA512 of the raw body using
 * the secret key. Reject any webhook that doesn't match.
 */
export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  if (!signature) return false;
  const hash = crypto.createHmac("sha512", secretKey()).update(rawBody).digest("hex");
  // timingSafeEqual requires equal-length buffers.
  const a = Buffer.from(hash);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
