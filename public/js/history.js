/**
 * QA-HISTORY-001 | Local-only IndexedDB interaction history.
 *
 * Stores imported transcripts, findings, evidence and rubric snapshots
 * on this browser/device. No server-side synchronisation or encryption.
 * Do not use personal customer data without applicable approvals.
 *
 * Editing this module impacts deduplication and persistence only.
 */
const DATABASE = "qualis-local-history";
const STORE = "interactions";
const VERSION = 1;

function open() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(Error("Browser storage is unavailable."));
      return;
    }
    const req = indexedDB.open(DATABASE, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || Error("Could not open local history."));
    req.onblocked = () => reject(Error("Local history is blocked by another browser tab."));
  });
}

async function transaction(kind, work) {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, kind);
      const store = tx.objectStore(STORE);
      let value;
      try { value = work(store); } catch (error) { reject(error); tx.abort(); return; }
      tx.oncomplete = () => resolve(value);
      tx.onerror = () => reject(tx.error || Error("Could not save Qualis history."));
      tx.onabort = () => reject(tx.error || Error("Qualis history transaction aborted."));
    });
  } finally {
    db.close();
  }
}

export async function loadHistory() {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error || Error("Could not read Qualis history."));
    });
  } finally {
    db.close();
  }
}

export async function saveHistory(calls) {
  // One transaction makes a batch import atomic. Each call is a separate row.
  await transaction("readwrite", store => {
    for (const c of calls) store.put(c);
  });
}

function hash(text) {
  // Two 32-bit fingerprints reduce collisions for ID-less transcripts.
  let a = 2166136261, b = 2654435761;
  for (let i = 0; i < text.length; i++) {
    const x = text.charCodeAt(i);
    a = Math.imul(a ^ x, 16777619);
    b = Math.imul(b ^ (x + i), 2246822519);
  }
  return (a >>> 0).toString(16) + "-" + (b >>> 0).toString(16);
}

function stableKey(call) {
  const id = String(call.id || "").trim();
  if (id && !/^(text-\d+|manual-\d+|csv-1|json-\d+)$/i.test(id)) {
    return "interaction:" + id.toLowerCase();
  }
  return "transcript:" + hash(JSON.stringify({
    start: call.start || "",
    agent: call.agent || "",
    turns: call.turns.map(t => [t.speaker, t.timestamp, t.text])
  }));
}

/**
 * QA-HISTORY-MERGE-001
 * Keeps historical completed scores on reupload and ignores duplicates.
 * All newly imported calls get keys stable across browser sessions.
 */
export function mergeImported(previous, imported) {
  const byKey = new Map(previous.map(c => [c.key, c]));
  let skipped = 0, added = 0, alreadyKnown = 0;
  const now = new Date().toISOString();
  for (const c of imported) {
    if (c.status === "DUPLICATE") { skipped++; continue; }
    c.key = stableKey(c);
    const prior = byKey.get(c.key);
    if (prior) {
      alreadyKnown++;
      // Reimporting a previously evaluated call does not erase its result.
      // If the prior record was incomplete, restore fresh dialogue for retry.
      if (prior.status !== "COMPLETE") {
        byKey.set(c.key, { ...c, importedAt: prior.importedAt || now });
      }
    } else {
      added++;
      byKey.set(c.key, { ...c, importedAt: now });
    }
  }
  return { calls: [...byKey.values()], added, skipped, alreadyKnown };
}

/** Clear stored assessments, e.g. after the demonstration on a shared device. */
export async function clearHistory() {
  await transaction("readwrite", store => store.clear());
}
