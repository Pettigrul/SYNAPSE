@echo off
REM SecurityAuditor — Environment Preflight (Windows wrapper, H2d-F1).
REM No admin, no Docker, no WSL — a thin wrapper over the shared Node module.
REM Usage: preflight.bat [--profile core-lab^|caido-native^|full-engagement] [--json]
REM Exit: 0 READY, 1 DEGRADED, 2 BLOCKED, 3 usage error, 9 node not found.
setlocal
where node >nul 2>nul
if errorlevel 1 (
  echo [BLOCKED] Node.js not found on PATH. Install Node.js ^(user-scope, no admin^) and re-run.
  exit /b 9
)
node "%~dp0cli.mjs" preflight %*
exit /b %errorlevel%
