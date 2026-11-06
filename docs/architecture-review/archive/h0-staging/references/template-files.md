# Engagement File Templates

Created during Flow 8 Step 2. Only create what's missing. Never overwrite existing files.

---

## Engagement config

**Derived from global `.config`**, not a blank copy of `.config.example`. See `flows-scope.md ## Flow 8 Step 2`: inherited values shown as commented reference, per-engagement fields ready to fill, global-only keys omitted.

---

## `scope.md` (user file)
```
# Scope — [Engagement]
Source: [client / platform / internal] | Loaded: YYYY-MM-DD

## Tech Stack
<!-- web stack AND/OR Windows host/domain details -->

## Host Inventory
<!-- For Windows/AD work: hostnames, IPs, roles, OS build, domain membership -->
| Host | IP | Role | OS / Build | Domain | Access level |
|------|----|----- |-----------|--------|--------------|

## Runtime Availability
<!-- Filled from the session availability check. Determines Tier-1 escalation paths. -->
| Host | PowerShell | Python | Go | Node | RSAT | Notes |
|------|-----------|--------|----|----- |------|-------|

## In Scope
## Out of Scope
## Special Rules
<!-- e.g. "no installing anything", "npm allowed for JS analysis only", "EDR present — engagement is visible to blue team" -->
```

## `session.md` (user file)
```
# Session Log — [Engagement]
Last updated: YYYY-MM-DD HH:MM
## Credentials
<!-- agents read this — paste creds/cookies/tokens/hashes here -->
## Current Objective
## Confirmed Findings
## In Progress
## Next Steps
## Notes
```

## `toDoList.md` (user-authored, runtime-edited state — bidirectional comms channel)

Canonical task queue AND the runtime↔user comms channel. See `SKILL.md ## Engagement task discipline` for the binding rule. The runtime works through the open tasks, then reports back; every flip requires live-evidence validation and a `## Validation log` entry.

**Two task addressees:**
- **Runtime tasks** (default): work the runtime executes itself. Flipped to `[x]` / `[~]` by the runtime with live-evidence validation.
- **User tasks** (`@user`): work only the user can perform — credentials, MFA codes, manual UI behind captcha, host access the runtime lacks, installing a Tier-1 runtime, EDR exclusions, a domain account, payment-tier upgrades, program-side messages, strategic decisions, hardware in-the-loop. The runtime AUTO-ADDS these when it hits a user-only roadblock instead of stopping inline to ask. The user flips the box. The runtime NEVER flips a `@user` task itself.

```
# To-Do List

Bidirectional comms channel: runtime↔user. `## For the user (@user)` is at the TOP so you can `Get-Content toDoList.md -Head 20` to see what's blocking. The runtime auto-adds `@user` tasks when it needs you and keeps working on `## Tasks`. See `SKILL.md ## Engagement task discipline`.

## For the user (@user)

<!--
User-only tasks. The runtime AUTO-ADDS entries here when it hits a roadblock that needs you — instead of stopping to ask. You flip the box when done. The runtime polls this section at every cycle / status / dispatch and resumes blocked work when a box flips. The runtime NEVER flips a `@user` task itself.

CONCISENESS RULE (HARD): task body = one line task + one line Why. Nothing else. The Why MUST tell you why it matters AND tell the runtime what it'll do with the result.

Format:
- [ ] **TASK-NNN** @user: <task — ≤15 words, imperative>
  - Why: <≤25 words — what the runtime will do with the result / what it unblocks>
-->

## Tasks

<!--
Runtime tasks (default — runtime executes and validates):
- [ ] **TASK-NNN**: <imperative description>
  - Done-when: <observable completion criterion with a live-probe oracle — include the positive completion path AND the negative ruled-out-with-evidence path>
  - Priority: <high|med|low>  (optional; default med)
  - Notes: <free text> (optional)
-->

## Validation log

<!-- Runtime appends one line per task state-flip + per @user task creation, citing the evidence:
- YYYY-MM-DD TASK-NNN → <done|ruled-out>: <evidence cite>
- YYYY-MM-DD TASK-NNN created @user: <≤15 words — what was tried, what unblocks>
- YYYY-MM-DD TASK-NNN @user resolved by user (resuming TASK-MMM / LEAD-MMM / GAD-MMM)
-->
```

**Section order is load-bearing.** `## For the user (@user)` MUST be the first section after the file intro.

**Numbering algorithm (TASK-NNN):** Single shared sequence across both sections. Scan all entries, find highest NNN, next = highest + 1. Zero-pad to 3 digits. Never fill gaps. A `- [~]` ruled-out task keeps its NNN.

**Status markers:** `- [ ]` open · `- [x]` done (runtime: live-evidence + log entry; `@user`: user flips) · `- [~]` ruled out (evidence path + log entry).

**Authorship rules:** user adds/edits/reorders/drops anytime. Runtime NEVER auto-adds runtime tasks; only edits their state. Runtime AUTO-ADDS `@user` tasks on user-only roadblocks; NEVER flips a `@user` box. Validation log is append-only.

**When the runtime auto-adds a `@user` task (decision rule):**
1. Progress requires something only the user can do.
2. The runtime has tried ≥2 in-session bypasses (different account / host / path / native technique / Tier-1 script) and all failed.
3. The runtime writes the task with the two required fields, concise.
4. Appends the creation line to `## Validation log`.
5. IMMEDIATELY pivots to other work. NO inline question. A one-line "added TASK-NNN @user: <gist> — continuing with X" status update is the form.
6. Every cycle/status/dispatch re-polls the section; a flipped box → log "resolved by user" → resume the Why-line work.

**Conciseness rule (HARD).** Task line ≤15 words, Why line ≤25 words. No padding. Examples:
- ✅ `- [ ] **TASK-042** @user: Install Python 3 on WIN-DC01 (no internet egress from there).`
  `- Why: needed for the Tier-1 socket smuggler; unblocks LEAD-017 (request-smuggling probe).`
- ✅ `- [ ] **TASK-043** @user: Provide a domain user cred (any tier).`
  `- Why: enables authenticated LDAP enum via ADSI; resumes GAD-009 (SPN/service-account ticket extraction chain).`

**Done-when guidance (runtime tasks):** clauses with a live-probe oracle. Good: "ccGadgets.md has a `report-ready` entry with `**Coordinator re-verified:**` AND `1-Reports/[NNN]-*/report.md` written." Always include the negative path: "...OR `ccFailed.md ## Dead Ends` records why this can't be done with evidence trace."

## Runtime project-instructions file (`CLAUDE.md` / `AGENTS.md`)

Every runtime auto-loads its project-instructions file at session start, BEFORE any skill is invoked. This is the canonical always-loaded surface. Claude Code reads `CLAUDE.md`; Antigravity/Codex read `AGENTS.md`. Flow 8 enforces this file exists (creates from template if missing; self-heals the preamble if stripped).

```
# [Engagement Name] — Engagement Bootstrap

> 🔧 **NATIVE-TOOLING CONSTRAINT** — this engagement forbids dropping installed tools. Tier-0 native (PowerShell/cmd/.NET/LOLBins) first, every time; escalate to Tier-1 (Python/Go/Node) only with a one-sentence justification; NEVER reach for a tool the user would have to install (a port scanner, an in-memory credential-dumping tool, an AD attack-path mapping tool, an automated SQL-injection tool, an intercepting web proxy, etc.). Full doctrine: `references/native-tooling-doctrine.md`.
>
> 📋 **WORKING NORM** — this engagement is governed by `toDoList.md` in this directory. Work through the open `- [ ]` runtime tasks, then report back. When you hit something only the user can do, write a `@user` task and pivot to other open work instead of stopping inline to ask. Legitimate stops: the user says "stop"/"pause"/"exit"/"wait", or a user-set hard-budget cap hits.
>
> **Multi-agentic, runtime-agnostic.** Binds Claude Code, Claude Agent SDK, Antigravity, Codex, and every dispatched subagent. The brief embedding propagates the norm across runtimes.
>
> Full rule: `SKILL.md ## Engagement task discipline`. Out-of-ideas playbook: `references/ideas-when-stuck.md`. Verification contract: `references/verification-contract.md`.

---

## Engagement Context

**Engagement:** [Name]
**Type:** [internal pentest / web bug bounty / red team / audit]
**Started:** YYYY-MM-DD
**Primary objective:** [one line — kept in sync with `session.md ## Current Objective`]

## Active toDoList summary
<!-- Optional: mirror top 3-5 open tasks for at-a-glance context. Authoritative list is toDoList.md. -->

## Engagement-specific guidance
<!-- User-authored notes for this engagement only: special rules, host quirks, which Tier-1 runtimes are allowed/present, cross-engagement context. -->
```

**Flow 8 enforcement:** On every load/resume — resolve filename; if missing, write the template; if present, check for the `🔧 NATIVE-TOOLING` block and prepend if missing (don't overwrite user content below); for multi-runtime, create each runtime's file with identical content.

## `ccLeads.md`
```
# Leads — [Engagement]
### LEAD-001 — [one-line]
**Observed:** date | **Signal:** [what] | **Location:** [host/endpoint] | **Hypothesis:** [why] | **Status:** queued
**Coordinator re-verified:** [method + log path or quote + date] — REQUIRED when the lead came from a subagent's Verified Claims block. Without it, the lead is treated as UNVERIFIED and excluded from dispatch/recommendation logic.
```
Dead → move to ccFailed.md. Promoted → `→ GAD-00N`.

**Numbering (LEAD and GAD):** scan existing, highest NNN + 1, zero-pad 3 digits, never fill gaps.

## `ccFailed.md`
```
# Failed — [Engagement]
## Dead Leads
### LEAD-001 — [one-line reason] — YYYY-MM-DD
**Original signal:** [what] | **Location:** [where] | **Why killed:** [reason]
## Dead Ends
- [what was tested] — [why it's a dead end] — YYYY-MM-DD
```

## `ccGadgets.md`
```
# Gadgets — [Engagement]
## Active Gadgets
### GAD-001 — [one-line]
**Confirmed:** date | **What works:** [concrete] | **Location:** [host/endpoint]
**Tier used:** [0-native | 1-python | 1-go | 1-node] | **From:** LEAD-NNN | **Missing:** [what's needed to escalate] | **Chains with:** [GAD-NNN or none] | **Status:** active
**Reportability:** [report-ready / chain-first — [reason] / gadget-only — [reason]]
**Coordinator re-verified:** [method + log path or quote + date] — REQUIRED. Re-run the probe yourself in this session. A subagent's "STATUS: VERIFIED" alone is not enough. Gadgets without this field are treated as UNVERIFIED and excluded from chain checks and reportability.
**Cite check:** [for each source URL or file:line / host referenced: status code or "exists" + date]
## Archived Gadgets
```
Statuses: `active` → `chained` | `reported` | `downgraded`. On new gadget → auto-chain check → reportability assessment (`flows-status.md`).

**Tier used** is SecurityAuditor-specific — records which tooling tier produced the gadget, so a report can state reproducibility constraints ("requires Python on the host") and so the user knows the footprint.

**Reportability values:** `report-ready` (high standalone impact) · `chain-first — [reason]` (medium alone; look for chains) · `gadget-only — [reason]` (low-hanging; chaining only).

**Missing field values:** `chain partner` · `PoC` · `impact escalation` · `auth context` · `stable repro` · `bypass [control]` · `tier-1 runtime [name]` (technique needs a runtime not yet confirmed on the host).

## `ccNotes.md`
```
# Notes — [Engagement]
Last updated: YYYY-MM-DD
## What Works Here
<!-- Includes runtime availability per host (the session check result), what native techniques the box allows, EDR/logging observations. -->
## App / Host Mental Model
### Behavioral Quirks
## Technique History
<!-- per area heading: - [date] Tried [technique] (Tier N) → [outcome]. Include escalation notes here. -->
## Attempted Chains
<!-- - GAD-X + GAD-Y: [confirmed/partial/failed] [date] — [result or reason] -->
```

## `ccSurface.md`
```
# Surface — [Engagement]
Last updated: YYYY-MM-DD

## Hosts
| Host | Role | Stack/OS | CDN/WAF/EDR | Domain | Notes |
|------|------|----------|-------------|--------|-------|

## Windows / AD Inventory
<!-- Populated by host-inventory / directory-review agents. -->
| Item | Type | Value | Source command | Notes |
|------|------|-------|----------------|-------|
<!-- e.g. | SeImpersonatePrivilege | privilege | enabled | whoami /priv | privesc candidate -->
<!-- e.g. | MSSQLSvc/db01:1433 | SPN | svc_sql | DirectorySearcher | service-account ticket extraction candidate -->
<!-- e.g. | C:\Program Files\App\svc.exe | unquoted-service-path | App Service | Get-CimInstance Win32_Service | privesc candidate -->

## Endpoints
| Host | Path | Method | Auth | Params | Notes |
|------|------|--------|------|--------|-------|

## Params
| Param | Seen At | Type | Reflected | Notes |
|-------|---------|------|-----------|-------|

## Cookies
| Name | Domain | Path | Flags | Set By | Purpose |
|------|--------|------|-------|--------|---------|

## Headers
| Host | CSP | X-Frame-Options | CORS | HSTS | Other |
|------|-----|-----------------|------|------|-------|

## CORS
| Host | Origin Tested | Allowed | Credentials | Methods | Notes |
|------|---------------|---------|-------------|---------|-------|

## Client-Side
| Type | Host | Location | Target/Source | Details |
|------|------|----------|---------------|---------|

## JavaScript
<!-- Cross-ref: 4-Analysis/surface-map.md, code-summaries/ -->
| Host | File/URL | Source Map | Size | Interesting | Analysis |
|------|----------|-----------|------|-------------|----------|

## Auth
| Flow | Type | Endpoint | Token/Cookie | Notes |
|------|------|----------|--------------|-------|

## Infrastructure
| Component | Details | Notes |
|-----------|---------|-------|
```

## `ccLog.md`
```
# Log — [Engagement]
## Recon Sessions
<!-- Per-session entries, most recent first. Format: Flow 9 Step 3 -->
## Session Summaries
<!-- End-of-session summaries, condensed by Flow 13 -->
```

## `4-Analysis/surface-map.md`

Per-engagement attack surface map (code-review T17). Maps the codebase into categorized attack surfaces with source provenance. Created on first code review; updated as source is acquired.

```
# Attack Surface Map — [Engagement]
_Last updated: YYYY-MM-DD | Source: [repo URL / bundle origin / host path]_

## Source Provenance
| Artifact | Origin | Acquired | Hash/Version | Local path |
|----------|--------|----------|--------------|------------|

## Entry Points
| Entry point | Method | Auth | Handler | Params | Surface class | Summary | Source |
|-------------|--------|------|---------|--------|---------------|---------|--------|

## Attack Surfaces by Class
| Class | Location | Pattern | Risk | Source | Summary ref |
|-------|----------|---------|------|--------|-------------|

## External Data Flows
| Source | Entry handler | First hop | Reaches sink? | Notes |
|--------|---------------|-----------|---------------|-------|

## Dependency Inventory
<!-- Generated by T19. ALWAYS populated when T17 runs. Sort: vulnerable first, then unknown trust, then direct, then transitive. -->
| Name | Version (pinned) | Ecosystem | Direct/Transitive | Trust | Used at | Manifest source | CVE / Advisory |
|------|------------------|-----------|-------------------|-------|---------|-----------------|----------------|

## Code Summaries Index
| Module | Summary file | Entry points | Sinks | Last reviewed |
|--------|-------------|-------------|-------|---------------|
```

## `4-Analysis/code-summaries/` directory

Per-file structured summaries (code-review T18). One `.md` per source module. Filenames sanitized, lowercase, kebab-case. Persist across sessions.

```
---
file: [original path]
source: [provenance URL/path]
language: [js/ts/java/python/php/csharp/etc.]
framework: [express/spring/django/asp.net/etc. or "none"]
last-reviewed: [YYYY-MM-DD]
---

# [Module Name] — Code Summary
## Purpose
## Exports / Public API
## Imports / Dependencies
### Internal (cross-file taint paths)
### External
### Security-relevant
## Entry Points
## Data Flows
<!-- Mark ← SUSPECT where user data reaches sink without sanitizer. -->
## Security Patterns
## Sink Inventory
- SP-NNN [pattern] @ line NNN — verdict: [from ledger]
## Notes
```

## `4-Analysis/code-review-ledger.md`

Per-engagement sink-pattern coverage tracker. Created lazily on first JS download / source review. Pattern catalog (`SP-NNN`) lives globally in `agents/code-review/sink-patterns.md`.

```
# Code Review Ledger — [Engagement]
_Last updated: YYYY-MM-DD | Pattern catalog: agents/code-review/sink-patterns.md_

**Verdict legend:** PENDING / CLEAN / DEAD / PARTIAL / LIVE→LEAD-NNN
**Rule:** Never re-grep a (bundle × pattern) cell that is non-PENDING unless its bundle SHA changed.

## Bundle Inventory
| Bundle (path under 4-Analysis/) | Size | SHA1 (first 12) | First seen | Last reviewed | Notes |
|----|----|----|----|----|----|

## Coverage Matrix
| Bundle | SP-001 | SP-002 | SP-003 | SP-004 | SP-005 | ... |
|--------|--------|--------|--------|--------|--------|-----|

## Review Notes
<!-- Append-only. ### [bundle] · SP-NNN — [verdict] — YYYY-MM-DD -->
```

## Findings template (`2-Findings/`)

Every file in `2-Findings/` follows this. The gadget summary at top lets the user understand the chain without leaving the file.

```
# [Finding Title] — [impact in ≤5 words]

## Chain Summary
**Goal:** [what this chain achieves]
**Needs:** [what's still missing, or "nothing — ready to report"]
**Gadgets in this chain:**
| ID | What it does | Location | Tier | Status |
|----|-------------|----------|------|--------|
| GAD-NNN | [concrete description] | host/path | 0-native | active |

**Environment factors:** [relevant ccSurface/ccNotes observations that enable/block the chain — including runtime availability if a Tier-1 step is required]

---

## Exploitation Narrative
## PoC / Reproduction
[Native commands / scripts, or reference to 5-Scripts/. Every command runnable on the target as-is.]
## Impact
## Open Questions
```

---

## Engagement root cleanliness

The engagement root must contain ONLY:
- `scope.md`, `session.md`, `toDoList.md` (user files; `toDoList.md` runtime-edited)
- `ccLeads.md`, `ccFailed.md`, `ccGadgets.md`, `ccNotes.md`, `ccLog.md`, `ccSurface.md`
- `.config`, `checkpoint.md`
- One runtime project-instructions file (`CLAUDE.md` / `AGENTS.md`)
- The nine numbered directories

**Everything else** goes into a numbered directory. Ledgers live in `4-Analysis/`, never the root. Binding on the coordinator and every spawned agent.

---

## Numbered directories

All directories use a numbered prefix. Lower number = higher priority / more actively used. All 9 created during Flow 8 Step 2.

```
[engagement]/
├── scope.md, session.md, toDoList.md, .config, checkpoint.md, [runtime instructions file]
├── ccLeads.md, ccFailed.md, ccGadgets.md, ccNotes.md, ccLog.md, ccSurface.md
│
├── 1-Reports/          ← Report lifecycle (auto-written by Flow 10)
│   ├── 001-title/              report.md + poc-N-<role>-<action>.{ps1,py,go,js} — ready-to-submit drafts
│   ├── OnHold/                 Drafts paused by the user
│   └── Reported/               Submitted reports, bucketed by verdict
│       ├── Triaged/  Accepted/  Resolved-NoBounty/  Duplicate/  Informative/  NotApplicable/  OOS/  Disputed/
├── 2-Findings/         ← Pre-report deep-dives, chain analysis
├── 3-Recon/            ← Host enum dumps, port scans, web surface scans, AD enum
├── 4-Analysis/         ← JS bundles, source review, surface-map, ledgers
├── 5-Scripts/          ← Standalone engagement tools (native .ps1 + Tier-1 .py/.go/.js). NOT report PoCs.
├── 6-Lists/            ← Target-specific wordlists, payloads, param lists (forge-generated)
├── 7-Random/           ← Catch-all
├── 8-Archive/          ← Old but not dead
└── 9-Trashcan/         ← Dead stuff moves here instead of being deleted
    └── Hallucinations/         Reports the triager detected as fabricated. NNN preserved.
```

### Script convention (`5-Scripts/`)

Every script has a 2-line header so a glance shows what it does:
```
# native-portscan.ps1
# Native TCP port scan: TcpClient loop over WIN-DC01 top-1000 ports, no scanner installed

#!/usr/bin/env python3
# Boolean SQLi extractor: time/boolean blind on /search?q= — Tier-1 (PS can't pipeline async probes cleanly)
```
The header MUST state the tier and, for Tier-1, the one-sentence reason native couldn't do it (mirrors the doctrine's escalation note). Report PoCs go in `1-Reports/[NNN]-title/poc-N-*`, not here.

### Trashcan / Archive conventions

**Never delete engagement files.** Move to `9-Trashcan/` (dead) or `8-Archive/` (stale-but-useful) with a date prefix. Original path preserved in the filename or a top-of-file comment.

### Cross-reference requirement

Every file written to a numbered directory (2-6) MUST be referenced from the relevant CC file (ccSurface Analysis column, ccNotes `→ see ...`, ccLog `Details: ...`, ccLeads `**Analysis:** ...`).

### Portable filenames (MANDATORY — every file, every flow, agent, script, PoC)

The engagement tree commonly lives ON a Windows host. Windows is case-insensitive and forbids characters Linux allows.

1. **No Windows-reserved characters:** `? * : " < > | \ /`. Avoid reserved device names: `CON, PRN, AUX, NUL, COM1–9, LPT1–9`. Sanitize URL/endpoint/param-derived names — replace `?`, `&`, `=` with `_`/`-`.
2. **No case-only collisions in the same directory.** Default to lowercase; lowercase-normalize basenames in loops.

**Sanitizer recipe (PowerShell):**
```powershell
function Get-SafeName([string]$n) {
  $n = $n -replace '[?*:"<>|\\/]', '_'
  $n = $n -replace '[&=]', '-'
  $n = ($n -replace '_+', '_').Trim('_','.')
  return $n.ToLower()
}
```
**Sanitizer recipe (Python):**
```python
import re
def safe_name(name: str) -> str:
    name = re.sub(r'[?*:"<>|\\/]', '_', name)
    name = re.sub(r'[&=]', '-', name)
    name = re.sub(r'_+', '_', name).strip('_.')
    return name.lower()
```

---

## Routing rules

Every piece of output falls into exactly one bucket. The coordinator routes agent results during Step 4 write passes.

| Output type | Where it goes | Example |
|-------------|---------------|---------|
| New host/domain discovered | `ccSurface.md ## Hosts` | `WIN-DC01 \| DC \| Server 2019 \| Defender \| corp.local` |
| Windows/AD inventory item (privilege, SPN, service misconfig, share, ACL) | `ccSurface.md ## Windows / AD Inventory` | `SeImpersonatePrivilege \| privilege \| enabled \| whoami /priv` |
| New endpoint or parameter | `ccSurface.md ## Endpoints / ## Params` | `/api/v2/users \| GET \| cookie \| id` |
| Environmental observation (cookie flags, CSP, CORS, headers, WAF/EDR) | `ccSurface.md ## Cookies / ## Headers / ## CORS` | |
| Auth flow observed | `ccSurface.md ## Auth` | |
| Infrastructure detail | `ccSurface.md ## Infrastructure` | |
| JS file / source map | `ccSurface.md ## JavaScript` + `4-Analysis/` | |
| Behavioral observation | `ccNotes.md ## App / Host Mental Model ## Behavioral Quirks` | |
| Technique attempt result (any length, incl. escalation note) | `ccNotes.md ## Technique History` | `- [date] Tried native SPN enum via DirectorySearcher (Tier 0) → found 3 SPNs` |
| Runtime availability finding | `ccNotes.md ## What Works Here` | `WIN-WS01: PS 5.1, Python 3.11 present, no Go/Node, no RSAT` |
| Qualifying signal | `ccLeads.md` as new LEAD-NNN (queued) | |
| Confirmed exploitable behavior | `ccGadgets.md` as new GAD-NNN (after triage) → reportability → if report-ready/chain-first also `2-Findings/` | |
| Dead end | `ccFailed.md ## Dead Ends` | |
| Downloaded file | `4-Analysis/[filename]` + cross-ref | |
| Analysis doc >20 lines | `[N]-[Dir]/[name].md` + cross-ref | `3-Recon/host-enum-win-ws01.md` |
| Analysis result ≤20 lines | Inline in the relevant CC file | |
| Standalone script/tool | `5-Scripts/[name].*` (2-line header) | `5-Scripts/native-portscan.ps1` |
| Attack surface map (T17) | `4-Analysis/surface-map.md` + cross-ref | |
| Per-file code summary (T18) | `4-Analysis/code-summaries/[module].md` | |
| Sink-pattern verdict | `4-Analysis/code-review-ledger.md` | |
| Target-specific wordlist/payload | `6-Lists/[name].txt` | `6-Lists/api-paths.txt` |

**No output falls between the cracks.** If something isn't in the table, ask: "observation, signal, confirmed behavior, or artifact?" and route accordingly.

### Deletion policy

**Never delete files.** Dead → `9-Trashcan/` (date prefix). Stale-but-useful → `8-Archive/` (date prefix). Update cross-references.
