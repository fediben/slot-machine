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

    function Find-ExistingD1 {
        # Wrangler's --json output is documented for D1 list.
        $raw = & npx wrangler d1 list --json | Out-String
        if ($LASTEXITCODE -ne 0) { throw "Cannot list D1 databases. Verify the Cloudflare account." }
        try {
            $all = @($raw | ConvertFrom-Json)
        } catch {
            throw "Unable to parse 'wrangler d1 list --json'. Do not create a duplicate database."
        }
        $matches = @($all | Where-Object { $_.name -eq "slot-kiosk-db" })
        if ($matches.Count -gt 1) { throw "More than one slot-kiosk-db was found; select a database manually." }
        if ($matches.Count -eq 1) { return $matches[0] }
        return $null
    }

    $existing = Find-ExistingD1
    if ($null -ne $existing) {
        if (-not $existing.uuid -or [string]$existing.uuid -notmatch '^[a-f0-9-]{36}$') {
            throw "Existing slot-kiosk-db has no valid UUID. Nothing changed."
        }
        if ($DatabaseId -and $DatabaseId -ne [string]$existing.uuid) {
            throw "Supplied -DatabaseId does not match the existing slot-kiosk-db. Nothing changed."
        }
        $DatabaseId = [string]$existing.uuid
        Write-Host "Reusing existing D1 database slot-kiosk-db: $DatabaseId" -ForegroundColor Green
    } elseif ($DatabaseId) {
        throw "The selected account has no slot-kiosk-db. Refusing an unknown -DatabaseId."
    } else {
        Write-Host "No slot-kiosk-db found. Creating it once..." -ForegroundColor Cyan
        & npx wrangler d1 create slot-kiosk-db
        if ($LASTEXITCODE -ne 0) { throw "D1 creation failed. Nothing deployed." }
        $created = Find-ExistingD1
        if ($null -eq $created) { throw "D1 was created but not discoverable. Nothing deployed." }
        $DatabaseId = [string]$created.uuid
        Write-Host "Created slot-kiosk-db: $DatabaseId" -ForegroundColor Green
    }

    if ($DatabaseId -notmatch '^[a-f0-9-]{36}$' -or
        $DatabaseId -eq '00000000-0000-0000-0000-000000000000') {
        throw "D1 UUID invalid or placeholder."
    }

    # Validate all deployment prerequisites before touching live D1 resources.
    if ($Deploy) {
        if ($AccessTeamDomain -notmatch '^[a-z0-9-]+\.cloudflareaccess\.com$') {
            throw "Set -AccessTeamDomain from Cloudflare Zero Trust Access."
        }
        if ($AccessAudience -notmatch '^[a-zA-Z0-9_-]{20,200}$') {
            throw "Set -AccessAudience to your Access application AUD."
        }
        if ($TurnstileSiteKey -notmatch '^[a-zA-Z0-9_-]{10,150}$') {
            throw "Set -TurnstileSiteKey from the check-in hostname's Turnstile widget."
        }
    }

    $config = Join-Path $root "wrangler.toml"
    $content = [IO.File]::ReadAllText($config)
    if ($content -notmatch 'database_id\s*=\s*"[a-f0-9-]{36}"') {
        throw "Could not find the D1 database_id in wrangler.toml; file left unchanged."
    }
    $content = [regex]::Replace($content, 'database_id\s*=\s*"[a-f0-9-]{36}"',
      'database_id = "' + $DatabaseId + '"')

    if ($Deploy) {
        # Replace (rather than append) values, so the script remains safe to rerun.
        foreach ($entry in @{
            "ACCESS_TEAM_DOMAIN" = $AccessTeamDomain
            "ACCESS_AUD" = $AccessAudience
            "TURNSTILE_SITE_KEY" = $TurnstileSiteKey
        }.GetEnumerator()) {
            $key = $entry.Key
            $value = $entry.Value
            if ($content -match "(?m)^$key\s*=") {
                $content = [regex]::Replace($content, "(?m)^$key\s*=.*$", "$key = `"$value`"")
            } else {
                $content = $content -replace '(?m)^APP_MODE = "production"$',
                    "APP_MODE = `"production`"`n$key = `"$value`""
            }
        }
        if ($EnableR2 -and $content -notmatch '(?m)^\[\[r2_buckets\]\]') {
            Write-Host "R2 requested. Ensure bucket 'slot-kiosk-assets' exists before deploying." -ForegroundColor Yellow
            $content += "`n[[r2_buckets]]`nbinding = `"ASSETS`"`nbucket_name = `"slot-kiosk-assets`"`n"
        }
    }

    [IO.File]::WriteAllText($config, $content, (New-Object System.Text.UTF8Encoding($false)))
    Write-Host "D1 binding configured: $DatabaseId" -ForegroundColor Green

    if (-not $Deploy) {
        Write-Host "PREPARED ONLY: no migrations or Worker deployment performed." -ForegroundColor Green
        Write-Host "Next: configure Cloudflare Access and Turnstile, then run with -Deploy and required values."
        return
    }

    & npx wrangler d1 migrations list slot-kiosk-db --remote
    if ($LASTEXITCODE -ne 0) { throw "Remote D1 inspection failed; deployment stopped." }
    & npx wrangler d1 migrations apply slot-kiosk-db --remote --force
    if ($LASTEXITCODE -ne 0) { throw "D1 migration failed; deployment stopped." }
    & npx wrangler deploy
    if ($LASTEXITCODE -ne 0) { throw "Worker deployment failed." }

    # Never rotate an existing machine master or PIN pepper on repeated deployments.
    # Such a rotation would invalidate every provisioned kiosk key / saved profile PIN.
    $rawSecrets = & npx wrangler secret list --format json | Out-String
    if ($LASTEXITCODE -ne 0) {
        throw "Unable to inspect Worker secrets. Do NOT rerun provisioning blindly."
    }
    try { $secrets = @($rawSecrets | ConvertFrom-Json) }
    catch { throw "Unable to parse existing Worker secrets. Do NOT regenerate machine keys." }
    $existingNames = @($secrets | ForEach-Object { $_.name })

    function Set-RandomSecretIfMissing([string]$name) {
        if ($existingNames -contains $name) {
            Write-Host "Preserving existing $name" -ForegroundColor Green
            return
        }
        $bytes = New-Object byte[] 48
        $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
        try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
        $value = [Convert]::ToBase64String($bytes)
        $value | & npx wrangler secret put $name
        $value = $null
        if ($LASTEXITCODE -ne 0) { throw "Failed to install $name" }
        Write-Host "$name set once; preserve it for existing kiosks." -ForegroundColor Green
    }
    Set-RandomSecretIfMissing "MACHINE_MASTER_KEY"
    Set-RandomSecretIfMissing "PROFILE_PEPPER"

    if ($existingNames -contains "TURNSTILE_SECRET") {
        Write-Host "Preserving existing TURNSTILE_SECRET" -ForegroundColor Green
    } else {
        $turnstileSecret = Read-Host "Paste Turnstile secret (hidden)" -AsSecureString
        $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($turnstileSecret)
        try {
            $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
            $plain | & npx wrangler secret put TURNSTILE_SECRET
            if ($LASTEXITCODE -ne 0) { throw "Failed to configure Turnstile secret" }
        } finally {
            [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
            $plain = $null
        }
    }
    Write-Host "Worker deployment finished. Verify Access, QR, and machine controls before event use." -ForegroundColor Green
} finally {
    Pop-Location
}
