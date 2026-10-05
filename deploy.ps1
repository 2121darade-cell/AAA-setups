$zipPath = Join-Path $PSScriptRoot "site.zip"
$bytes = [System.IO.File]::ReadAllBytes($zipPath)
$res = Invoke-RestMethod -Uri "https://ship.page/deploy" -Method Post -Body $bytes -ContentType "application/zip"
$res | ConvertTo-Json
