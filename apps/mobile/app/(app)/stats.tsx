import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DeviceEventEmitter,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { formatRelativeTime } from '@eventmerge/ui';
import { api } from '@/src/lib/api';
import { useScannerStore } from '@/src/store/scannerStore';
import { OPEN_EVENT_SELECTOR, SCANNER_STATS_REFRESH } from '@/src/lib/networkListener';
import type { CheckInStats, RecentScan } from '@eventmerge/types';

// ─── Helpers

function resultColor(result: string): string {
  if (result === 'VALID') return '#059669';        // emerald-600
  if (result === 'ALREADY_USED') return '#d97706'; // amber-600
  return '#dc2626';                                // red-600
}

function resultBg(result: string): string {
  if (result === 'VALID') return '#ecfdf5';
  if (result === 'ALREADY_USED') return '#fffbeb';
  return '#fef2f2';
}

function resultLabel(result: string): string {
  switch (result) {
    case 'VALID':            return 'Valid';
    case 'ALREADY_USED':     return 'Used';
    case 'INVALID_TOKEN':    return 'Invalid';
    case 'EVENT_NOT_ACTIVE': return 'Inactive';
    case 'TICKET_CANCELLED': return 'Cancelled';
    default:                 return result;
  }
}

// ─── Circular progress ring
// Custom SVG ring using stroke-dasharray / stroke-dashoffset.
// No third-party progress library — just react-native-svg primitives.
// The inner circle is rotated -90° so the arc starts at 12 o'clock.

const RING_SIZE = 160;
const STROKE_W = 14;
const RADIUS = (RING_SIZE - STROKE_W) / 2;   // inset by half stroke to prevent clipping
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const CX = RING_SIZE / 2;
const CY = RING_SIZE / 2;

function CircularProgress({ percent }: { percent: number }) {
  const pct = Math.max(0, Math.min(100, percent));
  const dashOffset = CIRCUMFERENCE * (1 - pct / 100);

  return (
    <View style={styles.ringWrap}>
      <Svg width={RING_SIZE} height={RING_SIZE}>
        {/* Gray track */}
        <Circle
          cx={CX} cy={CY} r={RADIUS}
          stroke="#e5e7eb"
          strokeWidth={STROKE_W}
          fill="none"
        />
        {/* Indigo progress arc — transform rotates origin to 12 o'clock */}
        <Circle
          cx={CX} cy={CY} r={RADIUS}
          stroke="#4f46e5"
          strokeWidth={STROKE_W}
          fill="none"
          strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          transform={`rotate(-90, ${CX}, ${CY})`}
        />
      </Svg>
      {/* Percentage text, centered over the SVG */}
      <View style={styles.ringCenter}>
        <Text style={styles.ringPct}>{Math.round(pct)}%</Text>
        <Text style={styles.ringLabel}>check-in rate</Text>
      </View>
    </View>
  );
}

// ─── Stat card

interface StatCardProps { label: string; value: number; accent: string; bg: string; }

function StatCard({ label, value, accent, bg }: StatCardProps) {
  return (
    <View style={[styles.statCard, { backgroundColor: bg }]}>
      <Text style={[styles.statValue, { color: accent }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: accent }]}>{label}</Text>
    </View>
  );
}

// ─── StatsScreen 

export default function StatsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { activeEventId, activeEventTitle, updateStats } = useScannerStore();

  const [stats, setStats] = useState<CheckInStats | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const prevEventIdRef = useRef(activeEventId);

  // ── Data fetching 

  const fetchStats = useCallback(
    async (isManual = false) => {
      if (!activeEventId) return;
      // RefreshControl handles its own indicator on pull-down. For non-manual
      // (auto-poll, focus, network event) we keep the current dashboard on
      // screen; no full-screen blocker.
      if (isManual) setRefreshing(true);

      try {
        const res = await api.get<{ data: CheckInStats }>(
          `/checkin/stats/${activeEventId}`,
        );
        setStats(res.data.data);
        setError(null);
        // Keep the scanner mini-bar counts in sync
        updateStats(res.data.data.checkedIn, res.data.data.totalTickets);
      } catch (err) {
        const axiosErr = err as { code?: string; message?: string };
        if (axiosErr.code === 'ECONNABORTED') {
          setError('Stats request timed out — pull down to retry.');
        } else {
          setError('Could not load stats — pull down to retry.');
        }
      } finally {
        setRefreshing(false);
      }
    },
    // updateStats is stable (Zustand action); activeEventId is the only changing input
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeEventId],
  );

  // Auto-refresh every 30 s while screen is focused; cancel when leaving tab
  useFocusEffect(
    useCallback(() => {
      void fetchStats();
      const id = setInterval(() => void fetchStats(), 30_000);
      return () => clearInterval(id);
    }, [fetchStats]),
  );

  // Re-fetch when the network listener fires a stats-refresh event
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(SCANNER_STATS_REFRESH, () =>
      void fetchStats(),
    );
    return () => sub.remove();
  }, [fetchStats]);

  // Clear local stats when the user switches to a different event
  useEffect(() => {
    if (prevEventIdRef.current !== activeEventId) {
      setStats(null);
      setError(null);
      prevEventIdRef.current = activeEventId;
    }
  }, [activeEventId]);

  // ── No event selected 

  if (!activeEventId) {
    return (
      <View style={[styles.emptyRoot, { paddingTop: insets.top }]}>
        <Ionicons name="calendar-outline" size={56} color="#d1d5db" />
        <Text style={styles.emptyHeading}>No Event Selected</Text>
        <Text style={styles.emptySub}>
          Select an event from the scanner tab to see live stats.
        </Text>
        <TouchableOpacity
          style={styles.emptyBtn}
          activeOpacity={0.8}
          onPress={() => {
            // Signal scanner.tsx to open its event selector sheet, then navigate there
            DeviceEventEmitter.emit(OPEN_EVENT_SELECTOR);
            router.navigate('/(app)/scanner');
          }}
        >
          <Ionicons name="qr-code-outline" size={16} color="white" />
          <Text style={styles.emptyBtnText}>Open Event Selector</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Render the dashboard always (zeros while initial fetch is in flight) ──
  // No full-screen "Loading…" blocker — empty events should look like the
  // dashboard with zeros, and pull-to-refresh handles the refresh indicator.
  const displayStats: CheckInStats = stats ?? {
    totalTickets: 0,
    checkedIn:    0,
    remaining:    0,
    checkInRate:  0,
    errorCount:   0,
    recentScans:  [],
  };

  // ── Main content 
  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32 },
      ]}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void fetchStats(true)}
          tintColor="#4f46e5"
          colors={['#4f46e5']}
        />
      }
    >
      {/* ── Event title */}
      <Text style={styles.eventTitle} numberOfLines={2}>
        {activeEventTitle}
      </Text>

      {/* ── Error banner */}
      {error && (
        <View style={styles.errorBanner}>
          <Ionicons name="warning-outline" size={14} color="#92400e" />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* ── Progress ring */}
      <View style={styles.ringSection}>
        <CircularProgress percent={displayStats.checkInRate} />
      </View>

      {/* ── Stat cards */}
      <View style={styles.cardRow}>
        <StatCard
          label="Checked In"
          value={displayStats.checkedIn}
          accent="#059669"
          bg="#ecfdf5"
        />
        <StatCard
          label="Remaining"
          value={displayStats.remaining}
          accent="#4f46e5"
          bg="#eef2ff"
        />
        <StatCard
          label="Errors"
          value={displayStats.errorCount}
          accent="#dc2626"
          bg="#fef2f2"
        />
      </View>

      {/*  Recent scans */}
      <Text style={styles.sectionTitle}>Recent Scans</Text>

      {displayStats.recentScans.length === 0 ? (
        <View style={styles.noScans}>
          <Text style={styles.noScansText}>
            {stats ? 'No scans recorded yet' : 'Pull down to load stats'}
          </Text>
        </View>
      ) : (
        <View style={styles.scanList}>
          {displayStats.recentScans.map((scan, index) => (
            <View
              key={scan.id}
              style={[
                styles.scanRow,
                index === displayStats.recentScans.length - 1 && styles.scanRowLast,
              ]}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.scanName} numberOfLines={1}>
                  {scan.attendeeName}
                </Text>
                <Text style={styles.scanTime}>{formatRelativeTime(scan.scannedAt)}</Text>
              </View>
              <View style={[styles.badge, { backgroundColor: resultBg(scan.result) }]}>
                <Text style={[styles.badgeText, { color: resultColor(scan.result) }]}>
                  {resultLabel(scan.result)}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

// Styles 

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f9fafb' },
  content: { paddingHorizontal: 20 },

  // ── Empty / no-event 
  emptyRoot: {
    flex: 1,
    backgroundColor: '#f9fafb',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  emptyHeading: { fontSize: 20, fontWeight: '700', color: '#111827', textAlign: 'center' },
  emptySub: { fontSize: 14, color: '#6b7280', textAlign: 'center', lineHeight: 20 },
  emptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#4f46e5',
    paddingVertical: 13,
    paddingHorizontal: 24,
    borderRadius: 12,
    marginTop: 8,
  },
  emptyBtnText: { fontSize: 15, fontWeight: '600', color: 'white' },

  // ── Event title 
  eventTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#4f46e5',
    marginBottom: 20,
    lineHeight: 30,
  },

  // ── Error banner ────
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fef3c7',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 16,
  },
  errorText: { fontSize: 13, color: '#92400e', flex: 1 },

  // ── Progress ring ───
  ringSection: { alignItems: 'center', marginBottom: 28 },
  ringWrap: { width: RING_SIZE, height: RING_SIZE },
  ringCenter: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringPct:   { fontSize: 36, fontWeight: '700', color: '#1f2937' },
  ringLabel: { fontSize: 11, color: '#6b7280', marginTop: 2 },

  // ── Stat cards 
  cardRow: { flexDirection: 'row', gap: 10, marginBottom: 28 },
  statCard: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  statValue: { fontSize: 26, fontWeight: '800', lineHeight: 32 },
  statLabel: { fontSize: 11, fontWeight: '600', marginTop: 3, textAlign: 'center' },

  // ── Recent scans ────
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 10 },

  noScans: { alignItems: 'center', paddingVertical: 24 },
  noScansText: { fontSize: 14, color: '#9ca3af' },

  scanList: {
    backgroundColor: 'white',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e5e7eb',
  },
  scanRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f3f4f6',
    gap: 10,
  },
  scanRowLast: { borderBottomWidth: 0 },
  scanName: { fontSize: 14, fontWeight: '600', color: '#111827' },
  scanTime: { fontSize: 12, color: '#9ca3af', marginTop: 1 },

  badge: { borderRadius: 6, paddingVertical: 3, paddingHorizontal: 8 },
  badgeText: { fontSize: 11, fontWeight: '700' },
});
