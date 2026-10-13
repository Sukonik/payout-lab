// Local persistence ("remember on this device"). A convenience, never a backup: browsers can clear site data.
// Backends are tried in order: IndexedDB, localStorage, memory. Memory means nothing is remembered; packets still work.
const LS_PREFIX = "payoutlab.v2:";
export const LEGACY_KEY = "payoutlab.v1";
const MAX_BACKUPS = 5;

export function memoryBackend() {
  const m = new Map();
  return { kind: "memory", persistent: false, async get(k) { return m.has(k) ? structuredCloneSafe(m.get(k)) : undefined; }, async set(k, v) { m.set(k, structuredCloneSafe(v)); }, async del(k) { m.delete(k); }, async keys() { return [...m.keys()]; } };
}

function structuredCloneSafe(v) { return v === undefined ? v : JSON.parse(JSON.stringify(v)); }

export function localStorageBackend(storage = globalThis.localStorage) {
  try {
    if (!storage) return null;
    const probe = `${LS_PREFIX}__probe`;
    storage.setItem(probe, "1"); storage.removeItem(probe);
  } catch { return null; }
  return {
    kind: "localstorage", persistent: true,
    async get(k) { const r = storage.getItem(LS_PREFIX + k); return r === null ? undefined : JSON.parse(r); },
    async set(k, v) { storage.setItem(LS_PREFIX + k, JSON.stringify(v)); },
    async del(k) { storage.removeItem(LS_PREFIX + k); },
    async keys() { const out = []; for (let i = 0; i < storage.length; i++) { const k = storage.key(i); if (k && k.startsWith(LS_PREFIX)) out.push(k.slice(LS_PREFIX.length)); } return out; },
  };
}

export async function idbBackend(factory = globalThis.indexedDB, name = "payoutlab") {
  if (!factory) return null;
  let db;
  try {
    db = await new Promise((resolve, reject) => {
      const req = factory.open(name, 1);
      req.onupgradeneeded = () => req.result.createObjectStore("kv");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error("blocked"));
    });
    // Probe: some private modes open the database but fail on write.
    await tx(db, "readwrite", (s) => s.put(1, "__probe"));
    await tx(db, "readwrite", (s) => s.delete("__probe"));
  } catch { return null; }
  return {
    kind: "indexeddb", persistent: true,
    get: (k) => tx(db, "readonly", (s) => s.get(k)),
    set: (k, v) => tx(db, "readwrite", (s) => s.put(v, k)),
    del: (k) => tx(db, "readwrite", (s) => s.delete(k)),
    keys: () => tx(db, "readonly", (s) => s.getAllKeys()),
  };
}

function tx(db, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction("kv", mode);
    const req = fn(t.objectStore("kv"));
    t.oncomplete = () => resolve(req.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error("aborted"));
  });
}

export async function openStore({ backends } = {}) {
  const list = backends ?? [await idbBackend(), localStorageBackend()];
  const backend = list.find(Boolean) ?? memoryBackend();
  return new Store(backend);
}

export class Store {
  constructor(backend) { this.backend = backend; }
  get kind() { return this.backend.kind; }
  get persistent() { return this.backend.persistent; }

  async list() {
    const out = [];
    for (const k of await this.backend.keys()) {
      if (!k.startsWith("p:")) continue;
      const rec = await this.backend.get(k);
      if (!rec?.packet) continue;
      out.push({ id: rec.packet.portfolioId, name: rec.packet.portfolioName, holdings: rec.packet.holdings.length, savedAt: rec.packet.savedAt, revisionId: rec.packet.revisionId, ...rec.meta });
    }
    return out.sort((a, b) => String(b.lastEditedAt || b.savedAt).localeCompare(String(a.lastEditedAt || a.savedAt)));
  }
  async load(id) { return (await this.backend.get(`p:${id}`)) ?? null; }
  async save(packet, meta = {}) {
    const prev = await this.load(packet.portfolioId);
    await this.backend.set(`p:${packet.portfolioId}`, { packet, meta: { ...(prev?.meta || {}), ...meta } });
  }
  async remove(id) { await this.backend.del(`p:${id}`); await this.backend.del(`b:${id}`); }

  async getApp() { return (await this.backend.get("app")) ?? {}; }
  async setApp(patch) { await this.backend.set("app", { ...(await this.getApp()), ...patch }); }

  // Keep the last few replaced versions so an import or CSV update never destroys local work.
  async backup(packet, reason, at = new Date().toISOString()) {
    const key = `b:${packet.portfolioId}`;
    const cur = (await this.backend.get(key)) ?? [];
    cur.unshift({ at, reason, packet });
    await this.backend.set(key, cur.slice(0, MAX_BACKUPS));
  }
  async backups(id) { return (await this.backend.get(`b:${id}`)) ?? []; }
}
