# Flow 19 — Proxy Sync

Optional. For web work when the user runs an intercepting web proxy on their own machine — the proxy is theirs, not a tool installed on the target, so it doesn't violate the native-tooling constraint (the constraint is about the target/host footprint).

**Trigger:** "sync from proxy" / "what did I intercept" / "import from my proxy" / "replay this".

---

## Routing native probes through the proxy

When `PROXY` is set, native HTTP probes route through it so the user observes in real-time:
```powershell
Invoke-WebRequest -Uri $u -Proxy $env:PROXY -SkipHttpErrorCheck
# curl.exe -x http://127.0.0.1:8080 ...
# Python: http.client via a proxy CONNECT, or requests-free urllib ProxyHandler
```
Honor `DELAY` and politeness.

---

## Import

"sync from proxy" / "import from my proxy": the user exports their proxy history (HAR / proxy items / proxy export) into `intake/files/`. Parse it (native `ConvertFrom-Json` for HAR; Tier-1 Python for proxy XML if needed). For each request:
- New host/endpoint/param → `ccSurface.md`.
- Auth flow / cookie / CORS / header observation → the matching `ccSurface.md` section.
- A qualifying signal (reflected input, predictable ID, interesting param) → `ccLeads.md`.
**Verification contract applies** — a lead from imported traffic still needs a live re-probe before it's treated as real.

---

## Replay

"replay this [request]" / "re-send with [modification]": reconstruct the request natively (`Invoke-WebRequest`/`Invoke-RestMethod` with the captured method/headers/body), apply the modification, diff the response against baseline. Route any signal to `ccLeads.md`. Write the replay script to `5-Scripts/` if it'll be reused.
