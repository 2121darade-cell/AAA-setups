Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$zipPath = Join-Path $PSScriptRoot "site.zip"
if (Test-Path $zipPath) {
    Remove-Item $zipPath -Force
}

$files = @(
    "index.html",
    "admin.html",
    "manifest.json",
    "sw.js",
    "assets/i18n.js",
    "assets/app.js",
    "assets/echarts.min.js",
    "assets/logo.png",
    "assets/style.css",
    "assets/real_market_cache.js",
    "assets/nifty500_data.js",
    "assets/mcx_data.js",
    "assets/trade_setup.js",
    "assets/aaa_screener.js",
    "assets/cubeplus_feed.js",
    "tradejini_server.ps1",
    "serve.ps1",
    "run_server.bat"
)

$zip = [System.IO.Compression.ZipFile]::Open($zipPath, [System.IO.Compression.ZipArchiveMode]::Create)
foreach ($rel in $files) {
    $fullPath = Join-Path $PSScriptRoot $rel
    if (Test-Path $fullPath) {
        $entryName = $rel.Replace("\", "/")
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $fullPath, $entryName, [System.IO.Compression.CompressionLevel]::Optimal)
    } else {
        Write-Warning "File missing: $fullPath"
    }
}
$zip.Dispose()

Write-Host "Created site.zip successfully. Size:" (Get-Item $zipPath).Length
