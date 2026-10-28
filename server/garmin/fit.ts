import { Decoder, Stream } from "@garmin/fitsdk";
import { unzipSync } from "fflate";

const SEMICIRCLE_TO_DEG = 180 / 2 ** 31;

/** Columnar streams, index-aligned. `t` is seconds since activity start. */
export interface Streams {
  t: number[];
  hr: (number | null)[];
  power: (number | null)[];
  speed: (number | null)[]; // m/s
  cadence: (number | null)[];
  alt: (number | null)[]; // m
  dist: (number | null)[]; // m
  lat: (number | null)[];
  lon: (number | null)[];
}

export interface ParsedFit {
  streams: Streams;
  laps: Record<string, unknown>[];
  session: Record<string, unknown> | null;
}

function extractFit(bytes: Uint8Array): Uint8Array {
  // Downloads are ZIP archives (PK header) wrapping a single .fit file.
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    const files = unzipSync(bytes);
    const name = Object.keys(files).find((n) => n.toLowerCase().endsWith(".fit"));
    if (!name) throw new Error(`ZIP has no .fit file: ${Object.keys(files).join(", ")}`);
    return files[name];
  }
  return bytes;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function parseFit(download: Uint8Array): ParsedFit {
  const decoder = new Decoder(Stream.fromByteArray(extractFit(download)));
  if (!decoder.isFIT()) throw new Error("Not a FIT file");
  const { messages, errors } = decoder.read({ convertDateTimesToDates: true });
  if (errors.length && !messages.recordMesgs?.length) throw new Error(String(errors[0]));

  const records: Record<string, unknown>[] = messages.recordMesgs ?? [];
  const t0 = records.length ? (records[0].timestamp as Date).getTime() : 0;
  const s: Streams = { t: [], hr: [], power: [], speed: [], cadence: [], alt: [], dist: [], lat: [], lon: [] };

  for (const r of records) {
    s.t.push(Math.round(((r.timestamp as Date).getTime() - t0) / 1000));
    s.hr.push(num(r.heartRate));
    s.power.push(num(r.power));
    s.speed.push(num(r.enhancedSpeed) ?? num(r.speed));
    s.cadence.push(num(r.cadence));
    s.alt.push(num(r.enhancedAltitude) ?? num(r.altitude));
    s.dist.push(num(r.distance));
    const lat = num(r.positionLat);
    const lon = num(r.positionLong);
    s.lat.push(lat === null ? null : +(lat * SEMICIRCLE_TO_DEG).toFixed(6));
    s.lon.push(lon === null ? null : +(lon * SEMICIRCLE_TO_DEG).toFixed(6));
  }

  return { streams: s, laps: messages.lapMesgs ?? [], session: messages.sessionMesgs?.[0] ?? null };
}
