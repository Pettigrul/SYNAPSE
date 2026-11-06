# Assessment Methodology — Knowledge Base
_Last updated: 2026-06-25_

Decision framework for how to approach an engagement. Covers host-first vs web-first, the assessment lifecycle, and checklist discipline.

## Scope Decision: Host-First vs Web-First

| Signal | Start with |
|--------|-----------|
| You have local/RDP/SSH access to a Windows box | **Host-first** (host-inventory → privesc → lateral) |
| You have only web URLs / API endpoints | **Web-first** (web-inventory → web-testing) |
| You have both | Host-first for host scope, web-first for web scope — run in parallel tracks |
| Internal pentest / AD engagement | **Host-first** — AD-enum, credential-review, host-to-host-access are the path |
| Bug bounty / external | **Web-first** — web-inventory, web-testing; host techniques apply only if you land a shell |

## Assessment Lifecycle

### Phase 1: Scope & Setup
1. Load scope (`flows-scope.md` — Flow 8)
2. Runtime availability check (`$PSVersionTable`, `Get-Command python,go,node`)
3. Set up engagement directory (`template-files.md`)
4. Configure proxy if needed (`flows-proxy.md`)

### Phase 2: Reconnaissance
**Host track (if applicable):**
1. `host-inventory` — system info, users, network, services, scheduled tasks, installed software
2. `directory-review` — if domain-joined: users, groups, SPNs, GPOs, trusts, ACLs
3. Note findings in `ccSurface.md ## Windows / AD Inventory`

**Web track (if applicable):**
1. `web-inventory` T6 — robots/sitemap/well-known (passive)
2. `web-inventory` T1 — header fingerprint
3. `web-inventory` T5/T3 — CT + subdomain enum
4. `web-inventory` T2 — content discovery
5. `web-inventory` T4 — JS pull + grep
6. `web-inventory` T7 — API schema discovery
7. Note findings in `ccSurface.md`

### Phase 3: Vulnerability Discovery
**Host track:**
1. `privilege-review` — check each technique against enumeration data
2. `credential-review` — if admin or if credentials are reachable
3. `persistence` — if demonstrating foothold durability is in scope

**Web track:**
1. Walk through `web-testing` techniques against each endpoint
2. Priority order: auth bypass (T8) → IDOR (T5) → SQLi (T3) → SSRF (T6) → XSS (T1/T2) → everything else
3. Test each input with the relevant probe

**Code review (if source available):**
1. `code-review` T1 — sink scan
2. `code-review` T4 — secrets grep
3. Trace confirmed sinks (T2) to validate findings

### Phase 4: Exploitation & Proof
1. Confirm each finding with a clean reproduction (verification contract)
2. Minimize proof data — hash/count/redacted sample, never real PII
3. Record evidence per `evidence-hygiene`
4. Try to chain findings for maximum impact

### Phase 5: Lateral Movement & Post-Exploitation (host engagements)
1. `host-to-host-access` — using native paths only
2. `data-egress-check` — demonstrate data reach (minimal proof)
3. `telemetry-awareness` — document detection coverage

### Phase 6: Reporting
1. `flows-report.md` — structure and quality bar
2. Impact-first: what can the attacker DO, not just what's misconfigured
3. Chain-first: connect findings into attack narratives
4. Every PoC step must be native-runnable on the target

### Phase 7: Cleanup
1. Remove all persistence (services, tasks, reg keys, WMI subscriptions, staged files)
2. Remove all shadow copies / BITS jobs
3. Verify removal (re-enumerate)
4. Document cleanup in the report

## Checklist: Per-Finding Quality Gate

Before recording a finding:
- [ ] Can I reproduce it right now? (verification contract)
- [ ] Is the PoC native-runnable? (no installed tools in the steps)
- [ ] Is the impact stated in terms of what an attacker can DO?
- [ ] Is the evidence minimal? (no real PII/secrets in bulk)
- [ ] Is the tier + escalation noted? (if Tier 1)
- [ ] Is the detection footprint documented?

## Checklist: End-of-Engagement

- [ ] All persistence removed
- [ ] All staged files removed
- [ ] Cleanup verified by re-enumeration
- [ ] Report reviewed for native-runnable PoCs
- [ ] All findings have verified=true in the engagement log
