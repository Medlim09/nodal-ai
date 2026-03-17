$url = "https://query2.finance.yahoo.com/v7/finance/quote?symbols=AAPL,GC=F&formatted=false&fields=regularMarketPrice,shortName"
$headers = @{
    "User-Agent" = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    "Accept" = "application/json"
    "Referer" = "https://finance.yahoo.com/"
    "Origin" = "https://finance.yahoo.com"
}

try {
    $r = Invoke-WebRequest -Uri $url -Headers $headers -TimeoutSec 15 -UseBasicParsing
    Write-Host "Status: $($r.StatusCode)"
    Write-Host "Response: $($r.Content.Substring(0, [Math]::Min(500, $r.Content.Length)))"
} catch {
    Write-Host "FAILED: $($_.Exception.Message)"
    if ($_.Exception.Response) {
        Write-Host "HTTP Status: $([int]$_.Exception.Response.StatusCode)"
    }
}

# Also test query1
Write-Host ""
Write-Host "--- Testing query1 ---"
$url2 = "https://query1.finance.yahoo.com/v7/finance/quote?symbols=AAPL&formatted=false&fields=regularMarketPrice"
try {
    $r2 = Invoke-WebRequest -Uri $url2 -Headers $headers -TimeoutSec 15 -UseBasicParsing
    Write-Host "Status: $($r2.StatusCode)"
    Write-Host "Response: $($r2.Content.Substring(0, [Math]::Min(300, $r2.Content.Length)))"
} catch {
    Write-Host "FAILED: $($_.Exception.Message)"
}
