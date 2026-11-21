# No network, no secrets from accounts. Mocks only the read-only dry-run.
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$setup=Join-Path $PSScriptRoot '..\scripts\setup-account.ps1'
$original=[IO.File]::ReadAllText((Join-Path $PSScriptRoot '..\wrangler.toml'))
$global:paths=New-Object 'System.Collections.Generic.List[string]'
function Read-Host {
    param([string]$Prompt,[switch]$AsSecureString)
    if (-not $AsSecureString) { throw 'Unexpected confirmation prompt.' }
    return (ConvertTo-SecureString 'mock-token-not-real' -AsPlainText -Force)
}
function Invoke-RestMethod {
    param($Method,$Uri,$Headers,$ContentType,$Body)
    $global:paths.Add([string]$Uri)
    if ($Method -ne 'GET') { throw 'No mutation permitted in dry-run test.' }
    if ($Uri -match '/workers/subdomain$') { return [pscustomobject]@{success=$true;result=[pscustomobject]@{subdomain='testaccount'}} }
    if ($Uri -match '/access/organizations$') { return [pscustomobject]@{success=$true;result=[pscustomobject]@{auth_domain='testaccount.cloudflareaccess.com'}} }
    if ($Uri -match '/access/apps\?') { return [pscustomobject]@{success=$true;result=@()} }
    if ($Uri -match '/challenges/widgets\?') { return [pscustomobject]@{success=$true;result=@()} }
    throw ('Unexpected API: '+$Uri)
}
& $setup -AccountId 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' -OperatorEmail 'operator@example.com'
if ($global:paths.Count -ne 4) { throw 'Unexpected Cloudflare API call count.' }
if ([IO.File]::ReadAllText((Join-Path $PSScriptRoot '..\wrangler.toml')) -ne $original) { throw 'Dry run changed wrangler.toml.' }
Write-Host 'PASS: simulated account bootstrap only read metadata; no API mutation or deployment.' -ForegroundColor Green
