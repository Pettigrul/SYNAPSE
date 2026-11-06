# Flows — Reports

Flows 10 (write report), 10b (revise report). Also drives the triager. Loads `reports/template.md`, `reports/impact-library.md`, `reports/precedent-library/<class>.md`, `reports/agent-writer.md`, `reports/agent-triager.md`, and `agents/evidence-hygiene/evidence-hygiene.md`.

**Gate:** Flow 10 only fires when the gadget is `report-ready` under the impact-first bar (`SKILL.md ## Reporting quality bar`). AUTO_REPORT honors the same gate.

---

## Flow 10 — Write report

**Trigger:** "write the report" / "draft finding [from GAD-NNN]". Or AUTO_REPORT on a `report-ready` gadget.

1. **Verify the gadget is report-ready** (demonstrated impact, not precursor). Not yet → tell the user what's missing, create/update the `2-Findings/` working doc, do NOT write a report.
2. **Re-verify every factual claim** the report will make (the contract). Re-run the host command / re-hit the endpoint in THIS session. A report is the highest-stakes output — no unverified claims.
3. **Load precedent** for the class (`reports/precedent-library/<class>.md`) for severity anchoring.
4. **Draft** per `reports/template.md` using `reports/agent-writer.md` style. Pull the chain summary + gadget table from the `2-Findings/` file. Pull impact framing from `reports/impact-library.md`.
5. **Native-tooling PoC discipline:** every reproduction step must be a command runnable on the target as-is — native PowerShell/cmd/LOLBin, or a Tier-1 script committed to `1-Reports/[NNN]-*/poc-N-*`. State the tier and any runtime prerequisite ("requires Python 3 on the host"). The report must NOT instruct the reader to install a tool — if the PoC needed a Tier-1 runtime, say which and that it was already present (or staged) per scope.
6. **Evidence hygiene** (`agents/evidence-hygiene/evidence-hygiene.md`): redact credentials/PII, sanitize logs, mask tokens before any evidence goes in the report.
7. **Number** the report: scan `1-Reports/` (incl. `9-Trashcan/Hallucinations/`) for the highest NNN, next + 1. Write to `1-Reports/[NNN]-[kebab-title]/report.md`.
8. **Triage** (if AUTO_TRIAGE): run the triager (`reports/agent-triager.md`) — QA the claims, detect fabrication. Hallucinated → move to `9-Trashcan/Hallucinations/[NNN]-*`. Clean → leave in root (ready to submit).
9. **End the chat reply with a `## Verified Claims` footer.**

---

## Flow 10b — Revise report

**Trigger:** "revise report [NNN]" / "they asked about [NNN]" / "update report [NNN]".

Read the existing report. Apply the user's edit or the program's feedback. **Re-verify any factual claim touched by the revision** (the contract). If the revision adds a new claim, it earns its place by a fresh probe. Keep the PoC native-runnable. Re-triage if AUTO_TRIAGE.

---

## Triager (dispatched per `reports/agent-triager.md`)

Two modes:
- **Mode 1 — gadget verify:** before a gadget is marked report-ready, independently re-confirm the exploitable behavior in this session.
- **Mode 2 — report QA:** after a draft, audit every claim against its cited evidence; flag any that can't be reproduced. Fabricated endpoint/response/host-state → route the report to `9-Trashcan/Hallucinations/`.

The triager brief embeds the verification contract verbatim and the relevant native-tooling slice (it must reproduce using native tooling too).
