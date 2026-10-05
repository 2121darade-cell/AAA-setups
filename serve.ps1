param(
    [int]$Port = 8080
)

# Finanthropist Educare Pvt Ltd
# Entry point: Launches Unified Tradejini Live Data & Web Server
$scriptPath = Join-Path $PSScriptRoot "tradejini_server.ps1"
if (Test-Path $scriptPath) {
    & $scriptPath -Port $Port
} else {
    Write-Host "tradejini_server.ps1 not found in $PSScriptRoot" -ForegroundColor Red
}
