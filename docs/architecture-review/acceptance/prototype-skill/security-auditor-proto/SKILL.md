---
name: security-auditor-proto
description: PROTÓTIPO DE ACEITAÇÃO (descartável) — subconjunto do SecurityAuditor para validar carregamento de skill em runtimes reais (Pi, Antigravity, Claude Code). Use when testing reflected XSS or SQL injection extraction against an authorized web target. Triggers de roteamento herdados do pattern-index — xss, reflected xss, sqli, sql injection, blind sqli, extraction.
license: MIT
metadata:
  user-invocable: "false"
  prototype: "true"
  origin: SecurityAuditor/agents/web-testing/web-testing.md (T1, T4) — cópia verbatim
---

# SecurityAuditor — Protótipo de aceitação (web-testing)

> Este é um **protótipo descartável** da Fase 0.2. Não é operacional. Reproduz o
> contrato de *progressive disclosure* do HackBot no padrão Agent Skills
> (`SKILL.md` + `references/`), com duas técnicas copiadas **verbatim** da base:
> `T1` (simples, Tier-0) e `T4` (complexa, Tier-1 Python, múltiplas etapas).
>
> As Execution Policies **não** são embutidas aqui — o protótipo testa apenas
> descoberta, carregamento, resolução de `references/`, disclosure e roteamento.

## Index
<!-- Carregue SOMENTE isto. Pare antes de abrir references/. Leia um corpo de técnica apenas quando as Tags casarem. -->

| # | Technique | When (one line) | Tier | Tags | Corpo |
|---|-----------|-----------------|------|------|-------|
| T1 | Reflected XSS probe | Input refletido no HTML sem encoding | 0-native | web-testing, xss | → `references/web-testing.md#T1` |
| T4 | SQL injection extraction | SQLi confirmada — extrair dados | 1-python | web-testing, sqli, tier1-python | → `references/web-testing.md#T4` |

## Loading protocol (idêntico ao HackBot)
1. Roteamento (pattern-index / `description`) identifica esta skill.
2. Ler o `## Index` acima — **parar aqui**.
3. Casar Tags contra o contexto do alvo (domínio, tooling, plataforma).
4. Linha casada → abrir **somente** aquele `### T[N]` em `references/web-testing.md`.
5. Linha não casada → nunca carregar.

## Runtime availability (exemplo)
Tier-0 (PowerShell/.NET) sempre disponível no alvo. `T4` é Tier-1 Python: só
usar se Python estiver presente+autorizado no alvo (senão, cai para extração
manual booleana via `Invoke-WebRequest`, registrada em Variations).
