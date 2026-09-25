import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ─── Hoisted mock state 

const mockSyncAll        = vi.hoisted(() => vi.fn().mockResolvedValue({ synced: 0, failed: 0 }));
const mockGetPendingCount = vi.hoisted(() => vi.fn().mockResolvedValue(0));
const mockGetNetworkState = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ isConnected: true, isInternetReachable: true }),
);
const mockToastShow      = vi.hoisted(() => vi.fn());
const mockEmit           = vi.hoisted(() => vi.fn());
const mockAppStateAdd    = vi.hoisted(() => vi.fn().mockReturnValue({ remove: vi.fn() }));

// ─── Module mocks

vi.mock('../lib/offlineQueue', () => ({
  offlineQueue: {
    syncAll:         mockSyncAll,
    getPendingCount: mockGetPendingCount,
  },
}));

vi.mock('expo-network', () => ({
  getNetworkStateAsync: mockGetNetworkState,
}));

vi.mock('react-native', () => ({
  DeviceEventEmitter: { emit: mockEmit },
  AppState:           { addEventListener: mockAppStateAdd },
}));

vi.mock('react-native-toast-message', () => ({
  default: { show: mockToastShow },
}));

// ─── Import under test 

import { startNetworkListener, stopNetworkListener, SCANNER_STATS_REFRESH } from '../lib/networkListener';

// ─── Helpers 

const POLL_MS = 5_000;

/** Seed prevOnline and flush the initial getNetworkStateAsync microtask. */
async function seedAndFlush() {
  await Promise.resolve();
  await Promise.resolve(); // two ticks — covers any chained .then() inside startNetworkListener
}

// ─── Tests 

describe('startNetworkListener', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockSyncAll.mockResolvedValue({ synced: 0, failed: 0 });
    mockGetPendingCount.mockResolvedValue(0);
    mockGetNetworkState.mockResolvedValue({ isConnected: true, isInternetReachable: true });
    mockAppStateAdd.mockReturnValue({ remove: vi.fn() });
  });

  afterEach(() => {
    stopNetworkListener();
    vi.useRealTimers();
  });

  it('seeds prevOnline by calling getNetworkStateAsync on start', async () => {
    startNetworkListener();
    await seedAndFlush();
    expect(mockGetNetworkState).toHaveBeenCalledOnce();
  });

  it('polls getNetworkStateAsync after POLL_MS elapses', async () => {
    startNetworkListener();
    await seedAndFlush();
    vi.clearAllMocks();

    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(mockGetNetworkState).toHaveBeenCalledOnce();
  });

  it('does NOT call syncAll on an online→online transition', async () => {
    // Both seed and poll return online
    mockGetNetworkState.mockResolvedValue({ isConnected: true, isInternetReachable: true });
    startNetworkListener();
    await seedAndFlush();

    await vi.advanceTimersByTimeAsync(POLL_MS);
    await seedAndFlush();

    expect(mockSyncAll).not.toHaveBeenCalled();
  });

  it('calls syncAll on an offline→online transition', async () => {
    // Seed as offline
    mockGetNetworkState.mockResolvedValueOnce({ isConnected: false, isInternetReachable: false });
    startNetworkListener();
    await seedAndFlush(); // prevOnline = false

    // Poll returns online
    mockGetNetworkState.mockResolvedValue({ isConnected: true, isInternetReachable: true });
    await vi.advanceTimersByTimeAsync(POLL_MS);
    await seedAndFlush(); // handleReconnect fires → syncAll

    expect(mockSyncAll).toHaveBeenCalledOnce();
  });

  it('shows Toast with synced count when syncAll returns synced > 0', async () => {
    mockSyncAll.mockResolvedValue({ synced: 3, failed: 0 });
    // Seed offline, poll online
    mockGetNetworkState
      .mockResolvedValueOnce({ isConnected: false, isInternetReachable: false })
      .mockResolvedValue({ isConnected: true, isInternetReachable: true });

    startNetworkListener();
    await seedAndFlush();
    await vi.advanceTimersByTimeAsync(POLL_MS);
    await seedAndFlush();

    expect(mockToastShow).toHaveBeenCalledOnce();
    const call = mockToastShow.mock.calls[0][0] as { type: string; text2: string };
    expect(call.type).toBe('success');
    expect(call.text2).toContain('3');
  });

  it('does NOT show Toast when syncAll returns { synced: 0, failed: 0 }', async () => {
    mockSyncAll.mockResolvedValue({ synced: 0, failed: 0 });
    // Seed offline, poll online
    mockGetNetworkState
      .mockResolvedValueOnce({ isConnected: false, isInternetReachable: false })
      .mockResolvedValue({ isConnected: true, isInternetReachable: true });

    startNetworkListener();
    await seedAndFlush();
    await vi.advanceTimersByTimeAsync(POLL_MS);
    await seedAndFlush();

    // Toast IS shown (the "Back Online" toast) — but with no text2 about scans
    // The zero-pending branch shows a simple "Back Online" toast with no synced count
    const call = mockToastShow.mock.calls[0]?.[0] as { text2?: string } | undefined;
    expect(call?.text2).toBeUndefined();
  });

  it('emits SCANNER_STATS_REFRESH after a successful reconnect', async () => {
    mockSyncAll.mockResolvedValue({ synced: 2, failed: 0 });
    mockGetNetworkState
      .mockResolvedValueOnce({ isConnected: false, isInternetReachable: false })
      .mockResolvedValue({ isConnected: true, isInternetReachable: true });

    startNetworkListener();
    await seedAndFlush();
    await vi.advanceTimersByTimeAsync(POLL_MS);
    await seedAndFlush();

    expect(mockEmit).toHaveBeenCalledWith(SCANNER_STATS_REFRESH);
  });
});

describe('stopNetworkListener', () => {
  it('is safe to call before startNetworkListener', () => {
    expect(() => stopNetworkListener()).not.toThrow();
  });

  it('stops the poll interval so subsequent ticks do not call getNetworkStateAsync', async () => {
    vi.useFakeTimers();
    startNetworkListener();
    await seedAndFlush();
    stopNetworkListener();
    vi.clearAllMocks();

    await vi.advanceTimersByTimeAsync(POLL_MS * 3);
    expect(mockGetNetworkState).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
