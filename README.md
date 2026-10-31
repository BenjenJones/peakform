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

## Security model

| What | How |
|---|---|
| Login (standalone) | Username + password, Argon2id (19 MiB, t=2, p=1, PHC format) via built-in `node:crypto`. 10 failed attempts per IP per 15 min, then 429. Unknown users cost the same time as wrong passwords. |
| Login (Home Assistant) | HA authenticates; the ingress proxy passes `X-Remote-User-*` headers. Only trusted because the server rejects every source except the Supervisor proxy (172.30.32.2). |
| Sessions | 32 random bytes in an `HttpOnly`, `SameSite=Lax` cookie (`Secure` over https); only the SHA-256 is stored. 30 days. Password change revokes all sessions. |
| CSRF | SameSite cookies + `Origin` check on state-changing requests. |
| Garmin API keys | Verified with Garmin, then AES-256-GCM encrypted with a master key kept outside the DB (`MASTER_KEY` / `MASTER_KEY_FILE` / HA option). Random 96-bit IV per write; user id bound as AAD, so ciphertext copied to another row will not decrypt. Never returned by the API. |
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
