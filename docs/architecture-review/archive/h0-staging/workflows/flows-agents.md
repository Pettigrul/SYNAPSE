# Flows — Agents & Dispatch

Flows 9 (recon dispatch), 12 (feature intelligence), 12b (JS/code analysis), 12c (sink reachability), 20 (chaos). Covers the agent dispatch contract, the verdict vocabulary, dedup, and rate limiting.

**Everything in this file obeys two embedded contracts in every brief: `verification-contract.md` (verbatim) and the relevant slice of `native-tooling-doctrine.md`.**

---

## Dispatch brief template (MANDATORY structure)

Every Investigation / Attack / Chaos brief has these sections, in order:

```
## Objective
[One line — what this agent confirms or rules out.]

## Active engagement task
TASK-NNN: <task> | Done-when: <criterion with live-probe oracle>

## Target
[Host(s) / endpoint(s) / bundle. Auth context. Access level.]

## Run mode
["interactive — confirm before destructive actions", plus any run-specific constraints.]

## Native-tooling constraint
[Embed the relevant slice of references/native-tooling-doctrine.md, OR a "## Pre-read: references/native-tooling-doctrine.md (whole file)" line. State which Tier-1 runtimes are present+allowed on the target (from scope.md ## Runtime Availability). The agent defaults to Tier 0; escalates only with a one-sentence justification it must include in its return.]

## Techniques to apply
[For each named technique: embed the verbatim KB body OR a "## Pre-read: agents/<cat>/<file>.md lines N-M" line. Paraphrase from memory is FORBIDDEN.]

## Verification contract
[Paste references/verification-contract.md VERBATIM. Its marker line signals the brief carries the contract.]

## Return contract
End your report with:
- ## Verified Claims (per the verification contract)
- ## Coverage row (one line per surface×class attempted: surface, class, techniques tried, verdict, evidence path)
- ## Task progress (which TASK-NNN advanced + by how much; propose @user tasks if you hit a user-only roadblock)
- ## Escalation notes (any Tier-1 escalation: one sentence why native couldn't do it + the script path)
```

If the runtime has no parallel dispatch: write the brief to `4-Analysis/briefs/[date]-[name].md`, run the phase yourself working only from it, produce the return blocks at the end. Same methodology, sequential.

---

## Flow 9 — Recon / probe / spawn agents

**Trigger:** "probe" / "spawn agents" / "try harder on [X]" / "check if [technique] works on [Y]".

1. **Read state:** `.config`, `session.md`, `ccSurface.md`, `ccNotes.md ## What Works Here` (runtime availability!), `ccLeads.md`.
2. **Pick surfaces × classes.** Use `pattern-index.md` to map the surface type to candidate KB files. For Windows hosts: host-inventory → privesc → cred-access → lateral. For web: web-inventory → web-testing by reflected/stored/auth signals.
3. **Compose briefs** (template above). For a focused single-vector test, one brief; for broad recon, up to `MAX_AGENTS` briefs in parallel (or sequential phases on no-parallel runtimes). Cap per-agent native-scan concurrency so the host isn't hammered.
4. **Dispatch / run.** Honor `PROXY`, `DELAY`. Native probes write to `3-Recon/` / `4-Analysis/`; never flood stdout.
5. **Audit returns.** For every claim in a `## Verified Claims` block, re-verify in THIS session before propagating (re-run the host command / re-hit the endpoint / re-read the file). Record `**Coordinator re-verified:**` on any cc entry.
6. **Route output** per `template-files.md ## Routing rules`. Append a recon entry to `ccLog.md ## Recon Sessions`.
7. **Flip tasks** only with live-evidence validation + a `## Validation log` entry.

---

## Flow 12 — Feature intelligence / plan attacks

**Trigger:** "how does [feature] work?" / "understand [X]" / "plan attacks".

Map the feature's data flow (inputs → handlers → sinks → outputs) using native observation: for web, replay the flow with `Invoke-WebRequest`/`Invoke-RestMethod` and diff responses; for a host feature, trace the service/scheduled-task/registry chain with native enumeration. Produce a `3-Recon/` or `4-Analysis/` doc, populate `ccSurface.md`, and emit candidate leads for each attack vector the flow exposes.

---

## Flow 12b — JS / code analysis & sink sweep

**Trigger:** "analyze JS" / "review code" / "find sinks" / "map attack surface".

Load `agents/code-review/code-review.md` + `agents/code-review/sink-patterns.md`. Native path: pull JS with `Invoke-WebRequest`, `Select-String` for sink patterns (SP-NNN). **Escalation:** minified/source-mapped bundles where regex misses structure → Node (`acorn` walk) if Node is present+allowed, else a Python regex pass with manual chunk-splitting. Steps:
- **0b T17/T18:** map attack surface to `4-Analysis/surface-map.md`; per-file summaries to `code-summaries/`. **T19 dependency inventory runs with T17 — never skip it.**
- **T8 sink sweep:** populate `4-Analysis/code-review-ledger.md` Coverage Matrix. LIVE cell → create a `ccLeads.md` LEAD-NNN with `**Source:** code-review SP-NNN @ [bundle]`.

---

## Flow 12c — Sink reachability / trace

**Trigger:** "trace [function]" / "is [sink] reachable" / "verify SP-NNN @ [bundle]".

Source-to-sink trace (T2/T3/T6 in code-review.md). Native grep via `Select-String -Context`; Node for AST-level reachability if needed. Flip the ledger cell (PARTIAL → CLEAN/DEAD/LIVE) with a Review Notes block citing offsets.

---

## Flow 20 — Chaos / fuzz

**Trigger:** "chaos test" / "fuzz this" / "break this" / "trigger errors".

Load `agents/chaos/chaos.md`. Native fuzz loops in PowerShell (`Invoke-WebRequest` over a forge-generated mutation list) or a Tier-1 Python loop when you need speed/concurrency/binary mutation. Goal: error intel, parser confusion, type juggling, boundary/encoding/truncation. Route signals to `ccLeads.md`, dead noise to `ccNotes.md ## Technique History`.

---

## Verdict vocabulary (for coverage rows)

`untested` · `tested-clean` (probes tried, no signal) · `tested-partial` (weak/ambiguous signal — see Notes) · `confirmed` (exploitable behavior → gadget) · `blocked` (a control stopped the probe — note which) · `loop-protection` (skipped: identical brief already run).

---

## Dedup & rate limiting

- Before dispatching, check the coverage rows in `ccLog.md` / prior recon entries — don't re-run an identical (surface × class × technique) brief unless the KB gained a technique or the surface changed.
- Respect `DELAY` and per-host politeness. Native scans against production must be gentle (`Start-Sleep`, small batches) — a hammering `TcpClient` loop trips IDS and burns the engagement.
