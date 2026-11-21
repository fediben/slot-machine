# Slot Kiosk account bootstrap. Runs locally: API token and Turnstile secret never go to GitHub.
param(
    [Parameter(Mandatory=$true)][string]$AccountId,
    [Parameter(Mandatory=$true)][string]$OperatorEmail,
    [switch]$Apply,
    [switch]$Deploy
)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
if ($Deploy -and -not $Apply) { throw 'Use -Apply -Deploy together.' }
if ($AccountId -notmatch '^[a-fA-F0-9]{32}$') { throw 'Invalid Cloudflare account ID.' }
if ($OperatorEmail -notmatch '^[^@\s]+@[^@\s]+\.[^@\s]+$') { throw 'Invalid operator email.' }
$root=Split-Path -Parent $PSScriptRoot
if (-not (Test-Path (Join-Path $root 'wrangler.toml'))) { throw 'Run from the checked-out Slot Kiosk cloudflare project.' }
$secureToken=Read-Host 'Paste a scoped Cloudflare API token (hidden; stays on this PC)' -AsSecureString
$ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
try { $token=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
if ([string]::IsNullOrWhiteSpace($token)) { throw 'API token is empty.' }
$headers=@{Authorization=('Bearer '+$token)}
function Call-Cloudflare([string]$Method,[string]$Path,[object]$Data=$null) {
    $args=@{Method=$Method;Uri=('https://api.cloudflare.com/client/v4'+$Path);Headers=$headers;ErrorAction='Stop'}
    if ($null -ne $Data) {
        $args.ContentType='application/json'
        $args.Body=ConvertTo-Json -InputObject $Data -Depth 15 -Compress
    }
    try { $r=Invoke-RestMethod @args }
    catch { throw ('Cloudflare API rejected '+$Method+' '+$Path+'. Verify token permissions and account; no secret will be printed.') }
    if (-not $r.success) {
        $errors=(@($r.errors) | ForEach-Object { $_.message }) -join '; '
        throw ('Cloudflare API failure: '+$errors)
    }
    return $r.result
}
try {
    $account=$AccountId.ToLowerInvariant()
    $sub=Call-Cloudflare 'GET' ('/accounts/'+$account+'/workers/subdomain')
    if (-not $sub.subdomain -or $sub.subdomain -notmatch '^[a-z0-9-]+$') { throw 'Cannot discover workers.dev subdomain; check Workers Scripts Read permission.' }
    $hostName=('slot-kiosk-api.'+$sub.subdomain+'.workers.dev')
    $org=Call-Cloudflare 'GET' ('/accounts/'+$account+'/access/organizations')
    $team=[string]$org.auth_domain
    $team=$team -replace '^https?://',''
    if ($team -notmatch '^[a-z0-9-]+\.cloudflareaccess\.com$') { throw 'Cloudflare Zero Trust organization missing or invalid; finish one-time Zero Trust onboarding first.' }

    $appName='Slot Kiosk Admin'
    $urls=@($hostName+'/admin',$hostName+'/api/admin/*')
    $apps=@(Call-Cloudflare 'GET' ('/accounts/'+$account+'/access/apps?per_page=100'))
    $existingApps=@($apps | Where-Object { $_.name -eq $appName })
    if ($existingApps.Count -gt 1) { throw 'Multiple Slot Kiosk Admin Access apps. Resolve duplicates in Cloudflare first.' }
    $access=$null
    if ($existingApps.Count -eq 1) {
        $access=Call-Cloudflare 'GET' ('/accounts/'+$account+'/access/apps/'+$existingApps[0].id)
        $paths=@($access.destinations | Where-Object { $_.type -eq 'public' } | ForEach-Object { $_.uri })
        if ($paths.Count -ne $urls.Count -or @($urls | Where-Object { $paths -notcontains $_ }).Count -gt 0) {
            throw 'Existing Slot Kiosk Admin has different Access paths; refusing to weaken or overwrite it.'
        }
        $matchingPolicy=$false
        foreach ($policy in @($access.policies)) {
            if ($policy.decision -ne 'allow') { continue }
            foreach ($rule in @($policy.include)) {
                if ($rule.email.email -eq $OperatorEmail) { $matchingPolicy=$true }
            }
        }
        if (-not $matchingPolicy) {
            throw 'Existing Access policy cannot be verified as operator-only; inspect it in Cloudflare before deploying.'
        }
        Write-Host 'Existing operator-only Access application verified.' -ForegroundColor Green
    }

    $widgetName='Slot Kiosk Check-in'
    $widgets=@(Call-Cloudflare 'GET' ('/accounts/'+$account+'/challenges/widgets?per_page=100'))
    $matches=@($widgets | Where-Object { $_.name -eq $widgetName -and @($_.domains) -contains $hostName })
    if ($matches.Count -gt 1) { throw 'Multiple matching Turnstile widgets; resolve duplicates first.' }
    $widget=$null
    if ($matches.Count -eq 1) {
        $widget=Call-Cloudflare 'GET' ('/accounts/'+$account+'/challenges/widgets/'+$matches[0].sitekey)
        Write-Host 'Existing Turnstile widget found; will reuse it.' -ForegroundColor Green
    }

    Write-Host ''
    Write-Host ('Target hostname: '+$hostName) -ForegroundColor Cyan
    Write-Host ('Operator: '+$OperatorEmail)
    Write-Host ('Cloudflare Access: '+$team)
    Write-Host 'Protected paths: /admin, /api/admin/* (public QR remains available)'
    Write-Host ('Access app: '+$(if ($access) { 'reuse' } else { 'create' }))
    Write-Host ('Turnstile widget: '+$(if ($widget) { 'reuse' } else { 'create' }))
    if (-not $Apply) {
        Write-Host 'DRY RUN ONLY. No resources were created or deployed.' -ForegroundColor Green
        Write-Host 'Review the target, then run the same command with -Apply -Deploy if correct.'
        return
    }
    $confirmation=Read-Host 'Type CONFIGURE to approve Access/Turnstile changes'
    if ($confirmation -cne 'CONFIGURE') { throw 'Cancelled without creating resources.' }

    if ($null -eq $access) {
        $payload=@{
            type='self_hosted';name=$appName;domain=$urls[0];
            destinations=@(
                @{type='public';uri=$urls[0]},
                @{type='public';uri=$urls[1]}
            )
            policies=@(
                @{decision='allow';name='Only selected kiosk operator';include=@(@{email=@{email=$OperatorEmail}})}
            )
            session_duration='8h'
        }
        $access=Call-Cloudflare 'POST' ('/accounts/'+$account+'/access/apps') $payload
        Write-Host 'Access app created.' -ForegroundColor Green
    }
    if (-not $access.aud -or [string]$access.aud -notmatch '^[A-Za-z0-9_-]{20,200}$') {
        throw 'Access AUD not found; app may have been created. Inspect Cloudflare before retrying.'
    }
    # Reusing an app is only permitted when its existing access policy is accepted by operator.
    if ($null -eq $widget) {
        $widget=Call-Cloudflare 'POST' ('/accounts/'+$account+'/challenges/widgets') @{
            domains=@($hostName);mode='managed';name=$widgetName
        }
        Write-Host 'Turnstile widget created.' -ForegroundColor Green
    }
    if (-not $widget.sitekey -or -not $widget.secret) {
        throw 'Turnstile site key or secret unavailable; inspect widget before deployment. Do not rotate it.'
    }
    if (@($widget.domains) -notcontains $hostName) { throw 'Turnstile widget does not authorize the Worker hostname.' }
    Write-Host 'Access + Turnstile configured; credentials have not been displayed.' -ForegroundColor Green

    if (-not $Deploy) {
        Write-Host 'No Worker deployment requested. Re-run with -Apply -Deploy to deploy.'
        return
    }
    $deployConfirm=Read-Host 'Type DEPLOY to start Worker deployment using existing D1'
    if ($deployConfirm -cne 'DEPLOY') { throw 'Stopped before deployment; Access and Turnstile may already exist.' }
    $secureWidget=ConvertTo-SecureString -String ([string]$widget.secret) -AsPlainText -Force
    $prep=Join-Path $PSScriptRoot 'prepare-cloudflare.ps1'
    & $prep -AccessTeamDomain $team -AccessAudience ([string]$access.aud) -TurnstileSiteKey ([string]$widget.sitekey) -TurnstileSecret $secureWidget -Deploy
    if ($LASTEXITCODE -ne 0) { throw 'Wrangler failed. Review output and do not rotate secrets.' }
    Write-Host ('Worker target: https://'+$hostName) -ForegroundColor Green
    Write-Host 'Verify /health, public QR and unauthorized /admin before considering a pilot.'
}
finally {
    $token=$null
    $secureToken.Dispose()
    $headers.Clear()
}
