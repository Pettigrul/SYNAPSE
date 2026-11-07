# Subagent Orchestration — runtime capability contract

Subagent orchestration (parallel dispatch / delegation) is a **runtime-provided capability (L2)**, not a feature
the harness bundles. The harness declares this contract and **detects** the capability in Preflight
(`orchestration` check); it never vendors a runtime's orchestrator. A runtime without it is not broken — the
flows **degrade to sequential**, same methodology, same contracts.

## What the harness owns vs. what the runtime provides

- **Harness owns (portable):** the dispatch *brief* contract in [`flows-agents.md`](flows-agents.md) (mandatory
  brief structure, verdict vocabulary, dedup, rate limiting) and the gates every brief embeds verbatim —
  [`verification-contract.md`](verification-contract.md), the relevant slice of
  [`native-tooling-doctrine.md`](native-tooling-doctrine.md), and the
  [`authorization-gate.md`](authorization-gate.md). These are identical on every runtime.
- **Runtime provides (not bundled):** the actual mechanism that runs N briefs concurrently and returns their
  results. This differs per runtime and is **never** hardcoded into a flow.

## Per-runtime mechanism (what Preflight detects)

| Runtime | Mechanism | Detection (offline) |
|---|---|---|
| **Claude Code** | native `Task`/`Agent` tool | assumed present when the Claude Code runtime is detected |
| **Pi** | the `pi-subagents` extension | `pi-subagents` present under `<pi-agent-home>/npm/node_modules/` |
| **Antigravity** | its own delegation mechanism | not verifiable offline → reported, not asserted |

## Rules (delegation never widens authority)

1. A flow **references this contract**, never a specific extension (no `pi-subagents` coupling in flow text).
2. Every dispatched brief carries the same embedded gates as the dispatcher. A subagent **cannot** create
   scope, approvals or an Execution Context — those come only from the operator-provided context. Delegation
   is a workload split, **not** a privilege boundary, and subagent isolation is **not** an OS sandbox.
3. The verdict/validator rules in `flows-agents.md` apply unchanged; a subagent must not upgrade an
   inconclusive result to a confirmed violation.
4. Concurrency is capped by the dispatch config (`MAX_AGENTS` in `flows-agents.md`); per-agent native-scan
   concurrency is capped so the target host isn't hammered.

## Degradation (no parallel dispatch)

When the `orchestration` check is not `ok` (runtime present without the mechanism, or no runtime), the flow
follows the existing rule in `flows-agents.md`: write the brief to `4-Analysis/briefs/[date]-[name].md`, run
the phase **yourself** working only from that brief, and produce the return blocks at the end. Same
methodology, sequential — never a silent skip and never a relaxed contract.
