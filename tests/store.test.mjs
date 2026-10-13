import test from "node:test";
import assert from "node:assert/strict";
import { Store, memoryBackend, localStorageBackend, openStore } from "../js/core/store.js";
import { nextRevision } from "../js/core/packet.js";
import { samplePacket } from "./helpers.mjs";

function fakeStorage({ failWrites = false } = {}) {
  const m = new Map();
  return {
    get length() { return m.size; }, key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { if (failWrites) throw new DOMException("denied", "SecurityError"); m.set(k, String(v)); },
    removeItem: (k) => m.delete(k),
  };
}

test("save, list, load and remove keep portfolios distinct", async () => {
  const s = new Store(memoryBackend());
  const a = samplePacket(), b = samplePacket();
  b.portfolioName = "Second";
  await s.save(a, { lastEditedAt: "2026-10-13T10:00:00Z" });
  await s.save(b, { lastEditedAt: "2026-10-13T11:00:00Z" });
  const list = await s.list();
  assert.deepEqual(list.map((x) => x.name), ["Second", "Test portfolio"], "most recently edited first");
  assert.equal((await s.load(a.portfolioId)).packet.portfolioName, "Test portfolio");
  await s.remove(a.portfolioId);
  assert.equal(await s.load(a.portfolioId), null);
  assert.equal((await s.list()).length, 1);
});

test("meta is merged, so exporting does not erase the last-edited time", async () => {
  const s = new Store(memoryBackend());
  const p = samplePacket();
  await s.save(p, { lastEditedAt: "t1" });
  await s.save(p, { lastExportedAt: "t2", lastExportedRevisionId: p.revisionId });
  const { meta } = await s.load(p.portfolioId);
  assert.equal(meta.lastEditedAt, "t1");
  assert.equal(meta.lastExportedRevisionId, p.revisionId);
});

test("backups keep the last five replaced versions, newest first", async () => {
  const s = new Store(memoryBackend());
  let p = samplePacket();
  for (let i = 0; i < 7; i++) { await s.backup(p, `r${i}`); p = nextRevision(p); }
  const b = await s.backups(p.portfolioId);
  assert.equal(b.length, 5);
  assert.deepEqual(b.map((x) => x.reason), ["r6", "r5", "r4", "r3", "r2"]);
});

test("app preferences persist and merge", async () => {
  const s = new Store(memoryBackend());
  await s.setApp({ lastActiveId: "pf_x" });
  await s.setApp({ remember: false });
  assert.deepEqual(await s.getApp(), { lastActiveId: "pf_x", remember: false });
});

test("localStorage backend round-trips and is skipped when storage is denied", async () => {
  const good = localStorageBackend(fakeStorage());
  assert.equal(good.kind, "localstorage");
  const s = new Store(good);
  const p = samplePacket();
  await s.save(p);
  assert.equal((await s.load(p.portfolioId)).packet.portfolioId, p.portfolioId);
  assert.equal(localStorageBackend(fakeStorage({ failWrites: true })), null);
  assert.equal(localStorageBackend(null), null);
});

test("when every persistent backend fails the store falls back to memory and still works", async () => {
  const s = await openStore({ backends: [null, localStorageBackend(fakeStorage({ failWrites: true }))] });
  assert.equal(s.kind, "memory");
  assert.equal(s.persistent, false);
  const p = samplePacket();
  await s.save(p);
  assert.equal((await s.list()).length, 1);
});

test("a storage write failure surfaces to the caller instead of being swallowed", async () => {
  const backend = { ...memoryBackend(), async set() { throw new DOMException("full", "QuotaExceededError"); } };
  const s = new Store(backend);
  await assert.rejects(() => s.save(samplePacket()), /full/);
});
