import { brotliCompressSync, brotliDecompressSync, constants } from "node:zlib";
import type { Streams } from "./garmin/fit.js";

// Compact storage for the bulky columns. Measured on real data (199 activities):
// per-second streams as JSON 19.9 MB -> 1.4 MB with this codec; raw API payloads ~13x with plain Brotli.

const BROTLI = { params: { [constants.BROTLI_PARAM_QUALITY]: 9 } };

// ---------- JSON blobs (raw payloads, activity detail) ----------

export function packJson(value: unknown): Buffer {
  return brotliCompressSync(JSON.stringify(value), BROTLI);
}

export function unpackJson<T = unknown>(stored: Uint8Array): T {
  return JSON.parse(brotliDecompressSync(stored).toString("utf8"));
}

// ---------- Activity streams: quantize -> delta -> zigzag varint -> Brotli ----------

const MAGIC = 0x47; // "G"
const VERSION = 1;

/** Fixed column order and integer scale. Precision: speed 1 mm/s, alt 10 cm, dist 1 cm, lat/lon ~11 cm. */
const COLUMNS: { key: keyof Streams; scale: number }[] = [
  { key: "t", scale: 1 },
  { key: "hr", scale: 1 },
  { key: "power", scale: 1 },
  { key: "speed", scale: 1000 },
  { key: "cadence", scale: 1 },
  { key: "alt", scale: 10 },
  { key: "dist", scale: 100 },
  { key: "lat", scale: 1e6 },
  { key: "lon", scale: 1e6 },
];

class Writer {
  private buf = Buffer.alloc(1 << 16);
  private len = 0;
  byte(b: number) {
    if (this.len === this.buf.length) {
      const next = Buffer.alloc(this.buf.length * 2);
      this.buf.copy(next);
      this.buf = next;
    }
    this.buf[this.len++] = b;
  }
  varint(n: number) {
    while (n >= 0x80) {
      this.byte((n % 0x80) | 0x80);
      n = Math.floor(n / 0x80);
    }
    this.byte(n);
  }
  done() {
    return this.buf.subarray(0, this.len);
  }
}

class Reader {
  private pos = 0;
  constructor(private buf: Buffer) {}
  byte() {
    return this.buf[this.pos++];
  }
  varint() {
    let n = 0;
    let mul = 1;
    for (;;) {
      const b = this.buf[this.pos++];
      n += (b & 0x7f) * mul;
      if (b < 0x80) return n;
      mul *= 0x80;
    }
  }
}

// Zigzag via arithmetic (not bit ops) so deltas beyond 32 bits stay exact.
const zig = (d: number) => (d >= 0 ? d * 2 : -d * 2 - 1);
const unzig = (z: number) => (z % 2 === 0 ? z / 2 : -(z + 1) / 2);

export function encodeStreams(s: Streams): Buffer {
  const w = new Writer();
  w.byte(MAGIC);
  w.byte(VERSION);
  const n = s.t.length;
  w.varint(n);
  for (const { key, scale } of COLUMNS) {
    const col = s[key] as (number | null)[];
    let prev = 0;
    for (let i = 0; i < n; i++) {
      const v = col[i];
      // 0 encodes null; real values are shifted by one.
      if (v === null || v === undefined || !Number.isFinite(v)) {
        w.varint(0);
        continue;
      }
      const q = Math.round(v * scale);
      w.varint(zig(q - prev) + 1);
      prev = q;
    }
  }
  return brotliCompressSync(w.done(), BROTLI);
}

export function decodeStreams(stored: Uint8Array): Streams {
  const r = new Reader(brotliDecompressSync(stored));
  if (r.byte() !== MAGIC) throw new Error("Not an encoded stream");
  const version = r.byte();
  if (version !== VERSION) throw new Error(`Unsupported stream codec version ${version}`);
  const n = r.varint();
  const out = {} as Streams;
  for (const { key, scale } of COLUMNS) {
    const col = new Array<number | null>(n);
    let prev = 0;
    for (let i = 0; i < n; i++) {
      const z = r.varint();
      if (z === 0) {
        col[i] = null;
        continue;
      }
      prev += unzig(z - 1);
      col[i] = scale === 1 ? prev : prev / scale;
    }
    (out as unknown as Record<string, (number | null)[]>)[key] = col;
  }
  return out;
}
