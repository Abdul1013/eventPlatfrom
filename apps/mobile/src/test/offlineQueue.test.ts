import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as SQLite from 'expo-sqlite';

// ─── Hoisted mock objects
// vi.hoisted() runs before module imports so the factory can reference these.

const mockDb = vi.hoisted(() => ({
  execAsync:    vi.fn().mockResolvedValue(undefined),
  runAsync:     vi.fn().mockResolvedValue({ changes: 1, lastInsertRowId: 0 }),
  getAllAsync:   vi.fn().mockResolvedValue([]),
  getFirstAsync: vi.fn().mockResolvedValue({ count: 0 }),
}));

const mockApiPost = vi.hoisted(() => vi.fn().mockResolvedValue({ data: { result: 'VALID' } }));

// ─── Module mocks 

vi.mock('expo-sqlite', () => ({
  openDatabaseAsync: vi.fn().mockImplementation(() => Promise.resolve(mockDb)),
}));

vi.mock('../lib/api', () => ({
  api: { post: mockApiPost },
}));

// ─── Import after mocks are in place 

import { initQueue, offlineQueue } from '../lib/offlineQueue';

// ─── Helpers 

const makeRow = (overrides: Partial<{
  id: string; token: string; event_id: string; scanned_at: string; synced: number;
}> = {}) => ({
  id:         'scan-1',
  token:      'tok-abc',
  event_id:   'event-1',
  scanned_at: '2026-03-01T10:00:00.000Z',
  synced:     0,
  ...overrides,
});

// ─── Tests 

describe('initQueue', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Re-configure mock return values after clearing
    mockDb.execAsync.mockResolvedValue(undefined);
    mockDb.runAsync.mockResolvedValue({ changes: 1, lastInsertRowId: 0 });
    mockDb.getAllAsync.mockResolvedValue([]);
    mockDb.getFirstAsync.mockResolvedValue({ count: 0 });
    (SQLite.openDatabaseAsync as ReturnType<typeof vi.fn>).mockResolvedValue(mockDb);

    await initQueue();
  });

  it('calls openDatabaseAsync with the correct db name', () => {
    expect(SQLite.openDatabaseAsync).toHaveBeenCalledWith('ef_scan_queue.db');
  });

  it('creates the scan_queue table', () => {
    const sql: string = mockDb.execAsync.mock.calls[0][0];
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS scan_queue');
    expect(sql).toContain('id         TEXT PRIMARY KEY');
    expect(sql).toContain('synced     INTEGER DEFAULT 0');
  });

  it('creates the synced index', () => {
    const sql: string = mockDb.execAsync.mock.calls[0][0];
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS idx_scan_queue_synced');
  });
});

describe('enqueue', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockDb.runAsync.mockResolvedValue({ changes: 1, lastInsertRowId: 0 });
    (SQLite.openDatabaseAsync as ReturnType<typeof vi.fn>).mockResolvedValue(mockDb);
    await initQueue();
    vi.clearAllMocks(); // clear initQueue's execAsync call from counts
  });

  it('inserts a row with the correct token and eventId', async () => {
    await offlineQueue.enqueue('qr-token-xyz', 'event-42');

    expect(mockDb.runAsync).toHaveBeenCalledOnce();
    const [sql, params] = mockDb.runAsync.mock.calls[0] as [string, string[]];
    expect(sql).toContain('INSERT INTO scan_queue');
    expect(params[1]).toBe('qr-token-xyz');   // token column
    expect(params[2]).toBe('event-42');        // event_id column
  });

  it('generates a UUID for the id and a valid ISO scanned_at', async () => {
    await offlineQueue.enqueue('tok', 'ev');

    const params = mockDb.runAsync.mock.calls[0][1] as string[];
    // UUID v4 pattern
    expect(params[0]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    // Valid ISO date
    expect(() => new Date(params[3]).toISOString()).not.toThrow();
  });
});

describe('getPending', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    (SQLite.openDatabaseAsync as ReturnType<typeof vi.fn>).mockResolvedValue(mockDb);
    await initQueue();
    vi.clearAllMocks();
  });

  it('returns an empty array when no pending scans exist', async () => {
    mockDb.getAllAsync.mockResolvedValue([]);
    const result = await offlineQueue.getPending();
    expect(result).toEqual([]);
  });

  it('maps snake_case rows to camelCase QueuedScan objects', async () => {
    const row = makeRow();
    mockDb.getAllAsync.mockResolvedValue([row]);

    const result = await offlineQueue.getPending();

    expect(result).toEqual([{
      id:        row.id,
      token:     row.token,
      eventId:   row.event_id,
      scannedAt: row.scanned_at,
      synced:    false,
    }]);
  });

  it('marks synced = true when db row has synced = 1', async () => {
    mockDb.getAllAsync.mockResolvedValue([makeRow({ synced: 1 })]);
    const [scan] = await offlineQueue.getPending();
    expect(scan.synced).toBe(true);
  });

  it('queries only un-synced rows ordered by scanned_at ASC', () => {
    const [sql] = mockDb.getAllAsync.mock.calls[0] ?? [''];
    if (sql) {
      expect(sql).toContain('WHERE synced = 0');
      expect(sql).toContain('ORDER BY scanned_at ASC');
    }
  });
});

describe('getPendingCount', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    (SQLite.openDatabaseAsync as ReturnType<typeof vi.fn>).mockResolvedValue(mockDb);
    await initQueue();
    vi.clearAllMocks();
  });

  it('returns the numeric count from COUNT(*) result', async () => {
    mockDb.getFirstAsync.mockResolvedValue({ count: 7 });
    const count = await offlineQueue.getPendingCount();
    expect(count).toBe(7);
  });

  it('returns 0 when getFirstAsync returns null', async () => {
    mockDb.getFirstAsync.mockResolvedValue(null);
    const count = await offlineQueue.getPendingCount();
    expect(count).toBe(0);
  });
});

describe('markSynced', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockDb.runAsync.mockResolvedValue({ changes: 1, lastInsertRowId: 0 });
    (SQLite.openDatabaseAsync as ReturnType<typeof vi.fn>).mockResolvedValue(mockDb);
    await initQueue();
    vi.clearAllMocks();
  });

  it('executes UPDATE … SET synced = 1 with the correct id', async () => {
    await offlineQueue.markSynced('scan-abc');

    expect(mockDb.runAsync).toHaveBeenCalledOnce();
    const [sql, params] = mockDb.runAsync.mock.calls[0] as [string, [string]];
    expect(sql).toContain('UPDATE scan_queue SET synced = 1');
    expect(params[0]).toBe('scan-abc');
  });
});

describe('syncAll', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockDb.runAsync.mockResolvedValue({ changes: 0, lastInsertRowId: 0 });
    mockApiPost.mockResolvedValue({ data: { result: 'VALID' } });
    (SQLite.openDatabaseAsync as ReturnType<typeof vi.fn>).mockResolvedValue(mockDb);
    await initQueue();
    vi.clearAllMocks();
    mockDb.runAsync.mockResolvedValue({ changes: 0, lastInsertRowId: 0 });
  });

  it('returns { synced: 0, failed: 0 } immediately when queue is empty', async () => {
    mockDb.getAllAsync.mockResolvedValue([]);
    const result = await offlineQueue.syncAll();
    expect(result).toEqual({ synced: 0, failed: 0 });
    expect(mockApiPost).not.toHaveBeenCalled();
  });

  it('syncs 3 scans successfully: returns { synced: 3, failed: 0 }', async () => {
    const rows = [makeRow({ id: 's1' }), makeRow({ id: 's2' }), makeRow({ id: 's3' })];
    mockDb.getAllAsync.mockResolvedValue(rows);

    const result = await offlineQueue.syncAll();

    expect(result).toEqual({ synced: 3, failed: 0 });
    expect(mockApiPost).toHaveBeenCalledTimes(3);

    // 3× markSynced (UPDATE) + 1× clearSynced (DELETE)
    const updateCalls = mockDb.runAsync.mock.calls.filter(
      ([sql]) => (sql as string).includes('UPDATE'),
    );
    const deleteCalls = mockDb.runAsync.mock.calls.filter(
      ([sql]) => (sql as string).includes('DELETE'),
    );
    expect(updateCalls).toHaveLength(3);
    expect(deleteCalls).toHaveLength(1);
  });

  it('partial failure: 1 success + 1 network error → { synced: 1, failed: 1 }', async () => {
    mockDb.getAllAsync.mockResolvedValue([makeRow({ id: 'ok' }), makeRow({ id: 'fail' })]);
    mockApiPost
      .mockResolvedValueOnce({ data: { result: 'VALID' } })
      .mockRejectedValueOnce(new Error('Network Error'));

    const result = await offlineQueue.syncAll();

    expect(result).toEqual({ synced: 1, failed: 1 });
    // markSynced called only for the successful scan
    const updateCalls = mockDb.runAsync.mock.calls.filter(
      ([sql]) => (sql as string).includes('UPDATE'),
    );
    expect(updateCalls).toHaveLength(1);
  });

  it('always calls clearSynced after a non-empty sync run', async () => {
    mockDb.getAllAsync.mockResolvedValue([makeRow()]);
    await offlineQueue.syncAll();

    const deleteCalls = mockDb.runAsync.mock.calls.filter(
      ([sql]) => (sql as string).includes('DELETE'),
    );
    expect(deleteCalls).toHaveLength(1);
  });
});

describe('clearSynced', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockDb.runAsync.mockResolvedValue({ changes: 5, lastInsertRowId: 0 });
    (SQLite.openDatabaseAsync as ReturnType<typeof vi.fn>).mockResolvedValue(mockDb);
    await initQueue();
    vi.clearAllMocks();
    mockDb.runAsync.mockResolvedValue({ changes: 5, lastInsertRowId: 0 });
  });

  it('executes DELETE FROM scan_queue WHERE synced = 1', async () => {
    await offlineQueue.clearSynced();

    expect(mockDb.runAsync).toHaveBeenCalledOnce();
    const [sql] = mockDb.runAsync.mock.calls[0] as [string];
    expect(sql).toContain('DELETE FROM scan_queue WHERE synced = 1');
  });
});
