#!/usr/bin/env bash
# Installs an already-built Unity Linux standalone game into the *current* user profile.
set -euo pipefail
if (( $# != 3 )); then
  echo "Usage: bash linux/install-kiosk.sh /path/to/Unity/LinuxBuild https://api.example.com MACHINE_UUID" >&2
  exit 2
fi
build="$1"; api="${2%/}"; machine="$3"
[[ "$api" =~ ^https://[a-zA-Z0-9.-]+(:[0-9]+)?$ || "$api" =~ ^http://127\.0\.0\.1(:[0-9]+)?$ ]] || { echo "Use HTTPS or localhost" >&2; exit 2; }
[[ "$machine" =~ ^[a-f0-9-]{36}$ ]] || { echo "Invalid machine UUID" >&2; exit 2; }
[[ -f "$build/SlotKiosk.x86_64" ]] || { echo "Expected SlotKiosk.x86_64 inside Linux build folder" >&2; exit 2; }
printf 'Paste one-time kiosk key (hidden): '
read -rs key
printf '\n'
[[ "$key" =~ ^[A-Za-z0-9_-]{40,90}$ ]] || { echo "Invalid key format" >&2; exit 2; }
root="$HOME/.local/share/slot-kiosk"
cfg="$HOME/.config/slot-kiosk"
mkdir -p "$root" "$cfg" "$HOME/.config/autostart"
chmod 700 "$cfg"
rm -rf "$root/build"
mkdir -p "$root/build"
cp -a "$build/." "$root/build/"
chmod u+x "$root/build/SlotKiosk.x86_64"
install -m 700 "$(dirname "$0")/launch-kiosk.sh" "$root/launch-kiosk.sh"
umask 077
printf '{"api_url":"%s","machine_id":"%s","machine_key":"%s"}\n' "$api" "$machine" "$key" > "$cfg/device.json"
chmod 600 "$cfg/device.json"
printf '%s\n' "[Desktop Entry]" "Type=Application" "Name=Slot Kiosk" "Exec=$root/launch-kiosk.sh" "Terminal=false" "X-GNOME-Autostart-enabled=true" > "$HOME/.config/autostart/slot-kiosk.desktop"
chmod 600 "$HOME/.config/autostart/slot-kiosk.desktop"
echo "Installed for your user. Start $root/launch-kiosk.sh or log in again."
echo "No automatic OS login is enabled. Keep device.json and workstation physically protected."
