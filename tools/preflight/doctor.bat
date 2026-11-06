@echo off
REM SecurityAuditor — HackBot Doctor (Windows wrapper, H2d-F1).
REM No admin, no Docker, no WSL. Informational only (no verdict). Usage: doctor.bat [--json]
setlocal
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js not found on PATH. Install Node.js ^(user-scope, no admin^) and re-run.
  exit /b 9
)
node "%~dp0cli.mjs" doctor %*
exit /b %errorlevel%
