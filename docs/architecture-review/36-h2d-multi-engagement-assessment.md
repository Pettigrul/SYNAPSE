# 36 — Pré-piloto: Engagement Selection & Caido Project Binding — Diagnóstico

> Diagnóstico do ajuste multi-engagement anterior a H2d-F2. Par do handbook cap. 16.

## 1. O que já existia (inspeção do código real)

- **Bridge** (`tools/web-runtime/bridge.mjs`): Execution Context por `investigationId`; `caido-no-project`
  se não há `projectId`; **`_caidoAssoc` recusa cross-project** (`caido-project-mismatch`, sem fallback);
  `_scopeFilter` (Rule 0); `_caidoProvenance` carimba `engagementId`+`caidoProjectId`. `caido.health`/
  `caido.projects` **não** são gated → descoberta pré-associação funciona.
- **Workspace** (`engagement.mjs`): manifesto `.engagement.json` já com `caido.projectId`; `initEngagement`
  aceita `caidoProjectId`; confinamento **lexical** (`decideWhiteboxAccess`).
- **Preflight**: exigia `CAIDO_PROJECT_ID` global para `caido-native`.

## 2. Lacunas reais identificadas

1. Sem associação de projeto a um engagement **existente** (só no init).
2. Sem **cola de seleção** (engagement selecionado → Execution Context com projectId do manifesto).
3. `CAIDO_PROJECT_ID` global tratado como obrigatório (`.env.example` + Preflight).
4. Confinamento **lexical** não resolve **symlink** apontando para fora.
5. `statePath` de monitor/copilot/record não garantidamente confinado ao engagement.
6. Sem CLI de operador para o fluxo criar→escopo→associar→selecionar.
7. Sem guia de onboarding Caido.
8. Sem testes multi-engagement.

## 3. Mudanças (mínimas, comprovadamente necessárias)

- `engagement.mjs` (+ helpers): `associateCaidoProject` (rebind exige `force`; sem rebind silencioso),
  `resolveProjectId` (manifesto > env-compat > nenhum; env nunca sobrepõe), `assertInsideEngagement`
  (**symlink-safe**, realpath), `engagementStatePaths` (estado em `<eng>/.hackbot/`, confinado),
  `selectEngagement` (resolve dir+scope+projeto).
- `tools/workspace/cli.mjs`: `init|scope|associate|use|active|clear|select|show|list|projects` (reusa Bridge
  `caido.projects`). **Seleção dinâmica por sessão** (ajuste UX): `setActiveEngagement`/`getActiveEngagement`/
  `clearActiveEngagement`/`listEngagements` + ponteiro `<root>/.sa-state/active[-<SA_SESSION_ID>].json`.
  Precedência `SA_ENGAGEMENT` (override) > ponteiro > nenhum; match exato (sem fuzzy); troca reporta
  `switched`/`requiresCleanContext` (não apaga histórico do LLM); sem seleção → ops dependentes bloqueadas.
- Preflight: `caido` = config de **instância** (baseUrl+token); novo `caidoProject` (binding via manifesto,
  compat sinalizada como `degraded`); `workspace` reflete engagement ativo; `caido-native`/`full-engagement`
  passam a exigir `caidoProject`. `collectEnv` resolve o engagement ativo (SA_ENGAGEMENT_ROOT+SA_ENGAGEMENT).
- `.env.example`: separa instância × engagement; `SA_ENGAGEMENT`; `CAIDO_PROJECT_ID` vira compat opcional.
- **Evidence Directory por engagement** (correção pré-piloto): `EVIDENCE_DIR="evidence"`,
  `engagementEvidenceDir`/`resolveEvidenceDir` + `confineWithin` (symlink-safe genérico, reusado por
  engagement root E evidence). `selectEngagement().evidenceDir`. **Bridge**: `ctx.evidenceDir` + helper
  `_evidenceDir`; `browser.screenshot` roteado/confinado; sem engagement → `evidence-no-engagement`; escape →
  `evidence-path-escape`. **Sem** dir global/`/tmp`; `SA_EVIDENCE_DIR` deprecado (compat só sem engagement,
  nunca sobrepõe). Preflight `evidence` resolve o engagement ativo (opcional core-lab; obrigatório
  caido-native/full-engagement). Doctor/`.env.example`/bootstrap atualizados.
- **Bridge: enforcement/autorização inalterados** (a correção de evidências só adiciona roteamento/
  confinamento de caminho; a correção de projeto é na camada de config/seleção).

## 4. Limitação de enforcement (honesta)

O isolamento vale para acessos que **passam pelo Bridge/módulo**. Ferramentas genéricas do Claude Code
(ex.: `bash cat`) podem ler arquivos de outro engagement fora desse caminho — **mesma** limitação de
camada-de-ferramentas do Whitebox. **Não** há isolamento universal sem um wrapper de enforcement por runtime
(fora do escopo deste ajuste; candidato a H2d-F2+).

## 5. Fora de escopo / preservado

Sem LLM pago, sem operações ofensivas, sem novos frameworks, sem mudança em KB/`agents`/`policies`. **F5b
(workflows nativos) permanece pós-MVP/V2.** Não inicia H2d-F2.
