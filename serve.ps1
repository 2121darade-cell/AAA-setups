param(
    [int]$Port = 8080
)

# Unified Trading Platform
# Entry point: Launches Unified Live Data & Web Server
$scriptPath = Join-Path $PSScriptRoot "tradejini_server.ps1"
if (Test-Path $scriptPath) {
    & $scriptPath -Port $Port
} else {
    Write-Host "tradejini_server.ps1 not found in $PSScriptRoot" -ForegroundColor Red
}
