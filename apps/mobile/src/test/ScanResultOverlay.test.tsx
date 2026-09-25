/**
 * ScanResultOverlay — unit tests
 *
 * Tests the real component. Heavy dependencies are stubbed:
 *  - @expo/vector-icons  → Ionicons renders icon name as a Text with testID
 *  - Animated.spring     → start() is a no-op (no animation in node env)
 *  - Animated.timing     → start(cb) calls cb immediately (dismiss is synchronous)
 *
 * Background-colour assertions work via toJSON() style inspection because
 * the component inlines { backgroundColor } in the Animated.View style array.
 */

import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react-native';
import React from 'react';
import * as ReactNative from 'react-native';

// ─── Make Animated animations synchronous ─────────────────────────────────────
// In the node test environment the native driver and requestAnimationFrame are
// unavailable.  Mocking spring/timing here means:
//   • spring().start()     → no-op (slide-in animation skipped, content still renders)
//   • timing().start(cb)   → cb() called immediately (dismiss fires without animation delay)

beforeAll(() => {
  vi.spyOn(ReactNative.Animated, 'spring').mockImplementation(
    () => ({ start: (_cb?: () => void) => {} }) as ReturnType<typeof ReactNative.Animated.spring>,
  );
  vi.spyOn(ReactNative.Animated, 'timing').mockImplementation(
    () =>
      ({ start: (cb?: () => void) => cb?.() }) as ReturnType<typeof ReactNative.Animated.timing>,
  );
});

// ─── @expo/vector-icons ────────────────────────────────────────────────────────
// Font-based icons cannot render in a test environment.
// Replace with a plain <Text testID="icon-{name}">{name}</Text> so tests can
// assert which icon the component chose without loading any font.

vi.mock('@expo/vector-icons', () => ({
  Ionicons: ({ name }: { name: string }) =>
    React.createElement(ReactNative.Text, { testID: `icon-${name}` }, name),
}));

// ─── Component under test ─────────────────────────────────────────────────────

import ScanResultOverlay from '@/src/components/scanner/ScanResultOverlay';
import type { ScanResultData } from '@/src/components/scanner/ScanResultOverlay';

// ─── Helper: extract backgroundColor from toJSON() tree ──────────────────────
// The component renders:
//   <Animated.View style={[containerStyle, { backgroundColor: bg, transform }]}>
// In react-test-renderer Animated.View flattens to View; the style is an array.

function getContainerBg(component: { toJSON: () => unknown }): string {
  const tree = component.toJSON() as { props?: { style?: unknown } } | null;
  if (!tree || !tree.props?.style) return '';
  const styleArr = [tree.props.style].flat(Infinity) as unknown[];
  const entry = styleArr.find(
    (s): s is { backgroundColor: string } =>
      s !== null && typeof s === 'object' && 'backgroundColor' in (s as object),
  );
  return entry?.backgroundColor ?? '';
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ScanResultOverlay', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  // ── Null result ─────────────────────────────────────────────────────────────

  it('renders nothing when result is null', () => {
    const { toJSON } = render(
      <ScanResultOverlay result={null} onDismiss={vi.fn()} />,
    );
    expect(toJSON()).toBeNull();
  });

  // ── VALID ───────────────────────────────────────────────────────────────────

  it('VALID — renders emerald background (#10b981), checkmark-circle icon, and attendee name', () => {
    const data: ScanResultData = {
      attendeeName: 'Mubin Prince',
      seatInfo: 'Row A, Seat 1',
      ticketType: 'VIP',
    };
    const component = render(
      <ScanResultOverlay result="VALID" data={data} onDismiss={vi.fn()} />,
    );

    expect(getContainerBg(component)).toBe('#10b981');
    expect(screen.getByTestId('icon-checkmark-circle')).toBeTruthy();
    expect(screen.getByText('Mubin Prince')).toBeTruthy();
    expect(screen.getByText('Row A, Seat 1')).toBeTruthy();
    expect(screen.getByText('VIP')).toBeTruthy();
  });

  it('VALID — falls back to "Guest" when attendeeName is absent', () => {
    render(<ScanResultOverlay result="VALID" onDismiss={vi.fn()} />);
    expect(screen.getByText('Guest')).toBeTruthy();
  });

  // ── ALREADY_USED ────────────────────────────────────────────────────────────

  it('ALREADY_USED — renders amber background (#f59e0b), alert-circle icon, and heading', () => {
    const component = render(
      <ScanResultOverlay result="ALREADY_USED" onDismiss={vi.fn()} />,
    );

    expect(getContainerBg(component)).toBe('#f59e0b');
    expect(screen.getByTestId('icon-alert-circle')).toBeTruthy();
    expect(screen.getByText('Already Checked In')).toBeTruthy();
  });

  // ── INVALID_TOKEN ───────────────────────────────────────────────────────────

  it('INVALID_TOKEN — renders red background (#ef4444), close-circle icon, and heading', () => {
    const component = render(
      <ScanResultOverlay result="INVALID_TOKEN" onDismiss={vi.fn()} />,
    );

    expect(getContainerBg(component)).toBe('#ef4444');
    expect(screen.getByTestId('icon-close-circle')).toBeTruthy();
    expect(screen.getByText('Invalid QR Code')).toBeTruthy();
  });

  // ── EVENT_NOT_ACTIVE ────────────────────────────────────────────────────────

  it('EVENT_NOT_ACTIVE — renders dark-gray background (#374151), time-outline icon', () => {
    const component = render(
      <ScanResultOverlay result="EVENT_NOT_ACTIVE" onDismiss={vi.fn()} />,
    );

    expect(getContainerBg(component)).toBe('#374151');
    expect(screen.getByTestId('icon-time-outline')).toBeTruthy();
    expect(screen.getByText('Event Not Active')).toBeTruthy();
  });

  // ── TICKET_CANCELLED ────────────────────────────────────────────────────────

  it('TICKET_CANCELLED — renders red background (#ef4444), ban icon, and heading', () => {
    const component = render(
      <ScanResultOverlay result="TICKET_CANCELLED" onDismiss={vi.fn()} />,
    );

    expect(getContainerBg(component)).toBe('#ef4444');
    expect(screen.getByTestId('icon-ban')).toBeTruthy();
    expect(screen.getByText('Ticket Cancelled')).toBeTruthy();
  });

  // ── QUEUED ──────────────────────────────────────────────────────────────────

  it('QUEUED — renders indigo background (#4f46e5), cloud-offline-outline icon, and "Scan Queued"', () => {
    const component = render(
      <ScanResultOverlay result="QUEUED" onDismiss={vi.fn()} />,
    );

    expect(getContainerBg(component)).toBe('#4f46e5');
    expect(screen.getByTestId('icon-cloud-offline-outline')).toBeTruthy();
    expect(screen.getByText('Scan Queued')).toBeTruthy();
  });

  // ── Dismiss on press ────────────────────────────────────────────────────────

  it('calls onDismiss when the overlay is pressed', () => {
    const mockDismiss = vi.fn();
    render(
      <ScanResultOverlay
        result="VALID"
        data={{ attendeeName: 'Test User' }}
        onDismiss={mockDismiss}
      />,
    );

    // The "Tap to dismiss" text is rendered inside the TouchableOpacity
    fireEvent.press(screen.getByText('Tap to dismiss'));

    // Animated.timing().start(cb) is mocked to call cb() immediately, so
    // onDismiss fires synchronously without needing to wait for animation
    expect(mockDismiss).toHaveBeenCalledOnce();
  });

  // ── Auto-dismiss ────────────────────────────────────────────────────────────

  it('auto-dismisses after 2500 ms', () => {
    vi.useFakeTimers();
    const mockDismiss = vi.fn();

    render(
      <ScanResultOverlay
        result="ALREADY_USED"
        onDismiss={mockDismiss}
      />,
    );

    // Timer not yet fired
    expect(mockDismiss).not.toHaveBeenCalled();

    // Advance past the AUTO_DISMISS_MS threshold
    vi.advanceTimersByTime(2_500);

    // setTimeout(dismiss, 2500) fires → Animated.timing().start(onDismiss) →
    // our mock calls cb() immediately → onDismiss invoked
    expect(mockDismiss).toHaveBeenCalledOnce();

    vi.useRealTimers();
  });
});
