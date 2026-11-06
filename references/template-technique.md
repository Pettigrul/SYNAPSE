# Technique Templates

Single source of truth for technique format. All flows that create or query entries reference this file. No exceptions — consistency depends on it.

---

## Technique Entry

```markdown
### T[N]: [Technique Name]
Tags: tag1, tag2, tag3                             ← required
When: [one-line condition — when does this apply?]  ← required
Why: [decision signal — see quality bar below]      ← required
Tier: [0-native | 1-python | 1-go | 1-node]         ← required for SYNAPSE — which tooling tier this lives at
Steps: 1. [x] 2. [y] 3. [z]                       ← required
Payload: `[native command / script / payload here]` ← required if applicable
Escalation: [if Tier 1: ONE sentence why native can't do it] ← required when Tier ≠ 0-native
Signal: [how to confirm it worked] | Pitfall: [common mistake]  ← only if non-obvious
Needs: [what you control before attempting]         ← only if non-trivial prerequisites
Variations: [append over time — never duplicate the entry]      ← omit until variants exist
Source: [title](URL) — YYYY-MM-DD                  ← required
```

Omit optional fields entirely when not relevant — no placeholder dashes, no filler.

**Rules:**
- `T[N]` is sequential per file (T1, T2, T3). `web-testing/web-testing.md#T3` is unique across the system.
- **Tier** is the SYNAPSE-specific field. Every technique declares whether its primary path is Tier-0 native or a Tier-1 runtime. If the technique is native-first with an optional Tier-1 fallback, mark `Tier: 0-native` and put the fallback in `Variations`. The **Escalation** field is mandatory whenever `Tier ≠ 0-native` — it carries the one-sentence justification from the native-tooling doctrine. A Tier-1 technique with no Escalation note fails review.
- **Payload** for SYNAPSE is usually a native command (PowerShell / cmd / LOLBin one-liner) or a short script. Inline backticks for one-liners; code block for multi-line. If the technique would normally use a banned tool, the Payload MUST give the native/Tier-1 equivalent — never a banned-tool invocation (a port scanner, an in-memory credential-dumping tool, etc.).
- **Tags** must cover ALL relevant dimensions — see `intake/tags.md`:
  - Domain: `windows-local`, `active-directory`, `web`, `api`
  - Tooling tier: `tier0-native`, `tier1-python`, `tier1-go`, `tier1-node`, `lolbin`
  - Technique area: `recon`, `privesc`, `lateral`, `cred-access`, `persistence`, `telemetry-awareness`, `xss`, `idor`, `ssrf`, `sqli`, `auth`, `deserialization`, etc.
  - Platform/stack: `ps5`, `ps7`, `wmi`, `ldap`, `dpapi`, `kerberos`, `php`, `node`, `dotnet`, `iis`, `mssql`, `any`
  - Context: `no-rsat`, `non-admin`, `requires-admin`, `requires-domain-creds`, `waf-bypass`
  - When in doubt, add the tag. False positives (extra load) are cheap. False negatives lose techniques.
- **Steps** on one line for ≤3 steps. Separate lines for 4+.
- **Why** must answer: "What signal or condition made the operator reach for *this specific* technique?" Bad: "The host was vulnerable to privesc." Good: "`whoami /priv` showed `SeImpersonatePrivilege` enabled on a service account, and the box is Server 2019 → PrintSpoofer-class token abuse, done natively via the printer-bug RPC trigger rather than a dropped binary." The Why is what lets the assistant recognize the same pattern on future targets — the most valuable field from processed writeups.
- **Variations** optional — only when actual variants exist (e.g., a PS5.1 path and a PS7 path, or a native path and a Tier-1 fallback).

---

## Index Row

Every technique gets a row. The Index is the ONLY thing loaded on first access.

```
| T[N] | Technique Name | When (one line) | Tier | Tags |
```

The `Tier` column lets the assistant filter by what's available on the box (e.g., skip `1-node` techniques when Node isn't installed) before reading any entry body.

**Cross-reference** (technique lives in another file but applies here too):
```
| T[N] | Name | When | Tier | Tags | → category/common.md#T[M] |
```

The `→` in the last column means "content lives there — read it from that file."

---

## Knowledge File Structure

```markdown
# [Category] / [Subtype] — Knowledge Base
_Last updated: —_

## Index
<!-- Load this ONLY. Stop at ## Techniques. Read entries ONLY when tags match. -->
| # | Technique | When | Tier | Tags |
|---|-----------|------|------|------|

## Techniques
<!-- Format: references/template-technique.md -->
```

**Loading protocol (enforced everywhere):**
1. Pattern Index → identify file(s)
2. Read `## Index` only — stop at `## Techniques`
3. Match tags against target context (domain, tooling availability, platform, area)
4. Matching row → read only that `### T[N]` section
5. Non-matching → skip completely, never load

At scale (80 techniques, 3 match): ~2KB Index + ~1KB entries = ~3KB instead of ~40KB.
