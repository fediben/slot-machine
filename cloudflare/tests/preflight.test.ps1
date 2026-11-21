# CI-only PowerShell 5.1 test. Every Wrangler invocation is mocked in-memory.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$fixture = Join-Path $env:TEMP ("slot-kiosk-preflight-" + [guid]::NewGuid().ToString("N"))
$cloudflare = Join-Path $fixture 'cloudflare'
$directory = Join-Path $cloudflare 'scripts'
New-Item -ItemType Directory -Path $directory -Force | Out-Null
$script = Join-Path $directory 'prepare-cloudflare.ps1'
$source = Join-Path $PSScriptRoot '..\\scripts\\prepare-cloudflare.ps1'
Copy-Item -LiteralPath $source -Destination $script
$toml = Join-Path $cloudflare 'wrangler.toml'
$testDatabaseId = '2a22a2d2-e98c-4461-9a8e-30c108b08d1e'
$testOtherId = 'bb22a2d2-e98c-4461-9a8e-30c108b08d1e'
$initialConfig = @'
name = "slot-kiosk-api"
[[d1_databases]]
binding = "DB"
database_name = "slot-kiosk-db"
database_id = "00000000-0000-0000-0000-000000000000"
[vars]
APP_MODE = "production"
'@
[IO.File]::WriteAllText($toml, $initialConfig)

$global:mockCalls = New-Object 'System.Collections.Generic.List[string]'
function npx {
    $argumentsText = ($args | ForEach-Object { [string]$_ }) -join ' '
    $global:mockCalls.Add($argumentsText)
    $global:LASTEXITCODE = 0
    if ($argumentsText -eq 'wrangler whoami') { Write-Output 'mock authenticated'; return }
    if ($argumentsText -eq 'wrangler d1 list --json') {
        # Two records catch the original Windows PowerShell array-enumeration regression.
        Write-Output ('[{"name":"unrelated-db","uuid":"' + $testOtherId + '"},{"name":"slot-kiosk-db","uuid":"' + $testDatabaseId + '"}]')
        return
    }
    throw "TEST FAILURE: unexpected Wrangler call: $argumentsText"
}
try {
    . $script
    $text = [IO.File]::ReadAllText($toml)
    if ($text -notmatch [regex]::Escape($testDatabaseId)) { throw 'Existing D1 binding was not recovered.' }
    if ($global:mockCalls -contains 'wrangler d1 create slot-kiosk-db') { throw 'Script tried to create duplicate D1.' }
    if ($global:mockCalls -contains 'wrangler deploy') { throw 'Script deployed without explicit permission.' }
    $callsBefore = $global:mockCalls.Count
    $before = [IO.File]::ReadAllText($toml)
    $caught = $false
    try {
        . $script -Deploy -AccessTeamDomain 'YOUR-TEAM.cloudflareaccess.com' -AccessAudience 'YOUR-ACCESS-AUD' -TurnstileSiteKey 'YOUR-TURNSTILE-SITE-KEY'
    } catch {
        $caught = $_.Exception.Message -match 'sample or missing'
    }
    if (-not $caught) { throw 'Literal tutorial placeholders were not rejected.' }
    if ($global:mockCalls.Count -ne $callsBefore) { throw 'Placeholder rejection made Cloudflare calls.' }
    if ([IO.File]::ReadAllText($toml) -ne $before) { throw 'Placeholder rejection changed wrangler.toml.' }
    Write-Host 'PASS: reuses correct D1 ID; no duplicate, deployment or placeholder side effects.'
} finally {
    Remove-Item -LiteralPath $fixture -Recurse -Force
}
