import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import * as SecureStore from 'expo-secure-store';
import type { ScanResultCode } from '@eventmerge/types';

// ─── Secure storage adapter (mirrors authStore pattern) ───────────────────────

const secureStorage = createJSONStorage(() => ({
  getItem: (name: string) => SecureStore.getItemAsync(name),
  setItem: (name: string, value: string) => SecureStore.setItemAsync(name, value),
  removeItem: (name: string) => SecureStore.deleteItemAsync(name),
}));

// ─── Types 
export interface QueuedScan {
  id: string;          // client-generated UUID for deduplication
  token: string;       // raw QR token string
  eventId: string;
  deviceInfo?: string;
  queuedAt: number;    // Date.now() timestamp
}

interface ScannerState {
  // ── Persisted (survives app restarts) 
  /** The event currently being checked in for. */
  activeEventId: string | null;
  activeEventTitle: string | null;
  /** Offline scan queue — flushed by the sync service when connectivity returns. */
  queuedScans: QueuedScan[];

  // ── Session-only (reset to defaults on each app launch) 
  checkedInCount: number;
  totalCount: number;
  lastScanResult: ScanResultCode | null;

  // ── Actions 
  setActiveEvent: (id: string, title: string) => void;
  clearActiveEvent: () => void;
  updateStats: (checkedIn: number, total: number) => void;
  setLastScanResult: (result: ScanResultCode | null) => void;
  enqueueScann: (scan: Omit<QueuedScan, 'id' | 'queuedAt'>) => void;
  removeFromQueue: (id: string) => void;
  clearQueue: () => void;
}

// ─── Store 

export const useScannerStore = create<ScannerState>()(
  persist(
    (set) => ({
      activeEventId: null,
      activeEventTitle: null,
      queuedScans: [],

      // Session fields — always start fresh
      checkedInCount: 0,
      totalCount: 0,
      lastScanResult: null,

      setActiveEvent: (id, title) => set({ activeEventId: id, activeEventTitle: title }),
      clearActiveEvent: () => set({ activeEventId: null, activeEventTitle: null }),

      updateStats: (checkedIn, total) =>
        set({ checkedInCount: checkedIn, totalCount: total }),

      setLastScanResult: (result) => set({ lastScanResult: result }),

      enqueueScann: (scan) =>
        set((state) => ({
          queuedScans: [
            ...state.queuedScans,
            { ...scan, id: Math.random().toString(36).slice(2), queuedAt: Date.now() },
          ],
        })),

      removeFromQueue: (id) =>
        set((state) => ({
          queuedScans: state.queuedScans.filter((s) => s.id !== id),
        })),

      clearQueue: () => set({ queuedScans: [] }),
    }),
    {
      name: 'ef-scanner',
      storage: secureStorage,
      // Only persist active event identity and offline queue.
      // checkedInCount, totalCount, lastScanResult are session-only — not included.
      partialize: (s) => ({
        activeEventId: s.activeEventId,
        activeEventTitle: s.activeEventTitle,
        queuedScans: s.queuedScans,
      }),
    },
  ),
);
