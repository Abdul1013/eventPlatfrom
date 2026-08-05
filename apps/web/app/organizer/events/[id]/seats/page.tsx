"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  runAllocation,
  compareAllocation,
  getAllocationHistory,
  type AllocationSummary,
  type ComparisonSummary,
} from "@/lib/actions/allocation";
import { Button } from "@/components/ui/button";

interface HistoryRow {
  id: string;
  algorithm_used: string;
  utilization_rate: number;
  run_at: string;
}

const pct = (n: number) => `${Math.round(n * 100)}%`;

export default function EventSeatsPage() {
  const params = useParams<{ id: string }>();
  const eventId = params.id;

  const [running, setRunning] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState<AllocationSummary | null>(null);
  const [comparison, setComparison] = useState<ComparisonSummary | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);

  async function loadHistory() {
    const res = await getAllocationHistory(eventId);
    if (res.success) setHistory(res.allocations as HistoryRow[]);
  }

  useEffect(() => {
    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  async function handleRun() {
    setError("");
    setRunning(true);
    setComparison(null);
    try {
      const res = await runAllocation(eventId);
      if (!res.success) {
        setError(res.error || "Allocation failed");
        return;
      }
      setSummary(res.summary ?? null);
      await loadHistory();
    } finally {
      setRunning(false);
    }
  }

  async function handleCompare() {
    setError("");
    setComparing(true);
    try {
      const res = await compareAllocation(eventId);
      if (!res.success) {
        setError(res.error || "Comparison failed");
        return;
      }
      setComparison(res.comparison ?? null);
    } finally {
      setComparing(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <Link
          href="/organizer/events"
          className="text-sm text-accent hover:underline"
        >
          ← Back to events
        </Link>
        <h1 className="text-3xl font-bold text-primary mt-2 mb-1">Seat Allocation</h1>
        <p className="text-foreground/70">
          Assign ticket-holders to seats using intelligent clustering.
        </p>
      </div>

      {error && (
        <div className="bg-destructive/10 border border-destructive text-destructive px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      <div className="flex gap-3">
        <Button
          onClick={handleRun}
          disabled={running}
          className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
        >
          {running ? "Allocating…" : "Run Allocation"}
        </Button>
        <Button
          onClick={handleCompare}
          disabled={comparing}
          variant="outline"
          className="flex-1"
        >
          {comparing ? "Comparing…" : "Compare vs Baseline"}
        </Button>
      </div>

      {summary && (
        <div className="bg-accent/5 border border-accent/20 rounded-lg p-5 space-y-2">
          <h2 className="font-semibold text-primary">Latest allocation</h2>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Stat label="Utilization" value={pct(summary.utilizationRate)} />
            <Stat label="Adjacency" value={pct(summary.adjacencyScore)} />
            <Stat
              label="Seats assigned"
              value={`${summary.seatsAssigned}/${summary.seatsTotal}`}
            />
            <Stat label="Unassigned" value={String(summary.unassigned)} />
          </div>
          <p className="text-xs text-foreground/50 pt-1">
            {summary.algorithmUsed} · {summary.durationMs} ms
          </p>
        </div>
      )}

      {comparison && (
        <div className="bg-accent/5 border border-accent/20 rounded-lg p-5 space-y-2">
          <h2 className="font-semibold text-primary">SAO vs. manual baseline</h2>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Stat label="SAO utilization" value={pct(comparison.saoUtilizationRate)} />
            <Stat
              label="Baseline utilization"
              value={pct(comparison.baselineUtilizationRate)}
            />
          </div>
          <p
            className={`text-sm font-medium ${
              comparison.hypothesisH1Passed ? "text-success" : "text-warning"
            }`}
          >
            {comparison.improvementPercentage >= 0 ? "+" : ""}
            {comparison.improvementPercentage.toFixed(1)}% vs baseline
            {comparison.hypothesisH1Passed ? " · meets ≥15% target" : ""}
          </p>
        </div>
      )}

      {history.length > 0 && (
        <div className="space-y-2">
          <h2 className="font-semibold">History</h2>
          <ul className="space-y-2">
            {history.map((h) => (
              <li
                key={h.id}
                className="flex items-center justify-between text-sm border border-foreground/10 rounded-lg px-4 py-2"
              >
                <span className="text-foreground/70">{h.algorithm_used}</span>
                <span className="font-medium text-primary">
                  {pct(h.utilization_rate)}
                </span>
                <span className="text-foreground/50">
                  {new Date(h.run_at).toLocaleString("en-NG")}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-foreground/60">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}
