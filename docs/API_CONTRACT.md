# Event API contract (v1, development)

All paths are same origin, JSON, no CORS; no gambling / withdrawals.

## Machine authentication
1. Privileged admin provisions a machine and receives `id` and `machine_key` **only once**.
2. For each request set `X-Machine-Id`, `X-Machine-Timestamp` (Unix milliseconds), `X-Machine-Nonce` (unique 12+ chars), and `X-Machine-Signature` (hex HMAC-SHA256).
3. Canonical HMAC bytes: `timestamp + "\\n" + nonce + "\\n" + UPPER_METHOD + "\\n" + pathname + query + "\\n" + lowercase_hex(SHA256(UTF8(body)))`.
4. The key is `HMAC_SHA256(MACHINE_MASTER_KEY, "slot-kiosk-machine-v1:" + machine_id)`, delivered by admin; clients never know the master key.
5. Clock drift ±5 minutes and replay nonce rejection enforced. TLS is mandatory off localhost.

## Operator endpoints
- `POST /api/admin/events` create event (slug, name, opening credits, per-profile limit).
- `PATCH /api/admin/events/{uuid}` state active/closed.
- `GET /api/admin/events` list recent events.
- `GET /api/admin/machines?event_id=...` list machine states and command/ack numbers.
- `POST /api/admin/machines` create machine and return a *one-time* key.
- `PATCH /api/admin/machines/{uuid}` set machine enabled boolean; increments command sequence.
- `GET /api/admin/scores?event_id=...` score audit.
- `GET /api/admin/leaderboard?event_id=...` operator ranking.
- `GET/PATCH /api/admin/settings` event display settings.

In production, admin endpoints require correctly configured **Cloudflare Access** JWT verification. Never use ADMIN_DEV_TOKEN outside the development Wrangler configuration.

## Kiosk endpoints
- `GET /api/machine/state` machine state, event, active session and command sequence.
- `POST /api/machine/ack` {"command_seq":n} to acknowledge operator commands.
- `POST /api/machine/checkins` {} -> 90-second QR web URL.
- `POST /api/machine/spins` {"session_id":"uuid","cost":50|150} -> `spin_token`.
- `POST /api/machine/scores` {"session_id":"uuid","spin_token":"...","award":100,"played_at":unixMs,"client_result_hash":"..."}.
  - Hash input `spin_token:session_id:award:played_at`; hex SHA-256. This detects malformed submissions; it is **not** a proof of fair RNG.
- `POST /api/machine/end` {"session_id":"uuid"} (requires no pending spin).
- `GET /api/events/{slug}/leaderboard` publicly visible, **provisional**.

## QR
`GET /join/{token}` is a mobile player form, `GET/POST /api/join/{token}` retrieves details or signs in with event nickname/PIN. One-use, four-attempt maximum, production Turnstile required.

## Limits
- **No independent server-side RNG or result replay yet**. Scores are flagged provisional.
- **No cash wagering**, payments, cash-out, paid credits, or transferable value.
- Production identities need policy review; nickname/PIN is not verified personhood. Never use prize eligibility based only on nickname/PIN.
