param(
    [int]$Port = 8080
)

# ==============================================================================
# Finanthropist Educare Pvt Ltd - Tradejini Dynamic Data Server & Web Host
# 100% Dynamic Tradejini CubePlus API v2 Feed Engine
# Auto-login every 24h via TOTP Seed • Real Live Candlestick Charts & AAA Screener
# ==============================================================================

$folder = Split-Path -Parent $MyInvocation.MyCommand.Definition
if (-not $folder) { $folder = (Get-Location).Path }

# Credentials
$Global:TjApiKey = "4e8598e9e21fb2092d772c2923ab72a2"
$Global:TjUserId = "TR2488"
$Global:TjPassword = "1208"
$Global:TjSeed = "GRZZXEU7TV6WUXEFWGOJR7RHHQC54ZL4"

# Session State
$Global:TjAccessToken = "42eb1fac0906cf59d99d1b9c7eb2e09d"
$Global:TjTokenExpiryTime = [DateTimeOffset]::UtcNow.AddHours(23)
$Global:TjBaseUrl = "https://api.tradejini.com/v2"

# 1. RFC 6238 TOTP Generator
function Get-TotpCode([string]$Secret) {
    $base32Chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
    $bits = ""
    $cleanSecret = $Secret.ToUpper().Replace(" ", "").Replace("=", "")
    foreach ($c in $cleanSecret.ToCharArray()) {
        $val = $base32Chars.IndexOf($c)
        if ($val -lt 0) { throw "Invalid Base32 character: $c" }
        $bits += [Convert]::ToString($val, 2).PadLeft(5, '0')
    }
    $byteList = New-Object System.Collections.Generic.List[byte]
    for ($i = 0; $i -le ($bits.Length - 8); $i += 8) {
        $byteList.Add([Convert]::ToByte($bits.Substring($i, 8), 2))
    }
    $key = [byte[]]$byteList.ToArray()
    $step = [long][Math]::Floor([DateTimeOffset]::UtcNow.ToUnixTimeSeconds() / 30.0)
    $counterBytes = [BitConverter]::GetBytes($step)
    if ([BitConverter]::IsLittleEndian) { [Array]::Reverse($counterBytes) }
    
    $hmac = New-Object System.Security.Cryptography.HMACSHA1
    $hmac.Key = $key
    $hash = $hmac.ComputeHash($counterBytes)
    $offset = $hash[$hash.Length - 1] -band 0x0F
    $binary = (($hash[$offset] -band 0x7F) -shl 24) -bor (($hash[$offset + 1] -band 0xFF) -shl 16) -bor (($hash[$offset + 2] -band 0xFF) -shl 8) -bor ($hash[$offset + 3] -band 0xFF)
    $otp = ($binary % 1000000).ToString("D6")
    return $otp
}

# 2. Automated Tradejini Login (24h Token Renewal)
function Refresh-TradejiniSession([bool]$force = $false) {
    $now = [DateTimeOffset]::UtcNow
    if (-not $force -and $Global:TjAccessToken -and $now -lt $Global:TjTokenExpiryTime) {
        return $Global:TjAccessToken
    }

    Write-Host "[Tradejini Engine] Auto-renewing session token using TOTP seed..." -ForegroundColor Cyan
    try {
        $totp = Get-TotpCode -Secret $Global:TjSeed
        $headers = @{ "Authorization" = "Bearer " + $Global:TjApiKey }
        $body = @{
            userid = $Global:TjUserId
            password = $Global:TjPassword
            twoFa = $totp
            twoFaTyp = "totp"
        }
        $res = Invoke-RestMethod -Uri "$($Global:TjBaseUrl)/api-gw/oauth/individual-token-v2" -Method Post -Headers $headers -Body $body -ContentType "application/x-www-form-urlencoded"
        if ($res.access_token) {
            $Global:TjAccessToken = $res.access_token
            $Global:TjTokenExpiryTime = [DateTimeOffset]::UtcNow.AddSeconds($res.expires_in - 300) # 5 min safety buffer
            Write-Host "[Tradejini Engine] Successfully authenticated! Token expires at: $($Global:TjTokenExpiryTime.ToLocalTime())" -ForegroundColor Green
            return $Global:TjAccessToken
        }
    } catch {
        Write-Host "[Tradejini Engine] Login error: $($_.Exception.Message)" -ForegroundColor Red
    }
    return $Global:TjAccessToken
}

# 3. Symbol ID Resolver
function Resolve-TradejiniId([string]$symbol) {
    $sym = $symbol.Trim().ToUpper()
    if ($sym -eq "NIFTY" -or $sym -eq "NIFTY 50" -or $sym -eq "NIFTY50" -or $sym -eq "^NSEI") {
        return "IDX_-1_NSE"
    }
    if ($sym -eq "BANKNIFTY" -or $sym -eq "BANK NIFTY" -or $sym -eq "^NSEBANK") {
        return "IDX_-20_NSE"
    }
    if ($sym -eq "FINNIFTY" -or $sym -eq "FIN NIFTY") {
        return "IDX_-21_NSE"
    }
    if ($sym -eq "MIDCPNIFTY" -or $sym -eq "MIDCAP NIFTY" -or $sym -eq "MIDCAP") {
        return "IDX_-18_NSE"
    }
    if ($sym -eq "SENSEX" -or $sym -eq "^BSESN") {
        return "IDX_-51_BSE"
    }
    if ($sym -eq "GOLD" -or $sym -eq "GOLDM") {
        return "FUTCOM_GOLD_MCX_2026-12-04"
    }
    if ($sym -eq "CRUDEOIL" -or $sym -eq "CRUDE") {
        return "FUTCOM_CRUDEOIL_MCX_2026-10-19"
    }
    if ($sym -eq "SILVER" -or $sym -eq "SILVERM") {
        return "UNDCOM_SILVER_MCX"
    }
    # Equities
    $cleanSym = $sym.Replace(".NS", "").Replace(".BO", "").Trim()
    return "EQT_${cleanSym}_EQ_NSE"
}

# 4. Fetch Real Live Candles from Tradejini
function Get-TradejiniCandles([string]$symbol, [string]$interval = "5", [int]$days = 7) {
    $token = Refresh-TradejiniSession
    $tradejiniId = Resolve-TradejiniId -symbol $symbol
    $now = [long][DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
    $from = $now - ($days * 86400)
    $authHeader = "Bearer " + $Global:TjApiKey + ":" + $token
    $headers = @{ "Authorization" = $authHeader }

    # Map interval
    $tjInterval = switch ($interval) {
        "1"  { "1" }
        "5"  { "5" }
        "15" { "15" }
        "60" { "60" }
        "D"  { "D" }
        default { "5" }
    }

    $url = "$($Global:TjBaseUrl)/api/mkt-data/chart/interval-data?from=$from&to=$now&interval=$tjInterval&id=$tradejiniId"
    
    try {
        $r = Invoke-WebRequest -Uri $url -Method Get -Headers $headers
        if ($r.StatusCode -eq 200) {
            $data = $r.Content | ConvertFrom-Json
            if ($data.s -eq "ok" -and $data.d -and $data.d.bars) {
                $candles = @()
                foreach ($c in $data.d.bars) {
                    $ts = [long]$c[0]
                    $dt = [DateTimeOffset]::FromUnixTimeMilliseconds($ts).ToLocalTime()
                    $timeStr = if ($tjInterval -eq "D") { "Close" } else { $dt.ToString("HH:mm") + " IST" }
                    $dateStr = if ($tjInterval -eq "D") { $dt.ToString("dd MMM") } else { $dt.ToString("HH:mm") }
                    $fullDate = $dt.ToString("dd MMM yyyy")

                    $candles += @{
                        date = $dateStr
                        fullDate = $fullDate
                        time = $timeStr
                        open = [Math]::Round([double]$c[1], 2)
                        high = [Math]::Round([double]$c[2], 2)
                        low = [Math]::Round([double]$c[3], 2)
                        close = [Math]::Round([double]$c[4], 2)
                        volume = if ($c.Length -gt 5) { [long]$c[5] } else { 100 }
                    }
                }
                return @{
                    s = "ok"
                    symbol = $symbol
                    tradejiniId = $tradejiniId
                    count = $candles.Count
                    candles = $candles
                    source = "Tradejini CubePlus Live API"
                }
            }
        }
    } catch {
        # Check if 401 Unauthorized
        if ($_.Exception.Response -and $_.Exception.Response.StatusCode.value__ -eq 401) {
            Write-Host "[Tradejini Engine] Token expired (401). Retrying with immediate fresh login..." -ForegroundColor Yellow
            $token = Refresh-TradejiniSession -force $true
            $authHeader = "Bearer " + $Global:TjApiKey + ":" + $token
            $headers = @{ "Authorization" = $authHeader }
            $r = Invoke-WebRequest -Uri $url -Method Get -Headers $headers
            if ($r.StatusCode -eq 200) {
                $data = $r.Content | ConvertFrom-Json
                if ($data.s -eq "ok" -and $data.d -and $data.d.bars) {
                    $candles = @()
                    foreach ($c in $data.d.bars) {
                        $ts = [long]$c[0]
                        $dt = [DateTimeOffset]::FromUnixTimeMilliseconds($ts).ToLocalTime()
                        $candles += @{
                            date = $dt.ToString("HH:mm")
                            fullDate = $dt.ToString("dd MMM yyyy")
                            time = $dt.ToString("HH:mm") + " IST"
                            open = [Math]::Round([double]$c[1], 2)
                            high = [Math]::Round([double]$c[2], 2)
                            low = [Math]::Round([double]$c[3], 2)
                            close = [Math]::Round([double]$c[4], 2)
                            volume = if ($c.Length -gt 5) { [long]$c[5] } else { 100 }
                        }
                    }
                    return @{
                        s = "ok"
                        symbol = $symbol
                        tradejiniId = $tradejiniId
                        count = $candles.Count
                        candles = $candles
                        source = "Tradejini CubePlus Live API"
                    }
                }
            }
        } else {
            Write-Host "[Tradejini Engine] Error fetching candles for $symbol ($tradejiniId): $($_.Exception.Message)" -ForegroundColor Red
        }
    }

    return @{
        s = "error"
        symbol = $symbol
        tradejiniId = $tradejiniId
        candles = @()
    }
}

# 5. Dynamic AAA Screener (Real-Time Tradejini calculation)
# 5. Dynamic AAA Screener (Real-Time Tradejini Candlestick Pattern Engine)
$Global:CachedAaaScreener = $null
$Global:LastAaaScanTime = [DateTime]::MinValue

function Get-TradejiniAaaScreener() {
    # 30-second memory cache to make frontend snappy and responsive
    if ($Global:CachedAaaScreener -and ((Get-Date) - $Global:LastAaaScanTime).TotalSeconds -lt 30) {
        return $Global:CachedAaaScreener
    }

    $screenerStocks = @(
        "RELIANCE", "TCS", "HDFCBANK", "INFY", "ICICIBANK", "SBIN", "BHARTIARTL",
        "ITC", "KOTAKBANK", "LT", "AXISBANK", "HINDUNILVR", "BAJFINANCE", "MARUTI",
        "ASIANPAINT", "TATAMOTORS", "SUNPHARMA", "TITAN", "NTPC", "POWERGRID"
    )

    $rows = @()
    foreach ($sym in $screenerStocks) {
        try {
            $cData = Get-TradejiniCandles -symbol $sym -interval "5" -days 3
            if ($cData.s -eq "ok" -and $cData.candles.Count -gt 20) {
                $candles = $cData.candles
                $n = $candles.Count

                # Scan the recent bars for genuine AAA trend reversal setups
                for ($i = $n - 1; $i -ge [Math]::Max(10, $n - 45); $i--) {
                    $cCurr = $candles[$i]
                    $cPrev = $candles[$i - 1]
                    $isGreen = $cCurr.close -gt $cCurr.open
                    $isRed = $cCurr.close -lt $cCurr.open

                    # 1. BUY SIDE: Red Trend (3+ or 4+ red candles) -> Green Reversal
                    if ($isGreen -and ($cPrev.close -lt $cPrev.open)) {
                        $redTrend = 0
                        for ($k = $i - 1; $k -ge [Math]::Max(0, $i - 10); $k--) {
                            if ($candles[$k].close -lt $candles[$k].open) { $redTrend++ } else { break }
                        }

                        if ($redTrend -ge 3) {
                            $prevBody = [Math]::Abs($cPrev.close - $cPrev.open)
                            $currBody = [Math]::Abs($cCurr.close - $cCurr.open)

                            $pattern = "Bullish Reversal"
                            if ($cCurr.open -le $cPrev.close * 1.002 -and $cCurr.close -ge $cPrev.open * 0.998 -and $currBody -gt $prevBody) {
                                $pattern = "Bullish Engulfing"
                            } elseif ($cCurr.open -ge $cPrev.close * 0.999 -and $cCurr.close -le $cPrev.open * 1.001 -and $currBody -lt $prevBody) {
                                $pattern = "Bullish Harami"
                            } elseif ($cCurr.open -lt $cPrev.close -and $cCurr.close -gt (($cPrev.open + $cPrev.close) / 2)) {
                                $pattern = "Piercing Line"
                            }

                            $entry = [Math]::Round([double]$cCurr.open, 2)
                            $stopLoss = [Math]::Round([double]$cPrev.low, 2)
                            $risk = [Math]::Round([Math]::Max([Math]::Abs($entry - $stopLoss), $entry * 0.005), 2)
                            $target1 = [Math]::Round($entry + ($risk * 1.5), 2)
                            $target2 = [Math]::Round($entry + ($risk * 2.5), 2)
                            $ltp = [Math]::Round([double]$candles[-1].close, 2)

                            # Recent candle slice for the interactive chart modal
                            $sliceStart = [Math]::Max(0, $i - 12)
                            $candleSlice = $candles[$sliceStart..$i]

                            $rows += @{
                                id = "TJ_${sym}_BUY_$($cCurr.date -replace '[:\s]','_')"
                                symbol = $sym
                                name = "$sym Ltd. (NSE)"
                                type = "BUY"
                                pattern = $pattern
                                trendLength = $redTrend
                                trend = "$redTrend Red Candles"
                                date = "$($cCurr.fullDate) $($cCurr.time)"
                                entry = $entry
                                stopLoss = $stopLoss
                                target1 = $target1
                                target2 = $target2
                                risk = $risk
                                ltp = $ltp
                                candles = $candleSlice
                                source = "Tradejini Live API"
                            }
                            break # Found most recent valid setup for this stock
                        }
                    }

                    # 2. SELL SIDE: Green Trend (3+ or 4+ green candles) -> Red Reversal
                    if ($isRed -and ($cPrev.close -gt $cPrev.open)) {
                        $greenTrend = 0
                        for ($k = $i - 1; $k -ge [Math]::Max(0, $i - 10); $k--) {
                            if ($candles[$k].close -gt $candles[$k].open) { $greenTrend++ } else { break }
                        }

                        if ($greenTrend -ge 3) {
                            $prevBody = [Math]::Abs($cPrev.close - $cPrev.open)
                            $currBody = [Math]::Abs($cCurr.close - $cCurr.open)

                            $pattern = "Bearish Reversal"
                            if ($cCurr.open -ge $cPrev.close * 0.998 -and $cCurr.close -le $cPrev.open * 1.002 -and $currBody -gt $prevBody) {
                                $pattern = "Bearish Engulfing"
                            } elseif ($cCurr.open -le $cPrev.close * 1.001 -and $cCurr.close -ge $cPrev.open * 0.999 -and $currBody -lt $prevBody) {
                                $pattern = "Bearish Harami"
                            } elseif ($cCurr.open -gt $cPrev.close -and $cCurr.close -lt (($cPrev.open + $cPrev.close) / 2)) {
                                $pattern = "Dark Cloud Cover"
                            }

                            $entry = [Math]::Round([double]$cCurr.close, 2)
                            $stopLoss = [Math]::Round([double]$cPrev.high, 2)
                            $risk = [Math]::Round([Math]::Max([Math]::Abs($entry - $stopLoss), $entry * 0.005), 2)
                            $target1 = [Math]::Round($entry - ($risk * 1.5), 2)
                            $target2 = [Math]::Round($entry - ($risk * 2.5), 2)
                            $ltp = [Math]::Round([double]$candles[-1].close, 2)

                            $sliceStart = [Math]::Max(0, $i - 12)
                            $candleSlice = $candles[$sliceStart..$i]

                            $rows += @{
                                id = "TJ_${sym}_SELL_$($cCurr.date -replace '[:\s]','_')"
                                symbol = $sym
                                name = "$sym Ltd. (NSE)"
                                type = "SELL"
                                pattern = $pattern
                                trendLength = $greenTrend
                                trend = "$greenTrend Green Candles"
                                date = "$($cCurr.fullDate) $($cCurr.time)"
                                entry = $entry
                                stopLoss = $stopLoss
                                target1 = $target1
                                target2 = $target2
                                risk = $risk
                                ltp = $ltp
                                candles = $candleSlice
                                source = "Tradejini Live API"
                            }
                            break
                        }
                    }
                }
            }
        } catch {}
    }

    $result = @{
        s = "ok"
        updatedAt = [DateTimeOffset]::Now.ToString("dd MMM yyyy HH:mm:ss IST")
        totalScanned = $screenerStocks.Count
        foundCount = $rows.Count
        rows = $rows
        source = "Tradejini CubePlus v2 Live"
    }

    $Global:CachedAaaScreener = $result
    $Global:LastAaaScanTime = Get-Date
    return $result
}

# 6. Web & API Server
$url = "http://localhost:$Port/"
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($url)

try {
    $listener.Start()
    Write-Host "==================================================================" -ForegroundColor Cyan
    Write-Host " Finanthropist Educare Pvt Ltd - Tradejini Pure Live Data Terminal" -ForegroundColor Yellow
    Write-Host " Server Running at: $url" -ForegroundColor Green
    Write-Host " Auto-Login Token: Active (Auto-renew every 24h via TOTP Seed)" -ForegroundColor Green
    Write-Host " Press Ctrl+C to stop anytime." -ForegroundColor DarkGray
    Write-Host "==================================================================" -ForegroundColor Cyan

    while ($listener.IsListening) {
        try {
            $context = $listener.GetContext()
            $request = $context.Request
            $response = $context.Response

            # CORS Headers
            $response.Headers.Add("Access-Control-Allow-Origin", "*")
            $response.Headers.Add("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            $response.Headers.Add("Access-Control-Allow-Headers", "Content-Type, Authorization")

            if ($request.HttpMethod -eq "OPTIONS") {
                $response.StatusCode = 200
                $response.Close()
                continue
            }

            $path = $request.Url.LocalPath

            # API: Status
            if ($path -eq "/api/tradejini/status") {
                $status = @{
                    connected = $true
                    clientCode = $Global:TjUserId
                    tokenExpiresAt = $Global:TjTokenExpiryTime.ToLocalTime().ToString("yyyy-MM-dd HH:mm:ss")
                    autoRefresh = "Enabled (24h TOTP Seed)"
                    broker = "Tradejini CubePlus v2"
                }
                $json = $status | ConvertTo-Json
                $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
                $response.ContentType = "application/json; charset=utf-8"
                $response.StatusCode = 200
                $response.OutputStream.Write($bytes, 0, $bytes.Length)
                $response.Close()
                continue
            }

            # API: Live Candles
            if ($path -eq "/api/tradejini/candles") {
                $q = $request.QueryString
                $symbol = if ($q["symbol"]) { $q["symbol"] } else { "RELIANCE" }
                $interval = if ($q["interval"]) { $q["interval"] } else { "5" }
                $days = if ($q["days"]) { [int]$q["days"] } else { 7 }

                $candleResult = Get-TradejiniCandles -symbol $symbol -interval $interval -days $days
                $json = $candleResult | ConvertTo-Json -Depth 5
                $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
                $response.ContentType = "application/json; charset=utf-8"
                $response.StatusCode = 200
                $response.OutputStream.Write($bytes, 0, $bytes.Length)
                $response.Close()
                continue
            }

            # API: Dynamic AAA Screener
            if ($path -eq "/api/tradejini/screener") {
                $screenerResult = Get-TradejiniAaaScreener
                $json = $screenerResult | ConvertTo-Json -Depth 5
                $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
                $response.ContentType = "application/json; charset=utf-8"
                $response.StatusCode = 200
                $response.OutputStream.Write($bytes, 0, $bytes.Length)
                $response.Close()
                continue
            }

            # Static File Handler
            $relPath = $path.TrimStart('/')
            if ([string]::IsNullOrWhiteSpace($relPath) -or $relPath -eq "/") {
                $relPath = "index.html"
            }
            $safePath = $relPath.Replace('/', [System.IO.Path]::DirectorySeparatorChar)
            $filePath = [System.IO.Path]::Combine($folder, $safePath)

            if ([System.IO.File]::Exists($filePath)) {
                $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
                $mime = switch ($ext) {
                    ".html" { "text/html; charset=utf-8" }
                    ".htm"  { "text/html; charset=utf-8" }
                    ".css"  { "text/css; charset=utf-8" }
                    ".js"   { "application/javascript; charset=utf-8" }
                    ".json" { "application/json; charset=utf-8" }
                    ".png"  { "image/png" }
                    ".jpg"  { "image/jpeg" }
                    ".jpeg" { "image/jpeg" }
                    ".svg"  { "image/svg+xml" }
                    ".ico"  { "image/x-icon" }
                    default { "application/octet-stream" }
                }
                $bytes = [System.IO.File]::ReadAllBytes($filePath)
                $response.ContentType = $mime
                $response.StatusCode = 200
                $response.OutputStream.Write($bytes, 0, $bytes.Length)
            } else {
                $response.StatusCode = 404
                $err = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
                $response.OutputStream.Write($err, 0, $err.Length)
            }
            $response.Close()
        } catch {
            # Client socket drop or early termination - continue listening cleanly
        }
    }
} finally {
    if ($listener.IsListening) { $listener.Stop() }
}
