# Report Triager — Instructions
_Last updated: 2026-06-25_

Instructions for triage assessment of findings before report submission.

## Triage Decision Tree

```
1. Is it reproducible right now?
   NO  → Don't report. Investigate further or note as "unconfirmed."
   YES ↓

2. Is the impact real (not theoretical)?
   NO  → Informational at best. Does the program accept informational? If not, skip.
   YES ↓

3. Does it affect confidentiality, integrity, or availability of real data/systems?
   NO  → Low/Informational. Check program scope.
   YES ↓

4. Is it in scope?
   NO  → Don't report (or report as out-of-scope bonus if the program allows).
   YES ↓

5. Is it a duplicate of a known/common issue the program likely knows about?
   LIKELY → Check known issues / previous reports. Still submit if you have a novel angle.
   NO     ↓

6. Rate severity:
   - Can an unauthenticated attacker exploit it? → bump severity
   - Does it require user interaction? → lower severity
   - Does it chain with other findings? → rate the chain, not the individual link
   - What's the blast radius? (one user vs all users vs the infrastructure)
```

## Reportability Assessment (Native-Specific)

For host-side findings, impact must be demonstrated, not assumed:

| Finding | Reportable as-is? | Why |
|---------|-------------------|-----|
| SeImpersonatePrivilege enabled | NO | It's a default config. Show the actual escalation to SYSTEM. |
| Unquoted service path with spaces | MAYBE | Only if a writable dir exists in the path. Show the DLL/exe you'd place. |
| Weak service permissions | YES (if demonstrated) | Show `sc config` changing the binPath, service restart, SYSTEM execution. |
| LSASS dump successful | YES | Demonstrate the dump, show hashes (redacted), show they crack or PTH. |
| Domain admin via AD chain | YES | Full chain: initial foothold → enum → privesc → lateral → DA. This is the narrative. |

For web-side findings:
| Finding | Reportable as-is? | Why |
|---------|-------------------|-----|
| Reflected XSS (self) | LOW | Self-XSS requires social engineering. Show it fires for another user. |
| SQLi (error-based) | YES | Error confirms injection; extract to prove data access. |
| IDOR read | YES | Show another user's data (redacted). |
| IDOR write/delete | CRITICAL | Demonstrate data modification as another user. |
| Open redirect | LOW | Unless it chains (OAuth token theft, phishing). Show the chain. |
| Missing rate limit | DEPENDS | On login = medium. On search = informational. Context matters. |

## Pre-Submit Checklist

- [ ] Reproduced within the last 24 hours
- [ ] Steps are copy-paste runnable (native)
- [ ] Impact is described in attacker-capability terms
- [ ] Evidence is attached and redacted
- [ ] Severity matches the decision tree above
- [ ] Not a known duplicate
- [ ] In scope per the program's policy
