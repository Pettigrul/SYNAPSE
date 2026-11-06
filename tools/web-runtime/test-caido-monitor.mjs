// Deterministic, offline tests for the Caido Live History Monitor (H2b-F2).
// No network, no LLM, no real Caido, no real timers (tick() driven directly).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert";
import { CaidoHistoryMonitor, createCaidoHistoryMonitor, MonitorError, MONITOR_SCHEMA } from "./caido-monitor.mjs";

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "caido-mon-"));
let n = 0, fail = 0;
const okT = (s) => { n++; console.log(`  ok  ${s}`); };
const badT = (s, e) => { n++; fail++; console.log(`FAIL  ${s}: ${e && e.stack || e}`); };
async function t(s, fn) { try { await fn(); okT(s); } catch (e) { badT(s, e); } }

// A mock F1-shaped source over a mutable record set, with failure injection + call log.
function prov(r, idx, eng, proj) {
  return {
    cursor: `idx:${idx}`,
    provenance: { source: "caido", engagementId: eng, caidoProjectId: proj, caidoRequestId: r.id,
      caidoResponseId: r.response ? r.response.id : null, responseAvailable: !!r.response, ts: r.ts },
    resource: { host: r.host || "app.lab", method: r.method || "GET", url: r.url || `https://app.lab/${r.id}`,
      statusCode: r.response ? r.response.statusCode : null },
    record: { responseAvailable: !!r.response, ...(r.secretRaw ? { request: { raw: r.secretRaw } } : {}) },
  };
}
function mkServer(init = {}) {
  const s = { records: init.records || [], count: init.count, fail: null, calls: [], eng: init.eng || "ENG-1", proj: init.proj || "proj-1" };
  s.history = async (params) => {
    s.calls.push(["history", params]); if (s.fail) throw new MonitorError(s.fail, s.fail);
    const first = params.first; const start = params.after ? Number(String(params.after).split(":")[1]) : 0;
    const slice = s.records.slice(start, start + first); const end = start + slice.length;
    return { count: (s.count != null ? s.count : s.records.length), pageInfo: { endCursor: `idx:${end}`, hasNextPage: end < s.records.length }, edges: slice.map((r, k) => prov(r, start + k, s.eng, s.proj)) };
  };
  s.getRequest = async (id) => { s.calls.push(["getRequest", id]); if (s.fail) throw new MonitorError(s.fail, s.fail); const r = s.records.find((x) => x.id === id); return r ? { found: true, ...prov(r, 0, s.eng, s.proj) } : { found: false }; };
  return s;
}
function mkClock() { let T = 1_000_000_000; return { now: () => (T += 1000) }; }
function mkMon(s, over = {}) {
  const sleeps = [];
  const m = createCaidoHistoryMonitor({ engagementId: s.eng, caidoProjectId: s.proj, source: s, clock: mkClock(), sleep: async (ms) => { sleeps.push(ms); }, ...over });
  m._sleeps = sleeps; return m;
}
const rec = (id, resp = null, extra = {}) => ({ id, ts: `2026-11-05T00:00:${String(id).replace(/\D/g, "").padStart(2, "0").slice(-2)}Z`, response: resp, ...extra });

await t("1 empty history: no new, no events", async () => {
  const m = mkMon(mkServer({ records: [] })); m.state = "RUNNING";
  await m.tick();
  assert.equal(m.status().new, 0); assert.equal(m.peekEvents().length, 0);
});

await t("2 first batch: all requests emitted as new", async () => {
  const m = mkMon(mkServer({ records: [rec("r1", { id: "s1", statusCode: 200 }), rec("r2", { id: "s2", statusCode: 200 }), rec("r3")] })); m.state = "RUNNING";
  await m.tick();
  assert.equal(m.status().new, 3); assert.equal(m.drainEvents().filter((e) => e.type === "new").length, 3);
});

await t("3 new requests during polling only emit the delta (dedup)", async () => {
  const s = mkServer({ records: [rec("r1"), rec("r2")] }); const m = mkMon(s); m.state = "RUNNING";
  await m.tick(); assert.equal(m.status().new, 2);
  s.records.push(rec("r3"), rec("r4"));
  await m.tick();
  assert.equal(m.status().new, 4); // total across both cycles
  assert.equal(m.drainEvents().filter((e) => e.type === "new").length, 4); // r1..r4 each once
});

await t("4 multi-page pagination within one cycle", async () => {
  const s = mkServer({ records: Array.from({ length: 5 }, (_, i) => rec(`r${i}`)) });
  const m = mkMon(s, { limits: { pageSize: 2, maxPagesPerCycle: 10 } }); m.state = "RUNNING";
  await m.tick();
  assert.equal(m.status().processedCount, 5);
});

await t("5 request without response tracked as pending", async () => {
  const s = mkServer({ records: [rec("r1")] }); const m = mkMon(s); m.state = "RUNNING";
  await m.tick();
  assert.equal(m.status().pendingResponses, 1);
});

await t("6 late-arriving response detected → updated event", async () => {
  const s = mkServer({ records: [rec("r1")] }); const m = mkMon(s); m.state = "RUNNING";
  await m.tick(); assert.equal(m.status().pendingResponses, 1);
  s.records[0].response = { id: "s1", statusCode: 200 }; // response arrives later
  await m.tick();
  assert.equal(m.status().updated, 1);
  assert.equal(m.status().pendingResponses, 0);
});

await t("7 duplicate request ids deduped", async () => {
  const s = mkServer({ records: [rec("r1"), rec("r1"), rec("r2")] }); const m = mkMon(s); m.state = "RUNNING";
  await m.tick();
  assert.equal(m.status().new, 2);
});

await t("8 restart with checkpoint is idempotent (no re-emit)", async () => {
  const sp = path.join(TMP, "eng1", "monitor.json");
  const s = mkServer({ records: [rec("r1"), rec("r2"), rec("r3")] });
  const a = mkMon(s, { statePath: sp }); a.state = "RUNNING";
  await a.tick(); // tick persists while RUNNING (simulates a crash/restart mid-run)
  const b = mkMon(s, { statePath: sp });
  const loaded = await b.load();
  assert.equal(loaded, true);
  assert.equal(b.state, "PAUSED"); // RUNNING state never auto-resumes on load
  assert.equal(b.processedCount, 3);
  b.state = "RUNNING"; await b.tick();
  // idempotent: the already-seen records emit NO new events after restart
  assert.equal(b.peekEvents().filter((e) => e.type === "new").length, 0);
  assert.equal(b.processedCount, 3);
});

await t("9 transient connection failure → retry, stays RUNNING", async () => {
  const s = mkServer({ records: [rec("r1")] }); s.fail = "caido-unreachable";
  const m = mkMon(s); m.state = "RUNNING";
  const r = await m.tick();
  assert.equal(r.retry, 1); assert.equal(m.state, "RUNNING"); assert.equal(m.status().connection, "down");
  assert.ok(m._sleeps.length === 1); // backoff slept once
});

await t("10 auth failure is permanent → ERROR, no retry", async () => {
  const s = mkServer({ records: [] }); s.fail = "caido-auth-failed";
  const m = mkMon(s); m.state = "RUNNING";
  const r = await m.tick();
  assert.equal(r.permanent, true); assert.equal(m.state, "ERROR"); assert.equal(m._sleeps.length, 0);
});

await t("11 project changed/mismatch is permanent → ERROR", async () => {
  const s = mkServer({ records: [] }); s.fail = "caido-project-mismatch";
  const m = mkMon(s); m.state = "RUNNING";
  await m.tick();
  assert.equal(m.state, "ERROR");
});

await t("12 out-of-scope records never reach the monitor (F1 withholds)", async () => {
  // server reports count=3 but only 2 in-scope edges (one withheld upstream by F1)
  const s = mkServer({ records: [rec("r1"), rec("r2")], count: 3 }); const m = mkMon(s); m.state = "RUNNING";
  await m.tick();
  assert.equal(m.status().processedCount, 2);
  assert.equal(m.status().backlog, 1); // count - processed
});

await t("13 persistence failure is atomic & non-destructive", async () => {
  const blocker = path.join(TMP, "blocker-file");
  fs.writeFileSync(blocker, "keepme");
  const m = mkMon(mkServer({ records: [] }), { statePath: path.join(blocker, "state.json") }); // parent is a FILE
  await assert.rejects(() => m.persist(), (e) => /ENOTDIR|EEXIST|ENOENT/.test(e.code || e.message));
  assert.equal(fs.readFileSync(blocker, "utf8"), "keepme"); // original intact
});

await t("14 idempotent reprocessing (two ticks, same data)", async () => {
  const s = mkServer({ records: [rec("r1"), rec("r2")] }); const m = mkMon(s); m.state = "RUNNING";
  await m.tick(); await m.tick();
  assert.equal(m.status().new, 2);
});

await t("15 backfill reconciles out-of-order / missed records", async () => {
  const s = mkServer({ records: [rec("r1"), rec("r2")] });
  const m = mkMon(s, { limits: { reconcileEveryCycles: 1 } }); m.state = "RUNNING";
  await m.tick(); assert.equal(m.status().new, 2);
  // an out-of-order record inserted BEFORE the cursor position
  s.records.unshift(rec("r0"));
  await m.tick(); // reconcile cycle re-scans from start
  assert.equal(m.status().new, 3);
});

await t("16 backlog limit: bounded work per cycle, resumes next cycle", async () => {
  const s = mkServer({ records: Array.from({ length: 10 }, (_, i) => rec(`r${i}`)) });
  const m = mkMon(s, { limits: { pageSize: 2, maxPagesPerCycle: 2 } }); m.state = "RUNNING";
  await m.tick(); const p1 = m.status().processedCount; // <= 4
  assert.ok(p1 <= 4 && p1 > 0);
  await m.tick(); assert.ok(m.status().processedCount > p1);
});

await t("17 backoff grows then recovers", async () => {
  const s = mkServer({ records: [rec("r1")] }); s.fail = "caido-timeout";
  const m = mkMon(s, { limits: { backoffBaseMs: 100 } }); m.state = "RUNNING";
  await m.tick(); await m.tick();
  assert.deepEqual(m._sleeps, [100, 200]); // exponential, bounded
  s.fail = null; const r = await m.tick();
  assert.equal(r.ok, true); assert.equal(m.status().connection, "up"); assert.equal(m.status().new, 1);
});

await t("18 cancellation via aborted signal → no state change, not ERROR", async () => {
  const s = mkServer({ records: [rec("r1")] }); const m = mkMon(s); m.state = "RUNNING";
  const ac = new AbortController(); ac.abort();
  const r = await m.tick({ signal: ac.signal });
  assert.equal(r.cancelled, true); assert.equal(m.state, "RUNNING");
});

await t("19 shutdown → STOPPED + persisted", async () => {
  const sp = path.join(TMP, "shut", "s.json");
  const s = mkServer({ records: [rec("r1")] }); const m = mkMon(s, { statePath: sp }); m.state = "RUNNING";
  await m.tick(); await m.shutdown();
  assert.equal(m.state, "STOPPED"); assert.ok(fs.existsSync(sp));
});

await t("20 engagement isolation: foreign state file rejected", async () => {
  const sp = path.join(TMP, "iso", "s.json");
  const a = mkMon(mkServer({ records: [rec("r1")], eng: "ENG-A", proj: "proj-A" }), { statePath: sp }); a.state = "RUNNING";
  await a.tick(); await a.stop();
  const other = createCaidoHistoryMonitor({ engagementId: "ENG-B", caidoProjectId: "proj-B", source: mkServer({ eng: "ENG-B", proj: "proj-B" }), statePath: sp });
  await assert.rejects(() => other.load(), (e) => e.code === "state-mismatch");
});

await t("21 events carry metadata only (no raw/secret content)", async () => {
  const s = mkServer({ records: [rec("r1", { id: "s1", statusCode: 200 }, { secretRaw: "Authorization: Bearer SECRET\r\nCookie: sid=abc" })] });
  const m = mkMon(s); m.state = "RUNNING";
  await m.tick();
  const ev = m.peekEvents()[0];
  const blob = JSON.stringify(ev);
  assert.ok(!blob.includes("SECRET") && !blob.includes("abc"), "no secret content in events");
  assert.ok(!("raw" in ev) && !("request" in ev) && !("record" in ev), "events are metadata-only");
});

await t("22 zero LLM / only injected source used (no global fetch needed)", async () => {
  const prev = globalThis.fetch; globalThis.fetch = undefined; // prove monitor doesn't fetch itself
  try { const s = mkServer({ records: [rec("r1")] }); const m = mkMon(s); m.state = "RUNNING"; await m.tick(); assert.equal(m.status().new, 1); }
  finally { globalThis.fetch = prev; }
});

await t("23 zero write GraphQL ops (only history/getRequest called)", async () => {
  const s = mkServer({ records: [rec("r1")] }); const m = mkMon(s); m.state = "RUNNING";
  await m.tick();
  // Only the two READ ops exist; there is no write/mutation call surface at all.
  assert.ok(s.calls.length > 0);
  assert.ok(s.calls.every((c) => c[0] === "history" || c[0] === "getRequest"));
  assert.equal(typeof s.createRequest, "undefined"); // monitor never reaches a write op
});

await t("24 provenance integrity on emitted events", async () => {
  const s = mkServer({ records: [rec("r1", { id: "s9", statusCode: 404 })] }); const m = mkMon(s); m.state = "RUNNING";
  await m.tick();
  const ev = m.peekEvents()[0];
  assert.equal(ev.engagementId, "ENG-1"); assert.equal(ev.caidoProjectId, "proj-1");
  assert.equal(ev.caidoRequestId, "r1"); assert.equal(ev.caidoResponseId, "s9");
  assert.equal(ev.statusCode, 404); assert.equal(ev.responseAvailable, true);
});

try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {}
console.log(`\n${n - fail}/${n} passed` + (fail ? ` (${fail} FAILED)` : ""));
process.exit(fail ? 1 : 0);
