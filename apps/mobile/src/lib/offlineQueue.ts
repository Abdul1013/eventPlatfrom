import * as SQLite from 'expo-sqlite';
import { api } from './api';
import type { QueuedScan } from '@eventmerge/types';

// ─── Module-level DB instance 
// Initialised once by initQueue(); shared across all operations.
// Never call openDatabaseAsync outside initQueue — opening the same DB
// file twice creates separate connection objects and can corrupt WAL state.

let _db: SQLite.SQLiteDatabase | null = null;

function getDb(): SQLite.SQLiteDatabase {
  if (!_db) {
    throw new Error('[OfflineQueue] DB not initialised — call initQueue() first');
  }
  return _db;
}

// ─── Raw row shape (SQLite column names are snake_case) 

interface ScanQueueRow {
  id:         string;
  token:      string;
  event_id:   string;
  scanned_at: string;
  synced:     number; // 0 | 1
}

function rowToQueuedScan(row: ScanQueueRow): QueuedScan {
  return {
    id:        row.id,
    token:     row.token,
    eventId:   row.event_id,
    scannedAt: row.scanned_at,
    synced:    row.synced === 1,
  };
}

// ─── initQueue 

/**
 * Opens the SQLite database and bootstraps the scan_queue table + index.
 * Must be called once on app launch (app/_layout.tsx) before any queue
 * operations — all other functions call getDb() which throws if skipped.
 */
export async function initQueue(): Promise<void> {
  _db = await SQLite.openDatabaseAsync('ef_scan_queue.db');

  await _db.execAsync(`
    CREATE TABLE IF NOT EXISTS scan_queue (
      id         TEXT PRIMARY KEY,
      token      TEXT NOT NULL,
      event_id   TEXT NOT NULL,
      scanned_at TEXT NOT NULL,
      synced     INTEGER DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_scan_queue_synced ON scan_queue (synced);
  `);
}

// ─── offlineQueue 

export const offlineQueue = {
  /**
   * Persist a scan token locally so it can be flushed when connectivity returns.
   */
  enqueue: async (token: string, eventId: string): Promise<void> => {
    const id        = crypto.randomUUID();
    const scannedAt = new Date().toISOString();

    await getDb().runAsync(
      'INSERT INTO scan_queue (id, token, event_id, scanned_at, synced) VALUES (?, ?, ?, ?, 0)',
      [id, token, eventId, scannedAt],
    );

    console.debug(`[OfflineQueue] Enqueued scan ${id}`);
  },

  /**
   * Return all scans that have not yet been synced to the server, oldest first.
   */
  getPending: async (): Promise<QueuedScan[]> => {
    const rows = await getDb().getAllAsync<ScanQueueRow>(
      'SELECT * FROM scan_queue WHERE synced = 0 ORDER BY scanned_at ASC',
    );
    return rows.map(rowToQueuedScan);
  },

  /**
   * Mark a single scan as successfully synced.
   * Rows are soft-kept until clearSynced() runs after the full sync pass.
   */
  markSynced: async (id: string): Promise<void> => {
    await getDb().runAsync('UPDATE scan_queue SET synced = 1 WHERE id = ?', [id]);
  },

  /**
   * Flush all pending scans to the API sequentially (not concurrently —
   * avoids thundering-herd when reconnecting on a slow mobile connection).
   *
   * VALID, ALREADY_USED, and INVALID_TOKEN are all treated as conclusive
   * and marked synced. Only network errors or 5xx responses leave the
   * scan in the queue for a future retry.
   *
   * Calls clearSynced() at the end to prevent unbounded table growth.
   */
  syncAll: async (): Promise<{ synced: number; failed: number }> => {
    const pending = await offlineQueue.getPending();
    if (pending.length === 0) return { synced: 0, failed: 0 };

    let synced = 0;
    let failed = 0;

    for (const scan of pending) {
      try {
        await api.post('/checkin/scan', {
          token:      scan.token,
          deviceInfo: 'EventMerge Staff App (Offline Sync)',
        });
        await offlineQueue.markSynced(scan.id);
        synced++;
      } catch (err) {
        console.warn(`[OfflineQueue] Failed to sync scan ${scan.id}`, err);
        failed++;
      }
    }

    // Purge synced rows so the table stays small
    await offlineQueue.clearSynced();

    return { synced, failed };
  },

  /**
   * Count of scans waiting to be synced — used by OfflineBanner.
   */
  getPendingCount: async (): Promise<number> => {
    const row = await getDb().getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) AS count FROM scan_queue WHERE synced = 0',
    );
    return row?.count ?? 0;
  },

  /**
   * Hard-delete all synced rows.
   * Called automatically by syncAll() after each successful flush.
   */
  clearSynced: async (): Promise<void> => {
    const result = await getDb().runAsync('DELETE FROM scan_queue WHERE synced = 1');
    console.debug(`[OfflineQueue] Cleared ${result.changes} synced row(s)`);
  },
};
