# Flows — Recon (Flow 9R)

Structured native recon. Three phase tracks — pick by target type. Everything is Tier-0 native first; escalate per `native-tooling-doctrine.md`. `RECON_DEPTH` (config or trigger override): `quick` / `normal` / `deep`.

**Trigger:** "recon [target]" / "enumerate [host]" / "map surface" / "start recon".

---

## Phase 0 — Orient

Read `scope.md ## Host Inventory` + `## Runtime Availability`, `ccSurface.md`, `ccNotes.md ## What Works Here`. Decide track: **Host/AD** (Windows target), **Web** (HTTP target), or both. Confirm access level and which Tier-1 runtimes are present.

---

## Track A — Windows host / AD recon (`agents/host-inventory/`, `agents/directory-review/`)

### A1 — Local host enumeration (load `agents/host-inventory/host-inventory.md`)
Always-run baseline, all native:
```powershell
whoami /all                                  # user, groups, privileges, SID
systeminfo                                   # OS build, patches, domain
Get-LocalGroupMember Administrators          # local admins
Get-CimInstance Win32_Service | ? {$_.StartMode -eq 'Auto'} | Select Name,PathName,StartName   # service misconfig hunt
Get-ScheduledTask | ? State -ne Disabled     # task hijack candidates
Get-ChildItem env:                           # creds/paths in env
netstat -ano                                 # listening services + owning PID
```
Route findings to `ccSurface.md ## Windows / AD Inventory`. Flag privesc candidates (load `agents/privilege-review/windows.md` for the check catalog).

### A2 — Network position (load `agents/host-inventory/` network section)
Native host/port discovery (native port-scan, no scanner installed):
```powershell
1..254 | % { Test-Connection -Count 1 -Quiet "10.0.0.$_" }       # ARP/ICMP sweep
$ports=@(22,80,135,139,389,443,445,1433,3389,5985); $ports | % { Test-NetConnection -Port $_ -InformationLevel Quiet "TARGET" }
```
Deep depth: forge a concurrent Go/Python scanner (escalation: native loop is slow on a /16) per `flows-forge.md`.

### A3 — AD enumeration (load `agents/directory-review/directory-review.md`) — domain-joined only
Native LDAP via ADSI / `DirectorySearcher` (no AD attack-path mapping tool or AD enumeration framework). Users, groups, computers, SPNs (service-account ticket extraction candidates), no-preauth ticket extraction accounts, ACLs, trusts. RSAT `Get-AD*` only if present. Route SPNs and ACL findings to `ccSurface.md ## Windows / AD Inventory` as service-account ticket extraction/abuse candidates.

---

## Track B — Web / API recon (`agents/web-inventory/`)

Load `agents/web-inventory/web-inventory.md`. All native HTTP (no content-discovery fuzzers, HTTP probe tools, or subdomain enumerators):

### B1 — Passive / fingerprint
```powershell
$r = Invoke-WebRequest -Uri "https://target" -MaximumRedirection 0 -SkipHttpErrorCheck
$r.Headers                                    # server, framework, security headers
$r.Headers['Set-Cookie']                      # cookie flags
```
Cert-transparency subdomain enum: `Invoke-RestMethod "https://crt.sh/?q=%25.target.com&output=json"`. DNS brute: `Resolve-DnsName` loop over a forge-generated subdomain list.

### B2 — Content & param discovery
Forge a target-aware wordlist (`flows-forge.md`), then:
```powershell
Get-Content 6-Lists\paths.txt | % {
  $u="https://target/$_"; $c=(Invoke-WebRequest $u -SkipHttpErrorCheck).StatusCode
  if ($c -ne 404) { "$c  $u" }
} | Out-File 3-Recon\content-disco.txt
```
Escalation: large list / need concurrency → Go prober or Python `concurrent.futures`.

### B3 — JS pull & endpoint extraction
Pull linked JS with `Invoke-WebRequest`, `Select-String` for URLs/endpoints/secrets. Deep analysis → Flow 12b (Node for source-mapped bundles).

---

## Phase 1b — Output

All recon output >20 lines → `3-Recon/` with a cross-reference from `ccSurface.md`. Append a session entry to `ccLog.md ## Recon Sessions`. Every discovered surface becomes a row in `ccSurface.md` and a candidate for Flow 9 attack dispatch. Privesc/service-account ticket extraction/injection candidates become queued `ccLeads.md` entries.

---

## Exposed-services & misconfig checklist (deep depth)

For internal/host engagements, sweep for the high-value exposures, all native:
- SMB null/anonymous session (`net use \\host\IPC$ "" /u:""`), readable shares (`net view \\host`).
- MSSQL reachable (port 1433) → `System.Data.SqlClient` connect test with current creds.
- WinRM (5985/5986) reachable → lateral candidate (`Test-WSMan`).
- RDP (3389) NLA state.
- Unauth web admin panels, exposed `/actuator`, `.git`, backup files (B2 list).
- Registry-stored creds (`reg query` autologon, VNC, PuTTY sessions).
