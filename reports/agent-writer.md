# Report Writer — Instructions & Style Rules
_Last updated: 2026-06-25_

Instructions for the AI when writing vulnerability reports. Load this before drafting any report.

## Voice & Tone
- **Professional, precise, factual.** No hype, no hedging.
- Write for two audiences: the security team (technical) and the executive (impact summary).
- Use active voice: "An attacker can extract..." not "Data could potentially be extracted..."
- State facts, not opinions. "The server returns the full database row" not "The server appears to leak data."

## Structure Rules

1. **Impact-first**: Lead with what an attacker can DO, not what's misconfigured. The impact statement is the first thing the reader sees after the title.
2. **Chain-first**: If findings chain, describe the full path. A standalone SQLi is a finding; SQLi → admin creds → RCE is a narrative. Narratives get fixed faster.
3. **PoC discipline**: Every reproduction step must be native-runnable. No "use an intercepting web proxy to..." or "run an automated SQL-injection tool..." — the reader must be able to reproduce with PowerShell + (maybe) Python/Go/Node.
4. **Tier transparency**: State the tier in the PoC section. If Tier 1, state why native wasn't sufficient (one sentence).
5. **Evidence-linked**: Reference the evidence files, don't inline large blobs. Evidence should already be redacted.

## Quality Checklist

Before submitting a report:
- [ ] Title is specific (includes the parameter/endpoint)
- [ ] Impact describes attacker capability, not misconfiguration
- [ ] CVSS score is present and vector string is included
- [ ] Steps to reproduce are numbered and copy-paste ready
- [ ] PoC uses only native commands (or explicitly notes Tier 1 + reason)
- [ ] Evidence is linked and redacted
- [ ] Remediation is specific (file, line, function — not "use parameterized queries")
- [ ] Detection section documents what the blue team would see
- [ ] CWE is referenced
- [ ] No real PII/secrets/passwords in the report body

## Common Mistakes to Avoid

- **"May be vulnerable"** — either it is or it isn't. If you can't confirm, say "unable to confirm" and explain what you tried.
- **Generic remediation** — "input validation" is not a fix. "Use `SqlCommand.Parameters.AddWithValue()` at `UserRepository.cs:142`" is.
- **Missing reproduction** — if it can't be reproduced from your steps, it didn't happen.
- **Overlong reports** — respect the reader's time. A crisp 1-page finding beats a rambling 5-page one.
- **Installing tools in PoC steps** — this is a native-tooling skill. If your PoC says "pip install ...", rewrite it.

## Severity Calibration

| Severity | Criteria |
|----------|---------|
| Critical | RCE, full data breach, admin account takeover, unauthenticated |
| High | Significant data access, privilege escalation, auth bypass |
| Medium | Partial data access, limited impact, requires specific conditions |
| Low | Information disclosure, missing best-practice headers, limited exploitability |
| Info | Observation, no direct security impact but worth noting |
