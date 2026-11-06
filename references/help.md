# SYNAPSE — Help

Output this block and stop. Translate to the user's language. Do not load any other files.

```
SYNAPSE — Quick Reference
Native-tooling security assessment: PowerShell/cmd/.NET/LOLBins first;
Python/Go/Node only when native can't; NEVER install a tool.
Setup: copy .config.example -> .config, set ENGAGEMENT_ROOTS + RUNNING_ON

-- Getting Started --
"I'm hacking on [engagement]"    start (runs runtime-availability check)
"I'm back" / "resume"            quick resume (recent) or full resume (>7 days)
"full resume"                    force scope diff + regression check

-- Recon & Attack --
"recon [host]" / "enumerate"     native recon (host/AD or web track)
"enumerate this Windows host"    native host enum + privesc check catalog
"enumerate AD" / "domain recon"  ADSI/DirectorySearcher enum (no AD attack-path mapping tool)
"how does [feature] work?"       investigate feature, map attack vectors
"analyze JS"                     JS bundle analysis (Node for source maps)
"check if [technique] works on [target]"   single targeted test
"dump creds natively"            DPAPI/comsvcs MiniDump/reg save (no in-memory credential-dumping tool)
"move laterally"                 WinRM/WMI/sc (no remote-execution utility / network execution toolkit)
"native equivalent of [tool]"    how to do it without installing the tool

-- Status & Tracking --
"status"                         dashboard: findings, gadgets, leads, runtimes
"what next?" / "suggest"         smart recommendation
"what's the attack surface?"     show discovered hosts/endpoints/AD inventory
"coverage" / "what's been tested"  coverage summary
"what leads do I have"           list leads | "kill/activate/promote lead N"
"what gadgets do I have"         list gadgets | "chain GAD-X with GAD-Y"

-- Reports --
"write the report"               draft from gadget (impact-first gated)
"revise report [NNN]"            update after feedback
"withdraw report"                pull back a submitted report

-- Knowledge Base --
"save [URL]" / "process my intake"   extract techniques (native-normalized)
"what do I know about [X]"        query techniques
"note: [text]"                    quick capture
"learn this: [observation]"       save as technique from current session
"compact techniques"              merge variants

-- Forge (native micro-tool builder) --
"forge [tool]" / "build me a [tool]"   WRITE the native replacement for a
                                        banned tool (port scanner, buster,
                                        OAST listener, JWT toolkit, smuggler)
"forge cleanup" / "tear down [tool]"   stop + clean up staged artifacts

-- Cross-Program --
"cross-program"                  recurring native techniques across engagements

-- Proxy --
"sync from proxy"                import intercepting web proxy / Caido history
                                  (proxy is yours, not a target-side tool)
"replay this"                    re-send natively with modifications

-- Conversation Mode --
When scope is active, just talk. Auto-creates leads and gadgets.
Non-security tasks just work without loading engagement files.

-- Config (in .config) --
RUNNING_ON        describe the box + which Tier-1 runtimes are present
ENGAGEMENT_ROOTS  where engagement folders live
ALLOW_TIER1       which Tier-1 runtimes are policy-allowed (default python,go,node)
PROXY             HTTP proxy for web work
MAX_AGENTS        parallel agent cap (default 3)
AUTO_REPORT       auto-write reports on confirmed findings (default true)
AUTO_TRIAGE       run QA on gadgets and reports (default true)
DELAY             ms between requests (default 0)

-- The constraint --
Tier 0: PowerShell, cmd, .NET, WMI/CIM, LOLBins (certutil, comsvcs, etc.)
Tier 1: Python (default), Go (compiled binaries), Node (JS/npm) — with a
        one-sentence justification, only if present on the box.
Banned: a port scanner, an in-memory credential-dumping tool, an AD
        attack-path mapping tool, a Kerberos ticket-abuse tool, an automated
        SQL-injection tool, a content-discovery fuzzer, a remote-execution
        utility, an intercepting web proxy...
        The KB carries the native equivalent of each.

-- Files --
Your files: session.md, scope.md (host inventory + runtime availability)
Auditor's: ccLeads/ccFailed/ccGadgets/ccNotes/ccLog/ccSurface.md
Dirs: 1-Reports/ 2-Findings/ 3-Recon/ 4-Analysis/ 5-Scripts/
      6-Lists/ 7-Random/ 8-Archive/ 9-Trashcan/
```
