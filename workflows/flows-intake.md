# Flows — Intake & KB

Flows 1 (process intake), 1a (save URL), 1c (process file), 2 (query), 3 (add technique), 3a (note), 3b (learn), 4 (new category).

**Every technique that enters the KB is normalized to native-tooling form.** When a writeup uses a banned tool (a port scanner, an in-memory credential-dumping tool, an AD attack-path mapping tool, an automated SQL-injection tool, an intercepting web proxy, etc.), the technique's `Payload`/`Steps` MUST be rewritten to the Tier-0 native or Tier-1 equivalent, and the `Tier` field set accordingly. A KB entry that hard-depends on an uninstallable tool fails review — see `native-tooling-doctrine.md ## Banned tools`.

---

## Flow 1 — Process intake

**Trigger:** "process my intake" / pasted URLs / "process the queue".

1. Read `intake/links.md` (queued URLs) and `intake/files/` (dropped docs).
2. For each: fetch (web fetch / `Invoke-WebRequest`) or read the file. **Verification contract applies** — quote verbatim, don't summarize from memory.
3. Extract techniques. For each, decide category via `pattern-index.md`. Multiple categories → one entry per file.
4. **Native-normalize:** if the source used a tool, translate to native/Tier-1. Set `Tier` + (if Tier 1) the `Escalation` one-liner.
5. Dedup against existing entries (Flow 2 search first). Genuine variant → add to `Variations`, not a new entry.
6. Write each technique per `template-technique.md` into the right `agents/<cat>/<file>.md` (Index row + body). Add new tags to `intake/tags.md`.
7. Move processed URLs from `links.md` to `processed.md`.
8. Report: N techniques added, M deduped, which categories, any banned-tool translations made.

## Flow 1a — Save URL
**Trigger:** "save [URL]". Append to `intake/links.md` with a one-line note. Don't process yet unless asked.

## Flow 1c — Process file
**Trigger:** "process [filename]". Same as Flow 1 but scoped to one file in `intake/files/`.

## Flow 2 — Query techniques
**Trigger:** "how to exploit X" / "what do I know about X" / "native equivalent of [tool]".
1. `pattern-index.md` → candidate file(s).
2. Read each file's `## Index` only; match tags (including the **Tier** column — filter by what's available on the box).
3. Read matching `### T[N]` bodies. Synthesize an answer that leads with the native path; mention Tier-1 fallback only if relevant + available.
4. No match → say so; offer to create the category (Flow 4) or answer from built-in knowledge (native-normalized).

## Flow 3 — Add technique
**Trigger:** "add technique" / "save this" / "learn this technique".
Same write path as Flow 1 step 6, for a single user-provided technique. Native-normalize, set `Tier`, dedup, write Index + body, update tags.

## Flow 3a — Note
**Trigger:** "note: [text]". Append raw to `intake/scratch.md` with a timestamp. No processing.

## Flow 3b — Learn this
**Trigger:** "learn this: [observation from current session]".
Promote a session observation into a durable technique. Verify it (the contract applies — re-run the probe if needed), native-normalize, write per Flow 3. If it's engagement-specific (not generalizable), it goes to `ccNotes.md ## What Works Here` instead of the global KB.

## Flow 4 — New category
**Trigger:** "create category for X".
1. Confirm no existing category fits (check `pattern-index.md`).
2. `mkdir agents/<new-cat>/`; create `<new-cat>.md` with the `template-technique.md` Knowledge File Structure.
3. Add routing rows to `pattern-index.md` (keywords → file).
4. Add the row to `SKILL.md ## File Map` and `README.md` tree.
5. Add tags to `intake/tags.md`.
