"use client";

import { useEffect, useState } from "react";
import { getPayoutSummary, getBanks, savePayoutAccount, type PayoutSummary } from "@/lib/actions/payouts";
import { refundOrder } from "@/lib/actions/payments";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const naira = (n: number) => `₦${n.toLocaleString("en-NG")}`;

export default function PayoutsPage() {
  const [summary, setSummary] = useState<PayoutSummary | null>(null);
  const [banks, setBanks] = useState<{ name: string; code: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [form, setForm] = useState({ businessName: "", bankCode: "", accountNumber: "" });
  const [saving, setSaving] = useState(false);
  const [refundingId, setRefundingId] = useState<string | null>(null);

  async function load() {
    const [s, b] = await Promise.all([getPayoutSummary(), getBanks()]);
    if (s.success) setSummary(s.data);
    else setError(s.error);
    setBanks(b.banks);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    const res = await savePayoutAccount(form);
    if (!res.success) setError(res.error || "Could not save");
    else await load();
    setSaving(false);
  }

  async function handleRefund(orderId: string) {
    setRefundingId(orderId);
    const res = await refundOrder(orderId);
    if (!res.success) setError(res.error || "Refund failed");
    else await load();
    setRefundingId(null);
  }

  if (loading) {
    return <div className="max-w-3xl mx-auto text-foreground/60">Loading payouts…</div>;
  }

  const acct = summary?.account;

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-primary mb-1">Payouts</h1>
        <p className="text-foreground/70">Your earnings, payout account, and refunds</p>
      </div>

      {error && (
        <div className="bg-destructive/10 border border-destructive text-destructive px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Earnings */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Gross sales" value={naira(summary.gross)} />
          <Stat label={`Platform fee (${summary.feePct}%)`} value={`−${naira(summary.platformFee)}`} />
          <Stat label="Net payout" value={naira(summary.net)} highlight />
          <Stat label="Tickets sold" value={String(summary.ticketsSold)} />
        </div>
      )}

      {/* Payout account */}
      <section className="bg-accent/5 border border-accent/20 rounded-lg p-6 space-y-4">
        <h2 className="font-semibold text-primary">Payout account</h2>
        {acct?.connected ? (
          <div className="text-sm text-foreground/80 space-y-1">
            <p>
              <span className="text-foreground/50">Business:</span> {acct.businessName}
            </p>
            <p>
              <span className="text-foreground/50">Account:</span> {acct.accountName || "—"} ·{" "}
              {acct.accountNumber}
            </p>
            <p className="text-xs text-success">
              Connected — future ticket sales split to your bank automatically.
            </p>
          </div>
        ) : (
          <p className="text-sm text-foreground/60">
            Add your bank details so ticket revenue is paid out to you.
          </p>
        )}

        <form onSubmit={handleSave} className="grid grid-cols-1 gap-3 pt-2">
          <Input
            placeholder="Business / organizer name"
            value={form.businessName}
            onChange={(e) => setForm({ ...form, businessName: e.target.value })}
            required
            disabled={saving}
          />
          <div className="grid grid-cols-2 gap-3">
            <select
              value={form.bankCode}
              onChange={(e) => setForm({ ...form, bankCode: e.target.value })}
              required
              disabled={saving}
              className="flex w-full rounded-lg border border-foreground/20 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">
                {banks.length ? "Select bank" : "Banks load when Paystack is configured"}
              </option>
              {banks.map((b) => (
                <option key={b.code} value={b.code}>
                  {b.name}
                </option>
              ))}
            </select>
            <Input
              placeholder="Account number (10 digits)"
              value={form.accountNumber}
              onChange={(e) => setForm({ ...form, accountNumber: e.target.value })}
              required
              disabled={saving}
            />
          </div>
          <Button
            type="submit"
            disabled={saving}
            className="bg-primary text-primary-foreground hover:bg-primary/90 w-fit"
          >
            {saving ? "Saving…" : acct?.connected ? "Update account" : "Connect payout account"}
          </Button>
        </form>
      </section>

      {/* Recent paid orders + refund */}
      {summary && summary.recentPaidOrders.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold text-primary">Recent paid orders</h2>
          <ul className="space-y-2">
            {summary.recentPaidOrders.map((o) => (
              <li
                key={o.id}
                className="flex items-center justify-between gap-3 border border-foreground/10 rounded-lg px-4 py-2 text-sm"
              >
                <div className="min-w-0">
                  <p className="font-medium truncate">{o.event_title}</p>
                  <p className="text-xs text-foreground/50">
                    {naira(o.amount)} · {o.reference}
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={() => handleRefund(o.id)}
                  disabled={refundingId === o.id}
                  className="shrink-0 text-destructive border-destructive/30 hover:bg-destructive/10"
                >
                  {refundingId === o.id ? "Refunding…" : "Refund"}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="bg-accent/5 border border-accent/20 rounded-lg p-4">
      <p className="text-xs text-foreground/60">{label}</p>
      <p className={`text-lg font-bold ${highlight ? "text-primary" : "text-foreground"}`}>{value}</p>
    </div>
  );
}
