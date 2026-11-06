# SYNAPSE

This project uses the SYNAPSE harness. This file is a pointer; it grants no permissions.

- Dispatcher and rules: read `SKILL.md` before any security analysis or engagement work; open the file, don't answer from this pointer. Skill name: `security-auditor`.
- Operational skills: `.claude/skills/<name>/SKILL.md`. A `/name` in them is a skill name: if this runtime has no such slash command, open that file and follow it (Pi: `/skill:<name>`).
- CLIs, run from this directory: `node tools/workspace/cli.mjs` (engagements: `list`, `init`, `use`, `scope`, `bootstrap`, `active`, `next`), `node tools/modes/cli.mjs` (`status`, `copilot`, `autopilot`), `node tools/preflight/cli.mjs doctor`. Use `--help` on them; don't guess paths.
- Activating or selecting an engagement authorizes nothing. Scope Guard, Execution Context and Approval Gate exist only inside `securityauditor_*` tools: without those tools, or in a shell, nothing enforces them, so never claim that protection.
