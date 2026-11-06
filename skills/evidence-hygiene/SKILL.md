---
name: evidence-hygiene
description: >-
  Evidence Hygiene — Knowledge Base — How to capture, store, and redact proof-of-concept evidence for
  findings. Applies to both host-side and web-side work. Triggers: evidence hygiene, PoC capture,
  redact, credential redaction, PII black bar, log sanitization, screenshot hygiene.
license: MIT
metadata:
  user-invocable: "false"
  origin: agents/evidence-hygiene/evidence-hygiene.md (verbatim; frontmatter prefixado)
  progressive-disclosure: index-first
---
# Evidence Hygiene — Knowledge Base
_Last updated: 2026-06-25_

How to capture, store, and redact proof-of-concept evidence for findings. Applies to both host-side and web-side work.

## Principles

1. **Minimal proof** — capture the minimum data that proves the finding. A hash, a row count, a redacted sample — never bulk PII/secrets.
2. **Reproducible** — every PoC must be re-runnable from the steps recorded. No "I saw it once" findings.
3. **Native-runnable** — PoC steps use only native commands (Tier 0) or explicitly noted Tier-1 runtimes. No installed tools in the steps.
4. **Timestamped** — every evidence item records when it was captured.
5. **Redacted before storage** — sensitive data is redacted BEFORE writing to engagement files.

## Index
| # | Technique | When | Tier | Tags |
|---|-----------|------|------|------|
| T1 | Screenshot / terminal capture | Visual proof of exploitation | 0-native | evidence, capture |
| T2 | Request/response logging | Web finding proof | 0-native | evidence, web |
| T3 | Redaction protocol | Before storing any evidence | 0-native | evidence, redaction |
| T4 | Hash-based proof | Proving data access without storing data | 0-native | evidence, hash |
| T5 | Evidence organization | Structuring proof in engagement dir | 0-native | evidence, workflow |

## Techniques

### T1: Screenshot / terminal capture
Tags: evidence, capture
When: Need visual proof of a finding (UI-based XSS, admin panel access, command output).
Why: A screenshot or terminal log is the most direct evidence. PowerShell can capture terminal transcripts natively.
Tier: 0-native
Payload:
```powershell
# start transcript (captures all terminal I/O)
Start-Transcript -Path "C:\engagement\evidence\finding-01-transcript.txt" -Append

# ... run your PoC ...

Stop-Transcript
```
Signal: transcript file with timestamped commands + output. | Pitfall: transcripts capture everything — redact before including in the report. `Start-Transcript` only captures the PS host; for GUI screenshots, use `Add-Type` with `System.Drawing` or Snipping Tool.
Source: distilled evidence capture — 2026-06-25

### T2: Request/response logging
Tags: evidence, web
When: Web finding — need to record the exact HTTP exchange.
Why: The report needs the exact request that triggers the bug and the response that proves it. `Invoke-WebRequest` returns both.
Tier: 0-native
Payload:
```powershell
$r = Invoke-WebRequest "https://target.example/api/vuln?id=1' OR 1=1--" -UseBasicParsing
$evidence = [PSCustomObject]@{
    Timestamp = Get-Date -Format o
    URL       = $r.BaseResponse.ResponseUri
    Status    = $r.StatusCode
    Headers   = $r.Headers | ConvertTo-Json
    BodyLen   = $r.Content.Length
    BodySnip  = $r.Content.Substring(0, [Math]::Min(500, $r.Content.Length))
}
$evidence | ConvertTo-Json | Out-File "C:\engagement\evidence\finding-02-http.json"
```
Signal: structured evidence file. | Pitfall: truncate large response bodies — store just enough to prove the finding (first 500 chars, or the specific leaked data with redaction).
Source: distilled HTTP evidence capture — 2026-06-25

### T3: Redaction protocol
Tags: evidence, redaction
When: Before storing ANY evidence that may contain sensitive data.
Why: Engagement files should never contain real passwords, PII, tokens, or internal IPs/hostnames beyond what's necessary. Redact before write.
Tier: 0-native
Steps: 1. Identify sensitive fields 2. Replace with redacted markers 3. Verify redaction
Payload:
```powershell
function Redact-Evidence {
    param([string]$Text)
    $Text = $Text -replace '(?i)(password|passwd|secret|token|api.key)\s*[:=]\s*\S+', '$1=[REDACTED]'
    $Text = $Text -replace '\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b', '[EMAIL-REDACTED]'
    $Text = $Text -replace '\b\d{3}[-.]?\d{3}[-.]?\d{4}\b', '[PHONE-REDACTED]'
    $Text = $Text -replace '\b\d{3}-\d{2}-\d{4}\b', '[SSN-REDACTED]'
    $Text = $Text -replace 'AKIA[0-9A-Z]{16}', '[AWS-KEY-REDACTED]'
    $Text = $Text -replace 'eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+', '[JWT-REDACTED]'
    return $Text
}

# usage
$raw = Get-Content finding-02-http.json -Raw
Redact-Evidence $raw | Out-File finding-02-http-redacted.json
```
Signal: evidence file with sensitive data replaced. | Pitfall: custom data formats may need additional patterns — always review redacted output before sharing.
Source: distilled redaction protocol — 2026-06-25

### T4: Hash-based proof
Tags: evidence, hash
When: Proving you accessed data without storing the data itself.
Why: Hashing the data proves you had access (the hash can be verified by the client) without keeping the sensitive content. Best for bulk data access (database dumps, file reads).
Tier: 0-native
Payload:
```powershell
# prove file access by hash
$hash = (Get-FileHash C:\sensitive\data.xlsx -Algorithm SHA256).Hash
"[PROOF] Accessed data.xlsx at $(Get-Date -Format o) — SHA256: $hash" | Out-File finding-03-proof.txt

# prove database row access by count + sample hash
$rows = Invoke-SqlCmd "SELECT COUNT(*) as c FROM users" # or native SqlClient
$sample = Invoke-SqlCmd "SELECT TOP 1 id, email FROM users" | ConvertTo-Json
$sampleHash = [BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($sample))) -replace '-',''
"[PROOF] users table: $($rows.c) rows, sample hash: $sampleHash" | Out-File finding-04-proof.txt
```
Signal: hash-based proof without sensitive data. | Pitfall: the client must be able to verify the hash — tell them WHICH file/row and the algorithm used.
Source: distilled hash-based evidence — 2026-06-25

### T5: Evidence organization
Tags: evidence, workflow
When: Structuring proof files in the engagement directory.
Why: A consistent layout makes report writing easy and audit trails clear.
Tier: 0-native
Steps:
```
engagement/
├── 2-Findings/
│   ├── F01-sqli-login/
│   │   ├── request.txt       # raw HTTP request
│   │   ├── response.txt      # response (redacted)
│   │   ├── proof.txt         # hash/count proof
│   │   └── transcript.txt    # terminal capture
│   ├── F02-privesc-unquoted/
│   │   ├── enum.txt          # enumeration output
│   │   ├── exploit.txt       # exploit steps + output
│   │   └── proof.txt
```
Naming: `F{nn}-{short-slug}/` per finding. Files within describe the evidence type. All text, all redacted.
Source: distilled evidence organization — 2026-06-25
