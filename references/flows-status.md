# Flows — Status, Lifecycle & Recommendation

Flows 11 (status / recommend / surface / coverage / leads / gadgets), 13 (compact notes), 14 (cross-program), 15 (re-test), 16 (checkpoint). Plus leads/gadgets lifecycle, reportability assessment, auto-chain check, and report lifecycle transitions.

---

## Flow 11 — Status / What next / Surface / Coverage / Leads / Gadgets

**Read FIRST:** both sections of `toDoList.md`. Status output ALWAYS surfaces open `@user` tasks (one line each, oldest first).

- **"status" / "where was I":** dashboard — open runtime tasks, open `@user` tasks, active gadgets, queued leads, last recon session, runtime availability summary.
- **"what next?" / "suggest":** smart recommendation = the next unchecked RUNTIME task in priority order, unless the user asks off-list. `@user` tasks are NOT eligible runtime objectives. If no obvious move, load `references/ideas-when-stuck.md` and pick from the A→B→C→D playbook.
- **"what's the attack surface" / "show surface":** summarize `ccSurface.md` (hosts, Windows/AD inventory, endpoints).
- **"coverage" / "what's been tested":** summarize coverage rows from `ccLog.md` recon entries by verdict; list top untested surfaces.
- **"leads":** list `ccLeads.md` by status. **"gadgets":** list `ccGadgets.md` active/archived with Tier used + reportability.

**Working norm:** after a status output, if open runtime tasks remain, work through them and then report back.

---

## Leads Lifecycle

- **Create (auto):** a qualifying signal → new `ccLeads.md` LEAD-NNN, status `queued`. In conversation mode, "this looks interesting" auto-creates one (verification contract applies).
- **Activate:** begin investigating → status `active`.
- **Promote:** confirmed exploitable → run triage (see reportability) → create `ccGadgets.md` GAD-NNN, mark the lead `→ GAD-NNN`.
- **Kill:** falsified → move the full entry to `ccFailed.md ## Dead Leads` with a kill reason.

---

## Gadgets Lifecycle

On a new gadget: **(1)** record `Tier used`, **(2)** run the auto-chain check, **(3)** run the reportability assessment.

### Auto-Chain Check
Against ALL active gadgets AND queued leads: is there a one-sentence hypothesis "GAD-A's X + GAD-B's Y = higher-impact Z"? If yes, add to the gadget's `**Chains with:**` and (if it would otherwise be report-ready at medium) downgrade reportability to `chain-first — exploring [GAD/LEAD-N]`. Create/update a `2-Findings/` file documenting the chain test plan.

### Reportability Assessment (impact-first — see SKILL.md)
- `report-ready` — high standalone impact, **demonstrated** (not precursor). For Windows: a confirmed privesc to SYSTEM/admin, a confirmed cred that grants new access, a confirmed lateral hop — not "SeImpersonate is enabled" alone. For web: a confirmed XSS firing, a confirmed IDOR returning another principal's data — not "input reflected" alone.
- `chain-first — [reason]` — medium alone; look for chains first.
- `gadget-only — [reason]` — low-hanging; keep for chaining only.

A gadget that is only precursor evidence is downgraded to `chain-first — pending impact demonstration` with the missing step in `Missing:`. This prevents AUTO_REPORT firing on weak evidence.

---

## Flow 13 — Compact notes
**Trigger:** "compact notes". Condense `ccNotes.md` Technique History + `ccLog.md` into tighter summaries without losing load-bearing facts (what works, what's dead, runtime availability). Move superseded detail to `8-Archive/` with a date prefix.

## Flow 14 — Cross-program
**Trigger:** "cross-program" / "what patterns". Read all engagements' `ccNotes.md ## What Works Here`. Surface recurring native techniques that paid off across engagements (e.g., "unquoted service path privesc hit on 3 of 4 Windows engagements"). Useful for refining the KB.

## Flow 15 — Re-test findings
**Trigger:** "re-test findings" / regression. Re-run the live probe for each confirmed finding/gadget (the contract requires a fresh probe anyway). Patched → mark `downgraded`, note the date. Still live → refresh `**Coordinator re-verified:**`.

## Flow 16 — Checkpoint
**Trigger:** "save checkpoint" / near context limit. Write `checkpoint.md`: current objective, open tasks, active gadgets/leads one-liners, the exact next 1–3 actions, runtime availability. Replayed by Flow 8 on resume.

---

## Report lifecycle transitions

- **On Hold:** "hold report [NNN]" → move `1-Reports/[NNN]-*/` to `1-Reports/OnHold/`. "resume report [NNN]" → move back.
- **Submitted:** "I reported [NNN]" / "submitted" → move to `1-Reports/Reported/Triaged/`.
- **Verdict update:** "[NNN] accepted/paid" → `Reported/Accepted/` (assign a fresh paid-dir absolute number from 001). "[NNN] duplicate / informative / N/A / OOS / disputed" → the matching `Reported/<status>/` bucket. Log the verdict; update cc references.
- **Withdrawal:** "withdraw report [NNN]" → move to `9-Trashcan/` with date prefix, note the reason.

---

## Gadget Update
**Trigger:** "update gadget GAD-X" / "found the bypass for GAD-X". Edit the gadget entry, re-run the auto-chain check + reportability assessment, refresh `**Coordinator re-verified:**`. If the bypass turns a `chain-first` into `report-ready`, surface that.
