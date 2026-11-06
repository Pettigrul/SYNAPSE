# Flow 21 — Forge (native micro-tool builder)

Builds throwaway assessment tools — but ONLY within the native-tooling constraint. The forge does NOT install tools; it WRITES them, in PowerShell (Tier 0) or a Tier-1 runtime (Python/Go/Node) when native can't do the job. Every forged tool is the native replacement for a banned tool.

**Trigger:** "build me a [tool]" / "forge [tool]" / "I need a [tool]" / "set up [tool]". Teardown: "tear down [tool]" / "forge cleanup".

**Load `native-tooling-doctrine.md` first** — the forge's whole reason for existing is to give you the tool you're not allowed to install.

---

## Build protocol

1. **Can Tier 0 do it?** If a PowerShell one-liner / short script suffices, write that. Done.
2. **No?** Name the one-sentence escalation. Check the needed Tier-1 runtime is present + allowed (`scope.md ## Runtime Availability`, `ALLOW_TIER1`). Absent → `@user` task to install it, OR find a native path.
3. **Write** the tool to `5-Scripts/[name].{ps1,py,go,js}` with the 2-line header (tier + escalation reason). Prefer stdlib — no third-party deps without authorization.
4. **Test** it against a benign target / dry-run; verify it works (the contract).
5. **Register** reusable tools in `ccNotes.md ## What Works Here` so future cycles reuse them.

PoCs tied to one report go in `1-Reports/[NNN]-*/poc-N-*`, not `5-Scripts/`.

---

## Blueprint catalog

| Tool | Replaces | Tier | Native/Tier-1 approach |
|------|----------|------|------------------------|
| **Port scanner** | a port scanner | 0 (small) / 1-go (large) | PowerShell `TcpClient`/`Test-NetConnection` loop; Go `net.Dial` with goroutines for /16-scale concurrency |
| **Content/dir buster** | a content-discovery fuzzer | 0 / 1-go | `Invoke-WebRequest` loop over a forged list; Go concurrent prober for big lists |
| **Subdomain enum** | subdomain enumerators | 0 | crt.sh `Invoke-RestMethod` + `Resolve-DnsName` brute over forged list |
| **Wordlist generator** | (custom) | 0 | extract endpoints/params/naming from recon + JS → `6-Lists/`; small target-aware list beats generic |
| **Param miner** | param-mining tools | 0 / 1-python | forged param list + `Invoke-WebRequest` diff loop; Python for response-diff scale |
| **Raw-socket HTTP / smuggler** | raw TCP client / repeater in an intercepting web proxy | 1-python | `socket`+`ssl` for HTTP/1.1 pipelining, CL.TE/TE.CL, malformed requests (PS can't pipeline cleanly) |
| **JWT toolkit** | a JWT manipulation tool | 1-python | `hmac`/`hashlib`/`base64` — alg-none, alg-confusion, weak-secret brute |
| **Callback / OAST listener** | OAST/collaborator services | 0 / 1-python | `HttpListener` (PS) or Python `http.server` on a box you control to catch blind XSS/SSRF/OOB; DNS catch needs a controllable resolver (`@user` task if none) |
| **SQLi extractor** | an automated SQL-injection tool | 1-python | boolean/time-based blind extraction loop (`http.client`, `concurrent.futures`) |
| **Port forwarder / pivot** | tunneling/relay tools | 0 / 1-go | `netsh interface portproxy`, PowerShell `TcpListener` relay, Go TCP relay |
| **JS deobfuscator / AST walker** | (custom) | 1-node | `acorn` parse + walk for sink/gadget hunting in real bundles (npm authorized only) |
| **AD enum collector** | an AD data collector | 0 | `DirectorySearcher` queries dumped to JSON in `3-Recon/` — you build the graph view manually |
| **Hash/crypto helper** | a password-cracking tool (light) | 1-python | NOT a cracker — small dictionary checks, format ID, length-extension; heavy cracking is a `@user` task (offline, their hardware) |

---

## Teardown

"tear down [tool]" / "forge cleanup": stop any running listener/job (`Stop-Job`, kill the process), remove any host-side artifact you staged (the constraint cuts both ways — clean up what you dropped), archive the script to `8-Archive/` with a date prefix, note the teardown in `ccLog.md`. Never leave a listener or relay running past the engagement.
