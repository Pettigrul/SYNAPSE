// SecurityAuditor — reversible synthetic RACE/TOCTOU lab (H1c-F2 fixture).
// A tiny in-memory app with an AUTHORITATIVE state oracle (`GET /_state`) and a verifiable
// reset (`POST /_reset`). It exposes BOTH vulnerable (check-then-act with a delay → racy) and
// SECURE (atomic, no await between check and act) variants, plus an authz-revocation TOCTOU.
// Synthetic only — no secrets, no real data. State values (counters/balances/flags) are lab
// fixture facts, safe to observe; the validator records only declared observable fields.
import http from "node:http";

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

export function createRaceLab({ evilBase = "http://127.0.0.2:1" } = {}) {
  const defaults = () => ({ couponUses: 0, balance: 100, tokenValid: true, acted: 0, actionsAfterRevoke: 0 });
  let state = defaults();
  const sidUser = (req) => { const m = /(?:^|;\s*)sid=([^;]+)/.exec(req.headers.cookie || ""); return m ? m[1] : null; };
  const json = (res, code, obj) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(obj)); };

  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, "http://127.0.0.1");
    const p = u.pathname;
    if (p === "/login") { res.writeHead(200, { "content-type": "text/html", "set-cookie": `sid=${u.searchParams.get("user") || "anon"}; Path=/`, "x-auth-token": "tok_lab_secret" }); return res.end("<!doctype html><title>l</title>ok"); }
    if (p === "/") { res.writeHead(200, { "content-type": "text/html" }); return res.end("<!doctype html><title>lab</title>home"); }
    if (p === "/_state") return json(res, 200, { ...state });                 // AUTHORITATIVE oracle
    if (p === "/_reset" && req.method === "POST") { state = defaults(); return json(res, 200, { reset: true }); }
    if (p === "/_reset-broken" && req.method === "POST") return json(res, 200, { reset: false }); // intentionally does NOT restore
    if (p === "/public") return json(res, 200, { ok: true });                 // 200 with no state change
    if (p === "/redirect-evil") { res.writeHead(302, { location: `${evilBase}/x` }); return res.end(); }
    if (p === "/slow") { const ms = Number(u.searchParams.get("ms") || 300); await delay(ms); return json(res, 200, { ok: true }); }

    // Coupon double-spend: VULNERABLE (check -> await -> act) vs SECURE (atomic).
    if (p === "/coupon/redeem-vuln" && req.method === "POST") { const seen = state.couponUses; await delay(90); if (seen < 1) state.couponUses++; return json(res, 200, { redeemed: true }); }
    if (p === "/coupon/redeem-safe" && req.method === "POST") { if (state.couponUses < 1) { state.couponUses++; return json(res, 200, { redeemed: true }); } return json(res, 409, { redeemed: false }); }

    // Balance overdraw TOCTOU (vulnerable).
    if (p === "/withdraw-vuln" && req.method === "POST") { const amt = Number(u.searchParams.get("amt") || 0); const bal = state.balance; await delay(90); if (bal >= amt) state.balance = bal - amt; return json(res, 200, { ok: true }); }

    // Authorization-revocation TOCTOU: action checks token, delays, then acts on a stale check.
    if (p === "/action-vuln" && req.method === "POST") { const okAtCheck = state.tokenValid; await delay(90); if (okAtCheck) { state.acted++; if (!state.tokenValid) state.actionsAfterRevoke++; } return json(res, 200, { acted: okAtCheck }); }
    if (p === "/revoke" && req.method === "POST") { await delay(15); state.tokenValid = false; return json(res, 200, { revoked: true }); }

    json(res, 404, { error: "nf" });
  });
  return server;
}
