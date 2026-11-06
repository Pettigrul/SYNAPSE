#!/usr/bin/env bash
# =============================================================================
# SYNAPSE — root migration + first-commit preparation
# -----------------------------------------------------------------------------
# Consolidates the real product (currently the INNER dir) into a single root at
# ~/projetos/SYNAPSE, discards the empty external wrapper, fixes the one local
# absolute path, runs the sensitive-file gate and regressions, and STOPS before
# commit/push. It performs NO git push and NO force operations.
#
#   Run it when NO Claude Code / editor session is holding the current dir:
#       bash ~/projetos/SYNAPSE-migrate.sh      # (copy this file out first)
#   or: bash docs/architecture-review/migrate-to-synapse.sh
#
# Rollback at any point before you commit:
#       rm -rf ~/projetos/SYNAPSE/.git          # undoes the fresh repo (data intact)
#       cp -a <BACKUP>/. ~/projetos/SYNAPSE/     # restores from the verified backup
# =============================================================================
set -euo pipefail

# Paths may be overridden via env (defaults are the real project paths; overriding lets an
# isolated fixture exercise the script without touching the real project — see the §4 test).
STAMP="$(date +%Y%m%d-%H%M%S)"
OLD="${SYNAPSE_OLD:-/home/pettigrul/projetos/SecurityAuditor/SecurityAuditor}"
WRAP="${SYNAPSE_WRAP:-/home/pettigrul/projetos/SecurityAuditor}"
NEW="${SYNAPSE_NEW:-/home/pettigrul/projetos/SYNAPSE}"
BACKUP="${SYNAPSE_BACKUP:-/home/pettigrul/projetos/_synapse-backup-${STAMP}}"

echo "==> 0. Pre-flight"
[ -d "$OLD" ] || { echo "   ABORT: source not found: $OLD"; exit 1; }
[ ! -e "$NEW" ] || { echo "   ABORT: destination already exists: $NEW"; exit 1; }

echo "==> 1. Verified backup (includes .env + engagements — these never go to Git)"
[ -e "$BACKUP" ] && { echo "   ABORT: backup path already exists: $BACKUP"; exit 1; }
cp -a "$OLD" "$BACKUP"
# The verification MUST abort the run (and therefore prevent the mv) if the copy is not faithful.
if diff -qr "$OLD" "$BACKUP" >/dev/null; then
  echo "   backup OK: $BACKUP"
else
  echo "   ABORT: backup verification failed — NOT proceeding to move"; exit 1
fi

echo "==> 2. Move inner dir to the single SYNAPSE root"
mv "$OLD" "$NEW"

echo "==> 3. Discard the empty external wrapper (known residue only)"
rm -rf "$WRAP/__MACOSX" "$WRAP/.git" "$WRAP/.agents" "$WRAP/.aws" "$WRAP/.codex" 2>/dev/null || true
rmdir "$WRAP" 2>/dev/null && echo "   wrapper removed" || echo "   wrapper not empty — left for manual review"

cd "$NEW"

echo "==> 4. Fix the one local absolute path (SA_ENGAGEMENT_ROOT in .env) — value NOT printed"
[ -f .env ] && sed -i "s#${OLD}#${NEW}#g" .env && echo "   .env root updated"
# baseline manifest 'root' is informational (the validator takes root as an argument)
sed -i "s#${OLD}#${NEW}#g" docs/architecture-review/baseline/manifest.json 2>/dev/null || true

echo "==> 5. git init (fresh — there is no prior history to preserve)"
git init -q .
git symbolic-ref HEAD refs/heads/main 2>/dev/null || true   # portable default branch (no -b dependency)
git add -A

echo "==> 6. SENSITIVE-FILE GATE (must be empty)"
# Match whole path segments only: a skill named `listar-engagements/` is not the `engagements/` data dir.
SENSITIVE_DIRS='engagements|[^/]+\.engagement|evidence|node_modules|__MACOSX|__pycache__|\.cache|\.pytest_cache|\.aws|\.agents|\.sa-state|\.hackbot'
SENSITIVE_RE="(^|/)(${SENSITIVE_DIRS})/|(^|/)[^/]*\.env$|(^|/)\.env\.[^/]+$|(^|/)\.config$|(^|/)\.whitebox-access\.log$"
if git ls-files | grep -Ev '(^|/)\.env\.example$' | grep -E "$SENSITIVE_RE"; then
  echo "   !! SENSITIVE FILE STAGED — unstage and fix .gitignore before committing"; exit 1
else
  echo "   clean — no sensitive files staged"
fi

echo "==> 7. Regressions"
node docs/architecture-review/validate_h0.mjs . docs/architecture-review/baseline/manifest.json | grep -E 'overall|total='

echo
echo "==> DONE (nothing committed or pushed). Next, manually, when ready:"
echo "    cd $NEW"
echo "    git status                       # review the staged set"
echo "    git commit -m 'SYNAPSE: initial import (formerly SecurityAuditor/HackBot)'"
echo "    git remote add origin <PRIVATE_REPO_SSH_OR_HTTPS_URL>"
echo "    git push -u origin main          # only when you have reviewed everything"
echo
echo "    Backup kept at: $BACKUP   (delete once the new repo is verified)"
