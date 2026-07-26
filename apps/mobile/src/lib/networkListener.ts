import { AppState, DeviceEventEmitter } from 'react-native';
import type { AppStateStatus } from 'react-native';
import * as Network from 'expo-network';
import type { NetworkState } from 'expo-network';
import Toast from 'react-native-toast-message';
import { offlineQueue } from './offlineQueue';

// ─── Event keys 

/** Emitted after a successful offline→online sync — scanner and stats screens refresh. */
export const SCANNER_STATS_REFRESH = 'SCANNER_STATS_REFRESH';

/** Emitted by the stats screen "no event" CTA — scanner.tsx opens its event selector sheet. */
export const OPEN_EVENT_SELECTOR = 'OPEN_EVENT_SELECTOR';

// ─── Module state 
// expo-network v6 does not have addNetworkStateListener — poll every 5 s instead.

const POLL_MS = 5_000;

let pollInterval:       ReturnType<typeof setInterval> | null = null;
let appStateSubscription: ReturnType<typeof AppState.addEventListener> | null = null;
let prevOnline:         boolean | null = null;

// ─── Helpers 

/** Safely maps expo-network state to a boolean — treats `isInternetReachable: null` as online. */
function isOnlineState(state: NetworkState): boolean {
  return !!state.isConnected && state.isInternetReachable !== false;
}

/**
 * Sync the offline queue and show a toast.
 * Emits SCANNER_STATS_REFRESH so scanner + stats screens update their counts.
 */
async function handleReconnect(): Promise<void> {
  try {
    const { synced, failed } = await offlineQueue.syncAll();
    const hasPending = synced + failed > 0;

    if (hasPending) {
      const allOk = failed === 0;
      Toast.show({
        type:           allOk ? 'success' : 'error',
        text1:          'Back Online',
        text2:          allOk
          ? `Synced ${synced} queued scan${synced !== 1 ? 's' : ''}`
          : `Synced ${synced}, failed ${failed} — will retry`,
        visibilityTime: 4_000,
      });
    } else {
      Toast.show({ type: 'success', text1: 'Back Online', visibilityTime: 2_000 });
    }

    // Let the scanner and stats screens refresh their data
    DeviceEventEmitter.emit(SCANNER_STATS_REFRESH);
  } catch (err) {
    console.error('[networkListener] handleReconnect error:', err);
  }
}

/**
 * Called when the app returns to the foreground.
 * Handles the case where network connectivity was restored while the app was
 * backgrounded — the poll timer is paused by the OS, so the offline→online
 * transition may have been missed.
 */
async function handleForeground(): Promise<void> {
  try {
    const state    = await Network.getNetworkStateAsync();
    const isOnline = isOnlineState(state);
    if (!isOnline) return;

    const pending = await offlineQueue.getPendingCount();
    if (pending === 0) return;

    const { synced, failed } = await offlineQueue.syncAll();
    if (synced > 0) {
      Toast.show({
        type:           failed === 0 ? 'success' : 'error',
        text1:          'Synced offline scans',
        text2:          failed === 0
          ? `${synced} scan${synced !== 1 ? 's' : ''} uploaded`
          : `${synced} uploaded, ${failed} failed — will retry`,
        visibilityTime: 4_000,
      });
      DeviceEventEmitter.emit(SCANNER_STATS_REFRESH);
    }
  } catch (err) {
    console.error('[networkListener] handleForeground error:', err);
  }
}

/** Runs every POLL_MS — detects offline → online transitions. */
async function pollNetworkState(): Promise<void> {
  try {
    const state     = await Network.getNetworkStateAsync();
    const nowOnline = isOnlineState(state);

    if (prevOnline === false && nowOnline) {
      void handleReconnect();
    }

    prevOnline = nowOnline;
  } catch {
    // Swallow poll errors — next tick will retry
  }
}

// ─── Public API 

/**
 * Begin polling network state and watching app foreground transitions.
 * Call once in the root layout on mount.
 * Safe to call multiple times — re-entrant guard prevents duplicate timers.
 */
export function startNetworkListener(): void {
  if (pollInterval) return; // already started

  // Seed prevOnline immediately so the first poll has a baseline to compare against.
  void Network.getNetworkStateAsync()
    .then((state) => { prevOnline = isOnlineState(state); })
    .catch(()      => { prevOnline = true; }); // assume online when indeterminate

  pollInterval = setInterval(() => { void pollNetworkState(); }, POLL_MS);

  // Sync on foreground in case connectivity was restored while backgrounded
  appStateSubscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
    if (nextState === 'active') {
      void handleForeground();
    }
  });
}

/**
 * Stop polling, remove the foreground listener, and reset module state.
 * Call in the root layout cleanup (return value of useEffect).
 */
export function stopNetworkListener(): void {
  if (pollInterval) clearInterval(pollInterval);
  appStateSubscription?.remove();
  pollInterval         = null;
  appStateSubscription = null;
  prevOnline           = null;
}
