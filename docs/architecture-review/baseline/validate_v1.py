#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Validador V1 — Baseline de integridade do HackBot (SecurityAuditor).

FASE 0.1 — somente leitura. Este script NÃO move, renomeia, cria ou altera
nenhum arquivo operacional do HackBot. Ele apenas LÊ a árvore atual e emite
um manifesto (JSON) + relatório (Markdown) em docs/architecture-review/baseline/.

Dependências: apenas a biblioteca padrão do Python 3 (portável Win/Linux).
Uso:
    python3 validate_v1.py            # usa a raiz inferida a partir do script
    python3 validate_v1.py --root /caminho/para/SecurityAuditor
    python3 validate_v1.py --json-only
"""
from __future__ import annotations
import argparse
import hashlib
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

# ----------------------------------------------------------------------------
# Contratos codificados a partir da leitura do próprio HackBot (não presumidos):
#   references/template-technique.md  -> formato de técnica e campos obrigatórios
#   references/pattern-index.md       -> roteamento keyword->arquivo
#   references/flows-agents.md        -> brief dos agentes efêmeros (Flows 9/12)
#   references/authorization-gate.md  -> marcador SECAUDIT_SAFETY_GATE_v1, Rule 0
#   references/verification-contract.md -> marcador SECAUDIT_VERIFICATION_CONTRACT_v1
#   references/native-tooling-doctrine.md -> tiers + Banned tools
# ----------------------------------------------------------------------------

TECH_HEADING = re.compile(r'^### ((?:T|B)\d+):\s*(.+?)\s*$')
ANY_H2 = re.compile(r'^## +(.+?)\s*$')
ANY_H3 = re.compile(r'^### +')
INDEX_ROW = re.compile(r'^\|\s*((?:T|B)\d+)\s*\|(.*)$')
FIELD = re.compile(r'^([A-Z][A-Za-z]+):')          # "Tags:", "When:", ...
TIER_FIELD = re.compile(r'^Tier:\s*(\S+)')
MD_LINK = re.compile(r'\]\(([^)]+)\)')
CROSSREF = re.compile(r'→\s*([A-Za-z0-9_./-]+\.md)#((?:T|B)\d+)')

REQUIRED_FIELDS = ["Tags", "When", "Why", "Tier", "Steps", "Source"]
# forge expõe BLUEPRINTS (B[N]) para *construir ferramentas nativas*, não técnicas
# de ataque. Schema próprio verificado contra agents/forge/forge.md.
BLUEPRINT_REQUIRED = ["Purpose", "Runtime"]
VALID_TIERS = {"0-native", "1-python", "1-go", "1-node"}
INLINE_CODE = re.compile(r'`[^`]*`')

# Brief dos agentes efêmeros — seções obrigatórias e ordem (flows-agents.md)
BRIEF_SECTIONS = [
    "Objective",
    "Active engagement task",
    "Target",
    "Run mode",
    "Native-tooling constraint",
    "Techniques to apply",
    "Verification contract",
    "Return contract",
]

POLICY_FILES = {
    "authorization-gate": ("references/authorization-gate.md", "SECAUDIT_SAFETY_GATE_v1"),
    "verification-contract": ("references/verification-contract.md", "SECAUDIT_VERIFICATION_CONTRACT_v1"),
    "native-tooling-doctrine": ("references/native-tooling-doctrine.md", None),
}

SCAN_DIRS = ["agents", "references", "reports", "intake"]
SCAN_ROOT_FILES = ["SKILL.md", "README.md"]


def sha256_bytes(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def read_text(p: Path) -> str:
    return p.read_text(encoding="utf-8", errors="surrogateescape")


class Validator:
    def __init__(self, root: Path):
        self.root = root
        self.findings = []          # (severity, check, message)
        self.files = {}             # relpath -> {sha256,bytes,lines}
        self.techniques = []        # list of dicts
        self.catalogs = {}          # relpath -> {has_index, index_ids, tech_ids}
        self.routing = {}           # keyword-row -> file target(s)
        self.policies = {}
        self.brief = {}
        self.checks = {}            # check_id -> {status, detail}

    def add(self, severity, check, message):
        self.findings.append({"severity": severity, "check": check, "message": message})

    # -- C1: inventário de arquivos --------------------------------------
    def inventory(self):
        paths = []
        for d in SCAN_DIRS:
            base = self.root / d
            if base.is_dir():
                paths += sorted(base.rglob("*.md"))
        for f in SCAN_ROOT_FILES:
            p = self.root / f
            if p.is_file():
                paths.append(p)
        for p in paths:
            rel = p.relative_to(self.root).as_posix()
            data = p.read_bytes()
            self.files[rel] = {
                "sha256": sha256_bytes(data),
                "bytes": len(data),
                "lines": data.count(b"\n") + (1 if data and not data.endswith(b"\n") else 0),
            }
        self.checks["C1_inventory"] = {
            "status": "OK",
            "detail": f"{len(self.files)} arquivos .md inventariados em {SCAN_DIRS + SCAN_ROOT_FILES}",
        }

    # -- C2: extração de técnicas (número REAL) --------------------------
    def extract_techniques(self):
        for rel in self.files:
            if not rel.startswith("agents/"):
                continue
            p = self.root / rel
            lines = read_text(p).splitlines()
            # localizar headings de técnica e delimitar corpo
            heads = []
            for i, ln in enumerate(lines):
                m = TECH_HEADING.match(ln)
                if m:
                    heads.append((i, m.group(1), m.group(2)))
            has_index = any(ANY_H2.match(ln) and ANY_H2.match(ln).group(1).strip() == "Index" for ln in lines)
            tech_ids = []
            for idx, (start, tid, title) in enumerate(heads):
                end = len(lines)
                for j in range(start + 1, len(lines)):
                    if ANY_H3.match(lines[j]) or ANY_H2.match(lines[j]):
                        end = j
                        break
                body_lines = lines[start:end]
                body_text = "\n".join(body_lines)
                body_sha = sha256_bytes(body_text.encode("utf-8", "surrogateescape"))
                body_only = "\n".join(body_lines[1:])
                is_pointer = bool(
                    re.search(r'(?im)\bSee\b.*\.md', body_only)
                    or CROSSREF.search(body_only)
                    or "IS the forge blueprint" in body_only
                )
                fields = self._fields_in(body_lines[1:])  # skip heading line
                tier = None
                for bl in body_lines[1:]:
                    tm = TIER_FIELD.match(bl)
                    if tm:
                        tier = tm.group(1)
                        break
                uid = f"{rel}#{tid}"
                kind = "blueprint" if tid.startswith("B") else "technique"
                rec = {
                    "uid": uid,
                    "file": rel,
                    "id": tid,
                    "kind": kind,
                    "title": title,
                    "line": start + 1,
                    "body_lines": len(body_lines),
                    "body_sha256": body_sha,
                    "fields": sorted(fields),
                    "tier": tier,
                    "has_payload": "Payload" in fields,
                    "is_pointer": is_pointer,
                }
                self.techniques.append(rec)
                tech_ids.append(tid)
                self._check_fields(rec, fields, tier)
            self.catalogs[rel] = {
                "has_index": has_index,
                "tech_ids": tech_ids,
                "tech_count": len(tech_ids),
            }
        t_count = sum(1 for t in self.techniques if t["id"].startswith("T"))
        b_count = sum(1 for t in self.techniques if t["id"].startswith("B"))
        self.checks["C2_techniques"] = {
            "status": "OK",
            "detail": f"{len(self.techniques)} técnicas reais (T={t_count}, B={b_count}) em {len(self.catalogs)} arquivos de agents/",
        }

    def _fields_in(self, body_lines):
        found = set()
        for bl in body_lines:
            m = FIELD.match(bl)
            if m:
                found.add(m.group(1))
        return found

    # -- C3: contrato de campos da técnica -------------------------------
    def _check_fields(self, rec, fields, tier):
        if rec["kind"] == "blueprint":
            # forge: schema próprio (Purpose/Runtime). Técnica-template não se aplica.
            if rec.get("is_pointer"):
                # blueprint-ponteiro: delega a técnica de outro catálogo (dedup intencional).
                self.add("INFO", "C3_fields",
                         f"{rec['uid']} ({rec['title']}) [blueprint-ponteiro]: delega a outro catálogo (sem corpo próprio — dedup intencional)")
                return
            missing = [f for f in BLUEPRINT_REQUIRED if f not in fields]
            if missing:
                self.add("WARN", "C3_fields",
                         f"{rec['uid']} ({rec['title']}) [blueprint]: campos ausentes: {', '.join(missing)}")
            return
        missing = [f for f in REQUIRED_FIELDS if f not in fields]
        # Variância de formato conhecida: técnicas Tier-0 payload-driven embutem o
        # procedimento no bloco Payload em vez de um campo Steps rotulado.
        if missing == ["Steps"] and rec["has_payload"]:
            self.add("INFO", "C3_fields",
                     f"{rec['uid']} ({rec['title']}): procedimento embutido no Payload (sem campo Steps rotulado — variância de formato pré-existente)")
            missing = []
        if missing:
            self.add("WARN", "C3_fields",
                     f"{rec['uid']} ({rec['title']}): campos obrigatórios ausentes: {', '.join(missing)}")
        if tier is not None and tier not in VALID_TIERS:
            self.add("WARN", "C3_fields",
                     f"{rec['uid']}: Tier inválido '{tier}' (esperado {sorted(VALID_TIERS)})")
        if tier and tier != "0-native" and "Escalation" not in fields:
            self.add("WARN", "C3_fields",
                     f"{rec['uid']}: Tier {tier} exige campo Escalation (doutrina native-tooling) e ele está ausente")

    def finalize_field_check(self):
        warn = sum(1 for f in self.findings if f["check"] == "C3_fields" and f["severity"] == "WARN")
        info = sum(1 for f in self.findings if f["check"] == "C3_fields" and f["severity"] == "INFO")
        self.checks["C3_fields"] = {
            "status": "OK" if warn == 0 else "WARN",
            "detail": f"{len(self.techniques)} entradas verificadas (técnica + blueprint); {warn} avisos, {info} observações de formato",
        }

    # -- C4: Index <-> Techniques (progressive disclosure) ---------------
    def check_index_consistency(self):
        issues = 0
        for rel, cat in self.catalogs.items():
            p = self.root / rel
            lines = read_text(p).splitlines()
            in_index = False
            index_ids = []
            crossref_ids = set()
            for ln in lines:
                h2 = ANY_H2.match(ln)
                if h2:
                    in_index = (h2.group(1).strip() == "Index")
                    continue
                if in_index:
                    m = INDEX_ROW.match(ln)
                    if m:
                        index_ids.append(m.group(1))
                        if "→" in ln or CROSSREF.search(ln):
                            crossref_ids.add(m.group(1))
            cat["index_ids"] = index_ids
            cat["crossref_ids"] = sorted(crossref_ids)
            tech_set = set(cat["tech_ids"])
            idx_set = set(index_ids)
            # toda técnica presente no corpo deve estar no Index
            body_not_index = sorted(tech_set - idx_set)
            # todo id no Index (sem cross-ref externo) deve ter corpo aqui
            index_not_body = sorted((idx_set - tech_set) - crossref_ids)
            if cat["has_index"]:
                if body_not_index:
                    issues += 1
                    self.add("WARN", "C4_index",
                             f"{rel}: técnicas no corpo ausentes do Index: {', '.join(body_not_index)}")
                if index_not_body:
                    issues += 1
                    self.add("WARN", "C4_index",
                             f"{rel}: linhas de Index sem corpo correspondente (e sem cross-ref): {', '.join(index_not_body)}")
            else:
                # arquivos estruturais (methodology, sink-patterns) — sem Index é esperado
                if cat["tech_ids"]:
                    self.add("INFO", "C4_index",
                             f"{rel}: arquivo sem ## Index mas com {len(cat['tech_ids'])} técnicas (estrutural?)")
        self.checks["C4_index"] = {
            "status": "OK" if issues == 0 else "WARN",
            "detail": f"Consistência Index<->Techniques verificada em {len(self.catalogs)} catálogos; {issues} divergências",
        }

    # -- C5: roteamento pattern-index ------------------------------------
    def check_routing(self):
        p = self.root / "references/pattern-index.md"
        reachable = set()
        missing = 0
        if p.is_file():
            for ln in read_text(p).splitlines():
                if not ln.startswith("|"):
                    continue
                # alvos tipo `agents/.../file.md`
                for m in re.finditer(r'`([a-z0-9_./<>-]+\.md)`', ln):
                    tgt = m.group(1)
                    if "<" in tgt:   # ex.: reports/precedent-library/<class>.md (dinâmico)
                        continue
                    reachable.add(tgt)
                    if not (self.root / tgt).is_file():
                        missing += 1
                        self.add("WARN", "C5_routing", f"pattern-index aponta para arquivo inexistente: {tgt}")
        # todo catálogo com técnicas deve ser alcançável pelo roteamento
        unreached = []
        for rel, cat in self.catalogs.items():
            if cat["tech_ids"] and rel not in reachable:
                unreached.append(rel)
        for rel in unreached:
            self.add("WARN", "C5_routing", f"catálogo com técnicas não referenciado pelo pattern-index: {rel}")
        self.routing = {"reachable": sorted(reachable), "unreached": unreached, "broken_targets": missing}
        self.checks["C5_routing"] = {
            "status": "OK" if (missing == 0 and not unreached) else "WARN",
            "detail": f"{len(reachable)} alvos roteados; {missing} quebrados; {len(unreached)} catálogos não alcançados",
        }

    # -- C6: links internos e cross-refs ---------------------------------
    def check_links(self):
        broken_links = 0
        broken_xref = 0
        all_heads = {}  # relpath -> set(ids)
        for t in self.techniques:
            all_heads.setdefault(t["file"], set()).add(t["id"])
        for rel in self.files:
            p = self.root / rel
            text = read_text(p)
            base = p.parent
            # remover spans de código inline: `](...)` dentro de código é exemplo,
            # não link navegável (ex.: payloads, placeholder [title](URL) do template).
            scan_text = INLINE_CODE.sub("``", text)
            for m in MD_LINK.finditer(scan_text):
                target = m.group(1).strip()
                if target.startswith(("http://", "https://", "mailto:", "#")):
                    continue
                # placeholder de template e alvos que não são caminho (contêm espaço)
                if target in ("URL",) or " " in target:
                    continue
                path_part = target.split("#", 1)[0]
                if not path_part or path_part.startswith("<"):
                    continue
                resolved = (base / path_part).resolve()
                if not resolved.exists():
                    broken_links += 1
                    self.add("WARN", "C6_links", f"{rel}: link interno quebrado -> {target}")
            for m in CROSSREF.finditer(text):
                tgt_file, tgt_id = m.group(1), m.group(2)
                resolved = None
                for cand in (base / tgt_file, self.root / "agents" / tgt_file, self.root / tgt_file):
                    if cand.exists():
                        resolved = cand
                        break
                if resolved is None:
                    broken_xref += 1
                    self.add("WARN", "C6_links", f"{rel}: cross-ref aponta para arquivo inexistente -> {tgt_file}#{tgt_id}")
                else:
                    relp = resolved.resolve().relative_to(self.root.resolve()).as_posix()
                    if relp in all_heads and tgt_id not in all_heads[relp]:
                        broken_xref += 1
                        self.add("WARN", "C6_links", f"{rel}: cross-ref para id inexistente -> {relp}#{tgt_id}")
        self.checks["C6_links"] = {
            "status": "OK" if (broken_links == 0 and broken_xref == 0) else "WARN",
            "detail": f"links internos quebrados: {broken_links}; cross-refs quebrados: {broken_xref}",
        }

    # -- C7: policies imutáveis ------------------------------------------
    def check_policies(self):
        problems = 0
        for name, (rel, marker) in POLICY_FILES.items():
            p = self.root / rel
            if not p.is_file():
                problems += 1
                self.add("FAIL", "C7_policies", f"policy ausente: {rel}")
                continue
            text = read_text(p)
            entry = {"file": rel, "sha256": self.files.get(rel, {}).get("sha256")}
            if marker:
                entry["marker_present"] = marker in text
                if marker not in text:
                    problems += 1
                    self.add("FAIL", "C7_policies", f"{rel}: marcador imutável ausente: {marker}")
            if name == "authorization-gate":
                entry["rule0_present"] = bool(re.search(r'(?im)^##\s*Rule 0', text))
                if not entry["rule0_present"]:
                    problems += 1
                    self.add("FAIL", "C7_policies", f"{rel}: 'Rule 0' ausente")
            self.policies[name] = entry
        self.checks["C7_policies"] = {
            "status": "OK" if problems == 0 else "FAIL",
            "detail": f"{len(self.policies)} policies verificadas; {problems} problemas (marcadores/Rule 0/presença)",
        }

    # -- C8: contrato de brief dos agentes efêmeros ----------------------
    def check_brief(self):
        p = self.root / "references/flows-agents.md"
        present, order_ok = [], True
        if p.is_file():
            lines = read_text(p).splitlines()
            seen_positions = {}
            for i, ln in enumerate(lines):
                s = ln.strip()
                for sec in BRIEF_SECTIONS:
                    if s == f"## {sec}" and sec not in seen_positions:
                        seen_positions[sec] = i
            present = [s for s in BRIEF_SECTIONS if s in seen_positions]
            # ordem
            last = -1
            for sec in BRIEF_SECTIONS:
                if sec in seen_positions:
                    if seen_positions[sec] < last:
                        order_ok = False
                    last = seen_positions[sec]
            missing = [s for s in BRIEF_SECTIONS if s not in seen_positions]
            for s in missing:
                self.add("WARN", "C8_brief", f"flows-agents.md: seção de brief ausente: '## {s}'")
            if not order_ok:
                self.add("WARN", "C8_brief", "flows-agents.md: seções de brief fora da ordem canônica")
        else:
            self.add("FAIL", "C8_brief", "references/flows-agents.md ausente")
        self.brief = {"sections_present": present, "order_ok": order_ok,
                      "expected": BRIEF_SECTIONS}
        status = "OK" if (len(present) == len(BRIEF_SECTIONS) and order_ok) else "WARN"
        if not (self.root / "references/flows-agents.md").is_file():
            status = "FAIL"
        self.checks["C8_brief"] = {
            "status": status,
            "detail": f"{len(present)}/{len(BRIEF_SECTIONS)} seções de brief presentes; ordem_ok={order_ok}",
        }

    # -- C9: comportamento (tier vocab + banned-tool em Payload) ----------
    def check_behavior(self):
        # vocabulário de Tier
        bad_tier = [t["uid"] for t in self.techniques if t["tier"] and t["tier"] not in VALID_TIERS]
        # lista de banned tools (nomes) da doutrina — extração heurística
        banned = []
        p = self.root / "references/native-tooling-doctrine.md"
        if p.is_file():
            grab = False
            for ln in read_text(p).splitlines():
                h2 = ANY_H2.match(ln)
                if h2:
                    grab = h2.group(1).strip().lower().startswith("banned tools")
                    continue
                if grab:
                    for m in re.finditer(r'`([A-Za-z0-9._-]{3,})`', ln):
                        tok = m.group(1)
                        if not tok.endswith(".md"):
                            banned.append(tok.lower())
        banned = sorted(set(banned))
        self.checks["C9_behavior"] = {
            "status": "OK" if not bad_tier else "WARN",
            "detail": f"Tiers inválidos: {len(bad_tier)}; vocabulário de banned-tools catalogado ({len(banned)} tokens) para lint H0",
            "banned_tokens": banned,
            "bad_tier": bad_tier,
        }

    # -- Manifesto / equivalência ----------------------------------------
    def build_manifest(self):
        tech_sorted = sorted(self.techniques, key=lambda t: t["uid"])
        equivalence = {
            "technique_body_hashes": {t["uid"]: t["body_sha256"] for t in tech_sorted},
            "technique_count": len(tech_sorted),
            "technique_count_by_prefix": {
                "T": sum(1 for t in tech_sorted if t["id"].startswith("T")),
                "B": sum(1 for t in tech_sorted if t["id"].startswith("B")),
            },
            "policy_hashes": {k: v.get("sha256") for k, v in self.policies.items()},
            "catalog_counts": {rel: c["tech_count"] for rel, c in sorted(self.catalogs.items())},
        }
        # hash do grafo de roteamento (ordem estável)
        routing_blob = json.dumps(self.routing, sort_keys=True, ensure_ascii=False).encode("utf-8")
        equivalence["routing_graph_sha256"] = sha256_bytes(routing_blob)
        # hash agregado da baseline (resumo único para comparação rápida)
        agg = json.dumps(equivalence["technique_body_hashes"], sort_keys=True).encode("utf-8")
        equivalence["baseline_aggregate_sha256"] = sha256_bytes(agg)

        counts_status = {k: v["status"] for k, v in self.checks.items()}
        overall = "FAIL" if "FAIL" in counts_status.values() else ("WARN" if "WARN" in counts_status.values() else "OK")

        return {
            "tool": "validate_v1.py",
            "phase": "Fase 0.1 — baseline (read-only)",
            "generated_utc": datetime.now(timezone.utc).isoformat(),
            "root": str(self.root),
            "overall_status": overall,
            "checks": self.checks,
            "file_inventory": self.files,
            "catalogs": self.catalogs,
            "policies": self.policies,
            "brief_contract": self.brief,
            "routing": self.routing,
            "techniques": tech_sorted,
            "findings": self.findings,
            "equivalence_set": equivalence,
        }

    def run(self):
        self.inventory()
        self.extract_techniques()
        self.finalize_field_check()
        self.check_index_consistency()
        self.check_routing()
        self.check_links()
        self.check_policies()
        self.check_brief()
        self.check_behavior()
        return self.build_manifest()


def render_report(m: dict) -> str:
    eq = m["equivalence_set"]
    lines = []
    A = lines.append
    A(f"# Baseline V1 — Relatório (read-only)\n")
    A(f"> Gerado: {m['generated_utc']}  \n> Raiz: `{m['root']}`  \n> **Status geral: {m['overall_status']}**\n")
    A("## Resumo das verificações\n")
    A("| Check | Status | Detalhe |")
    A("|-------|--------|---------|")
    for cid, c in m["checks"].items():
        A(f"| {cid} | {c['status']} | {c['detail']} |")
    A("")
    A("## Baseline numérica\n")
    A(f"- **Técnicas reais (total): {eq['technique_count']}** "
      f"(T={eq['technique_count_by_prefix']['T']}, B={eq['technique_count_by_prefix']['B']})")
    A(f"- Arquivos .md inventariados: {len(m['file_inventory'])}")
    A(f"- Catálogos de conhecimento (agents/): {len(m['catalogs'])}")
    A(f"- Hash agregado da baseline: `{eq['baseline_aggregate_sha256']}`")
    A(f"- Hash do grafo de roteamento: `{eq['routing_graph_sha256']}`\n")
    A("### Técnicas por catálogo\n")
    A("| Catálogo | Técnicas | Index |")
    A("|----------|----------|-------|")
    for rel, cnt in eq["catalog_counts"].items():
        has = "sim" if m["catalogs"][rel].get("has_index") else "não"
        A(f"| `{rel}` | {cnt} | {has} |")
    A("")
    A("## Policies imutáveis (âncoras de preservação H0)\n")
    A("| Policy | Marcador | Rule 0 | sha256 |")
    A("|--------|----------|--------|--------|")
    for name, e in m["policies"].items():
        mk = e.get("marker_present")
        mk_s = "—" if mk is None else ("presente" if mk else "AUSENTE")
        r0 = e.get("rule0_present")
        r0_s = "—" if r0 is None else ("presente" if r0 else "AUSENTE")
        A(f"| {name} | {mk_s} | {r0_s} | `{(e.get('sha256') or '')[:16]}…` |")
    A("")
    A("## Contrato de brief (agentes efêmeros — Flows 9/12)\n")
    bc = m["brief_contract"]
    A(f"- Seções presentes: {len(bc['sections_present'])}/{len(bc['expected'])} — ordem canônica: {bc['order_ok']}")
    A(f"- Esperadas: {', '.join(bc['expected'])}\n")
    findings = m["findings"]
    A("## Achados\n")
    if not findings:
        A("Nenhum achado. Baseline íntegra sob todos os checks.\n")
    else:
        bysev = {}
        for f in findings:
            bysev.setdefault(f["severity"], []).append(f)
        for sev in ("FAIL", "WARN", "INFO"):
            if sev in bysev:
                A(f"### {sev} ({len(bysev[sev])})\n")
                for f in bysev[sev]:
                    A(f"- **[{f['check']}]** {f['message']}")
                A("")
    A("## Critérios de equivalência (contrato para validar o H0)\n")
    A("Após a migração H0, re-executar V1 sobre `skills/` e exigir:\n")
    A("1. **`baseline_aggregate_sha256` idêntico** — todo corpo de técnica preservado byte-a-byte.")
    A(f"2. **`technique_count` == {eq['technique_count']}** — nenhuma técnica perdida ou duplicada.")
    A("3. **`policy_hashes` idênticos** — os 3 docs imutáveis inalterados (marcadores + Rule 0).")
    A("4. **Checks C4/C5/C6/C8 em OK** — disclosure, roteamento, links e brief preservados.")
    A("5. Divergência em qualquer item acima = **bloqueio de migração** (rollback).\n")
    return "\n".join(lines)


def main():
    ap = argparse.ArgumentParser(description="Validador V1 — baseline read-only do HackBot")
    ap.add_argument("--root", type=str, default=None)
    ap.add_argument("--out", type=str, default=None, help="diretório de saída (default: ao lado do script)")
    ap.add_argument("--json-only", action="store_true")
    args = ap.parse_args()

    here = Path(__file__).resolve().parent
    if args.root:
        root = Path(args.root).resolve()
    else:
        # script em <root>/docs/architecture-review/baseline/validate_v1.py
        root = here.parents[2]
    if not (root / "SKILL.md").is_file():
        print(f"ERRO: raiz não parece ser o HackBot (SKILL.md não encontrado em {root})", file=sys.stderr)
        return 2

    out_dir = Path(args.out).resolve() if args.out else here
    out_dir.mkdir(parents=True, exist_ok=True)

    v = Validator(root)
    manifest = v.run()

    (out_dir / "manifest.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")
    report = render_report(manifest)
    if not args.json_only:
        (out_dir / "baseline-report.md").write_text(report, encoding="utf-8")

    # resumo no stdout
    print(f"[V1] status geral: {manifest['overall_status']}")
    print(f"[V1] técnicas reais: {manifest['equivalence_set']['technique_count']} "
          f"(T={manifest['equivalence_set']['technique_count_by_prefix']['T']}, "
          f"B={manifest['equivalence_set']['technique_count_by_prefix']['B']})")
    for cid, c in manifest["checks"].items():
        print(f"      {cid:16s} {c['status']:4s} — {c['detail']}")
    nf = len(manifest["findings"])
    print(f"[V1] achados: {nf}")
    print(f"[V1] manifest -> {out_dir/'manifest.json'}")
    if not args.json_only:
        print(f"[V1] report   -> {out_dir/'baseline-report.md'}")
    return 0 if manifest["overall_status"] != "FAIL" else 1


if __name__ == "__main__":
    sys.exit(main())
