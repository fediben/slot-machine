param(
    [string]$DatabaseId = "",
    [string]$AccessTeamDomain = "",
    [string]$AccessAudience = "",
    [string]$TurnstileSiteKey = "",
    [switch]$Deploy,
    [switch]$EnableR2
)
$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
$root = Split-Path -Parent $PSScriptRoot
Push-Location $root
try {
    if (-not (Get-Command npx -ErrorAction SilentlyContinue)) {
        throw "Node.js / npx is required. Install Node.js LTS first."
    }
    & npx wrangler whoami
    if ($LASTEXITCODE -ne 0) {
        throw "Cloudflare authentication required. Run: npx wrangler login"
    }
    $config = Join-Path $root "wrangler.toml"
    if (-not $DatabaseId) {
        $out = & npx wrangler d1 create slot-kiosk-db 2>&1 | Out-String
        Write-Host $out
        if ($LASTEXITCODE -ne 0) {
            throw "D1 creation failed. If DB already exists, rerun with -DatabaseId <UUID>."
        }
        $match = [regex]::Match($out, 'database_id\s*=\s*"([a-f0-9-]{36})"')
        if (-not $match.Success) {
            throw "Could not read D1 database_id. Rerun with -DatabaseId <UUID>."
        }
        $DatabaseId = $match.Groups[1].Value
    }
    if ($DatabaseId -notmatch '^[a-f0-9-]{36}$' -or $DatabaseId -eq '00000000-0000-0000-0000-000000000000') {
        throw "D1 UUID invalid or placeholder."
    }
    $content = [IO.File]::ReadAllText($config)
    $content = [regex]::Replace($content, 'database_id\s*=\s*"[a-f0-9-]{36}"', 'database_id = "' + $DatabaseId + '"')
    if ($Deploy) {
        if ($AccessTeamDomain -notmatch '^[a-z0-9-]+\.cloudflareaccess\.com$') {
            throw "Set -AccessTeamDomain from your Cloudflare Zero Trust Access account."
        }
        if ($AccessAudience -notmatch '^[a-zA-Z0-9_-]{20,200}$') {
            throw "Set -AccessAudience to your Access application AUD."
        }
        if ($TurnstileSiteKey -notmatch '^[a-zA-Z0-9_-]{10,150}$') {
            throw "Set -TurnstileSiteKey from the check-in hostname's Turnstile widget."
        }
        $content = [regex]::Replace($content,'APP_MODE = "production"','APP_MODE = "production"' +
            "`nACCESS_TEAM_DOMAIN = `"$AccessTeamDomain`"" +
            "`nACCESS_AUD = `"$AccessAudience`"" +
            "`nTURNSTILE_SITE_KEY = `"$TurnstileSiteKey`"")
        if ($EnableR2) {
            & npx wrangler r2 bucket create slot-kiosk-assets
            if ($LASTEXITCODE -ne 0) { throw "R2 creation failed; skip -EnableR2 if bucket already exists." }
            $content += "`n[[r2_buckets]]`nbinding = `"ASSETS`"`nbucket_name = `"slot-kiosk-assets`"`n"
        }
    }
    [IO.File]::WriteAllText($config, $content, (New-Object System.Text.UTF8Encoding($false)))
    Write-Host "Wrangler configured for D1: $DatabaseId" -ForegroundColor Green
    if (-not $Deploy) {
        Write-Host "Prepared only; no deployment or remote migration performed. Re-run with -Deploy and Access/Turnstile values."
        return
    }
    & npx wrangler d1 migrations apply slot-kiosk-db --remote --force
    if ($LASTEXITCODE -ne 0) { throw "D1 migration failed; deployment stopped." }
    & npx wrangler deploy
    if ($LASTEXITCODE -ne 0) { throw "Worker deployment failed." }
    function Write-RandomSecret([string]$name) {
        $bytes = New-Object byte[] 48
        $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
        try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
        $text = [Convert]::ToBase64String($bytes)
        $text | & npx wrangler secret put $name
        if ($LASTEXITCODE -ne 0) { throw "Failed to install secret: $name" }
        $text = $null
    }
    Write-RandomSecret "MACHINE_MASTER_KEY"
    Write-RandomSecret "PROFILE_PEPPER"
    $turnstileSecret = Read-Host "Paste Turnstile secret (hidden)" -AsSecureString
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($turnstileSecret)
    try {
        $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
        $plain | & npx wrangler secret put TURNSTILE_SECRET
        if ($LASTEXITCODE -ne 0) { throw "Failed to configure Turnstile secret" }
    }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
        $plain = $null
    }
    Write-Host "Worker deployed; verify /health, Cloudflare Access enforcement, and mobile Turnstile before registering player profiles." -ForegroundColor Green
}
finally { Pop-Location }
