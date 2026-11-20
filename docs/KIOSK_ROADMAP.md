# Slot kiosk / competition platform – migration plan

## Current state (baseline)
Imported Unity **5.6.0f3** project; original game logic remains in `Assets/scripts`. In particular, `UserManager.cs` makes unsecured requests to a legacy balance host and `qr.cs` treats camera-decoded text as a user ID. These legacy paths are **not** suitable for live events. The outbound balance host and login are now intentionally **disabled/fail-closed** in the legacy scene; the new scene must be wired and validated before operation. `LICENSE` retains the Apache-2.0 origin attribution.

## Implementation acceptance gates
1. **Audit/build:** documented legacy dependency inventory, GitHub JS/security CI; licensed Unity Editor for current project build must still be supplied.
2. **Separation:** preserve original reels and scoring while adding an isolated bridge/transport; set ReelManager.ManagedByKiosk=true in the new scene to disable legacy input handling. Never enable the old balance/QR login.
3. **Kiosk:** new bridge, QR renderer and idle leaderboard scripts are included, but must be attached in the Unity Editor and tested with real hardware; verify automatic bonus-spin timing and credit reconciliation. Do not enable for live events without this gate.
4. **Cloudflare:** D1 migration, events/machines, signed machine calls, Cloudflare Access admin guard.
5. **QR:** ephemeral kiosk-issued check-in, event-scoped nickname+PIN profile, single-use link and bounded attempts.
6. **Offline:** queue completed signed submissions for *previously issued* play tokens; no new sessions or unissued spins while offline.
7. **Back-office:** event/machine management, leaderboard and disable status; protect with Cloudflare Access SSO.
8. **Packaging:** theme assets optionally in R2, Linux auto-start kiosk, hardware test, multi-machine simulation, game validation and GDPR/privacy review.

## Security design
- Machine credential = HMAC-SHA256(MACHINE_MASTER_KEY, 'slot-kiosk-machine-v1:' + machine ID). Provision once over protected admin session, don't commit/store in source. Each request has machine ID, ±5 min timestamp, unique nonce, body digest and HMAC; D1 rejects nonce replays.
- Credit is in-game only, never real money. A machine gets one opaque one-use spin token at a time. Tokens bind event, session and machine; scores bounded and idempotent. Replays cannot award points twice.
- Score values are still computed by the **legacy Unity client** and cannot be fully trusted without a port of the rules to server-side verification. Treat competition results as **provisional** until authoritative validation is completed.
- Player nicknames appear on the public leaderboard. PINs are PBKDF2-hashed with distinct salt + server pepper. This is not verified email identity; enable stronger identity verification, Turnstile/rate limits and privacy policy before public rollout.
- Disable blocks new check-in links and play-token issuance; already-issued score submissions are accepted and kiosk acknowledges command sequence. A scheduled daily cleanup removes expired request nonces and stale QR check-in links.
- This branch does not deploy production resources or generate device credentials. Migrate D1 and configure Access/secrets manually under your own account.
