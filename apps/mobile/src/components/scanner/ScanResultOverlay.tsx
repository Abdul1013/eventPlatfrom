import { useEffect, useRef } from 'react';
import { Animated, Dimensions, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ScanResultCode } from '@eventmerge/types';

// Re-export for local consumers (scanner.tsx, scannerStore.ts)
export type { ScanResultCode };

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ScanResultData {
  attendeeName?: string;
  seatInfo?: string;
  ticketType?: string;
  eventTitle?: string;
  message?: string;
}

interface Props {
  result: ScanResultCode | null;
  data?: ScanResultData;
  onDismiss: () => void;
}

// ─── Per-result display config ────────────────────────────────────────────────

const CONFIG: Record<
  ScanResultCode,
  { bg: string; icon: keyof typeof Ionicons.glyphMap; heading: string }
> = {
  VALID:            { bg: '#10b981', icon: 'checkmark-circle', heading: 'Checked In!' },
  ALREADY_USED:     { bg: '#f59e0b', icon: 'alert-circle',     heading: 'Already Checked In' },
  INVALID_TOKEN:    { bg: '#ef4444', icon: 'close-circle',     heading: 'Invalid QR Code' },
  EVENT_NOT_ACTIVE: { bg: '#374151', icon: 'time-outline',     heading: 'Event Not Active' },
  TICKET_CANCELLED: { bg: '#ef4444', icon: 'ban',              heading: 'Ticket Cancelled' },
  QUEUED:           { bg: '#4f46e5', icon: 'cloud-offline-outline', heading: 'Scan Queued' },
};

const OVERLAY_HEIGHT = Dimensions.get('window').height * 0.4;
const AUTO_DISMISS_MS = 2500;

// ─── Component ────────────────────────────────────────────────────────────────

export default function ScanResultOverlay({ result, data, onDismiss }: Props) {
  const translateY = useRef(new Animated.Value(OVERLAY_HEIGHT)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear any pending timer on unmount
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  useEffect(() => {
    if (!result) return;

    // Reset to off-screen position before animating (handles back-to-back scans)
    translateY.setValue(OVERLAY_HEIGHT);

    // Spring slide-up
    Animated.spring(translateY, {
      toValue: 0,
      tension: 55,
      friction: 9,
      useNativeDriver: true,
    }).start();

    // Auto-dismiss
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(dismiss, AUTO_DISMISS_MS);
  }, [result]); // eslint-disable-line react-hooks/exhaustive-deps

  const dismiss = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    Animated.timing(translateY, {
      toValue: OVERLAY_HEIGHT,
      duration: 220,
      useNativeDriver: true,
    }).start(() => onDismiss());
  };

  if (!result) return null;

  const { bg, icon, heading } = CONFIG[result];

  return (
    <Animated.View
      style={[styles.container, { backgroundColor: bg, transform: [{ translateY }] }]}
    >
      <TouchableOpacity style={styles.inner} onPress={dismiss} activeOpacity={1}>
        {/* Icon */}
        <Ionicons name={icon} size={64} color="white" />

        {/* VALID: attendee name is the primary heading */}
        {result === 'VALID' ? (
          <>
            <Text style={styles.attendeeName}>{data?.attendeeName ?? 'Guest'}</Text>
            {data?.seatInfo    && <Text style={styles.detail}>{data.seatInfo}</Text>}
            {data?.ticketType  && <Text style={styles.detail}>{data.ticketType}</Text>}
            {data?.eventTitle  && <Text style={styles.sub}>{data.eventTitle}</Text>}
          </>
        ) : (
          <>
            <Text style={styles.heading}>{heading}</Text>

            {result === 'ALREADY_USED' && (
              <Text style={styles.detail}>This ticket has already been checked in</Text>
            )}
            {result === 'INVALID_TOKEN' && (
              <Text style={styles.detail}>This ticket could not be verified</Text>
            )}
            {result === 'EVENT_NOT_ACTIVE' && (
              <Text style={styles.detail}>Check-in is not open for this event</Text>
            )}
            {result === 'TICKET_CANCELLED' && (
              <Text style={styles.detail}>This ticket has been cancelled</Text>
            )}
            {result === 'QUEUED' && (
              <Text style={styles.detail}>Scan will sync automatically when back online</Text>
            )}
          </>
        )}

        <Text style={styles.tap}>Tap to dismiss</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: OVERLAY_HEIGHT,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    // Shadow for the slide-up card feel
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 20,
  },
  inner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingBottom: 20,
    gap: 6,
  },
  // VALID result — attendee name is the focal point
  attendeeName: {
    fontSize: 24,
    fontWeight: '700',
    color: 'white',
    textAlign: 'center',
    marginTop: 2,
  },
  // Non-VALID results — generic heading
  heading: {
    fontSize: 24,
    fontWeight: '700',
    color: 'white',
    textAlign: 'center',
    marginTop: 2,
  },
  detail: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.9)',
    textAlign: 'center',
  },
  sub: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
  },
  tap: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.45)',
    marginTop: 10,
  },
});
