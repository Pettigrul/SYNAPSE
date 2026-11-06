# Out-of-Ideas Playbook

When the runtime hits an obstacle (a probe fails, a hypothesis is falsified, a native technique returns nothing, a dispatched agent comes back empty), the response is NEVER to stop. Work A → B → C → D **in order**. NEVER skip to (D11) user-delegation without 5+ honest tries from earlier phases.

**Stuck-loop counter:** ≥2 cycles without progress → enter this playbook. ≥6 → write a `@user` task with a surface-context block and KEEP WORKING the playbook (D11 is delegation, not a stop).

---

## Phase A — Recombine what you already have (cheapest)

- **A1 — Chain-fuzz gadgets × leads pairwise.** Take every active gadget and every queued lead; for each pair, ask "does A's output enable B?" Test the plausible ones. Most chains hide here.
- **A2 — Reverse-direction hypothesis.** Start from a high-impact outcome (SYSTEM, domain admin, full account takeover, data exfil) and work backwards: what gadget would I need one step before? Do I have a precursor for it?
- **A3 — Re-graph the attack surface.** Re-read `ccSurface.md` (incl. Windows/AD inventory) as a whole. A surface noted but never probed × a class you haven't tried on it = a free lead.
- **A4 — Failure-log synthesis.** Read `ccFailed.md ## Dead Ends`. A cluster of "blocked by control X" failures often points at where X is *absent* — find the one surface the control doesn't cover.

## Phase B — Apply pressure with native primitives

- **B5 — Chaos on under-tested surfaces.** Run Flow 20 (native fuzz loop) against a surface that only got a polite first-pass. Error intel, parser confusion, type juggling.
- **B6 — Privilege/context matrix re-test.** Re-run probes under a different context: another account, unauth vs auth, a different host in scope, PS5.1 vs PS7, admin vs non-admin shell. Windows behavior shifts hard across contexts.
- **B7 — Time/state manipulation.** Race conditions, TOCTOU, stale-token windows, scheduled-task timing. Forge a Tier-1 concurrency script if native can't hit the window (escalation note required).

## Phase C — Get more signal

- **C8 — Recon refresh.** Re-run Flow 9R at a deeper `RECON_DEPTH`. New subdomain, new endpoint, a service that came up, an SPN you missed.
- **C9 — Documentation / source deep-read.** Read the target's docs, the JS bundle, the source if you have it (Flow 12b). The answer is often written down — the contract requires you to fetch+quote it anyway.

## Phase D — Widen, then delegate (last)

- **D10 — Cross-program transfer + KB rotation.** Flow 14: did a native technique that paid off on another engagement apply here? Rotate through KB categories you haven't touched on this target — load an Index you skipped and tag-match it against the surface.
- **D11 — Delegate to the user (only after 5+ honest tries above).** Write a `@user` task with full context: what you're blocked on, what you tried, exactly what the user input unblocks (a cred, host access, a Tier-1 runtime install, an EDR exclusion, a strategic call). Then KEEP WORKING the next playbook item. D11 is offloading one step, not stopping.

---

## Native-tooling-specific stuck moves

When the block is the tooling constraint itself:
- The native primitive is too slow / can't express the attack → forge the minimal Tier-1 tool (`flows-forge.md`). That IS the move, not a dead end.
- The Tier-1 runtime you need isn't on the box → D11 `@user` task to install it; meanwhile, is there a slower native path? (a `TcpClient` loop instead of a Go scanner; a PowerShell regex instead of an `acorn` walk). Slow-but-native beats blocked.
- A technique only exists in the KB with a banned tool → that's a KB bug; translate it to native on the spot, and flag the entry for Flow 5 cleanup.
