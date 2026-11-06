# Flows — Scope & Session

Flow 8 (scope load, progressive resume, config resolution, file integrity).

---

## Config Resolution

`Engagement .config → Global .config → Hardcoded defaults`. Read at flow start, merge top-down (engagement wins), cache for the session.

| Key | Default | Notes |
|-----|---------|-------|
| `RUNNING_ON` | (unset) | Free-text: OS, network position, **which Tier-1 runtimes are present**. Doubly important here — see `native-tooling-doctrine.md`. |
| `ENGAGEMENT_ROOTS` | (required) | Where engagement folders live. New engagements go in the first listed path. |
| `PROXY` | (unset) | HTTP proxy for web work (native probes route through it). |
| `MAX_AGENTS` | 3 | Parallel agent cap. |
| `FREE_ROAM` | ask | After structured agents, optionally add one free-roaming creative agent. |
| `AUTO_REPORT` | true | Auto-write reports on confirmed findings (gated by impact-first bar). |
| `AUTO_TRIAGE` | true | Run QA on gadgets and reports. |
| `DELAY` | 0 | ms between agent requests (`Start-Sleep -Milliseconds`). |
| `VERBOSITY` | normal | quiet / normal / verbose. |
| `ALLOW_TIER1` | python,go,node | Which Tier-1 runtimes are policy-allowed for this engagement (the *availability* check is separate — this is the *policy* gate). E.g. `ALLOW_TIER1=python` forbids Node/Go even if installed. |
| `LANGUAGE` / `TONE` | (unset) | Output language / style. |

---

## Flow 8 — Load Scope / Resume

**Trigger:** "I'm hacking on [X]" / "start engagement [X]" / "load scope" / "I'm back" / "resume" / "switch to [X]".

### Step 1 — Resolve engagement directory
- Search `ENGAGEMENT_ROOTS` for a folder matching the name. Found → resume path. Not found → new-engagement path.
- New engagement: create `[first ENGAGEMENT_ROOT]/[sanitized-name]/`.

### Step 1.5 — Resolve runtime + filename
- Detect which runtime is hosting (system-prompt signature). Resolve the project-instructions filename: `CLAUDE.md` (Claude Code / SDK) or `AGENTS.md` (Antigravity / Codex). Cross-runtime → create both.

### Step 1.8 — Runtime availability check (SecurityAuditor-specific, MANDATORY on first load)
Run the availability check from `native-tooling-doctrine.md ## Runtime availability` against the host(s) in scope (or the local host if that's the target):
```powershell
$PSVersionTable.PSVersion
Get-Command python, python3, py, go, node, npm -ErrorAction SilentlyContinue | Select Name, Version
# RSAT / AD module presence:
Get-Module -ListAvailable ActiveDirectory -ErrorAction SilentlyContinue
Get-Command dsquery, nltest -ErrorAction SilentlyContinue
```
Write the result to `ccNotes.md ## What Works Here` and to `scope.md ## Runtime Availability`. This determines every Tier-1 escalation path. If the local runtime can't reach the target host yet, write a `@user` task to confirm access and proceed with what you can.

### Step 2 — Create missing engagement files (only if new / missing)
Create from `template-files.md`: `scope.md`, `session.md`, `toDoList.md`, the six `cc*.md`, `.config` (derived from global), the nine numbered directories. **Never overwrite existing files.**

### Step 2.5 — Project-instructions file self-heal (MANDATORY, every load AND resume)
- Resolve filename (Step 1.5). Missing → write the full template from `template-files.md ## Runtime project-instructions file` (substitute name + date).
- Present → read it; check for the `🔧 NATIVE-TOOLING CONSTRAINT` block. Missing → prepend it (don't overwrite user content below).
- This is the load-bearing fix for the native-tooling rules surviving context compression.

### Step 3 — Load state (depth by recency)
- **Quick resume** (last touched ≤7 days): `session.md` + `toDoList.md` + `ccGadgets.md` + `ccLeads.md` + `checkpoint.md` (if present).
- **Full resume** (>7 days OR user says "full resume"): all engagement files + a scope diff (re-fetch scope if a URL is on file; diff tech stack) + a regression note (re-test confirmed findings — Flow 15).
- Read `checkpoint.md` if present and replay its "next steps".

### Step 4 — Orient + report
Output a tight orientation: open runtime tasks (top of `toDoList.md`), open `@user` tasks (surface oldest-first), active gadgets, queued leads, runtime availability summary, and the single recommended next action. Then work through the open runtime tasks and report back, unless the user is mid-conversation.

### Step 5 — File integrity
If a CC file is malformed (bad table, broken markers), note it and repair non-destructively (move the broken copy to `8-Archive/` with a date prefix, regenerate the header from template, re-import salvageable rows). Never silently drop data.

---

## New-engagement quickstart

When the engagement is brand new and scope is thin, don't block — seed `scope.md ## Host Inventory` / `## In Scope` with whatever the user gave, run Step 1.8, create a starter `toDoList.md ## Tasks` with the obvious first moves (host enum or web recon depending on target type), and start. Add a `@user` task for anything you need (creds, host access, a Tier-1 runtime) and keep moving.
