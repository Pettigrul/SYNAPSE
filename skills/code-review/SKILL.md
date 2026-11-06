---
name: code-review
description: >-
  Code Review / Audit (native) — Knowledge Base — Source code review techniques for finding
  vulnerabilities. No SAST tools installed — grep, regex, and manual trace through the code. Tier-1
  scripts for automated pattern matching across large codebases. Triggers: code review, source
  analysis, sink, source-to-sink, taint, reachability, attack surface map, dependency inventory, sink
  sweep, Select-String grep, AST walk, acorn, sink pattern, dangerous sink, eval, innerHTML, exec,
  deserialize, hardcoded secret.
license: MIT
metadata:
  user-invocable: "false"
  origin: agents/code-review/code-review.md (verbatim; frontmatter prefixado)
  progressive-disclosure: index-first
---
# Code Review / Audit (native) — Knowledge Base
_Last updated: 2026-06-25_

Source code review techniques for finding vulnerabilities. No SAST tools installed — grep, regex, and manual trace through the code. Tier-1 scripts for automated pattern matching across large codebases.

## Index
| # | Technique | When | Tier | Tags |
|---|-----------|------|------|------|
| T1 | Sink-driven review | Have source access, want to find vulns fast | 0-native | code-review, sink |
| T2 | Input trace (source → sink) | Found a user input, trace to dangerous use | 0-native | code-review, trace |
| T3 | Auth/authz logic review | Review access control implementation | 0-native | code-review, auth |
| T4 | Secrets / hardcoded credentials grep | Quick win — find leaked secrets in source | 0-native | code-review, secrets |
| T5 | Dependency / supply-chain check | Identify vulnerable or malicious dependencies | 0-native | code-review, supply-chain |
| T6 | Deserialization review | Find unsafe deserialization in code | 0-native | code-review, deserialization |
| T7 | SQL query construction review | Find SQL injection at the code level | 0-native | code-review, sqli |
| T8 | File operation review | Find path traversal / arbitrary file ops | 0-native | code-review, file-ops |
| T9 | Crypto misuse review | Find weak crypto, hardcoded keys, bad RNG | 0-native | code-review, crypto |
| T10 | Race condition / TOCTOU review | Find concurrency bugs exploitable for security | 0-native | code-review, race |
| T11 | Automated sink scanner | Scan a large codebase for all sink patterns | 1-python | code-review, scanner, tier1-python |

## Techniques

### T1: Sink-driven review
Tags: code-review, sink
When: Have source access — start by finding dangerous function calls (sinks).
Why: Sinks are where damage happens (exec, query, file write, redirect). Finding sinks and tracing back to user input is the fastest code-review methodology.
Tier: 0-native
Steps: 1. Grep for sink patterns per language 2. For each hit, trace the data flow back to the source (user input) 3. Check for sanitization/validation in between
Payload:
```powershell
# common sinks by language — adapt to the target
$sinks = @{
    python = 'eval\(|exec\(|subprocess|os\.system|os\.popen|pickle\.loads|yaml\.load\(|render_template_string|__import__|compile\('
    javascript = 'eval\(|child_process|\.exec\(|\.execSync|innerHTML|\.html\(|document\.write|Function\(|setTimeout\(.*\$|vm\.runIn'
    java = 'Runtime\.exec|ProcessBuilder|\.executeQuery\(|Statement\.(execute|executeUpdate)|ObjectInputStream|readObject\(|\.getParameter\('
    csharp = 'Process\.Start|SqlCommand|\.ExecuteReader|\.ExecuteNonQuery|BinaryFormatter|DeserializeObject|HttpUtility\.HtmlEncode'  # encode = absence check
    php = 'eval\(|exec\(|system\(|passthru|shell_exec|popen|unserialize|include\s*\$|require\s*\$|preg_replace.*\/e'
}
$lang = "python"  # adjust
Get-ChildItem -Recurse -Include *.py | Select-String -Pattern $sinks[$lang] | Format-Table -Property Filename, LineNumber, Line -AutoSize
```
Signal: list of sink locations to trace. | Pitfall: not every sink is exploitable — you must trace back to confirm user-controlled data reaches it without sanitization.
Source: distilled sink-driven code review — 2026-06-25

### T2: Input trace (source → sink)
Tags: code-review, trace
When: Found a user-input entry point — trace forward to see if it reaches a sink unsanitized.
Why: The complementary approach to T1 — start at the source (request params, headers, file uploads, env vars) and follow the data through the code.
Tier: 0-native
Steps: 1. Identify all input sources 2. Follow variable assignments / function calls 3. Check for sanitization at each step 4. Stop if it reaches a sink
Payload:
```powershell
# find all input sources (Python/Flask example)
Get-ChildItem -Recurse -Include *.py | Select-String -Pattern 'request\.(args|form|json|data|files|headers|cookies)\[' | Format-Table Filename, LineNumber, Line -AutoSize
```
Signal: trace path from source to sink documented. | Pitfall: frameworks often apply global sanitization (Django auto-escapes templates, Rails parameterizes SQL by default) — check if the framework's default protections are bypassed by raw queries or `|safe` filters.
Source: distilled input-trace review — 2026-06-25

### T3: Auth/authz logic review
Tags: code-review, auth
When: Reviewing access control — who can do what, and is it enforced.
Why: Auth bugs are logic bugs — no automated scanner finds them. Look for: missing auth decorators, role checks that use client-side data, IDOR-prone direct object references, inconsistent enforcement across endpoints.
Tier: 0-native
Steps: 1. Map all endpoints/routes 2. Check each for auth middleware/decorator 3. Verify role checks use server-side session data 4. Check for horizontal authz (object ownership)
Payload:
```powershell
# find routes missing auth decorator (Python/Flask example)
Get-ChildItem -Recurse -Include *.py | Select-String -Pattern '@app\.(route|get|post|put|delete)' | ForEach-Object {
    $file = $_.Path; $line = $_.LineNumber
    $next5 = Get-Content $file | Select-Object -Skip ($line) -First 5
    if ($next5 -notmatch 'login_required|auth|permission|jwt_required|token_required') {
        "[NO-AUTH] $file:$line — route without visible auth decorator"
    }
}
```
Signal: endpoints without auth enforcement. | Pitfall: auth may be applied at the middleware/framework level (not per-route) — check the app's middleware stack before flagging.
Source: distilled auth review — 2026-06-25

### T4: Secrets / hardcoded credentials grep
Tags: code-review, secrets
When: Quick pass to find leaked secrets in source.
Why: Hardcoded API keys, passwords, tokens, and connection strings are common and high-impact — a grep finds them instantly.
Tier: 0-native
Steps: 1. Grep for secret patterns 2. Verify they're real (not examples/tests) 3. Record
Payload:
```powershell
$patterns = @(
    'password\s*=\s*["\x27][^"\x27]{4,}',
    'api[_-]?key\s*=\s*["\x27]',
    'secret\s*=\s*["\x27]',
    'token\s*=\s*["\x27][A-Za-z0-9+/=]{20,}',
    'AKIA[0-9A-Z]{16}',           # AWS access key
    'ghp_[A-Za-z0-9]{36}',        # GitHub PAT
    'sk-[A-Za-z0-9]{48}',         # OpenAI / Stripe
    'eyJ[A-Za-z0-9_-]+\.eyJ',     # JWT
    'BEGIN (RSA |EC )?PRIVATE KEY'
)
$patterns | ForEach-Object {
    Get-ChildItem -Recurse -Include *.py,*.js,*.ts,*.java,*.cs,*.go,*.rb,*.yaml,*.yml,*.json,*.env,*.cfg,*.ini,*.conf |
        Select-String -Pattern $_ | Where-Object { $_.Path -notmatch '(test|spec|mock|example|node_modules|vendor|\.git)' }
}
```
Signal: real credentials in source. | Pitfall: skip test fixtures and example files. Validate by checking if the key format matches the provider's pattern (AWS keys start `AKIA`, etc.).
Source: distilled secrets grep — 2026-06-25

### T5: Dependency / supply-chain check
Tags: code-review, supply-chain
When: Reviewing a project's dependencies for known vulns or suspicious packages.
Why: Vulnerable dependencies are a common attack surface. Check lockfiles against public advisory databases.
Tier: 0-native
Steps: 1. Identify package manifest (requirements.txt, package.json, go.mod, pom.xml) 2. Check for known CVEs 3. Look for typosquatted or unusual packages
Payload:
```powershell
# list Python deps and check against pip audit (if available) or manually
Get-Content requirements.txt | ForEach-Object {
    $pkg = ($_ -split '[=<>!]')[0].Trim()
    if ($pkg) { "[DEP] $pkg — check https://pypi.org/project/$pkg/#history" }
}

# Node: check for suspicious install scripts
$pkg = Get-Content package.json | ConvertFrom-Json
$pkg.scripts | Format-List   # look for preinstall/postinstall scripts
$pkg.dependencies.PSObject.Properties | ForEach-Object {
    if ($_.Name -match '^\d|[^a-z0-9@/_-]') { "[SUSPICIOUS] unusual package name: $($_.Name)" }
}
```
Signal: vulnerable or suspicious dependencies. | Pitfall: lockfile pins exact versions — check THOSE, not the range specifier. Some supply-chain attacks use legitimate-looking package names.
Source: distilled supply-chain review — 2026-06-25

### T6: Deserialization review
Tags: code-review, deserialization
When: Looking for unsafe deserialization in code.
Why: Code-level review catches deser sinks that dynamic testing misses (internal-only endpoints, message queues, file parsers).
Tier: 0-native
Payload:
```powershell
$deser_sinks = @{
    python = 'pickle\.(loads?|Unpickler)|yaml\.load\((?!.*Loader=.*SafeLoader)|marshal\.loads|jsonpickle\.decode'
    java = 'ObjectInputStream|readObject|readUnshared|XMLDecoder|XStream\.fromXML|fromJson.*Object\.class'
    csharp = 'BinaryFormatter|SoapFormatter|LosFormatter|ObjectStateFormatter|NetDataContractSerializer|JavaScriptSerializer'
    php = 'unserialize\(|__wakeup|__destruct'
    ruby = 'Marshal\.load|YAML\.load(?!_safe)'
}
$lang = "java"
Get-ChildItem -Recurse -Include *.java | Select-String -Pattern $deser_sinks[$lang]
```
Signal: deser sinks found → trace data source. | Pitfall: in Java, `readObject` on a `ByteArrayInputStream` fed by user input = classic RCE. But `readObject` on a trusted source (file from server config) is fine — context matters.
Source: distilled deser code review — 2026-06-25

### T7: SQL query construction review
Tags: code-review, sqli
When: Checking for SQL injection at the code level.
Why: String concatenation/interpolation in SQL queries = injection. Parameterized queries/prepared statements = safe. Grep for the former.
Tier: 0-native
Payload:
```powershell
# find string-concat SQL (Python example)
Get-ChildItem -Recurse -Include *.py | Select-String -Pattern '(execute|cursor\.execute|raw|query)\s*\(\s*[f"\x27].*(%s|\{|"\s*\+|\x27\s*\+|%\s*\()' |
    Where-Object { $_.Line -notmatch 'paramstyle|placeholder' }
```
Signal: SQL built with string interpolation. | Pitfall: ORMs like SQLAlchemy/Django ORM are generally safe — but `raw()`, `extra()`, and `.execute()` bypass the ORM and need review.
Source: distilled SQL review — 2026-06-25

### T8: File operation review
Tags: code-review, file-ops
When: Looking for path traversal or arbitrary file read/write/delete.
Why: If user input reaches a file path without normalization, `../../etc/passwd` works. Look for `open()`, `readFile()`, `Path.Combine()` with user data.
Tier: 0-native
Payload:
```powershell
$file_sinks = @{
    python = 'open\(|os\.path\.join\(|shutil\.(copy|move)|send_file\(|send_from_directory'
    javascript = 'readFile|writeFile|createReadStream|createWriteStream|path\.join|path\.resolve|fs\.'
    java = 'new File\(|FileInputStream|FileOutputStream|Files\.(read|write|copy|move)'
    csharp = 'File\.(Read|Write|Open|Delete|Copy|Move)|Path\.Combine|StreamReader|StreamWriter'
}
$lang = "python"
Get-ChildItem -Recurse -Include *.py | Select-String -Pattern $file_sinks[$lang]
```
Signal: file ops using user-controlled paths. | Pitfall: `os.path.join("/base", user_input)` is NOT safe if `user_input` starts with `/` — it ignores the base. Check for `os.path.normpath` + prefix validation.
Source: distilled file-ops review — 2026-06-25

### T9: Crypto misuse review
Tags: code-review, crypto
When: Checking cryptographic implementations.
Why: Weak algorithms (MD5/SHA1 for passwords, ECB mode, static IVs, hardcoded keys) are common and exploitable.
Tier: 0-native
Payload:
```powershell
$crypto_issues = @(
    'MD5|md5\(',
    'SHA1(?!\.)|sha1\(',
    'DES\b|3DES|TripleDES',
    'ECB',
    'AES.*key\s*=\s*["\x27]',           # hardcoded AES key
    'random\(\)|Math\.random|rand\(',    # weak RNG for crypto
    'iv\s*=\s*["\x27]|IV\s*=.*0{16}',   # static IV
    'verify\s*=\s*False|VERIFY_NONE'     # disabled TLS verify
)
$crypto_issues | ForEach-Object {
    Get-ChildItem -Recurse -Include *.py,*.js,*.java,*.cs,*.go | Select-String -Pattern $_
}
```
Signal: weak crypto primitives or hardcoded keys. | Pitfall: MD5/SHA1 for checksums (not passwords) may be acceptable — context matters. `random()` for non-security purposes is fine.
Source: distilled crypto review — 2026-06-25

### T10: Race condition / TOCTOU review
Tags: code-review, race
When: Code checks a condition and then acts on it — window for exploitation between check and use.
Why: TOCTOU in auth checks, balance operations, file operations, or coupon redemption can be exploited with concurrent requests.
Tier: 0-native
Steps: 1. Find check-then-act patterns 2. Determine if they're atomic 3. Test with concurrent requests
Payload:
```powershell
# find check-then-act patterns (look for if-check followed by state change)
# manual review pattern — grep for balance/credit/coupon/redeem/transfer/withdraw
Get-ChildItem -Recurse -Include *.py,*.js,*.java | Select-String -Pattern '(balance|credit|stock|quantity|coupon|redeem|transfer|withdraw)' |
    Group-Object Path | Where-Object { $_.Count -gt 1 } | Select-Object Name

# test with concurrent requests (PowerShell jobs)
1..10 | ForEach-Object -Parallel {
    Invoke-RestMethod "https://target.example/api/redeem" -Method POST -Body '{"code":"SAVE10"}' -ContentType 'application/json' -Headers @{Authorization="Bearer $using:tok"}
} -ThrottleLimit 10
```
Signal: multiple successful redemptions of a single-use resource. | Pitfall: PowerShell `-Parallel` requires PS 7+. For PS 5.1, use `Start-Job` or the Python concurrent approach.
Source: distilled race-condition review — 2026-06-25

### T11: Automated sink scanner
Tags: code-review, scanner, tier1-python
When: Large codebase — need to scan all files for all sink patterns efficiently.
Why: A Python script can walk the tree, apply all sink regexes per language, and output a prioritized report. Faster than manual grep for large repos.
Tier: 1-python
Escalation: PowerShell `Get-ChildItem | Select-String` across thousands of files with dozens of patterns is slow; Python `os.walk` + compiled regex is significantly faster for large codebases.
Payload:
```python
#!/usr/bin/env python3
# Tier: 1-python | Escalation: performance for large codebase scanning
import os, re, sys

SINKS = {
    '.py': [
        (r'eval\(|exec\(', 'RCE'),
        (r'subprocess|os\.system|os\.popen', 'command-injection'),
        (r'pickle\.loads?|yaml\.load\(', 'deserialization'),
        (r'cursor\.execute\(.*[f"\'].*[\{%]', 'sqli'),
        (r'open\(.*\+', 'file-ops'),
        (r'render_template_string', 'ssti'),
    ],
    '.js': [
        (r'eval\(|child_process|\.exec\(', 'RCE'),
        (r'innerHTML|\.html\(|document\.write', 'xss'),
        (r'\.query\(.*[\`\$\+]', 'sqli'),
    ],
    '.java': [
        (r'Runtime\.exec|ProcessBuilder', 'RCE'),
        (r'ObjectInputStream|readObject', 'deserialization'),
        (r'executeQuery\(.*\+', 'sqli'),
    ],
}

root = sys.argv[1] if len(sys.argv) > 1 else "."
findings = []
for dirpath, _, filenames in os.walk(root):
    if any(skip in dirpath for skip in ['.git', 'node_modules', 'vendor', '__pycache__']):
        continue
    for fn in filenames:
        ext = os.path.splitext(fn)[1]
        if ext not in SINKS:
            continue
        path = os.path.join(dirpath, fn)
        try:
            lines = open(path, errors='ignore').readlines()
        except:
            continue
        for i, line in enumerate(lines, 1):
            for pattern, category in SINKS[ext]:
                if re.search(pattern, line):
                    findings.append((category, path, i, line.strip()[:120]))

for cat, path, line, text in sorted(findings):
    print(f"[{cat}] {path}:{line}  {text}")
print(f"\nTotal: {len(findings)} findings")
```
Signal: prioritized finding list across the codebase. | Pitfall: high false-positive rate — every finding needs manual triage to confirm user-controlled data reaches the sink.
Source: distilled automated sink scanner — 2026-06-25
