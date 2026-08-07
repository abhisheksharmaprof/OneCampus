/**
 * Local persistence layer for the standalone app.
 *
 * The artifact prototype used Anthropic's `window.storage` API, which
 * only exists inside claude.ai. A deployed, standalone app has no
 * backend, so this module replaces it with IndexedDB — the standard
 * browser database for structured, sizeable client-side data (far more
 * headroom than localStorage's ~5-10MB string-only limit, and async so
 * it never blocks the UI thread).
 *
 * The public API intentionally mirrors what App.jsx already expects
 * (get/set/delete/list), so the rest of the app didn't need to change
 * shape — only the implementation underneath it did.
 */

const DB_NAME = "timetable-builder";
const DB_VERSION = 1;
const STORE_NAME = "kv";

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("This browser doesn't support IndexedDB, so data can't be saved locally."));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("IndexedDB upgrade was blocked by another open tab."));
  });
  return dbPromise;
}

function runTransaction(mode, work) {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, mode);
        const store = tx.objectStore(STORE_NAME);
        let result;
        const request = work(store);
        request.onsuccess = () => {
          result = request.result;
        };
        request.onerror = () => reject(request.error);
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error("Storage transaction aborted."));
      })
  );
}

export const storage = {
  /** Returns { key, value } or null if the key doesn't exist. */
  async get(key) {
    const value = await runTransaction("readonly", (store) => store.get(key));
    return value === undefined ? null : { key, value };
  },

  /** Stores any structured-cloneable value (objects, arrays, etc. — no JSON stringify needed). */
  async set(key, value) {
    await runTransaction("readwrite", (store) => store.put(value, key));
    return { key, value };
  },

  async delete(key) {
    await runTransaction("readwrite", (store) => store.delete(key));
    return { key, deleted: true };
  },

  /** Returns { keys } — all keys, optionally filtered by prefix. */
  async list(prefix = "") {
    const keys = await runTransaction("readonly", (store) => store.getAllKeys());
    return { keys: (keys || []).filter((k) => String(k).startsWith(prefix)) };
  },
};
