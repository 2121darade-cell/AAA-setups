@echo off
title Finanthropist Educare - Trading Terminal
cd /d "%~dp0"
echo ========================================================
echo Starting Finanthropist Educare Trading Terminal...
echo ========================================================
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve.ps1"
if %errorlevel% neq 0 (
    echo.
    echo Server stopped or error occurred.
    pause
)
