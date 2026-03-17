Add-Type -AssemblyName System.Web
$yfUrl = "https://query2.finance.yahoo.com/v7/finance/quote?symbols=AAPL,GC=F&formatted=false&fields=regularMarketPrice,regularMarketChangePercent"
$enc = [System.Web.HttpUtility]::UrlEncode($yfUrl)

$proxies = @(
    "https://corsproxy.io/?$enc",
    "https://api.allorigins.win/raw?url=$enc",
    "https://api.codetabs.com/v1/proxy?quest=$enc",
    "https://thingproxy.freeboard.io/fetch/$yfUrl"
)

foreach ($p in $proxies) {
    try {
        $r = Invoke-WebRequest -Uri $p -TimeoutSec 12 -UseBasicParsing
        Write-Host "OK ($($r.StatusCode)): $($p.Substring(0,40))..."
        Write-Host "  Response: $($r.Content.Substring(0, [Math]::Min(150, $r.Content.Length)))"
    } catch {
        Write-Host "FAIL: $($p.Substring(0,40))... => $($_.Exception.Message)"
    }
}
