---
name: web-inventory
description: >-
  Web Recon (native) — Knowledge Base — Web and API reconnaissance using only native HTTP primitives
  (`Invoke-WebRequest`, `Invoke-RestMethod`, `System.Net.HttpWebRequest`) and Tier-1 scripts when
  needed. No content-discovery fuzzer, no HTTP probe tool. Triggers: web recon, content discovery, dir
  busting, content-discovery-fuzzer equivalent, HTTP-probe-tool equivalent, subdomain enum,
  subdomain-enumerator equivalent, crt.sh, Invoke-WebRequest recon, header inspection, fingerprint.
license: MIT
metadata:
  user-invocable: "false"
  origin: agents/web-inventory/web-inventory.md (verbatim; frontmatter prefixado)
  progressive-disclosure: index-first
---
# Web Recon (native) — Knowledge Base
_Last updated: 2026-06-25_

Web and API reconnaissance using only native HTTP primitives (`Invoke-WebRequest`, `Invoke-RestMethod`, `System.Net.HttpWebRequest`) and Tier-1 scripts when needed. No content-discovery fuzzer, no HTTP probe tool.

## Index
| # | Technique | When | Tier | Tags |
|---|-----------|------|------|------|
| T1 | Header / technology fingerprint | First contact with a target origin | 0-native | web-inventory, fingerprint |
| T2 | Content discovery (brute paths) | Need to find hidden endpoints | 1-python | web-inventory, content-discovery, tier1-python |
| T3 | Subdomain enumeration (passive + resolve) | Bug bounty wildcard scope | 0-native | web-inventory, subdomain |
| T4 | JavaScript pull + grep | Hunting endpoints/secrets in client JS | 0-native | web-inventory, js-analysis |
| T5 | Certificate transparency search | Discover subdomains/orgs via CT logs | 0-native | web-inventory, cert-transparency |
| T6 | robots.txt / sitemap / well-known | Low-hanging disclosure | 0-native | web-inventory, passive |
| T7 | API schema discovery | REST/GraphQL endpoint mapping | 0-native | web-inventory, api |
| T8 | Virtual host brute | Find vhosts on a shared IP | 1-python | web-inventory, vhost, tier1-python |

## Techniques

### T1: Header / technology fingerprint
Tags: web-inventory, fingerprint
When: First contact — identify server, framework, security headers, cookies.
Why: Response headers reveal the tech stack (Server, X-Powered-By, X-AspNet-Version), security posture (CSP, HSTS, X-Frame-Options), and session mechanics (cookie flags). Zero requests beyond what a browser sends.
Tier: 0-native
Steps: 1. Send HEAD/GET 2. Parse headers 3. Note findings in ccSurface
Payload:
```powershell
$r = Invoke-WebRequest -Uri https://target.example -Method HEAD -UseBasicParsing
$r.Headers | Format-Table -AutoSize
$r.Headers['Set-Cookie']       # cookie flags
$r.Headers['Content-Security-Policy']
```
Signal: tech stack + header policy mapped. | Pitfall: some CDNs strip upstream headers — try direct IP with Host header if available.
Source: distilled native header recon — 2026-06-25

### T2: Content discovery (brute paths)
Tags: web-inventory, content-discovery, tier1-python
When: Need to find hidden dirs/files beyond what spidering reveals.
Why: Brute-forcing paths with a wordlist is the core of content discovery. A PowerShell loop with `Invoke-WebRequest` works but is slow single-threaded; a small Python script with `concurrent.futures` gives honest parallelism without installing a content-discovery fuzzer.
Tier: 1-python
Escalation: PowerShell `Invoke-WebRequest` in a `foreach` loop is too slow for large wordlists (no true parallelism without `Start-Job` overhead); Python `ThreadPoolExecutor` provides clean concurrent HTTP with stdlib only.
Steps: 1. Select a wordlist (or forge one — `flows-forge.md`) 2. Run the buster 3. Filter by status/size
Payload:
```python
#!/usr/bin/env python3
# Tier: 1-python | Escalation: parallelism for large wordlists
import sys, urllib.request, concurrent.futures

BASE   = sys.argv[1].rstrip("/")
WORDS  = open(sys.argv[2]).read().splitlines()
THREADS = 20

def check(word):
    url = f"{BASE}/{word}"
    try:
        r = urllib.request.urlopen(urllib.request.Request(url, method="GET"), timeout=5)
        return (r.status, len(r.read()), url)
    except urllib.error.HTTPError as e:
        if e.code not in (404, 403):
            return (e.code, 0, url)
    except Exception:
        pass
    return None

with concurrent.futures.ThreadPoolExecutor(THREADS) as ex:
    for res in ex.map(check, WORDS):
        if res:
            print(f"[{res[0]}] {res[2]}  ({res[1]}B)")
```
```powershell
# fallback: pure PS (slow but works)
$base = "https://target.example"
Get-Content wordlist.txt | ForEach-Object {
    try { $r = Invoke-WebRequest "$base/$_" -UseBasicParsing -EA Stop; "[{0}] {1}" -f $r.StatusCode, "$base/$_" }
    catch {}
}
```
Signal: list of live paths + status codes. | Pitfall: filter by response size to exclude soft-404s (same-size custom error pages).
Source: distilled native content discovery — 2026-06-25

### T3: Subdomain enumeration (passive + resolve)
Tags: web-inventory, subdomain
When: Bug bounty wildcard scope — need to discover subdomains.
Why: Passive sources (crt.sh, DNS brute) reveal subdomains without touching the target. Then DNS-resolve each to confirm it's live. Native `Resolve-DnsName` + `Invoke-RestMethod` to public APIs.
Tier: 0-native
Steps: 1. Pull from crt.sh / other passive sources 2. Deduplicate 3. Resolve each 4. Record live ones
Payload:
```powershell
# crt.sh passive enum
$domain = "target.example"
$crt = Invoke-RestMethod "https://crt.sh/?q=%25.$domain&output=json"
$subs = $crt | ForEach-Object { $_.name_value -split "`n" } | Sort-Object -Unique | Where-Object { $_ -like "*.$domain" }

# resolve each
$subs | ForEach-Object {
    try {
        $ip = (Resolve-DnsName $_ -Type A -EA Stop).IPAddress
        [PSCustomObject]@{ Sub=$_; IP=$ip }
    } catch {}
} | Format-Table
```
Signal: list of live subdomains + IPs. | Pitfall: crt.sh can be slow/rate-limited; cache results. Wildcard DNS (`*.target.example` → same IP) inflates results — check for a wildcard first.
Source: distilled native subdomain enum — 2026-06-25

### T4: JavaScript pull + grep
Tags: web-inventory, js-analysis
When: Hunting for endpoints, API keys, secrets, or internal paths in client-side JavaScript.
Why: JS bundles frequently contain API routes, internal hostnames, hardcoded tokens, and commented-out debug endpoints. Pull them and grep.
Tier: 0-native
Steps: 1. Identify JS URLs (from page source or a prior spider) 2. Download each 3. Regex for interesting patterns
Payload:
```powershell
# pull all <script src=...> from a page
$page = Invoke-WebRequest https://target.example -UseBasicParsing
$scripts = $page.Links | Where-Object { $_.href -match '\.js(\?|$)' } | ForEach-Object { $_.href }
$scripts += ([regex]::Matches($page.Content, 'src="([^"]+\.js[^"]*)"')).Groups | Where-Object { $_.Name -eq '1' } | ForEach-Object { $_.Value }

$scripts | Sort-Object -Unique | ForEach-Object {
    $url = if ($_ -match '^https?://') { $_ } else { "https://target.example$_" }
    $js = (Invoke-WebRequest $url -UseBasicParsing).Content
    # grep for interesting patterns
    $patterns = 'api[_/]', 'secret', 'token', 'password', 'key[=:]', '/internal/', 'admin', '\.env', 'graphql'
    foreach ($p in $patterns) {
        [regex]::Matches($js, "(?i).{0,40}$p.{0,40}") | ForEach-Object {
            "[MATCH] $url : $($_.Value.Trim())"
        }
    }
}
```
Signal: endpoints/secrets extracted from JS. | Pitfall: minified JS is hard to read — use a JS beautifier (Node `js-beautify` if available, or an online one pre-engagement). Webpack sourcemaps (`.js.map`) are gold — check for them.
Source: distilled native JS recon — 2026-06-25

### T5: Certificate transparency search
Tags: web-inventory, cert-transparency
When: Discovering all certificates ever issued for a domain — reveals subdomains, internal names, acquisitions.
Why: CT logs are public and free. `crt.sh` is the standard API; `Invoke-RestMethod` queries it natively.
Tier: 0-native
Steps: 1. Query crt.sh 2. Extract unique names 3. Cross-ref with T3 (resolve)
Payload:
```powershell
$domain = "target.example"
$r = Invoke-RestMethod "https://crt.sh/?q=%25.$domain&output=json"
$names = $r | ForEach-Object { $_.name_value -split "`n" } | Sort-Object -Unique
$names | Where-Object { $_ -notmatch '\*' }   # skip wildcards
```
Signal: full subdomain/name list from CT logs. | Pitfall: includes expired/revoked certs — names may no longer resolve. Always verify with DNS.
Source: distilled native CT recon — 2026-06-25

### T6: robots.txt / sitemap / well-known
Tags: web-inventory, passive
When: First pass on any web target — check for disclosed paths.
Why: `robots.txt` discloses paths the site wants hidden from crawlers (which often means interesting). Sitemaps enumerate all pages. `.well-known/` has security.txt, openid-configuration, etc.
Tier: 0-native
Steps: 1. Fetch each 2. Parse paths 3. Add to content-discovery seed list
Payload:
```powershell
$base = "https://target.example"
@("robots.txt","sitemap.xml",".well-known/security.txt",".well-known/openid-configuration") | ForEach-Object {
    try {
        $r = Invoke-WebRequest "$base/$_" -UseBasicParsing -EA Stop
        "=== $_ (${($r.StatusCode)}) ==="; $r.Content.Substring(0, [Math]::Min(2000, $r.Content.Length))
    } catch { "=== $_ : $($_.Exception.Response.StatusCode) ===" }
}
```
Signal: disclosed paths + config. | Pitfall: `Disallow:` in robots.txt is a gift — add those paths to your content-discovery queue.
Source: distilled native disclosure recon — 2026-06-25

### T7: API schema discovery
Tags: web-inventory, api
When: Target exposes REST or GraphQL APIs.
Why: OpenAPI/Swagger docs (`/swagger.json`, `/openapi.json`, `/api-docs`) and GraphQL introspection (`{ __schema { types { name } } }`) reveal the full API surface without brute-forcing.
Tier: 0-native
Steps: 1. Check common schema paths 2. Try GraphQL introspection 3. Map endpoints
Payload:
```powershell
$base = "https://target.example"
# OpenAPI / Swagger
@("/swagger.json","/openapi.json","/api-docs","/v1/swagger.json","/v2/api-docs","/swagger/v1/swagger.json") | ForEach-Object {
    try { $r = Invoke-WebRequest "$base$_" -UseBasicParsing -EA Stop; "[FOUND] $base$_" } catch {}
}

# GraphQL introspection
$gql = '{"query":"{ __schema { queryType { name } types { name fields { name } } } }"}'
try {
    $r = Invoke-RestMethod "$base/graphql" -Method POST -ContentType 'application/json' -Body $gql
    $r.data.__schema.types | Where-Object { $_.name -notmatch '^__' } | ForEach-Object { $_.name }
} catch {}
```
Signal: API endpoints/types enumerated. | Pitfall: introspection is often disabled in prod — try `/graphiql`, `/altair`, `/playground` for dev UIs that may still be exposed.
Source: distilled native API recon — 2026-06-25

### T8: Virtual host brute
Tags: web-inventory, vhost, tier1-python
When: Multiple vhosts on a shared IP — need to discover non-public ones.
Why: Sending requests with different `Host` headers to the same IP reveals hidden vhosts. Need parallelism for wordlist-sized runs.
Tier: 1-python
Escalation: sequential `Invoke-WebRequest` with `-Headers @{Host=...}` is too slow for wordlist-length vhost brute; Python `ThreadPoolExecutor` provides clean parallelism.
Steps: 1. Get the baseline response (for the default vhost) 2. Brute with Host headers 3. Filter responses that differ
Payload:
```python
#!/usr/bin/env python3
# Tier: 1-python | Escalation: parallelism for large wordlists
import sys, urllib.request, concurrent.futures

IP      = sys.argv[1]       # e.g. "10.0.0.1"
DOMAIN  = sys.argv[2]       # e.g. "target.example"
WORDS   = open(sys.argv[3]).read().splitlines()
PORT    = int(sys.argv[4]) if len(sys.argv) > 4 else 443
SCHEME  = "https" if PORT == 443 else "http"

# baseline
base_req = urllib.request.Request(f"{SCHEME}://{IP}/", headers={"Host": DOMAIN})
base_len = len(urllib.request.urlopen(base_req, timeout=5).read())

def check(word):
    host = f"{word}.{DOMAIN}"
    req = urllib.request.Request(f"{SCHEME}://{IP}/", headers={"Host": host})
    try:
        data = urllib.request.urlopen(req, timeout=5).read()
        if len(data) != base_len:
            return f"[FOUND] {host}  ({len(data)}B vs baseline {base_len}B)"
    except Exception:
        pass
    return None

with concurrent.futures.ThreadPoolExecutor(15) as ex:
    for res in ex.map(check, WORDS):
        if res:
            print(res)
```
Signal: vhosts with different responses than the default. | Pitfall: TLS SNI — for HTTPS, you may need to match SNI to the Host header; `urllib` handles this but some setups may reject mismatches.
Source: distilled native vhost brute — 2026-06-25
