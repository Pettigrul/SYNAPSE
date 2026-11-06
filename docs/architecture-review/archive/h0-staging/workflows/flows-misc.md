# Flows — Utility

Flows 5 (reorganize/migrate), 6 (cross-ref / what chains), 7 (export/backup), 18 (compact techniques).

---

## Flow 5 — Reorganize / migrate
**Trigger:** "reorganize" / "migrate" / "add field to all entries" / "rename category".
Structural KB maintenance. E.g., adding the `Tier` field to legacy entries, splitting an overgrown category, renaming. Always update in lockstep: the KB files, `pattern-index.md`, `SKILL.md ## File Map`, `README.md` tree, `intake/tags.md`. Verify Index-row ↔ technique-body counts match per file after the change. Never leave dangling `[[links]]` or orphaned routing rows.

## Flow 6 — Cross-ref / what chains
**Trigger:** "techniques that work together" / "what chains with X".
Search the KB for techniques whose outputs feed another's inputs (e.g., SeImpersonate token abuse → SYSTEM → LSASS dump → domain creds → lateral). Surface chain templates. For engagement-specific chains, use the auto-chain check (`flows-status.md`) against live gadgets instead.

## Flow 7 — Export / backup
**Trigger:** "export" / "backup" / "export my knowledge base".
Bundle the skill (or an engagement) for transfer. KB export = `agents/` + `references/` + `reports/` + `intake/tags.md`. Engagement export = the whole engagement tree (already portable-filename-safe). Use `Compress-Archive` (native) — write to a path the user names. Never include `.config` secrets in a shared export (strip creds).

## Flow 18 — Compact techniques
**Trigger:** "compact techniques" / "merge variants".
Reduce KB bloat: find near-duplicate techniques across a category, merge the weaker into the stronger as a `Variations` entry, keep the most general `When`/`Why`. Preserve every distinct native path and every distinct Tier-1 escalation — don't collapse a native technique and its Tier-1 fallback into one if they're genuinely different approaches. Verify Index counts after.
