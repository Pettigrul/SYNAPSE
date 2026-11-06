# Native-Tooling Doctrine

The single authoritative source for SYNAPSE's defining constraint: **assess without dropping binaries.** Loaded on every recon / exploit / forge task. Referenced (not duplicated) from every flow and KB file. Embedded or pre-read into every recon/exploit dispatch brief.

---

## The tier model

### Tier 0 — native, always-allowed (no install, no new footprint)

Everything already present on a stock Windows host. Default to this **every time**, before anything else.

**PowerShell built-ins + the .NET surface they expose:**

| Need | Native primitive |
|------|------------------|
| HTTP(S) request | `Invoke-WebRequest`, `Invoke-RestMethod`; raw `[System.Net.HttpWebRequest]` / `[System.Net.Sockets.TcpClient]` for control |
| TCP connect / port check | `Test-NetConnection -Port`, `[System.Net.Sockets.TcpClient]` |
| DNS | `Resolve-DnsName`, `[System.Net.Dns]::GetHostAddresses()` |
| Host/system info | `Get-CimInstance` (PS7) / `Get-WmiObject` (PS5.1), `systeminfo`, `$env:`, `Get-ComputerInfo` |
| Process / service / task | `Get-Process`, `Get-CimInstance Win32_Service`, `Get-Service`, `sc query`, `Get-ScheduledTask`, `tasklist /svc` |
| Filesystem search ("grep") | `Get-ChildItem -Recurse`, `Select-String` |
| ACL / permissions | `Get-Acl`, `icacls`, `(Get-Acl).Access` |
| Users / groups / privileges | `whoami /all`, `whoami /priv`, `net user`, `net localgroup`, `Get-LocalUser`, `Get-LocalGroupMember` |
| Registry | `Get-ItemProperty`, `reg query`, `reg save` |
| AD / LDAP | `[ADSI]`, `System.DirectoryServices.DirectorySearcher`, `Get-AD*` (only if RSAT present), `nltest`, `dsquery` (if present) |
| Crypto / hashing | `Get-FileHash`, `[System.Security.Cryptography.*]`, `[System.Convert]::FromBase64String` |
| Archive / encode | `Compress-Archive`, `certutil -encode/-decode`, `[System.Convert]` |
| Scheduled exec | `schtasks`, `Register-ScheduledTask` |

**cmd.exe built-ins:** `net`, `whoami`, `dir`, `tasklist`, `sc`, `reg`, `nltest`, `wmic` (deprecated but often present), `dsquery`/`dsget` (RSAT), `findstr`, `for` loops.

**LOLBins** — signed Microsoft binaries on the box, used for non-default purposes. The native operator's toolbox. Full inventory + recipes in `agents/telemetry-awareness/lolbins.md`. Highlights:
- `certutil` — download (`-urlcache -f`), base64 encode/decode, hash.
- `bitsadmin` / `Start-BitsTransfer` — download.
- `rundll32`, `regsvr32`, `mshta`, `installutil`, `msbuild` — execution proxies.
- `comsvcs.dll` MiniDump — LSASS dump without an in-memory credential-dumping tool (`rundll32 comsvcs.dll MiniDump`).
- `wbadmin` / `vssadmin` / `esentutl` — shadow-copy / locked-file access (SAM, NTDS.dit).

### Tier 1 — runtime escalation (allowed when Tier 0 is genuinely insufficient)

Three runtimes, in rough order of how often they're the right call. **Escalate only after naming, in one sentence, why the native primitive can't do it.** Prefer the stdlib — no `pip install` / `npm install` of third-party packages unless explicitly authorized (that edges toward "installing tooling").

**Python** — the default Tier-1 escalation. Best for:
- Raw protocol work PowerShell makes painful: HTTP/1.1 pipelining & request smuggling (`socket`, `ssl`), custom TCP protocols, binary parsing (`struct`).
- Crypto / math: padding oracles, JWT alg confusion, hash length-extension, timing analysis (`hashlib`, `hmac`, `Crypto`-free stdlib where possible).
- Fast iteration loops, fuzzing, parsing large outputs (`re`, `json`, `xml.etree`).
- Stdlib-first: `http.client`, `urllib`, `socket`, `ssl`, `json`, `re`, `hashlib`, `base64`, `struct`, `subprocess`, `concurrent.futures`.

**Go** — for compiled single-binary tools when you need speed/concurrency and can get a binary onto the box:
- Concurrent port/host scanning, mass HTTP probing.
- A self-contained binary you cross-compile elsewhere (`GOOS=windows GOARCH=amd64 go build`) and copy in — useful when the host has no Python/Node but you can stage one file.
- Note: building on the host needs a toolchain; cross-compiling + copying a binary is often cleaner. Document which path in the brief.

**Node.js (npm)** — for the JS-native problems:
- JS bundle analysis, source-map reconstruction, deobfuscation (`acorn`, `escodegen` — note these are npm deps; use only with authorization, else hand-roll with regex).
- Client-side DOM work, prototype-pollution gadget hunting in real bundles, `jsdom` for headless-ish parsing.
- When the web target's logic lives in shipped JS, Node is the natural fit to replay/instrument it.

---

## The escalation rule (the discipline)

```
1. Can a Tier-0 native primitive do this?           → use it. Done.
2. No? Name in ONE sentence why not.                → write the escalation note.
3. Is the needed Tier-1 runtime present on the box? → verify with Get-Command (per verification contract).
   - Present  → write the minimal one-off script, prefer stdlib, log it to 5-Scripts/.
   - Absent   → find a native path, OR write a @user task to get the runtime
                installed (a user-only action). Do NOT assume it's there.
```

**The escalation note** is one sentence and goes in the relevant `ccNotes.md ## Technique History` entry or dispatch brief. Examples:
- ✅ "`Invoke-WebRequest` can't pipeline two requests on one connection for CL.TE smuggling → 25-line Python `socket` script in `5-Scripts/smuggle-probe.py`."
- ✅ "PowerShell regex over a 4 MB minified bundle is too slow and misses source-map chunks → Node `acorn` walk (npm authorized for this engagement per scope.md)."
- ✅ "Manual SPN enumeration via `DirectorySearcher` is fine; no escalation needed." (no escalation — this is the expected note when you *stay* Tier 0)
- ❌ Reaching for Python "because it's easier" with no native attempt first.

---

## Banned tools and their native equivalents

These are the tools the constraint exists to avoid. **Never reach for them.** The KB carries the native/runtime equivalent for each. (Banned = "the user would have to install it.")

| Banned tool category | What it does | Native / Tier-1 equivalent (KB ref) |
|----------------------|--------------|-------------------------------------|
| **Port scanners** | port/service scan | `Test-NetConnection`, `TcpClient` loop, Go concurrent scanner — `agents/host-inventory/host-inventory.md`, `agents/forge/forge.md` |
| **Content/param-discovery fuzzers** | content/param discovery | `Invoke-WebRequest` loop over a forge-generated list — `agents/web-inventory/web-inventory.md`, `flows-forge.md` |
| **HTTP probing tools** | HTTP probing | `Invoke-WebRequest`/`Invoke-RestMethod`, Go prober — `agents/web-inventory/web-inventory.md` |
| **Templated vuln scanners** | templated vuln scan | manual probes per `agents/web-testing/` techniques; no templated scanner |
| **Subdomain enumerators** | subdomain enum | cert-transparency fetch via `Invoke-RestMethod` (crt.sh), DNS brute via `Resolve-DnsName` loop — `agents/web-inventory/web-inventory.md` |
| **Automated SQL-injection tools** | SQLi automation | manual injection per `agents/web-testing/web-testing.md`, Python boolean/time-based extractor script |
| **Intercepting web proxies** | intercepting proxy | `PROXY` config + native probes; `flows-proxy.md` for import when the user has one |
| **AD attack-path mappers / data collectors** | AD graph collection | ADSI/`DirectorySearcher` enumeration, manual ACL/SPN/trust queries — `agents/directory-review/directory-review.md` |
| **AD enumeration frameworks** | AD recon module | the underlying `[ADSI]` / `System.DirectoryServices` calls such frameworks wrap — `agents/directory-review/directory-review.md` |
| **Kerberos ticket-abuse tools** | Kerberos abuse | manual service-account ticket extraction via `System.IdentityModel.Tokens.KerberosRequestorSecurityToken`, ticket extraction via `klist` — `agents/directory-review/directory-review.md`, `agents/credential-review/credential-review.md` |
| **In-memory credential-dumping tools** | credential dumping | `comsvcs.dll` MiniDump LOLBin, `reg save` SAM/SYSTEM, DPAPI via .NET — `agents/credential-review/credential-review.md` |
| **Remote-execution / host-to-host-access toolkits** | remote exec / lateral | `Invoke-Command` (WinRM), `Invoke-CimMethod` (WMI), `sc \\host`, remote scheduled task — `agents/host-to-host-access/host-to-host-access.md` |
| **Host privesc-enumeration tools** | privesc enumeration | manual native checks per `agents/privilege-review/windows.md` |
| **Raw-socket / listener utilities** | raw sockets / listeners | `TcpClient`/`TcpListener` in PowerShell, Python `socket` — `agents/forge/forge.md` |
| **Param-mining tools** | param mining | forge-generated param list + `Invoke-WebRequest` loop |

**If a KB technique cites a banned tool** (because the writeup it was distilled from used one), that is a bug in the KB entry — its `Steps`/`Payload` must give the native or Tier-1 equivalent. When you process intake and a writeup uses a banned tool, the technique's body translates it. Flag any KB entry that still hard-depends on a banned tool.

---

## OPSEC note (LotL is observable)

Living-off-the-land is not invisible. PowerShell script-block logging, AMSI, Sysmon, and EDR see native activity too. The point of the constraint is **not installing new binaries**, not **evading detection**. Detection-evasion for malicious purposes is out of scope (see `SKILL.md ## Refusal Protocol`). For authorized engagements, document what you ran (the engagement is supposed to be visible to the blue team), and consult `agents/telemetry-awareness/telemetry-awareness.md` for *awareness* of what logging your actions generate — so the report can note detection coverage, not so you can hide.

---

## Runtime availability — verify once per session

Per the verification contract, never assume a Tier-1 runtime is present. Early in each session:

```powershell
$PSVersionTable.PSVersion                                   # 5.1 vs 7+ — changes cmdlet set
Get-Command python, python3, py   -ErrorAction SilentlyContinue
Get-Command go                    -ErrorAction SilentlyContinue
Get-Command node, npm             -ErrorAction SilentlyContinue
```

Record the result in `ccNotes.md ## What Works Here`. It defines every escalation path for the engagement. If a writeup's native-equivalent leans on a runtime that's absent, that path is closed — fall back to native or raise a `@user` task.
