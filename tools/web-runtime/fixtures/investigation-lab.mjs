// SecurityAuditor — synthetic lab for H1d-F2 operational-integration tests.
// Three investigations on one app: (A) a genuine IDOR on /api/orders/:id (any authenticated
// session reads any order, with an ownership marker so confirmation is EVIDENCE-based, not
// inferred); (B) a coupon double-spend with an authoritative state oracle + reset; (C) a BENIGN
// SPA (/app) with no vulnerability. Synthetic only — no secrets, no real data.
import http from "node:http";

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

export function createInvestigationLab({ evilBase = "http://127.0.0.2:1" } = {}) {
  const orders = {
    "1": { owner: "alice", marker: "OWN-alice-1", item: "widget" },
    "2": { owner: "bob", marker: "OWN-bob-2", item: "gadget" },
  };
  const defaults = () => ({ couponUses: 0 });
  let state = defaults();
  const sid = (req) => { const m = /(?:^|;\s*)sid=([^;]+)/.exec(req.headers.cookie || ""); return m ? m[1] : null; };
  const json = (res, code, obj) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(obj)); };

  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, "http://127.0.0.1");
    const p = u.pathname;

    if (p === "/login") { res.writeHead(200, { "content-type": "text/html", "set-cookie": `sid=${u.searchParams.get("user") || "anon"}; Path=/`, "x-auth-token": "tok_inv_secret" }); return res.end("<!doctype html><title>l</title>ok"); }
    if (p === "/_state") return json(res, 200, { ...state });               // AUTHORITATIVE oracle
    if (p === "/_reset" && req.method === "POST") { state = defaults(); return json(res, 200, { reset: true }); }

    // (A) IDOR: any AUTHENTICATED session can read ANY order (vulnerable). noauth => 401.
    const mo = /^\/api\/orders\/(\d+)$/.exec(p);
    if (mo) {
      if (!sid(req)) return json(res, 401, { error: "auth-required" });
      const o = orders[mo[1]];
      if (!o) return json(res, 404, { error: "nf" });
      return json(res, 200, { id: mo[1], owner: o.owner, marker: o.marker, item: o.item });
    }

    // (B) coupon double-spend (check -> await -> act): racy.
    if (p === "/coupon/redeem" && req.method === "POST") { const seen = state.couponUses; await delay(90); if (seen < 1) state.couponUses++; return json(res, 200, { redeemed: true }); }

    // (C) BENIGN SPA: static shell + app.js, a form with no sink. Nothing to find.
    if (p === "/app") { res.writeHead(200, { "content-type": "text/html" }); return res.end('<!doctype html><title>SPA</title><main><h1 id="t">Dashboard</h1><form id="f"><input aria-label="search" name="q"><button type="submit">Go</button></form><script src="/app.js"></script></main>'); }
    if (p === "/app.js") { res.writeHead(200, { "content-type": "application/javascript" }); return res.end('document.getElementById("f").addEventListener("submit",function(e){e.preventDefault();});'); }

    if (p === "/redirect-evil") { res.writeHead(302, { location: `${evilBase}/x` }); return res.end(); }
    json(res, 404, { error: "nf" });
  });
  return server;
}
