import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as SecureStore from 'expo-secure-store';

// ─── Mock expo-secure-store 
// setup.ts already mocks it globally, but we redefine here so we can spy on
// the exact calls made by this store (import after mock is in effect).

vi.mock('expo-secure-store', () => {
  const _store: Record<string, string> = {};
  return {
    getItemAsync:    vi.fn((k: string) => Promise.resolve(_store[k] ?? null)),
    setItemAsync:    vi.fn((k: string, v: string) => { _store[k] = v; return Promise.resolve(); }),
    deleteItemAsync: vi.fn((k: string) => { delete _store[k]; return Promise.resolve(); }),
  };
});

// ─── Import after mock 

import { useScannerStore } from '../store/scannerStore';

// ─── Helpers 

/** Flush one microtask tick — the Zustand persist middleware writes async. */
const flush = () => new Promise<void>((r) => setTimeout(r, 0));

function getState() {
  return useScannerStore.getState();
}

// ─── Tests 

describe('useScannerStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useScannerStore.setState({
      activeEventId:    null,
      activeEventTitle: null,
      queuedScans:      [],
      checkedInCount:   0,
      totalCount:       0,
      lastScanResult:   null,
    });
  });

  // ── Persisted fields 

  describe('setActiveEvent', () => {
    it('sets activeEventId and activeEventTitle', () => {
      getState().setActiveEvent('event-123', 'Lagos Tech Summit');
      const { activeEventId, activeEventTitle } = getState();
      expect(activeEventId).toBe('event-123');
      expect(activeEventTitle).toBe('Lagos Tech Summit');
    });

    it('persists the active event via SecureStore setItemAsync', async () => {
      getState().setActiveEvent('event-99', 'Test Event');
      await flush();
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
        'ef-scanner',
        expect.stringContaining('event-99'),
      );
    });
  });

  describe('clearActiveEvent', () => {
    it('resets activeEventId and activeEventTitle to null', () => {
      getState().setActiveEvent('event-1', 'Some Event');
      getState().clearActiveEvent();
      expect(getState().activeEventId).toBeNull();
      expect(getState().activeEventTitle).toBeNull();
    });

    it('persists the cleared state via SecureStore setItemAsync', async () => {
      getState().setActiveEvent('e1', 'E1');
      vi.clearAllMocks();
      getState().clearActiveEvent();
      await flush();
      expect(SecureStore.setItemAsync).toHaveBeenCalledOnce();
    });
  });

  // ── Session-only fields 

  describe('updateStats', () => {
    it('sets checkedInCount and totalCount', () => {
      getState().updateStats(42, 200);
      expect(getState().checkedInCount).toBe(42);
      expect(getState().totalCount).toBe(200);
    });

    it('does NOT include session fields in the persisted payload', async () => {
      getState().updateStats(42, 200);
      await flush();
      const storedRaw = (SecureStore.setItemAsync as ReturnType<typeof vi.fn>).mock.calls
        .map(([, v]) => v as string)
        .find(Boolean);
      if (storedRaw) {
        const parsed = JSON.parse(storedRaw) as { state: Record<string, unknown> };
        expect(parsed.state).not.toHaveProperty('checkedInCount');
        expect(parsed.state).not.toHaveProperty('totalCount');
      }
    });
  });

  describe('setLastScanResult', () => {
    it('sets lastScanResult to the given code', () => {
      getState().setLastScanResult('VALID');
      expect(getState().lastScanResult).toBe('VALID');
    });

    it('can be cleared by passing null', () => {
      getState().setLastScanResult('ALREADY_USED');
      getState().setLastScanResult(null);
      expect(getState().lastScanResult).toBeNull();
    });
  });

  // ── Queue actions 

  describe('enqueueScann', () => {
    it('appends a scan with generated id and queuedAt', () => {
      getState().enqueueScann({ token: 'qr-tok', eventId: 'ev-1' });
      const { queuedScans } = getState();
      expect(queuedScans).toHaveLength(1);
      expect(queuedScans[0].token).toBe('qr-tok');
      expect(queuedScans[0].eventId).toBe('ev-1');
      expect(queuedScans[0].id).toBeDefined();
      expect(queuedScans[0].queuedAt).toBeGreaterThan(0);
    });
  });

  describe('removeFromQueue', () => {
    it('removes the scan with the given id', () => {
      getState().enqueueScann({ token: 't1', eventId: 'e1' });
      getState().enqueueScann({ token: 't2', eventId: 'e2' });
      const idToRemove = getState().queuedScans[0].id;
      getState().removeFromQueue(idToRemove);
      expect(getState().queuedScans).toHaveLength(1);
      expect(getState().queuedScans[0].token).toBe('t2');
    });
  });

  describe('clearQueue', () => {
    it('empties the queuedScans array', () => {
      getState().enqueueScann({ token: 't', eventId: 'e' });
      getState().clearQueue();
      expect(getState().queuedScans).toHaveLength(0);
    });
  });
});
