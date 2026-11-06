# Report Template — Field Structure
_Last updated: 2026-06-25_

Standard fields for every vulnerability report. All PoC steps MUST be native-runnable (Tier 0 or explicitly noted Tier 1).

## Finding Report Fields

```
## Title
{One-line: what + where. e.g., "SQL Injection in /api/search `q` parameter"}

## Severity
{Critical / High / Medium / Low / Informational}
CVSS: {score} ({vector string})

## Impact
{What can an attacker DO — not just what's misconfigured. Impact-first.
 e.g., "An unauthenticated attacker can extract the full users table including password hashes,
 enabling account takeover of any user including administrators."}

## Attack Narrative
{Chain-first: if this finding chains with others, describe the full attack path.
 e.g., "The SQLi (F01) extracts admin credentials → admin panel access → file upload (F02) → RCE"}

## Affected Component
- URL / Host: {target}
- Parameter / Field: {specific input}
- Endpoint: {path}
- Service: {if host-side}

## Steps to Reproduce
{Numbered steps. Every command must be native-runnable on the target environment.
 If Tier 1, state the runtime prereq at step 0.}

0. Prerequisites: PowerShell 5.1+ {and Python 3.x if Tier 1}
1. {step}
2. {step}
3. Observe: {what proves the finding}

## Proof of Concept
{The exact command(s) — copy-paste ready.}
```powershell
{native PoC}
```

Tier: {0-native | 1-python | 1-go | 1-node}
{If Tier 1: Escalation: {one-sentence justification}}

## Evidence
- Request: {see evidence/F{nn}-{slug}/request.txt}
- Response: {see evidence/F{nn}-{slug}/response.txt}
- Screenshot: {if applicable}
- Hash proof: {if applicable — SHA256 of accessed data}

## Detection
{What logging/telemetry would catch this exploitation:
 - Windows Event IDs triggered
 - EDR/Sysmon signals
 - WAF rules that should catch it
 - What the blue team sees}

## Remediation
{Specific fix — not generic advice.
 e.g., "Use parameterized queries via SqlCommand.Parameters.AddWithValue() instead of string concatenation at UserRepository.cs:142"}

## References
- {CVE if applicable}
- {CWE-XXX}
- {External writeup / advisory}

## Metadata
Finding ID: F{nn}
Tester: {name}
Date found: {YYYY-MM-DD}
Date verified: {YYYY-MM-DD}
Status: {confirmed | reported | fixed | retested}
```
