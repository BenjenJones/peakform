# PeakForm for Garmin

Personal health, recovery and training analytics on top of the
[Garmin Connect Personal API](https://developer.garmin.com/gc-developer-program/personal/personal-faq/).
Runs as a Home Assistant ingress app or as a standalone Docker container.

## How it works

```
Garmin Personal API ──(pull, hourly)──▶ sync ──▶ SQLite (/data) ──▶ analytics ──▶ Hono API ──▶ React SPA
```

- **Multi-user**: every user stores their own Garmin key and sees only their own data (all tables
  carry `user_id`). Sync runs for all users in a queue, one at a time.
- **Garmin auth**: each API key is exchanged for a 24h JWT bearer token (no refresh tokens), held in
  memory only and re-exchanged an hour before expiry (`server/garmin/client.ts`).
- **Raw-first storage**: Garmin hasn't published response schemas, so every range payload is stored
  verbatim (`raw_range`). `server/normalize.ts` finds per-day objects and flattens every numeric
  field into `daily_metric(date, metric, value)`, e.g. `hrv.lastNightAvg`. Curated dashboard metrics
  (`rhr`, `hrv_night`, `sleep_score`, …) resolve to the first candidate path with data. The **Data**
  tab shows the mapping and raw payloads, so when a field name is wrong, fix the candidates list.
- **Activities**: summaries via the search endpoint, plus the original FIT file, decoded by a small
  built-in parser (`server/garmin/fit.ts`) into per-second streams (HR, power, speed, altitude, GPS).
- **Analytics** (`server/analytics.ts`): CTL/ATL/TSB from Garmin training load (falls back to
  Banister TRIMP), acute:chronic ratio, mean-max curves, aerobic decoupling, lagged correlation
  matrix, and a 0–100 readiness score from z-scores against a 60-day personal baseline.
- **Activity reviews** (`server/review.ts`): sport activities (everything but walks) are reviewed
  on request from the activity page, one at a time, through the Claude API (`@anthropic-ai/sdk`)
  or the OpenAI Responses API (`openai`), both with structured JSON output against the same
  schema. Every user brings their own API key, from the Claude Console or the OpenAI platform, and
  picks the provider; subscription logins (Claude Pro/Max, ChatGPT Plus/Pro) are deliberately not
  supported, as the providers do not allow apps to use them on behalf of their users. The prompt
  carries the activity, laps and decoupling, recovery around it, training load, recent sessions,
  sex/age from the profile, the user's own extra instructions and their rating of the activity
  (`server/feedback.ts`: feeling 1–5, planned session type, quick notes). Out-of-credit
  (Anthropic `billing_error` or spend limit, OpenAI `insufficient_quota`) and key failures are
  shown as a notice in the app.

## Develop

```sh
cp .env.example .env   # set MASTER_KEY (openssl rand -base64 32)
npm install
npm run dev            # app on :8099 (Vite, proxies /api to :8098, see dev.env); create an account, paste key under Account
npm run sync -- alice  # one-off sync for one user from the terminal
```

Requires Node ≥ 24 (uses built-in `node:sqlite`).

## Releasing

1. Add a section to [CHANGELOG.md](CHANGELOG.md) and run `npm run changelog`. This copies it to
   `peakform/CHANGELOG.md`, which Home Assistant shows in the app store and update dialog. CI
   fails if the two differ.
2. Bump `version` in `peakform/config.yaml` (HA only offers an update when it changes) and
   `package.json`.
3. Push to `main`; the workflow publishes `ghcr.io/<owner>/peakform:<version>`.

## Home Assistant

1. Push this repo to GitHub, replace `OWNER` in `repository.yaml` and
   `peakform/config.yaml`; the workflow publishes `ghcr.io/<owner>/peakform`
   (make the package public).
2. HA → Settings → Apps → App store → ⋮ → Repositories → add the repo URL.
3. Install **PeakForm for Garmin**, start it, open **PeakForm** in the sidebar. Each HA user is signed in
   automatically and adds their own Garmin key under **Account**.

The SPA uses relative asset/API URLs and hash routing, so it works under HA's dynamic
`/api/hassio_ingress/<token>/` prefix. In HA mode the server only accepts requests from the
Supervisor ingress proxy (172.30.32.2).

## Standalone Docker

```sh
openssl rand -base64 32 > master_key.txt
docker compose up -d --build   # http://localhost:8099
```

Put it behind a TLS reverse proxy before exposing it, and set `TRUST_PROXY=true` so session
cookies get the `Secure` flag. Set `ALLOW_REGISTRATION=false` once everyone has an account.

### Forgotten passwords

With outgoing mail set up in `.env`, the sign-in page offers **Forgot your password?** and sends a
reset link to the e-mail address saved under **Account → E-mail** (optional, also asked when
creating an account):

```sh
PUBLIC_URL=https://peakform.example.org   # links are built from this, never from the Host header
SMTP_HOST=smtp.example.org
SMTP_PORT=587                              # 465 with SMTP_SECURE=true
SMTP_USER=peakform@example.org
SMTP_PASS=…
SMTP_FROM="PeakForm <peakform@example.org>"
# SMTP_REQUIRE_TLS=false                   # only for a relay on the same host or network
```

Without mail, or for an account without an e-mail address, set a new password on the server:

```sh
docker compose exec -it peakform node dist/server/reset-password.js <username>
npm run reset-password -- <username>       # from a checkout
```

Both sign the account out everywhere; the Garmin key and all data stay.

### Moving from Home Assistant to Docker

Everything PeakForm stores is one SQLite file, so it moves as a whole: accounts, Garmin data,
activities, reviews and settings.

1. In HA, **Settings → System → Backups**: create a backup with only the PeakForm app and
   download it. Inside the `.tar` is `…_peakform.tar.gz`; its `data/` folder holds
   `garmin.sqlite` and, if the app option `master_key` was empty, `master.key`. (HA encrypts
   backups by default; open it with the key from your backup emergency kit.) The app is stopped
   for the backup (`backup: cold`), so the file is consistent.
2. On the Docker host, put `garmin.sqlite` into `./data/` and the master key into
   `master_key.txt`: the app option `master_key` if you had set one, otherwise the content of
   `master.key`. With a different key the data stays, but the stored Garmin, Anthropic and OpenAI keys
   cannot be decrypted and have to be entered again.
3. `docker compose up -d`, then give each account a password. Accounts from Home Assistant are
   called `ha.<name>` and had none; `--rename` drops the prefix:

   ```sh
   docker compose exec -it peakform node dist/server/reset-password.js ha.ben --rename ben
   ```

   Without a username the command lists all accounts. Add an e-mail under **Account** afterwards
   if you want **Forgot your password?** to work.

## Security model

| What | How |
|---|---|
| Login (standalone) | Username + password, Argon2id (19 MiB, t=2, p=1, PHC format) via built-in `node:crypto`. 10 failed attempts per IP per 15 min, then 429. Unknown users cost the same time as wrong passwords. |
| Login (Home Assistant) | HA authenticates; the ingress proxy passes `X-Remote-User-*` headers. Only trusted because the server rejects every source except the Supervisor proxy (172.30.32.2). |
| Sessions | 32 random bytes in an `HttpOnly`, `SameSite=Lax` cookie (`Secure` over https); only the SHA-256 is stored. 30 days. Password change revokes all sessions. |
| Password reset | Optional, needs SMTP and `PUBLIC_URL`. 32 random bytes in the link's fragment (never sent to a server or in a `Referer`), only the SHA-256 is stored; valid 60 min, single use, every link and session of the account ends with the reset. The form answers the same for unknown accounts, accounts without e-mail and repeat requests, and sends in the background so timing does not tell either. At most one mail per account per 5 min and 5 requests per IP per 15 min. Changing the e-mail takes the current password. |
| CSRF | SameSite cookies + `Origin` check on state-changing requests. |
| Garmin API keys | Verified with Garmin, then AES-256-GCM encrypted with a master key kept outside the DB (`MASTER_KEY` / `MASTER_KEY_FILE` / HA option). Random 96-bit IV per write; user id bound as AAD, so ciphertext copied to another row will not decrypt. Never returned by the API. |
| Anthropic and OpenAI API keys | Verified with the provider (free model list call), then encrypted like the Garmin keys with their own AAD context per provider. Never returned by the API; each user's reviews use only their own key. OpenAI requests are sent with `store: false`. |
| Key rotation | New key in `MASTER_KEY`, old in `MASTER_KEY_PREVIOUS`; re-encrypted on startup. |
| Account deletion | Removes the user, key and all synced data (`ON DELETE CASCADE`). |

The master key protects against a leaked database or backup that does not include the key. It
does not protect against someone with full access to the running server; that tradeoff keeps
background sync working without users being signed in.

## Known unknowns (API launched Oct 2026)

- Rate limits undocumented: requests are sequential, 300 ms apart, with backoff on 429/5xx.
- Max range per request undocumented: range endpoints are fetched in 28-day chunks.
- History depth for personal keys unconfirmed.
- FIT files via the API may have undocumented fields (VO2max, training effect) stripped.

## Trademarks

PeakForm is an independent project. It is not affiliated with, endorsed by or sponsored by
Garmin Ltd. or its subsidiaries. Garmin and Garmin Connect are trademarks of Garmin Ltd. or its
subsidiaries, used here only to describe compatibility.

## License

[MIT](LICENSE)

Third-party licenses of everything shipped in the image are collected at build time
(`scripts/notices.mjs`) into `THIRD_PARTY_NOTICES.txt`, served next to the web app.
