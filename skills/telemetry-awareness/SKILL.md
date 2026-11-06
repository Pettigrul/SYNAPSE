---
name: telemetry-awareness
description: >-
  Defense Evasion — Awareness & OPSEC (native) — Knowledge Base — **Scope discipline (read first):**
  This file is about *awareness* — knowing what logging/telemetry your native actions generate, so the
  engagement report can document detection coverage and so you don't trip an incident response you
  weren't authorized to test. It is NOT a how-to for evading detection against systems you don't own.
  Detection-evasion for malicious purposes is refused (`SKILL.md ## Refusal Protocol`). For authorized
  red-team work where evasion IS in scope, the techniques here are framed as "what the blue team
  will/won't see," to be reported. Triggers: defense evasion, AMSI, script-block logging, Sysmon, ETW,
  LotL OPSEC, native obfuscation, logging awareness, LOLBin, certutil download, bitsadmin, rundll32,
  regsvr32, mshta, msbuild, installutil, living off the land binary, signed binary abuse.
license: MIT
metadata:
  user-invocable: "false"
  origin: agents/telemetry-awareness/telemetry-awareness.md (verbatim; frontmatter prefixado)
  progressive-disclosure: index-first
---
# Defense Evasion — Awareness & OPSEC (native) — Knowledge Base
_Last updated: 2026-06-22_

**Scope discipline (read first):** This file is about *awareness* — knowing what logging/telemetry your native actions generate, so the engagement report can document detection coverage and so you don't trip an incident response you weren't authorized to test. It is NOT a how-to for evading detection against systems you don't own. Detection-evasion for malicious purposes is refused (`SKILL.md ## Refusal Protocol`). For authorized red-team work where evasion IS in scope, the techniques here are framed as "what the blue team will/won't see," to be reported.

## Index
| # | Technique | When | Tier | Tags |
|---|-----------|------|------|------|
| T1 | Telemetry footprint awareness | Before any LotL action | 0-native | telemetry-awareness, recon, opsec |
| T2 | PowerShell logging surfaces | Using PowerShell on a monitored host | 0-native | telemetry-awareness, ps5, ps7 |
| T3 | AMSI awareness | Running script that may be scanned | 0-native | telemetry-awareness, amsi |
| T4 | Native artifact cleanup | After any technique that drops/stages files | 0-native | telemetry-awareness, opsec |

## Techniques

### T1: Telemetry footprint awareness
Tags: telemetry-awareness, recon, opsec
When: Before running LotL actions on a monitored host (any real environment).
Why: Each native technique fires specific Windows Event IDs / Sysmon events. Knowing the footprint lets the report state detection coverage accurately ("the comsvcs LSASS dump generated Sysmon ID 10 + Defender alert X") and lets you choose the quieter native path when several work.
Tier: 0-native
Steps: 1. Map the planned technique → its telemetry 2. Check what logging is actually enabled (`Get-WinEvent` providers, Sysmon service present?) 3. Record in the finding
Payload:
```powershell
Get-Service Sysmon* 2>$null
Get-WinEvent -ListProvider Microsoft-Windows-PowerShell 2>$null
(Get-ItemProperty 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\PowerShell\ScriptBlockLogging' 2>$null).EnableScriptBlockLogging
```
Reference footprints: service create → 7045; scheduled task → 4698/4702; new process → 4688 (+ cmdline if audited); WMI consumer → 5861; LSASS access → Sysmon 10.
Signal: which of your actions are observable here. | Pitfall: absence of Sysmon doesn't mean no logging — EDR hooks are invisible to these checks. Assume observed.
Source: distilled LotL telemetry awareness — 2026-06-22

### T2: PowerShell logging surfaces
Tags: telemetry-awareness, ps5, ps7
When: Using PowerShell on a host that may have logging enabled.
Why: Script-block logging (4104), module logging (4103), and transcription record what you run. For an authorized engagement this is fine and expected — the point is to know it's captured so the report is honest about detectability and so you don't assume "invisible."
Tier: 0-native
Steps: 1. Check which logging policies are on 2. Note that PS 5.1 logs more than you'd expect; PS 7 logs to its own provider 3. Record
Payload:
```powershell
(Get-ItemProperty 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\PowerShell\ScriptBlockLogging' -EA 0).EnableScriptBlockLogging
(Get-ItemProperty 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\PowerShell\Transcription' -EA 0).EnableTranscripting
```
Signal: logging on/off state for the report. | Pitfall: downgrading to PS 2.0 to dodge logging is a classic technique but PS 2.0 is usually removed on modern builds — verify, and only in authorized red-team scope.
Source: distilled PowerShell logging awareness — 2026-06-22

### T3: AMSI awareness
Tags: telemetry-awareness, amsi
When: Running script content that AV/Defender may scan in-memory.
Why: AMSI scans script content at runtime; a flagged string blocks execution. Knowing AMSI is in the path explains a "script blocked" failure and informs the detection-coverage section of the report. (AMSI *bypass* is in-scope only for authorized red-team engagements that say so.)
Tier: 0-native
Steps: 1. Note if a script unexpectedly fails to run (AMSI signal) 2. Record the detection 3. Adjust within authorized scope
Signal: a benign-looking script blocked → AMSI/Defender flagged a substring. | Pitfall: don't write evasion code by default — document the detection. Only pursue bypass when the engagement explicitly authorizes it.
Source: distilled AMSI awareness — 2026-06-22

### T4: Native artifact cleanup
Tags: telemetry-awareness, opsec
When: After any technique that staged a file, created a service/task, or made a registry change.
Why: The native-tooling constraint cuts both ways — you don't install tools, and you don't leave debris. Clean up what you created so the host returns to its prior state (and the report's cleanup section is accurate).
Tier: 0-native
Steps: 1. Track everything you created (services, tasks, files, reg keys, WMI subs, shadow copies, BITS jobs) 2. Remove each 3. Verify removal
Payload:
```powershell
# examples — match to what you created:
sc.exe delete tmpsvc; schtasks /delete /tn upd /f
Remove-Item C:\Temp\p.exe -Force
Get-WmiObject -Namespace root\subscription -Class __FilterToConsumerBinding | Remove-WmiObject
vssadmin delete shadows /for=C: /quiet; bitsadmin /reset
```
Signal: artifacts gone (re-enumerate to confirm — the contract). | Pitfall: forgetting a WMI subscription or a shadow copy leaves persistent state; keep a running cleanup list in `ccLog.md`.
Source: distilled native cleanup discipline — 2026-06-22
