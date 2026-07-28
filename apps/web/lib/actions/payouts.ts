"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/actions/auth";
import { createSubaccount, listBanks, isPaystackConfigured } from "@/lib/api/paystack";

const PLATFORM_FEE_PCT = 5; // EventMerge's cut (undercuts Afritickets' 10%, etc.)

async function requireOrganizer() {
  const session = await getSession();
  if (!session) return { ok: false as const, error: "Not authenticated" };
  if (!["ORGANIZER", "ADMIN"].includes(session.user.role)) {
    return { ok: false as const, error: "Only organizers can manage payouts" };
  }
  return { ok: true as const, userId: session.user.id };
}

/** Banks for the payout-account picker (empty list if Paystack not configured). */
export async function getBanks(): Promise<{ banks: { name: string; code: string }[] }> {
  if (!isPaystackConfigured()) return { banks: [] };
  try {
    const banks = await listBanks();
    return { banks: banks.map((b) => ({ name: b.name, code: b.code })) };
  } catch (error) {
    console.error("[getBanks]", (error as Error).message);
    return { banks: [] };
  }
}

const SaveAccountSchema = z.object({
  businessName: z.string().min(2).max(120),
  bankCode: z.string().min(2).max(10),
  accountNumber: z.string().regex(/^\d{10}$/, "Account number must be 10 digits"),
});

/**
 * Save/refresh the organizer's payout account. When Paystack is configured this
 * creates a subaccount so future ticket sales split to their bank automatically.
 */
export async function savePayoutAccount(
  input: z.infer<typeof SaveAccountSchema>
): Promise<{ success: boolean; error?: string }> {
  try {
    const auth = await requireOrganizer();
    if (!auth.ok) return { success: false, error: auth.error };

    const data = SaveAccountSchema.parse(input);

    let subaccountCode: string | undefined;
    let accountName: string | undefined;
    if (isPaystackConfigured()) {
      const sub = await createSubaccount({
        businessName: data.businessName,
        bankCode: data.bankCode,
        accountNumber: data.accountNumber,
        percentageCharge: PLATFORM_FEE_PCT,
      });
      subaccountCode = sub.subaccount_code;
      accountName = sub.account_name;
    }

    await prisma.payoutAccount.upsert({
      where: { organizerId: auth.userId },
      update: {
        businessName: data.businessName,
        bankCode: data.bankCode,
        accountNumber: data.accountNumber,
        accountName: accountName ?? null,
        subaccountCode: subaccountCode ?? null,
        percentageCharge: PLATFORM_FEE_PCT,
      },
      create: {
        organizerId: auth.userId,
        businessName: data.businessName,
        bankCode: data.bankCode,
        accountNumber: data.accountNumber,
        accountName: accountName ?? null,
        subaccountCode: subaccountCode ?? null,
        percentageCharge: PLATFORM_FEE_PCT,
      },
    });

    return { success: true };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues[0]?.message || "Validation failed" };
    }
    console.error("[savePayoutAccount]", (error as Error).message);
    return { success: false, error: "Could not save payout account" };
  }
}

export interface PayoutOrderRow {
  id: string;
  reference: string;
  amount: number;
  event_title: string;
  created_at: string;
}

export interface PayoutSummary {
  gross: number;
  platformFee: number;
  net: number;
  paidOrders: number;
  ticketsSold: number;
  feePct: number;
  account: {
    connected: boolean;
    businessName?: string;
    bankCode?: string;
    accountNumber?: string;
    accountName?: string | null;
  };
  recentPaidOrders: PayoutOrderRow[];
}

/** Earnings + payout-account status for the signed-in organizer. */
export async function getPayoutSummary(): Promise<
  { success: true; data: PayoutSummary } | { success: false; error: string }
> {
  try {
    const auth = await requireOrganizer();
    if (!auth.ok) return { success: false, error: auth.error };

    const [paidOrders, account] = await Promise.all([
      prisma.order.findMany({
        where: { status: "PAID", event: { organizerId: auth.userId } },
        orderBy: { paidAt: "desc" },
        select: {
          id: true,
          reference: true,
          amount: true,
          createdAt: true,
          event: { select: { title: true } },
          _count: { select: { tickets: true } },
        },
      }),
      prisma.payoutAccount.findUnique({ where: { organizerId: auth.userId } }),
    ]);

    const gross = paidOrders.reduce((s, o) => s + Number(o.amount), 0);
    const ticketsSold = paidOrders.reduce((s, o) => s + o._count.tickets, 0);
    const feePct = account?.percentageCharge ?? PLATFORM_FEE_PCT;
    const platformFee = (gross * feePct) / 100;

    return {
      success: true,
      data: {
        gross,
        platformFee,
        net: gross - platformFee,
        paidOrders: paidOrders.length,
        ticketsSold,
        feePct,
        account: {
          connected: Boolean(account?.subaccountCode) || Boolean(account),
          businessName: account?.businessName,
          bankCode: account?.bankCode,
          accountNumber: account?.accountNumber,
          accountName: account?.accountName,
        },
        recentPaidOrders: paidOrders.slice(0, 10).map((o) => ({
          id: o.id,
          reference: o.reference,
          amount: Number(o.amount),
          event_title: o.event.title,
          created_at: o.createdAt.toISOString(),
        })),
      },
    };
  } catch (error) {
    console.error("[getPayoutSummary]", (error as Error).message);
    return { success: false, error: "Failed to load payout summary" };
  }
}
