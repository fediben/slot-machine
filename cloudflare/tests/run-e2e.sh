#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export CI=true
printf '%s\n' 'MACHINE_MASTER_KEY=unit-testing-machine-master-key-with-over-32-characters' \
'PROFILE_PEPPER=unit-testing-profile-pepper-with-over-32-characters' \
'ADMIN_DEV_TOKEN=unit-test-admin-token-123' > .dev.vars
trap 'rm -f .dev.vars wrangler.ci.toml; if [[ -n "${SERVER_PID:-}" ]]; then kill "$SERVER_PID" 2>/dev/null || true; fi' EXIT
cp wrangler.toml wrangler.ci.toml
sed -i 's/APP_MODE = "production"/APP_MODE = "development"/' wrangler.ci.toml
npx wrangler d1 migrations apply slot-kiosk-db --local --config wrangler.ci.toml --persist-to .wrangler/state --yes
npx wrangler dev --local --config wrangler.ci.toml --ip 127.0.0.1 --port 8787 --persist-to .wrangler/state > /tmp/slot-kiosk-wrangler.log 2>&1 &
SERVER_PID=$!
ready=0
for n in $(seq 1 90); do
  if curl -fsS http://127.0.0.1:8787/health >/dev/null 2>&1; then ready=1; break; fi
  sleep 1
done
if [[ "$ready" != 1 ]]; then cat /tmp/slot-kiosk-wrangler.log; exit 1; fi
node --test tests/e2e.test.mjs || { cat /tmp/slot-kiosk-wrangler.log; exit 1; }
