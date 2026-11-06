@echo off
REM SecurityAuditor — Windows Bootstrap (H2d-F1, minimal).
REM Reproducible setup on restricted corporate Windows: NO admin, NO Docker, NO WSL.
REM What it does (minimal, F1): verifies Node, scaffolds a per-user config dir OUTSIDE the repo, prints
REM secure-persistence guidance for the Caido PAT (never stored in the repo), then runs Doctor + Preflight.
REM Full credential-store / runtime auto-config integration is H2d-F2+ (documented limitation).
setlocal EnableDelayedExpansion

echo === SecurityAuditor bootstrap (Windows, no admin) ===

where node >nul 2>nul
if errorlevel 1 (
  echo [BLOCKED] Node.js not found on PATH. Install Node.js user-scope ^(e.g. the .zip build extracted to
  echo           %%LOCALAPPDATA%%\nodejs and added to your user PATH^) — no administrator rights required.
  exit /b 9
)
for /f "delims=" %%v in ('node -v') do set NODEV=%%v
echo Node detected: !NODEV!

REM Per-user config dir OUTSIDE the repository (engagements and secrets never live in the repo).
set "SA_HOME=%LOCALAPPDATA%\SecurityAuditor"
if not exist "%SA_HOME%" mkdir "%SA_HOME%"
if not exist "%SA_HOME%\engagements" mkdir "%SA_HOME%\engagements"
echo Config/home dir: %SA_HOME%

echo.
echo --- Secure persistence guidance (do NOT commit secrets) ---
echo   Set these in your USER environment ^(setx, no admin^), not in the repo:
echo     setx SA_ENGAGEMENT_ROOT "%SA_HOME%\engagements"
echo     setx CAIDO_BASE_URL     "https://your-lab-caido:port"
echo   Store the Caido PAT as a user env var or in an ACL-restricted file under %SA_HOME% (readable only
echo   by your account) — e.g.  setx CAIDO_TOKEN "..."  — the Preflight reads only presence, never value.
echo   Evidence is per-engagement (^<engagement^>\evidence) — no SA_EVIDENCE_DIR needed. Select an engagement:
echo     node tools\workspace\cli.mjs use --name ^<name^>   (associate a Caido project with: cli.mjs associate)
echo.

echo --- Doctor ---
node "%~dp0cli.mjs" doctor
echo.
echo --- Preflight (core-lab) ---
node "%~dp0cli.mjs" preflight --profile core-lab
echo.
echo Bootstrap complete. Re-run  preflight.bat --profile caido-native  after configuring Caido.
exit /b %errorlevel%
