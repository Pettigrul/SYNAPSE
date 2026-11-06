<!-- SECAUDIT_VERIFICATION_CONTRACT_v1 — unique marker string. Do not remove. This is a self-enforced text convention: pasting this file verbatim into a dispatch brief includes the marker automatically, signalling that the brief carries the contract. -->

# Verification Contract (mandatory, applies to coordinator AND every subagent)

This contract governs how the assistant produces factual claims about external systems. It applies to:

- the coordinator (the agent invoking the SYNAPSE skill) before sending any user-facing output, file write, or dispatch brief
- every subagent — or sequential phase, where the runtime has no parallel subagent dispatch — that runs under a brief embedding this contract (embedding is mandatory; see `flows-agents.md`)

The contract is one file because it has one rule: **claims about external reality must be earned by live evidence in the current session, not asserted from memory, stale artifacts, or prior summaries.**

---

## Rule

Before composing any output (chat message, file write, dispatch brief, reply to a client, draft finding, agent report, summary) that contains a factual claim about an external system, list the claims and verify each one in THIS session with an unambiguous oracle.

**Claims that fall under this rule include but are not limited to:**

- "the documentation says / does not say X" → verify by fetching the doc URL in this session
- "the API returns / accepts / rejects X" → verify by live HTTP probe (`Invoke-WebRequest` / `curl.exe` / Python `http.client` or equivalent)
- "the server enforces / allows X" → verify by positive AND negative same-handler control
- "the service / share / registry key / scheduled task X exists on host Y" → verify by running the native enumeration command in this session (`Get-Service`, `Get-ChildItem`, `reg query`, `Get-ScheduledTask`) and citing the output
- "user / group / principal P has privilege / right / ACL R" → verify by `whoami /priv`, `Get-Acl`, `Get-LocalGroupMember`, `net user`, ADSI readback — not from memory of how Windows "usually" works
- "CVE-NNNN-NNNNN exists / affects version Y" → verify by live fetch of NVD / OSV / GHSA, or by fingerprinting the live host
- "report NNN is accepted / rejected / in triage" → verify by listing `1-Reports/` to find the actual directory
- "library X is at version Y in this product" → verify by fingerprinting the live host/server, not the manifest alone
- "function F at file:line L does X" → verify by reading the actual file in this session
- "Python / Go / Node is available on this host" → verify by `Get-Command python,node,go` in this session; do NOT assume a Tier-1 runtime exists
- "this LOLBin / native technique works on this Windows build" → verify by running it (or a benign dry-run) on the host; behavior varies by build, patch level, and EDR
- "the agent / subagent verified X" → verify the subagent's "Verified Claims" block actually lists X

**Claims that do NOT fall under this rule:**

- statements of intent ("I will run X next")
- statements of uncertainty ("I haven't checked yet whether X")
- statements of opinion clearly framed as such ("I think X would be cleaner")

---

## What counts as verification

Verification is a live probe in the current session that produces an unambiguous oracle:

- **Live HTTP probe**: response status, body containing/not containing a specific string, header presence/absence — written to a log file and citable by path.
- **Live host command**: a native PowerShell / cmd / WMI command (or a Tier-1 script) run in this session, its output written to a log file and citable by path. For Windows claims this is the primary oracle.
- **Web fetch**: against the canonical source (vendor docs, NVD / OSV / GHSA, the program's production endpoint) — quote the verbatim text returned.
- **File read / grep / shell on engagement files**: for claims about file contents, signatures, config values — cite path + line range. `Select-String` is the native grep.
- **Web search (with domain pinning where supported)**: when direct fetch is blocked — quote verbatim from the result snippet.

**Verification does NOT include:**

- "I remember reading this in a prior session"
- "the result file from a prior session says X"
- "another agent told me X in a summary"
- "this is implied by the bigger picture"
- "Windows usually behaves this way" / "this LOLBin normally works" — build/patch/EDR variance makes this unreliable; run it
- "the docs probably say X" / "I'd expect X to be true"
- training-data recollection of doc contents, CVE existence, or cmdlet/LOLBin behavior

If the only available basis for a claim is a stale artifact or prior summary, the verification is to RE-RUN the original probe in this session, not to cite the artifact.

---

## What to do when verification fails or is impractical

Three options, in order of preference:

1. **Re-frame the claim to remove the unverified part.**
2. **Mark the claim explicitly as UNVERIFIED** in the output, e.g. "I have not verified this in this session, but…".
3. **Drop the claim entirely.** Always allowed, always the cheapest correct action.

Sending a confident claim that has not been verified is NEVER allowed — not in a reply to a client, not in a draft finding, not in a dispatch brief, not in a casual chat sentence. The rule applies independent of softness, brevity pressure, or user push for speed.

---

## Subagent return contract

<!-- Keep this heading verbatim. It is a self-enforced text convention: the literal string `## Subagent return contract` marks where the return contract begins, so reviewers and briefs can find it consistently. -->

Every subagent operating under a brief that embeds this contract MUST end its final report with a structured block:

```
## Verified Claims
- <claim 1> — verified via <method (live HTTP probe / live host command / web fetch / file read / grep)> — <log path or quote> — STATUS: VERIFIED
- <claim 2> — attempted via <method> — STATUS: UNVERIFIED — reason: <why verification failed>
- <claim 3> — STATUS: PROPAGATED (relayed from another source; not verified by me)
```

The coordinator audits this block before propagating any claim downstream. UNVERIFIED claims must either be (a) re-verified by the coordinator before propagation, or (b) marked as UNVERIFIED wherever they appear downstream.

---

## Why this exists

Confident-sounding factual claims that ride a paragraph's overall confidence are the most common way wrong information reaches a third party (a client, a report, a chained agent, a downstream artifact). For native-tooling Windows work this is acute: assumptions about how a cmdlet, LOLBin, or privilege "usually" behaves are wrong often enough that asserting them unverified poisons the engagement. This contract is preventive — it fires at output time, before the prose, regardless of whether any failure memory has been consulted. Every factual claim earns its place by surviving a live probe in the current session.

---

## How to embed in a dispatch brief

When constructing a brief for any subagent, paste this entire file's contents verbatim into the brief under a `## Verification contract` heading. Do not paraphrase. Do not abbreviate. The subagent does not inherit the skill context; the brief is its only channel. If the subagent does not see this contract in its prompt, it will not enforce it.
