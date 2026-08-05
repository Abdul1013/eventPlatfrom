"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getGatekeeperStats, type GatekeeperStats } from "@/lib/actions/dashboard";

export default function GatekeeperPage() {
  const [stats, setStats] = useState<GatekeeperStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getGatekeeperStats().then((res) => {
      if (res.success) setStats(res.data);
      setLoading(false);
    });
  }, []);

  const show = (value: number | undefined) =>
    loading ? "…" : (value ?? 0).toLocaleString();

  return (
    <div className="space-y-8">
      {/* Welcome */}
      <div>
        <h2 className="text-3xl font-bold text-primary mb-2">Scanner Dashboard</h2>
        <p className="text-foreground/70">
          Validate QR codes and manage event entry
        </p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-success/5 border border-success/20 rounded-lg p-6">
          <p className="text-sm text-foreground/60 mb-2">Scans Today</p>
          <p className="text-3xl font-bold text-success">{show(stats?.validToday)}</p>
          <p className="text-xs text-foreground/50 mt-2">Valid entries</p>
        </div>

        <div className="bg-warning/5 border border-warning/20 rounded-lg p-6">
          <p className="text-sm text-foreground/60 mb-2">Duplicates</p>
          <p className="text-3xl font-bold text-warning">{show(stats?.duplicatesToday)}</p>
          <p className="text-xs text-foreground/50 mt-2">Already scanned</p>
        </div>

        <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-6">
          <p className="text-sm text-foreground/60 mb-2">Rejections</p>
          <p className="text-3xl font-bold text-destructive">{show(stats?.rejectionsToday)}</p>
          <p className="text-xs text-foreground/50 mt-2">Invalid/tampered</p>
        </div>
      </div>

      {/* Scanner Link */}
      <div className="bg-accent/5 border-2 border-accent/30 rounded-lg p-8 text-center">
        <h3 className="text-lg font-semibold text-primary mb-4">Start Scanning</h3>
        <p className="text-foreground/70 mb-6">
          Open the scanner to validate attendee QR codes
        </p>
        <Link href="/gatekeeper/scan">
          <Button className="bg-primary text-primary-foreground hover:bg-primary/90 text-lg h-12">
            Open Scanner
          </Button>
        </Link>
      </div>

      {/* Features */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-accent/5 border border-accent/20 rounded-lg p-6">
          <h4 className="font-semibold text-primary mb-2">📱 Camera Access</h4>
          <p className="text-sm text-foreground/70">
            Uses device camera to scan QR codes in real-time
          </p>
        </div>

        <div className="bg-accent/5 border border-accent/20 rounded-lg p-6">
          <h4 className="font-semibold text-primary mb-2">⚡ Instant Validation</h4>
          <p className="text-sm text-foreground/70">
            Decrypts and validates tickets against AES-256-GCM engine
          </p>
        </div>

        <div className="bg-accent/5 border border-accent/20 rounded-lg p-6">
          <h4 className="font-semibold text-primary mb-2">🔴 Color Feedback</h4>
          <p className="text-sm text-foreground/70">
            Green (Valid), Amber (Duplicate), Red (Invalid/Tampered)
          </p>
        </div>

        <div className="bg-accent/5 border border-accent/20 rounded-lg p-6">
          <h4 className="font-semibold text-primary mb-2">📡 Offline Support</h4>
          <p className="text-sm text-foreground/70">
            Works offline with pre-cached ticket hashes via IndexedDB
          </p>
        </div>
      </div>

      {/* Security Notice */}
      <div className="bg-accent/5 border-l-4 border-accent p-6 rounded-lg">
        <h4 className="font-semibold text-primary mb-2">🔐 Security</h4>
        <ul className="text-sm text-foreground/70 space-y-1">
          <li>✓ 30-second TTL — tickets expire after 30s</li>
          <li>✓ Anti-replay — duplicate scans are rejected</li>
          <li>✓ Tamper detection — any modification fails validation</li>
          <li>✓ Encrypted payload — military-grade AES-256-GCM</li>
        </ul>
      </div>
    </div>
  );
}
