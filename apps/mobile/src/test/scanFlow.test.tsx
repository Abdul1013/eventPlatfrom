/**
 * Scanner screen — integration tests (React Native Testing Library)
 *
 * All native-module and complex UI dependencies are mocked so the screen
 * can render and respond to events in a Node.js test environment:
 *
 *  - expo-camera          → Camera component captures onBarCodeScanned;
 *                           useCameraPermissions is a controllable vi.fn()
 *  - expo-haptics         → impactAsync / notificationAsync are spies
 *  - expo-network         → getNetworkStateAsync returns configurable state
 *  - @gorhom/bottom-sheet → transparent wrapper (BottomSheet is ref-forwarded)
 *  - @expo/vector-icons   → Ionicons renders null
 *  - react-native-safe-area-context → useSafeAreaInsets returns zero insets
 *  - @/src/lib/api        → api.post / api.get are spies
 *  - @/src/store/scannerStore → useScannerStore returns controlled state
 *  - ScanResultOverlay    → lightweight stub that mirrors auto-dismiss behaviour
 *  - OfflineBanner        → null
 *  - networkListener      → exports constants only (no listener started)
 *
 * Scan simulation:  After render the Camera mock's onBarCodeScanned prop is
 * captured in `capturedScanRef`.  Tests call
 * `capturedScanRef.current?.({ data: 'mock-token' })` inside act() to
 * simulate the device reading a QR code.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react-native';
import React from 'react';
import * as ReactNative from 'react-native';

// ─── Hoisted spies / refs ─────────────────────────────────────────────────────

/** Captures the onBarCodeScanned prop each time Camera re-renders. */
const capturedScanRef = vi.hoisted(
  () =>
    ({
      current: undefined as
        | ((d: { data: string }) => void | Promise<void>)
        | undefined,
    }) as { current: ((d: { data: string }) => void | Promise<void>) | undefined },
);

const mockUseCameraPermissions = vi.hoisted(() =>
  vi.fn().mockReturnValue([{ granted: true }, vi.fn().mockResolvedValue(undefined)]),
);

const mockHapticsImpact       = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockHapticsNotification = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockGetNetworkState     = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ isConnected: true, isInternetReachable: true }),
);
const mockApiPost = vi.hoisted(() => vi.fn());
const mockApiGet  = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ data: { data: [] } }),
);
const mockEnqueueScann  = vi.hoisted(() => vi.fn());
const mockSetActiveEvent = vi.hoisted(() => vi.fn());

// ─── Module mocks ──────────────────────────────────────────────────────────────

// expo-camera: Camera component + static useCameraPermissions hook
vi.mock('expo-camera', () => ({
  Camera: Object.assign(
    function MockCamera({
      onBarCodeScanned,
    }: {
      onBarCodeScanned?: (d: { data: string }) => void | Promise<void>;
    }) {
      // Keep the ref fresh on every re-render so tests always call the
      // latest version of handleBarcodeScan (which closes over current state).
      capturedScanRef.current = onBarCodeScanned;
      return null;
    },
    { useCameraPermissions: mockUseCameraPermissions },
  ),
}));

vi.mock('expo-haptics', () => ({
  impactAsync:           mockHapticsImpact,
  notificationAsync:     mockHapticsNotification,
  ImpactFeedbackStyle:   { Medium: 'Medium' },
  NotificationFeedbackType: { Success: 'Success', Warning: 'Warning', Error: 'Error' },
}));

vi.mock('expo-network', () => ({
  getNetworkStateAsync: mockGetNetworkState,
}));

// @gorhom/bottom-sheet: render children transparently; forward the ref so
// bottomSheetRef.current is not null (though it has no real methods).
vi.mock('@gorhom/bottom-sheet', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react') as typeof import('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native') as typeof import('react-native');
  return {
    default: React.forwardRef(
      ({ children }: { children?: React.ReactNode }, _ref: unknown) =>
        React.createElement(View, { testID: 'bottom-sheet' }, children),
    ),
    BottomSheetBackdrop:  () => null,
    BottomSheetFlatList:  () => null,
  };
});

vi.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

vi.mock('@/src/lib/api', () => ({
  api: { post: mockApiPost, get: mockApiGet },
}));

vi.mock('@/src/store/scannerStore', () => ({
  useScannerStore: () => ({
    activeEventId:    'event-1',
    activeEventTitle: 'Test Event',
    setActiveEvent:   mockSetActiveEvent,
    enqueueScann:     mockEnqueueScann,
  }),
}));

// ScanResultOverlay stub:
//  • Renders a View with testID "scan-result-overlay" when result is non-null
//  • Exposes the result code and attendee name as Text nodes for querying
//  • Mirrors the real component's 2500 ms auto-dismiss via setTimeout
vi.mock('@/src/components/scanner/ScanResultOverlay', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react') as typeof import('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View, Text, TouchableOpacity } = require('react-native') as typeof import('react-native');

  return {
    default: function MockScanResultOverlay({
      result,
      data,
      onDismiss,
    }: {
      result: string | null;
      data?: { attendeeName?: string; message?: string };
      onDismiss: () => void;
    }) {
      React.useEffect(() => {
        if (!result) return;
        const timer = setTimeout(onDismiss, 2_500);
        return () => clearTimeout(timer);
      }, [result, onDismiss]);

      if (!result) return null;

      return React.createElement(
        View,
        { testID: 'scan-result-overlay' },
        React.createElement(Text, { testID: 'scan-result-code' }, result),
        data?.attendeeName
          ? React.createElement(
              Text,
              { testID: 'scan-attendee-name' },
              data.attendeeName,
            )
          : null,
        React.createElement(
          TouchableOpacity,
          { testID: 'dismiss-overlay', onPress: onDismiss },
          React.createElement(Text, null, 'Dismiss'),
        ),
      );
    },
  };
});

vi.mock('@/src/components/scanner/OfflineBanner', () => ({
  default: () => null,
}));

vi.mock('@/src/lib/networkListener', () => ({
  OPEN_EVENT_SELECTOR:   'OPEN_EVENT_SELECTOR',
  SCANNER_STATS_REFRESH: 'SCANNER_STATS_REFRESH',
  startNetworkListener:  () => {},
  stopNetworkListener:   () => {},
}));

// ─── Prevent Animated.loop from spinning in a node environment ────────────────
// The scan-line animation uses Animated.loop + timing with useNativeDriver: true.
// Without RAF the loop would stall; mock it out so render stays clean.

beforeAll(() => {
  vi.spyOn(ReactNative.Animated, 'loop').mockImplementation(
    () =>
      ({
        start:  () => {},
        stop:   () => {},
        reset:  () => {},
      }) as ReturnType<typeof ReactNative.Animated.loop>,
  );
});

// ─── Component under test ─────────────────────────────────────────────────────

import ScannerScreen from '@/app/(app)/scanner';

// ─── Test setup ───────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();

  // Defaults: permission granted, device online, API resolves to VALID
  mockUseCameraPermissions.mockReturnValue([{ granted: true }, vi.fn().mockResolvedValue(undefined)]);
  mockGetNetworkState.mockResolvedValue({ isConnected: true, isInternetReachable: true });
  mockApiGet.mockResolvedValue({ data: { data: [] } });
  capturedScanRef.current = undefined;
});

afterEach(() => {
  vi.useRealTimers();
});

// ─── Helper: simulate a QR scan ───────────────────────────────────────────────

async function simulateScan(token = 'mock-qr-token') {
  await act(async () => {
    capturedScanRef.current?.({ data: token });
    // Flush microtasks so that Haptics.impactAsync and api.post resolve
    await new Promise<void>((r) => setTimeout(r, 0));
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ScannerScreen — camera permission states', () => {
  it('renders permission-denied UI when camera permission is not granted', async () => {
    mockUseCameraPermissions.mockReturnValue([{ granted: false }, vi.fn()]);

    await act(async () => {
      render(<ScannerScreen />);
    });

    expect(screen.getByText('Camera Access Required')).toBeTruthy();
    expect(screen.getByText('Open Settings')).toBeTruthy();
  });

  it('renders the viewfinder label when camera permission is granted', async () => {
    await act(async () => {
      render(<ScannerScreen />);
    });

    expect(screen.getByText('Point at QR code')).toBeTruthy();
  });
});

describe('ScannerScreen — online scan outcomes', () => {
  it('VALID scan — calls api.post, shows green overlay with attendee name, triggers SUCCESS haptic', async () => {
    mockApiPost.mockResolvedValue({
      data: {
        data: {
          result:       'VALID',
          attendeeName: 'Mubin Prince',
          seatInfo:     'Row A, Seat 1',
          ticketType:   'VIP',
        },
      },
    });

    await act(async () => { render(<ScannerScreen />); });
    await simulateScan('valid-token');

    expect(mockApiPost).toHaveBeenCalledWith(
      '/checkin/scan',
      { token: 'valid-token', deviceInfo: 'EventMerge Staff App' },
    );

    await waitFor(() =>
      expect(screen.getByTestId('scan-result-overlay')).toBeTruthy(),
    );
    expect(screen.getByTestId('scan-result-code').props.children).toBe('VALID');
    expect(screen.getByTestId('scan-attendee-name').props.children).toBe('Mubin Prince');

    expect(mockHapticsNotification).toHaveBeenCalledWith('Success');
  });

  it('ALREADY_USED scan — shows amber overlay and triggers WARNING haptic', async () => {
    mockApiPost.mockResolvedValue({
      data: { data: { result: 'ALREADY_USED' } },
    });

    await act(async () => { render(<ScannerScreen />); });
    await simulateScan();

    await waitFor(() =>
      expect(screen.getByTestId('scan-result-code').props.children).toBe('ALREADY_USED'),
    );
    expect(mockHapticsNotification).toHaveBeenCalledWith('Warning');
  });

  it('INVALID_TOKEN scan — shows red overlay and triggers ERROR haptic', async () => {
    mockApiPost.mockResolvedValue({
      data: { data: { result: 'INVALID_TOKEN' } },
    });

    await act(async () => { render(<ScannerScreen />); });
    await simulateScan();

    await waitFor(() =>
      expect(screen.getByTestId('scan-result-code').props.children).toBe('INVALID_TOKEN'),
    );
    expect(mockHapticsNotification).toHaveBeenCalledWith('Error');
  });

  it('network error — shows INVALID_TOKEN overlay and triggers ERROR haptic', async () => {
    mockApiPost.mockRejectedValue(new Error('Network Error'));

    await act(async () => { render(<ScannerScreen />); });
    await simulateScan();

    await waitFor(() =>
      expect(screen.getByTestId('scan-result-code').props.children).toBe('INVALID_TOKEN'),
    );
    expect(mockHapticsNotification).toHaveBeenCalledWith('Error');
  });
});

describe('ScannerScreen — debounce', () => {
  it('debounce prevents a second scan while the first is processing', async () => {
    mockApiPost.mockResolvedValue({
      data: { data: { result: 'VALID', attendeeName: 'X' } },
    });

    await act(async () => { render(<ScannerScreen />); });

    // First scan — sets isProcessing=true, which causes Camera to re-render
    // with onBarCodeScanned=undefined so subsequent scans are ignored.
    await simulateScan('tok-1');

    // capturedScanRef.current is now undefined (Camera re-rendered with prop=undefined)
    await act(async () => {
      capturedScanRef.current?.({ data: 'tok-2' }); // no-op
      await new Promise<void>((r) => setTimeout(r, 0));
    });

    expect(mockApiPost).toHaveBeenCalledOnce();
  });
});

describe('ScannerScreen — offline mode', () => {
  it('queues the scan and shows QUEUED overlay when device is offline', async () => {
    // Device is offline
    mockGetNetworkState.mockResolvedValue({
      isConnected: false,
      isInternetReachable: false,
    });

    await act(async () => { render(<ScannerScreen />); });

    // Wait for the useEffect network poll to set isOnline=false
    await act(async () => {
      await new Promise<void>((r) => setTimeout(r, 0));
    });

    await simulateScan('offline-qr-token');

    // Scan is queued, not sent to the API
    expect(mockEnqueueScann).toHaveBeenCalledWith({
      token:      'offline-qr-token',
      eventId:    'event-1',
      deviceInfo: 'EventMerge Staff App',
    });
    expect(mockApiPost).not.toHaveBeenCalled();

    await waitFor(() =>
      expect(screen.getByTestId('scan-result-code').props.children).toBe('QUEUED'),
    );
  });
});

describe('ScannerScreen — overlay auto-dismiss', () => {
  it('overlay auto-dismisses after 2500 ms', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    mockApiPost.mockResolvedValue({
      data: { data: { result: 'VALID', attendeeName: 'Prince' } },
    });

    await act(async () => { render(<ScannerScreen />); });

    // Simulate a valid scan — overlay appears
    await act(async () => {
      capturedScanRef.current?.({ data: 'tok' });
      // Let the async handler (Haptics + api.post) run
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(screen.getByTestId('scan-result-overlay')).toBeTruthy(),
    );

    // Advance past the mock ScanResultOverlay's 2500 ms auto-dismiss timer
    await act(async () => {
      vi.advanceTimersByTime(2_500);
    });

    // onDismiss has been called → scanResult set to null → overlay unmounts
    expect(screen.queryByTestId('scan-result-overlay')).toBeNull();
  });
});
