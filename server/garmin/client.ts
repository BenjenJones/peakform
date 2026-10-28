import { config } from "../config.js";

// Mirrors github.com/garmin/connect-personal-api-python: the API key is
// exchanged for a JWT bearer token (24h, no refresh token). Tokens are kept
// in memory only, per user, and re-exchanged within an hour of expiry.
const TOKEN_PATH = "/personalapitoken-service/personal-api/personal-api-key/token";
const REFRESH_WINDOW_S = 60 * 60;
const MIN_REQUEST_GAP_MS = 300;

export class GarminApiError extends Error {
  constructor(public status: number, public path: string, body: string) {
    super(`Garmin API ${status} on ${path}: ${body.slice(0, 300)}`);
  }
}

interface CachedToken {
  token: string;
  expiresAt: number;
}

const tokenCache = new Map<number, CachedToken>();
export const forgetToken = (userId: number) => tokenCache.delete(userId);

function jwtExpiration(token: string): number {
  const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
  if (typeof payload.exp !== "number") throw new Error("Bearer token has no exp claim");
  return payload.exp;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Exchange an API key for a bearer token. Also used to validate a key before storing it. */
export async function exchangeApiKey(apiKey: string, baseUrl = config.baseUrl): Promise<CachedToken> {
  const res = await fetch(baseUrl + TOKEN_PATH, {
    method: "POST",
    headers: { Accept: "*/*", Authorization: `ApiKey ${apiKey}` },
  });
  const body = await res.text();
  if (!res.ok) throw new GarminApiError(res.status, TOKEN_PATH, body);
  const token = body.trim();
  return { token, expiresAt: jwtExpiration(token) };
}

export class GarminClient {
  private lastRequestAt = 0;

  constructor(private userId: number, private apiKey: string, private baseUrl = config.baseUrl) {}

  private async token(force = false): Promise<string> {
    const cached = tokenCache.get(this.userId);
    if (!force && cached && cached.expiresAt - Date.now() / 1000 > REFRESH_WINDOW_S) return cached.token;
    const fresh = await exchangeApiKey(this.apiKey, this.baseUrl);
    tokenCache.set(this.userId, fresh);
    return fresh.token;
  }

  private async request(path: string, params: Record<string, string | number> = {}, accept = "application/json") {
    const url = new URL(this.baseUrl + path);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

    for (let attempt = 0; ; attempt++) {
      // Rate limits are undocumented; keep requests sequential and spaced out.
      const wait = this.lastRequestAt + MIN_REQUEST_GAP_MS - Date.now();
      if (wait > 0) await sleep(wait);
      this.lastRequestAt = Date.now();

      const res = await fetch(url, {
        headers: { Accept: accept, Authorization: `Bearer ${await this.token(attempt > 0)}` },
      });
      if (res.ok) return res;
      if (res.status === 401 && attempt === 0) continue;
      if ((res.status === 429 || res.status >= 500) && attempt < 4) {
        const retryAfter = Number(res.headers.get("retry-after"));
        await sleep(retryAfter > 0 ? retryAfter * 1000 : 2 ** attempt * 5000);
        continue;
      }
      throw new GarminApiError(res.status, path, await res.text());
    }
  }

  async get<T = unknown>(path: string, params?: Record<string, string | number>): Promise<T> {
    const res = await this.request(path, params);
    const text = await res.text();
    return (text ? JSON.parse(text) : null) as T;
  }

  /** Original activity file; Garmin returns a ZIP containing the .fit */
  async download(path: string): Promise<Uint8Array> {
    const res = await this.request(path, {}, "*/*");
    return new Uint8Array(await res.arrayBuffer());
  }
}
