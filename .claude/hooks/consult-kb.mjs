#!/usr/bin/env node
// SYNAPSE — UserPromptSubmit hook: "consult-before-concluding" enforcement.
//
// Design (minimal; NOT a classifier or orchestrator):
//  - Runs on every prompt, but INJECTS the mandatory rule BY DEFAULT.
//  - Selection is NOT gated by vulnerability keywords, so a security task described only
//    by SYMPTOM (e.g. "reflected in HTML without encoding") is still covered.
//  - The ONLY gate is SUPPRESSION: a request that is clearly ADMINISTRATIVE/workflow and
//    carries no security signal gets no mandatory directive -> avoids unnecessary KB consults.
//  - Progressive disclosure preserved: the rule says to read ONLY the matched entry.
//
// Portability: this hook is Claude Code-specific. Pi Agent / Antigravity rely on the twin
// rule in SKILL.md ("Rule — consult before concluding"). See adapters/ for equivalents.
let raw = "";
process.stdin.on("data", d => (raw += d));
process.stdin.on("end", () => {
  let prompt = "";
  try { prompt = String(JSON.parse(raw).prompt || "").toLowerCase(); } catch {}

  const ADMIN = /\b(git|commit|push|pull request|\bpr\b|merge|rebase|branch|checkout|stash|readme|changelog|licen[cs]e|typo|lint|format(ar|ting)?|prettier|rename|renomear|documenta|doc(s)?\b|resum(o|ir|a)|summari[sz]e|bullet|status|what next|pr[oó]ximo passo|resume|retomar|checkpoint|salvar nota|config(ura[cç][aã]o|uration)?|setting|timeout|\.md\b|instala[cç][aã]o|install section)\b/;
  const SECURITY = /\b(xss|sqli?|sql inject|inje[cç]|idor|bola|ssrf|xxe|rce|lfi|rfi|csrf|ssti|jwt|token|oauth|oidc|saml|session|cookie|auth(z|n|oriza|entica)?|privil[eé]gi|privesc|lateral|credential|senha|kerbero|ntlm|active directory|recon|enumerat|exploit|payload|vuln|pentest|owasp|deserial|prototype pollution|bypass|forge|ferramenta|tool|business logic|l[oó]gica de neg[oó]cio|logic flaw|refletid|sem codifica|encoding|sanitiz|escape|smuggl|redirect|header inject|upload|attack|ataque|seguran[cç]|security|explora[cç])\b/;

  if (ADMIN.test(prompt) && !SECURITY.test(prompt)) process.exit(0); // clearly administrative -> no KB lookup

  const msg = [
    "[SYNAPSE — standing rule] This looks like a security-technical request (if it is in fact purely administrative — git, README, config edit, doc summary, status — ignore this and proceed without a KB lookup).",
    "Otherwise, before formulating ANY security analysis, conclusion, payload or tooling recommendation — even if you believe you already know the answer, and even when the request names only a symptom rather than an attack-class name — you MUST first consult the knowledge base:",
    "1) invoke the SYNAPSE skill (`security-auditor`);",
    "2) read `references/pattern-index.md` and match keywords/symptoms to the catalog file;",
    "3) open ONLY the matching `skills/<category>/SKILL.md` and read the applicable technique T[N]/B[N] (do not load the whole catalog — progressive disclosure).",
    "Do NOT answer from general/parametric memory: the KB is native-tooling-normalized and authoritative, and memory may suggest banned tools or non-native approaches. Cite the consulted technique id in your answer."
  ].join("\n");
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: msg }
  }));
  process.exit(0);
});
