# Slot Kiosk V2 — overnight QA and release gates

Last updated: 21 November 2026. This is a **draft engineering acceptance plan**, not a production approval.

## Runtime facts

- Cloudflare D1 `slot-kiosk-db` was **manually initialized by the operator** on 20 November: both `0001_init.sql` and `0002_invariants.sql` succeeded and the eight requested application tables were observed. The GitHub connector cannot re-verify the account remotely.
- `prepare-cloudflare.ps1 -Deploy` was **not successful**: the operator copied `YOUR-TEAM.cloudflareaccess.com`, `YOUR-ACCESS-AUD`, and `YOUR-TURNSTILE-SITE-KEY` placeholder values and preflight refused them. The Worker is **not verified deployed**.
- Cloudflare Access, Turnstile and physical Unity 5.6/Linux kiosk builds are not yet verified. Do not merge PR #1 or claim a live launch.
- Event credits are not currency; no stakes, payments, cash-out or monetizable prizes are implemented. Legal rules for any real-world prizes require review.

## Automated testing and expected behavior

| Scenario | Automation | Expected |
|---|---|---|
| Public health, unconfigured D1 fails closed | Node unit | 200 health, 503 inaccessible DB |
| Production admin without valid Access JWT | Node unit | 401 |
| Admin cross-site Origin or Fetch-Site | Node unit + D1 E2E | 403 |
| Admin write with text/plain instead of JSON | Node unit + D1 E2E | 415 |
| Turnstile success with wrong hostname | Node unit with stub Siteverify | Rejected |
| Windows PowerShell 5.1 existing D1 lookup | Windows GitHub Actions offline mock | Reuses exact database, does not create |
| Documentation placeholders with -Deploy | Windows GitHub Actions offline mock | Fails before any Cloudflare calls |
| New event, machine provisioning and signed device state | D1 Wrangler E2E | Success |
| Repeated machine HMAC nonce | D1 Wrangler E2E | 409 replay |
| Wrong machine submits another kiosk's spin | D1 Wrangler E2E | 403 |
| Reused or expired check-in link | D1 Wrangler E2E | Rejected |
| PIN, profile reuse and session cap | D1 Wrangler E2E | Capped |
| Credits/spins/score ledger with idempotent retry | D1 Wrangler E2E | One score only |
| Modified score integrity hash and mismatched award | D1 Wrangler E2E | Rejected |
| Disable machine / signed command acknowledgement | D1 Wrangler E2E | No new check-ins or spins |
| Already authorized score after disable | D1 Wrangler E2E | Accepted/reconciled once |
| Close event | D1 Wrangler E2E | No new check-ins |

These tests exercise code and simulated local D1, not Cloudflare production or an attached Unity device. Tests can turn red when dependencies, APIs or runtime behavior change; inspect the current GitHub Actions run rather than relying on this table alone.

## Unverified scenarios requiring attention

1. **Cloudflare:** Real Access team domain and application AUD, exact host/path policy, valid Site Key and secret, `/admin` access only by operator, `/join` accessible to guests; verify direct `/api/admin/*` calls reject non-admins.
2. **Turnstile:** Real phone QR scan, expiry after 90 seconds, refresh, cancelled challenge, bad PIN, wrong hostname, repeated token, multiple devices on same link, weak connectivity and challenge errors.
3. **Unity:** Compile with actual Unity 5.6.0f3 and legacy assets; test keyboard/USB physical controls, spin/bonus completion, reel animations, every wager/award mode, rollback on rejection, screen layout, fonts, sound and HDMI resolution.
4. **Network/power:** Physically disconnect and reconnect during game, while score pending, before and after server acceptance; force-process kill during queue save, after server accepts score but before client ACK; confirm no lost or double score.
5. **Fairness:** **Not yet independently verifiable.** Hash binds the submitted payload but does not prove the kiosk's reel/award algorithm was honest. Competition scoring remains provisional until a server-verifiable mechanism or independent adjudication is in place.
6. **Identity/privacy:** A nickname + PIN is not a strong unique human identifier; validate consent, display-name moderation, retention/deletion, event rules, Swiss privacy and any prize regulations.
7. **Operator UX:** Test kiosk online/offline, command/ack delay, one-time machine key provision, event close confirmation, touch/mobile scrolling, player error copy, CSV export and lost admin session.
8. **Volume/concurrency:** Simulate many kiosks/players with synchronized requests, D1 limits, rate-limits/abuse, timeout/retry behavior and long events; existing tests are not a performance benchmark.

## Next operator actions

1. In Cloudflare Zero Trust, create a **hostname/path-based** Access application for `/admin` and `/api/admin/*` on the final hostname, with one AUD and only authorized operators. **Do not** enable full-Worker Access for this mixed public/private service, or public QR check-in will be blocked. [Cloudflare Access docs](https://developers.cloudflare.com/workers/configuration/cloudflare-access/).
2. Configure Turnstile for that exact hostname and retain its secret privately. Do not paste credentials into GitHub issues, the repo or chat.
3. Use the preparer with **real values**, then inspect `npx wrangler secret list`, `/health`, admin policy, and public QR from a separate mobile browser.
4. Run the Unity and Linux acceptance procedures above before any public event. Keep PR #1 draft until gates pass.

## Guardrails for automated improvement

Work on `feature/kiosk-cloudflare-v1` only. Never deploy, migrate remote D1 again, rotate secrets, merge PR #1, or assert physical testing without real evidence. Use a review-only draft PR and green tests as evidence of **source-level** improvements, not production acceptance.

## 21 November source review: concurrency and release boundaries

- Added HTTP regression assertions that an unsigned machine-state request fails with 401 and a successfully claimed QR link cannot create another session (commit `41f36f13b030d703fc66e8c902cce7eeaad8fe0d`). These are sequential replay checks, **not** a concurrent load test.
- The one-use QR path claims the link and creates the session in a D1 batch. A concurrent double-submit and same-profile check-in from **two distinct kiosk links** need deterministic simultaneous-request regression tests before a multi-kiosk pilot; the current sequential E2E suite cannot establish serializability under load.
- Spin issuance and score settlement use database conditions and score token uniqueness, but race tests must assert exactly one accepted credit/score mutation under parallel retries, timeout-after-commit and delayed offline replay. Verify D1 batch transaction semantics in the deployed runtime.
- Leaderboards are explicitly provisional: score hashes protect payload consistency, **not** reel fairness or unique-person eligibility. Do not use as prize-awarding authority.
- Admin and deployment checks remain source/mock-only. Validate real Access JWT audience, policy scoping, Turnstile exact hostname, CSV spreadsheet-injection handling, operator mobile layout and secret-safe provisioning on staging.
- Unity adapter is source-inspected only; no Editor compilation, USB controls, physical screen, offline queue persistence or Linux launch was performed by this review.
- Release gate: passing CI + two-machine concurrent staging tests + security/retention signoff + Unity physical pilot + explicit owner GO. Never infer a production GO from green CI.
