"use client";

import { useState, useCallback, useEffect } from "react";
import {
  saveHashList,
  getHashListCount,
  getLastSyncTime,
  type HashEntry,
} from "@/lib/offline/hashListDB";

interface SyncState {
  count: number;
  lastSynced: Date | null;
  syncing: boolean;
  error: string | null;
}

/**
 * Downloads the Gatekeeper's ticket hash list from the server and
 * persists it to IndexedDB for offline QR validation fallback.
 *
 * Auto-syncs on mount. Exposes `sync()` for manual refresh.
 */
export function useSyncHashList() {
  const [state, setState] = useState<SyncState>({
    count: 0,
    lastSynced: null,
    syncing: false,
    error: null,
  });

  const loadLocalState = useCallback(async () => {
    try {
      const [count, ts] = await Promise.all([getHashListCount(), getLastSyncTime()]);
      setState((prev) => ({
        ...prev,
        count,
        lastSynced: ts ? new Date(ts) : null,
      }));
    } catch {
      // IndexedDB not available (e.g. private browsing on some browsers)
    }
  }, []);

  const sync = useCallback(async () => {
    setState((prev) => ({ ...prev, syncing: true, error: null }));
    try {
      const response = await fetch("/api/gatekeeper/hash-list");
      if (!response.ok) {
        const { error } = await response.json();
        throw new Error(error || `HTTP ${response.status}`);
      }
      const { hashList, synced_at } = await response.json() as {
        hashList: HashEntry[];
        synced_at: number;
      };
      await saveHashList(hashList);
      setState({
        count: hashList.length,
        lastSynced: new Date(synced_at),
        syncing: false,
        error: null,
      });
    } catch (err) {
      const message = (err as Error).message || "Sync failed";
      setState((prev) => ({ ...prev, syncing: false, error: message }));
    }
  }, []);

  // Load persisted state on mount, then auto-sync if online
  useEffect(() => {
    loadLocalState().then(() => {
      if (navigator.onLine) sync();
    });
  }, [loadLocalState, sync]);

  return { ...state, sync };
}
