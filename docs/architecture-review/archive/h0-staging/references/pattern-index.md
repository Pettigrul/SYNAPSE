# Pattern Index

Maps keywords to knowledge files. Used by Flows 1, 2, 3, 9 for routing.

**Resolution rules** for ambiguous matches:
- `→ pick subtype`: choose the most relevant subtype file in the category directory.
- Multiple categories match: create one entry per file (same technique, different tags per context).
- No match at all: ask user. New attack class → run Flow 4.

**SecurityAuditor note:** every routed technique is native-normalized. When a keyword names a banned tool (an in-memory credential-dumping tool, an AD attack-path mapping tool, a port scanner, an automated SQL-injection tool...), route to the category whose KB carries the *native equivalent*, and consult `native-tooling-doctrine.md ## Banned tools`.

| Keywords | File |
|----------|------|
| **Windows host recon, local enumeration, system info, services, scheduled tasks, processes, env, netstat, host-enumeration-tool equivalent, host-privesc-tool equivalent** | `skills/host-inventory/SKILL.md` |
| **port scan, host discovery, network sweep, native port-scan (no scanner installed), TcpClient, Test-NetConnection** | `skills/host-inventory/SKILL.md` |
| **Windows privilege escalation, privesc, unquoted service path, weak service perms, AlwaysInstallElevated, SeImpersonate, token privilege, autorun, DLL hijack, registry privesc** | `skills/privilege-review/SKILL.md` |
| **Active Directory, AD enum, domain recon, LDAP, ADSI, DirectorySearcher, SPN, service-account ticket extraction, no-preauth ticket extraction, AD-attack-path-mapping-tool equivalent, AD-enumeration-framework equivalent, ACL abuse, trusts, RBCD, delegation, DCSync** | `skills/directory-review/SKILL.md` |
| **credential access, dump creds, in-memory-credential-dumping-tool equivalent, LSASS dump, comsvcs MiniDump, DPAPI, SAM dump, reg save SAM, browser creds, credential manager, NTDS.dit, vssadmin shadow copy, stored passwords** | `skills/credential-review/SKILL.md` |
| **lateral movement, WinRM, Invoke-Command, WMI exec, Invoke-CimMethod, sc remote, remote-execution-utility equivalent, network-execution-toolkit equivalent, hash-based authentication, remote scheduled task, SMB exec** | `skills/host-to-host-access/SKILL.md` |
| **persistence, Run key, registry autorun, scheduled task persistence, service install, WMI event subscription, startup folder, COM hijack** | `skills/foothold-durability/SKILL.md` |
| **defense evasion, AMSI, script-block logging, Sysmon, ETW, LotL OPSEC, native obfuscation, logging awareness** | `skills/telemetry-awareness/SKILL.md` |
| **LOLBin, certutil download, bitsadmin, rundll32, regsvr32, mshta, msbuild, installutil, living off the land binary, signed binary abuse** | `skills/telemetry-awareness/references/lolbins.md` |
| **web recon, content discovery, dir busting, content-discovery-fuzzer equivalent, HTTP-probe-tool equivalent, subdomain enum, subdomain-enumerator equivalent, crt.sh, Invoke-WebRequest recon, header inspection, fingerprint** | `skills/web-inventory/SKILL.md` |
| **reflected XSS, stored XSS, DOM XSS, blind XSS, CSP bypass, XSS WAF bypass** | `skills/web-testing/SKILL.md` (XSS techniques) |
| **SQLi, SQL injection, union, error-based, time-based blind, boolean blind, automated-SQL-injection-tool equivalent, mssql injection** | `skills/web-testing/SKILL.md` (SQLi techniques) |
| **IDOR, BOLA, object reference, predictable ID, horizontal escalation, parameter pollution** | `skills/web-testing/SKILL.md` (IDOR techniques) |
| **SSRF, server-side request forgery, cloud metadata, internal network, redirect SSRF, DNS rebinding** | `skills/web-testing/SKILL.md` (SSRF techniques) |
| **auth bypass, broken auth, JWT, OAuth, session fixation, alg-none, alg confusion, weak secret** | `skills/web-testing/SKILL.md` (auth techniques) |
| **deserialization, insecure deserialization, .NET ViewState, Java deser, pickle, ysoserial-equivalent** | `skills/web-testing/SKILL.md` (deser techniques) |
| **SSTI, template injection, Jinja2, Razor, Freemarker** | `skills/web-testing/SKILL.md` (SSTI techniques) |
| **command injection, OS injection, RCE, request smuggling, CRLF, path traversal, LFI, file upload, CORS, open redirect, mass assignment, prototype pollution** | `skills/web-testing/SKILL.md` (→ pick technique) |
| **code review, source analysis, sink, source-to-sink, taint, reachability, attack surface map, dependency inventory, sink sweep, Select-String grep, AST walk, acorn** | `skills/code-review/SKILL.md` + `skills/code-review/references/sink-patterns.md` |
| **sink pattern, dangerous sink, eval, innerHTML, exec, deserialize, hardcoded secret** | `skills/code-review/references/sink-patterns.md` (then code-review.md) |
| **chaos, fuzzing, error triggering, parser confusion, type juggling, malformed input, boundary, truncation, null byte** | `skills/chaos/SKILL.md` |
| **forge, build a tool, callback server, OAST, port scanner tool, wordlist generator, JWT toolkit, smuggler, raw socket, native tool builder, replace [banned tool]** | `skills/forge/SKILL.md` |
| **methodology, how to assess, host-first vs web-first, phase gates, escalation discipline, ROI ranking, exhaustion rule, 7-question gate** | `skills/methodology/SKILL.md` |
| **evidence hygiene, PoC capture, redact, credential redaction, PII black bar, log sanitization, screenshot hygiene** | `skills/evidence-hygiene/SKILL.md` |
| **native tooling, no install, tier 0, tier 1, banned tool, native equivalent, living off the land doctrine** | `policies/native-tooling-doctrine.md` |
| **data exfil, exfiltration, native upload, DNS exfil, HTTP exfil, encode and stage** | `skills/data-egress-check/SKILL.md` |
| **severity anchor, CVSS precedent, comparable finding, how severe** | `reports/precedent-library/<class>.md` — pick class |

> Multiple matches → one entry per file. No match → ask user or run Flow 4.

---

## Domain scope discipline

- **Windows-local / AD** categories (`host-inventory`, `privilege-review`, `directory-review`, `credential-review`, `host-to-host-access`, `persistence`, `telemetry-awareness`, `data-egress-check`) are for **host/domain living-off-the-land**. The native primitive is the technique; the banned-tool name is just a keyword to route on.
- **Web/API** categories (`web-inventory`, `web-testing`, `code-review`) are for **HTTP-surface bug classes** done with native HTTP + Tier-1 scripts.
- **Cross-cutting** (`chaos`, `forge`, `methodology`, `evidence-hygiene`) apply to both.
- A technique that genuinely spans domains (e.g., a web RCE that drops you on a Windows host → pivot to host recon) gets one entry per domain it touches, cross-linked, never duplicated body.
