# PeakForm for Garmin

Every Home Assistant user gets their own dashboard: sign-in happens through Home Assistant,
no extra password.

1. Start the app and open **PeakForm** in the sidebar.
2. In Garmin Connect (web), open **Settings → Personal API Key**
   (`https://connect.garmin.com/app/settings/personalApiToken`), create a key and copy it.
   It is shown only once and expires after the period you pick (max. one year).
3. In the dashboard, go to **Account** and paste the key. It is verified with Garmin, then
   stored encrypted (AES-256-GCM). The first sync backfills `backfill_days` of history.

## Master key

User API keys are encrypted with a master key. Leave `master_key` empty to have one generated in
`/data/master.key`, or set your own (`openssl rand -base64 32`). Either way it ends up in HA
backups: keep backup encryption enabled (the default since HA 2025.1).

Renew your Garmin key before it expires; Garmin emails a reminder about a week ahead. The
dashboard flags a rejected key in **Account**.

---

PeakForm is an independent project, not affiliated with or endorsed by Garmin. Garmin and
Garmin Connect are trademarks of Garmin Ltd. or its subsidiaries.
