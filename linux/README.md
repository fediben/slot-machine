# Linux kiosk deployment

1. Build a Linux x86-64 standalone player in the Unity Editor named `SlotKiosk.x86_64` (ensure matching `SlotKiosk_Data` directory is present).
2. In the **Cloudflare Access-protected** admin UI, create an event and machine. Copy its one-time ID and machine key to a safe place.
3. On the Linux kiosk, run `bash linux/install-kiosk.sh /path/to/LinuxBuild https://your-worker.example.com MACHINE_UUID`, then paste the key when prompted.
4. Launch via `~/.local/share/slot-kiosk/launch-kiosk.sh`; desktop auto-start at user login is installed.
5. Test a QR sign-in, spin, score retry after offline, leaderboard update, disable / acknowledge, reboot and safe recovery.

Do **not** enable automatic user login, run the game as root or allow public SSH. A kiosk is a controlled physical appliance; install security updates and turn off screen/power saving separately.

Secrets are stored at `~/.config/slot-kiosk/device.json` (user permissions 0600). The game must read `SLOT_KIOSK_CONFIG_PATH`. This installer does not publish or build Unity, and does not deploy Cloudflare.
