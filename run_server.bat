@echo off
title Trading Terminal - Unified Platform
cd /d "%~dp0"
echo ========================================================
echo Starting Trading Terminal...
echo ========================================================
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve.ps1"
if %errorlevel% neq 0 (
    echo.
    echo Server stopped or error occurred.
    pause
)
