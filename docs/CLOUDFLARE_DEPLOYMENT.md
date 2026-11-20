# Cloudflare deployment – operator checklist

**Scope:** Staging only until access, privacy, real Unity scoring and machine hardware validation pass. No ChatGPT/CI-owned production credentials have been created.

## 1. Prerequisites

- Install Node.js LTS on Windows, then `npx wrangler login` with the target Cloudflare account.
- Create a **Cloudflare Access** self-hosted application for the Worker administrative hostname/path, restricted to operator accounts. Copy its Team Domain (`xyz.cloudflareaccess.com`) and Application Audience (AUD). The Worker also verifies Access-signed JWTs and **fails closed** when unconfigured.
- Configure a **Cloudflare Turnstile** widget for the final check-in hostname. Copy its site key and keep the secret private.
- Determine the public hostname for the game check-in. Validate it on a phone.

## 2. One-time Windows setup

Open PowerShell in the `cloudflare` folder on the development branch, then:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\prepare-cloudflare.ps1
```

This reuses an existing **slot-kiosk-db** in the authenticated Cloudflare account (or creates it only if missing), then writes its ID into local `wrangler.toml`. **It does not deploy**. Re-running the preparation command is safe.

After Access and Turnstile are configured, the operator can deploy a non-prize staging instance:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\prepare-cloudflare.ps1 `
  -DatabaseId "YOUR_D1_UUID" `
  -AccessTeamDomain "YOURTEAM.cloudflareaccess.com" `
  -AccessAudience "YOUR_ACCESS_APP_AUD" `
  -TurnstileSiteKey "YOUR_TURNSTILE_SITE_KEY" `
  -Deploy
```

The script applies D1 migrations, deploys the Worker, provisions missing machine-master/profile-pepper secrets once, and prompts privately for a missing Turnstile secret. Subsequent executions preserve existing secrets. **Never rotate the machine master without reprovisioning every kiosk.** Always review migrations and keep backups before applying to data-bearing D1.

## 3. Provision a demo event

- Open `/admin` behind Access. Create a test event (`max_sessions_per_profile=1` for pilot).
- Create one kiosk; **copy the one-time machine ID and machine key** to a secure location, not into GitHub.
- Build a Unity Linux standalone player from your tested scene; install via `linux/install-kiosk.sh` on the kiosk.
- Verify heartbeat, enable/disable, command acknowledgement, QR link, Turnstile, score and idempotent retry, offline buffering and leaderboard.

## 4. Optional R2 themes

Create `slot-kiosk-assets` and add the following to the Wrangler TOML:

```toml
[[r2_buckets]]
binding = "ASSETS"
bucket_name = "slot-kiosk-assets"
```

Put a JSON manifest in `themeslug/manifest.json`:

```json
{"background":"background.webp","logo":"logo.png"}
```

Upload `themeslug/background.webp` and `themeslug/logo.png`. The Worker serves images through `/api/themes/{themeslug}/{filename}`, and a public manifest from `/api/events/{eventslug}/theme`. Filenames are restricted to images without path traversal.

## 5. Release gates

- **MUST PASS** Unity Editor Play Mode, built Linux kiosk, USB encoder, camera/QR display, event profile flow, offline power-loss recovery, connectivity and clock skew, safe stop/ack, and a two-kiosk load simulation.
- **MUST PASS** independent authoritative result validation (legacy Unity reel logic currently calculates awards) before using points for prizes or a consequential competition.
- Set GDPR/privacy notices, retention rules, deletion process, accessibility and host physical security.
- Machine controls must fail closed when connectivity is lost. Already-authorized rounds can finish, but no new spin tokens may be issued offline.

No real-money wagering, cash payouts, purchase of game credits or transferable credit value are included.


## Recovery: database already exists / accidentally cloned twice

If `wrangler d1 create slot-kiosk-db` says **a database with that name already exists**, do **not** delete the database. Update the development branch to the current recovery script:

```powershell
Set-Location "$HOME\slot-machine\cloudflare\slot-machine\cloudflare"
git pull --ff-only origin feature/kiosk-cloudflare-v1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\prepare-cloudflare.ps1
```

The nested path is an accidental clone inside another clone; it is usable for now, but do not `git clone` again. The updated script discovers `slot-kiosk-db` by exact name using `wrangler d1 list --json` and configures its existing UUID without creating anything. It prints **PREPARED ONLY** on success. Move to the outer repo later only after checking for uncommitted changes in both locations; deleting the inner folder before that risks losing local work.

Do not add `-Deploy` until Access + Turnstile are ready and verified. `npx wrangler whoami` confirms authentication but is **not proof of deployment**.
