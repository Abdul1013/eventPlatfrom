/**
 * IndexedDB wrapper for the Gatekeeper offline hash list.
 *
 * Stores the set of ACTIVE ticket IDs for the current day so the scanner
 * can do a basic existence check when the network is unavailable.
 *
 * DB schema:
 *   database : "truffle-gatekeeper"
 *   store    : "ticket_hashes"  (keyPath: "ticket_id")
 *   record   : { ticket_id: string; event_title: string; synced_at: number }
 *
 * "offline_scans" store tracks tickets admitted while offline so they can
 * be reconciled with the server on reconnect.
 *   record   : { ticket_id: string; admitted_at: number; outcome: string }
 */

const DB_NAME = "truffle-gatekeeper";
const DB_VERSION = 1;
const HASH_STORE = "ticket_hashes";
const OFFLINE_SCAN_STORE = "offline_scans";

export interface HashEntry {
  ticket_id: string;
  event_title: string;
  synced_at: number;
}

export interface OfflineScan {
  ticket_id: string;
  admitted_at: number;
  outcome: "valid_offline" | "duplicate_offline";
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(HASH_STORE)) {
        db.createObjectStore(HASH_STORE, { keyPath: "ticket_id" });
      }
      if (!db.objectStoreNames.contains(OFFLINE_SCAN_STORE)) {
        db.createObjectStore(OFFLINE_SCAN_STORE, { keyPath: "ticket_id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Replace the entire hash list with a fresh batch from the server. */
export async function saveHashList(entries: HashEntry[]): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(HASH_STORE, "readwrite");
  const store = tx.objectStore(HASH_STORE);
  store.clear();
  for (const entry of entries) {
    store.put(entry);
  }
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Return true if this ticket_id exists in the hash list. */
export async function hasTicketInHashList(ticketId: string): Promise<boolean> {
  const db = await openDB();
  const tx = db.transaction(HASH_STORE, "readonly");
  const store = tx.objectStore(HASH_STORE);
  return new Promise((resolve, reject) => {
    const req = store.get(ticketId);
    req.onsuccess = () => resolve(req.result !== undefined);
    req.onerror = () => reject(req.error);
  });
}

/** Count records in the hash list (for UI display). */
export async function getHashListCount(): Promise<number> {
  const db = await openDB();
  const tx = db.transaction(HASH_STORE, "readonly");
  return new Promise((resolve, reject) => {
    const req = tx.objectStore(HASH_STORE).count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Timestamp of the most recent sync (or null if never synced). */
export async function getLastSyncTime(): Promise<number | null> {
  const db = await openDB();
  const tx = db.transaction(HASH_STORE, "readonly");
  return new Promise((resolve, reject) => {
    const req = tx.objectStore(HASH_STORE).openCursor(null, "prev");
    req.onsuccess = () => resolve(req.result?.value?.synced_at ?? null);
    req.onerror = () => reject(req.error);
  });
}

/** Log an offline-admitted scan for later server reconciliation. */
export async function logOfflineScan(scan: OfflineScan): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(OFFLINE_SCAN_STORE, "readwrite");
  tx.objectStore(OFFLINE_SCAN_STORE).put(scan);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Check if a ticket was already admitted in an offline session. */
export async function hasOfflineScan(ticketId: string): Promise<boolean> {
  const db = await openDB();
  const tx = db.transaction(OFFLINE_SCAN_STORE, "readonly");
  return new Promise((resolve, reject) => {
    const req = tx.objectStore(OFFLINE_SCAN_STORE).get(ticketId);
    req.onsuccess = () => resolve(req.result !== undefined);
    req.onerror = () => reject(req.error);
  });
}

/** Drain and return all offline scans pending server sync. */
export async function flushOfflineScans(): Promise<OfflineScan[]> {
  const db = await openDB();
  const tx = db.transaction(OFFLINE_SCAN_STORE, "readwrite");
  const store = tx.objectStore(OFFLINE_SCAN_STORE);
  return new Promise((resolve, reject) => {
    const items: OfflineScan[] = [];
    const req = store.openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        items.push(cursor.value);
        cursor.delete();
        cursor.continue();
      } else {
        resolve(items);
      }
    };
    req.onerror = () => reject(req.error);
  });
}
