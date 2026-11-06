# Native Recon (Windows host & network) — Knowledge Base
_Last updated: 2026-06-22_

Living-off-the-land enumeration. Every technique is the native replacement for a dropped enum tool (a host enumeration tool, a host privesc-enumeration tool, a port scanner). Tier 0 unless noted.

## Index
<!-- Load this ONLY. Stop at ## Techniques. Read entries ONLY when tags match. -->
| # | Technique | When | Tier | Tags |
|---|-----------|------|------|------|
| T1 | Identity & privilege baseline | First contact with any Windows host | 0-native | windows-local, recon, non-admin, ps5, ps7 |
| T2 | System & patch fingerprint | Need OS build / hotfix level for exploit selection | 0-native | windows-local, recon, privesc |
| T3 | Service misconfiguration sweep | Hunting local privesc paths | 0-native | windows-local, recon, privesc, wmi |
| T4 | Scheduled task & autorun enum | Hunting persistence/privesc footholds | 0-native | windows-local, recon, privesc, persistence |
| T5 | Credential-in-config / registry sweep | Stored secrets on the host | 0-native | windows-local, recon, cred-access |
| T6 | Network position & listening services | Map what the host can reach / exposes | 0-native | windows-local, recon, network |
| T7 | Native TCP port scan (no scanner installed) | Need port state on a host with no scanner | 0-native | network, recon, native-port-scan |
| T8 | Concurrent port/host scan at scale | /16 or top-ports across many hosts; native loop too slow | 1-go | network, recon, tier1-go, native-port-scan |
| T9 | SMB / share enumeration | Internal host with file shares | 0-native | windows-local, network, recon, smb |
| T10 | Installed software & version inventory | CVE-matching / dependency surface | 0-native | windows-local, recon |

## Techniques

### T1: Identity & privilege baseline
Tags: windows-local, recon, non-admin, ps5, ps7
When: First contact with any Windows host — before anything else.
Why: Your token (groups + privileges) determines every other path. `SeImpersonatePrivilege`/`SeDebugPrivilege`/admin membership flips which privesc and cred-access techniques are even possible. This is the cheapest, highest-signal first move.
Tier: 0-native
Steps: 1. Dump identity, groups, privileges 2. Check local admin membership 3. Note any high-value privilege for `privilege-review/windows.md`
Payload:
```cmd
whoami /all
```
```powershell
whoami /priv                                   # privileges (look for SeImpersonate/SeDebug/SeBackup/SeRestore)
[System.Security.Principal.WindowsIdentity]::GetCurrent().Groups | % { $_.Translate([System.Security.Principal.NTAccount]) }
Get-LocalGroupMember Administrators 2>$null    # are you/your group local admin?
```
Signal: `SeImpersonatePrivilege Enabled` on a service account → token-impersonation privesc (`windows.md#T5`). | Pitfall: privileges show `Disabled` but are still *present* — many can be enabled in-process.
Source: distilled native baseline — 2026-06-22

### T2: System & patch fingerprint
Tags: windows-local, recon, privesc
When: Selecting a kernel/privilege exploit or matching CVEs.
Why: OS build + installed hotfixes tell you which known privesc CVEs are unpatched. Exploit selection without this is guesswork.
Tier: 0-native
Steps: 1. `systeminfo` for build + hotfix list 2. Diff hotfixes against known privesc CVEs 3. Record build in `ccSurface.md`
Payload:
```cmd
systeminfo
```
```powershell
Get-HotFix | Sort InstalledOn -Descending | Select -First 15
Get-ComputerInfo -Property OsName,OsVersion,OsBuildNumber,CsDomain,CsDomainRole
```
Signal: Server 2019/2022 with no recent print-spooler patch → PrintNightmare-class candidate. | Pitfall: `systeminfo` hotfix list can lag rollups; cross-check `Get-HotFix`.
Source: distilled native baseline — 2026-06-22

### T3: Service misconfiguration sweep
Tags: windows-local, recon, privesc, wmi
When: Hunting local privesc as a non-admin.
Why: Auto-start services running as SYSTEM with a writable binary path, unquoted path with a writable parent dir, or weak service ACLs are the most common Windows privesc primitive — and you find them with one query, no host privesc-enumeration tool.
Tier: 0-native
Steps: 1. List auto-start services + binary path + run-as account 2. Flag unquoted paths with spaces 3. Check write perms on the binary/dir and service ACL
Payload:
```powershell
Get-CimInstance Win32_Service | ? StartMode -eq 'Auto' |
  Select Name, StartName, PathName, State |
  ? PathName -notmatch '^"'  |                      # unquoted-path candidates
  ? PathName -match ' '
# Writable service binary check (per candidate):
icacls "C:\Path\to\svc.exe"                          # look for (M)/(F) for your groups
# Service ACL (needs sc/sdshow parse, or):
Get-Acl "HKLM:\SYSTEM\CurrentControlSet\Services\<svc>" | fl
```
Signal: an `Auto` SYSTEM service whose `.exe` you can overwrite, or unquoted `C:\Program Files\...` you can plant in. | Pitfall: `Win32_Service.PathName` includes args — strip them before the icacls check.
Source: distilled native privesc recon — 2026-06-22

### T4: Scheduled task & autorun enum
Tags: windows-local, recon, privesc, persistence
When: Hunting privesc via task hijack or mapping existing persistence.
Why: A scheduled task running as SYSTEM/another user with a writable script/binary is a privesc path; autorun keys reveal what executes at logon. Both are native one-liners.
Tier: 0-native
Steps: 1. List non-disabled tasks + their actions + run-as 2. Check write perms on each action target 3. Enumerate Run/RunOnce keys
Payload:
```powershell
Get-ScheduledTask | ? State -ne 'Disabled' | % {
  [pscustomobject]@{ Name=$_.TaskName; User=$_.Principal.UserId; Exec=($_.Actions.Execute -join ';') }
}
Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Run' 2>$null
Get-ItemProperty 'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Run' 2>$null
```
Signal: a SYSTEM task pointing at a script in a user-writable dir. | Pitfall: many tasks live under `\Microsoft\Windows\` and are signed — focus on third-party tasks.
Source: distilled native privesc recon — 2026-06-22

### T5: Credential-in-config / registry sweep
Tags: windows-local, recon, cred-access
When: Looking for stored secrets without dumping LSASS.
Why: Autologon creds, saved RDP/VNC/PuTTY sessions, unattend files, and app configs leak passwords in plaintext or reversibly-encoded form. `Select-String` + `reg query` find them fast.
Tier: 0-native
Steps: 1. Query known credential registry locations 2. Grep filesystem for secret patterns 3. Check unattend / sysprep / IIS configs
Payload:
```powershell
reg query "HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon" /v DefaultPassword 2>$null
reg query "HKCU\Software\SimonTatham\PuTTY\Sessions" 2>$null
Get-ChildItem C:\ -Include *.config,*.xml,*.ini,unattend.xml,web.config -Recurse -ErrorAction SilentlyContinue |
  Select-String -Pattern 'password|passwd|pwd|secret|connectionstring' -List
cmdkey /list                                         # stored credentials usable for runas
```
Signal: `DefaultPassword` set, or a `connectionString` with embedded creds. | Pitfall: recursing all of `C:\` is slow + noisy — scope to likely dirs (`C:\inetpub`, app dirs, user profiles) first.
Source: distilled native cred recon — 2026-06-22

### T6: Network position & listening services
Tags: windows-local, recon, network
When: Mapping what the host exposes and can reach.
Why: Listening ports (with owning PID) reveal local services to attack; the routing/ARP table and reachable hosts define the host-to-host-access surface — all native.
Tier: 0-native
Steps: 1. List listeners + owning process 2. Dump ARP/route for neighbors 3. Note interesting ports (1433/5985/445) for lateral
Payload:
```cmd
netstat -ano
```
```powershell
Get-NetTCPConnection -State Listen | Select LocalAddress,LocalPort,OwningProcess
Get-NetNeighbor -State Reachable | Select IPAddress,LinkLayerAddress
Get-NetRoute -AddressFamily IPv4 | Select DestinationPrefix,NextHop
```
Signal: 5985 listening → WinRM lateral candidate; 1433 → MSSQL. | Pitfall: `Get-NetTCPConnection` needs PS3+; fall back to `netstat -ano` + `tasklist /fi "pid eq N"`.
Source: distilled native network recon — 2026-06-22

### T7: Native TCP port scan (no scanner installed)
Tags: network, recon, native-port-scan
When: Need port state on hosts with no scanner installed.
Why: a port scanner isn't allowed; `Test-NetConnection` and `TcpClient` give you connect-scan results natively. Good enough for a top-ports sweep against a handful of hosts.
Tier: 0-native
Steps: 1. Define target + port list 2. TCP-connect each 3. Write open ports to `3-Recon/`
Payload:
```powershell
$target='10.0.0.5'; $ports=22,80,135,139,389,443,445,1433,3389,5985,5986
$ports | % {
  $r = Test-NetConnection -ComputerName $target -Port $_ -WarningAction SilentlyContinue
  if ($r.TcpTestSucceeded) { "$target`:$_ open" }
} | Out-File 3-Recon\portscan-$target.txt
# Faster TcpClient variant with timeout:
function Test-Port($h,$p,$ms=300){ $c=[Net.Sockets.TcpClient]::new(); $t=$c.BeginConnect($h,$p,$null,$null); if($t.AsyncWaitHandle.WaitOne($ms)){try{$c.EndConnect($t);$true}catch{$false}}else{$false}; $c.Close() }
```
Signal: open port list to feed lateral/web tracks. | Pitfall: `Test-NetConnection` is slow (one port ~1s) — for >50 ports or >5 hosts, escalate to T8.
Source: distilled native scanner — 2026-06-22

### T8: Concurrent port/host scan at scale
Tags: network, recon, tier1-go, native-port-scan
When: /16 sweep or top-ports across many hosts; the native loop is too slow (minutes per host).
Why: PowerShell's per-connection latency makes large sweeps impractical. A tiny Go binary with goroutines scans a /16 in seconds and is a single self-contained file you can stage.
Tier: 1-go
Escalation: native `TcpClient` loop is sequential/slow at scale; Go goroutines parallelize the connect-scan with no third-party deps.
Steps: 1. Forge the scanner (`flows-forge.md`) 2. Cross-compile `GOOS=windows go build` if the host has no toolchain 3. Stage one binary, run, collect to `3-Recon/`
Payload: see `agents/forge/forge.md` "Port scanner" blueprint (stdlib `net` + goroutines + a worker pool).
Signal: same as T7, at scale. | Pitfall: Go must be present on the box OR you cross-compile elsewhere and copy the binary — confirm per `scope.md ## Runtime Availability` before relying on this.
Source: distilled forge escalation — 2026-06-22

### T9: SMB / share enumeration
Tags: windows-local, network, recon, smb
When: Internal host(s) with file shares.
Why: Readable shares leak configs, creds, source, backups. Native `net view` / SMB cmdlets enumerate them without a network execution toolkit; null-session checks find unauthenticated exposure.
Tier: 0-native
Steps: 1. Null-session test 2. List shares 3. Recurse readable shares for secrets
Payload:
```cmd
net use \\TARGET\IPC$ "" /u:""           :: null session test
net view \\TARGET
```
```powershell
Get-SmbShare 2>$null                                  # local shares
net view \\TARGET /all
Get-ChildItem \\TARGET\Share -Recurse -ErrorAction SilentlyContinue |
  Select-String 'password|secret|connectionstring' -List
```
Signal: readable `\\host\backup` or a share with a `web.config`. | Pitfall: null sessions are usually disabled on modern Windows — don't assume; the contract requires you to actually run the test.
Source: distilled native SMB recon — 2026-06-22

### T10: Installed software & version inventory
Tags: windows-local, recon
When: CVE-matching the host's third-party software.
Why: Vulnerable installed apps (old Java, unpatched services, dev tools) are privesc/RCE surface. Native registry + WMI inventory beats guessing.
Tier: 0-native
Steps: 1. Enumerate installed products from the uninstall keys 2. Note versions 3. Cross-check against advisories (web fetch, verify per contract)
Payload:
```powershell
'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*',
'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*' |
  % { Get-ItemProperty $_ 2>$null } |
  ? DisplayName | Select DisplayName, DisplayVersion, Publisher | Sort DisplayName
```
Signal: an outdated agent/driver/service with a known LPE. | Pitfall: `Get-CimInstance Win32_Product` triggers an MSI reconfigure on every product — DON'T use it; use the registry keys above.
Source: distilled native software inventory — 2026-06-22
