#!/usr/bin/env bash
set -euo pipefail
root="${HOME}/.local/share/slot-kiosk"
export SLOT_KIOSK_CONFIG_PATH="${HOME}/.config/slot-kiosk/device.json"
if [[ ! -r "$SLOT_KIOSK_CONFIG_PATH" ]]; then
  echo "No kiosk device configuration. Run install-kiosk.sh first." >&2
  exit 2
fi
if [[ ! -x "$root/build/SlotKiosk.x86_64" ]]; then
  echo "Unity Linux executable not present. Build it in Unity and reinstall." >&2
  exit 3
fi
cd "$root/build"
exec ./SlotKiosk.x86_64 -screen-fullscreen 1 -screen-width 1920 -screen-height 1080 -logFile "${HOME}/.local/share/slot-kiosk/unity.log"
