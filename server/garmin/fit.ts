import { unzipSync } from "fflate";

// Minimal FIT decoder (protocol: https://developer.garmin.com/fit/protocol/). Reads only the
// record, lap and session fields PeakForm uses. Replaces Garmin's FIT SDK, whose license does
// not allow redistributing it in the published container image.

const SEMICIRCLE_TO_DEG = 180 / 2 ** 31;
const FIT_EPOCH_MS = Date.UTC(1989, 11, 31);

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

type Mesg = Record<string, unknown>;

// Field number -> [name, scale, offset], as in the FIT profile. Values are value / scale - offset.
type FieldSpec = [name: string, scale?: number, offset?: number];

const TIMESTAMP = 253;
const SESSION = 18;
const LAP = 19;
const RECORD = 20;

const TOTALS: Record<number, FieldSpec> = {
  2: ["startTime"],
  7: ["totalElapsedTime", 1000],
  8: ["totalTimerTime", 1000],
  9: ["totalDistance", 100],
  11: ["totalCalories"],
};

const PROFILE: Record<number, Record<number, FieldSpec>> = {
  [RECORD]: {
    [TIMESTAMP]: ["timestamp"],
    0: ["positionLat"],
    1: ["positionLong"],
    2: ["altitude", 5, 500],
    3: ["heartRate"],
    4: ["cadence"],
    5: ["distance", 100],
    6: ["speed", 1000],
    7: ["power"],
    73: ["enhancedSpeed", 1000],
    78: ["enhancedAltitude", 5, 500],
  },
  [LAP]: {
    [TIMESTAMP]: ["timestamp"],
    ...TOTALS,
    13: ["avgSpeed", 1000],
    14: ["maxSpeed", 1000],
    15: ["avgHeartRate"],
    16: ["maxHeartRate"],
    17: ["avgCadence"],
    18: ["maxCadence"],
    19: ["avgPower"],
    20: ["maxPower"],
    21: ["totalAscent"],
    22: ["totalDescent"],
    110: ["enhancedAvgSpeed", 1000],
    111: ["enhancedMaxSpeed", 1000],
  },
  [SESSION]: {
    [TIMESTAMP]: ["timestamp"],
    ...TOTALS,
    5: ["sport"],
    6: ["subSport"],
    14: ["avgSpeed", 1000],
    15: ["maxSpeed", 1000],
    16: ["avgHeartRate"],
    17: ["maxHeartRate"],
    18: ["avgCadence"],
    19: ["maxCadence"],
    20: ["avgPower"],
    21: ["maxPower"],
    22: ["totalAscent"],
    23: ["totalDescent"],
    34: ["normalizedPower"],
    124: ["enhancedAvgSpeed", 1000],
    125: ["enhancedMaxSpeed", 1000],
  },
};

const DATE_FIELDS = new Set(["timestamp", "startTime"]);

// Like the SDK, fill the 32-bit "enhanced" fields from their 16-bit counterparts.
const ENHANCED: [from: string, to: string][] = [
  ["speed", "enhancedSpeed"],
  ["altitude", "enhancedAltitude"],
  ["avgSpeed", "enhancedAvgSpeed"],
  ["maxSpeed", "enhancedMaxSpeed"],
];

/** Reads one value of a FIT base type; null for the type's "invalid" marker or unsupported types. */
function readValue(dv: DataView, pos: number, size: number, baseType: number, le: boolean): number | null {
  const fits = (n: number) => size >= n;
  switch (baseType & 0x1f) {
    case 0x00: // enum
    case 0x02: // uint8
    case 0x0d: // byte
      return fits(1) && dv.getUint8(pos) !== 0xff ? dv.getUint8(pos) : null;
    case 0x01: // sint8
      return fits(1) && dv.getInt8(pos) !== 0x7f ? dv.getInt8(pos) : null;
    case 0x0a: // uint8z
      return fits(1) && dv.getUint8(pos) !== 0 ? dv.getUint8(pos) : null;
    case 0x03: // sint16
      return fits(2) && dv.getInt16(pos, le) !== 0x7fff ? dv.getInt16(pos, le) : null;
    case 0x04: // uint16
      return fits(2) && dv.getUint16(pos, le) !== 0xffff ? dv.getUint16(pos, le) : null;
    case 0x0b: // uint16z
      return fits(2) && dv.getUint16(pos, le) !== 0 ? dv.getUint16(pos, le) : null;
    case 0x05: // sint32
      return fits(4) && dv.getInt32(pos, le) !== 0x7fffffff ? dv.getInt32(pos, le) : null;
    case 0x06: // uint32
      return fits(4) && dv.getUint32(pos, le) !== 0xffffffff ? dv.getUint32(pos, le) : null;
    case 0x0c: // uint32z
      return fits(4) && dv.getUint32(pos, le) !== 0 ? dv.getUint32(pos, le) : null;
    case 0x08: // float32
      return fits(4) && Number.isFinite(dv.getFloat32(pos, le)) ? dv.getFloat32(pos, le) : null;
    case 0x09: // float64
      return fits(8) && Number.isFinite(dv.getFloat64(pos, le)) ? dv.getFloat64(pos, le) : null;
    default: // strings, 64-bit integers: not needed
      return null;
  }
}

interface Definition {
  global: number;
  le: boolean;
  fields: [num: number, size: number, baseType: number][];
  devSize: number;
}

/** Decodes the record, lap and session messages of a (possibly chained) FIT file. */
function decode(fit: Uint8Array): { records: Mesg[]; laps: Mesg[]; sessions: Mesg[] } {
  const out = { records: [] as Mesg[], laps: [] as Mesg[], sessions: [] as Mesg[] };
  const target: Record<number, Mesg[]> = { [RECORD]: out.records, [LAP]: out.laps, [SESSION]: out.sessions };
  const dv = new DataView(fit.buffer, fit.byteOffset, fit.byteLength);

  try {
    let start = 0;
    while (start + 12 <= fit.length) {
      const headerSize = fit[start];
      if (String.fromCharCode(...fit.subarray(start + 8, start + 12)) !== ".FIT") {
        throw new Error("Not a FIT file");
      }
      const end = Math.min(start + headerSize + dv.getUint32(start + 4, true), fit.length);
      const defs = new Map<number, Definition>();
      let lastTimestamp = 0;
      let pos = start + headerSize;

      while (pos < end) {
        const header = fit[pos++];
        let local: number;
        let compressedTimestamp: number | null = null;

        if (header & 0x80) {
          // Compressed timestamp header: 5-bit offset from the last full timestamp.
          local = (header >> 5) & 0x03;
          const offset = header & 0x1f;
          const base = lastTimestamp - (lastTimestamp & 0x1f);
          lastTimestamp = base + offset + (offset < (lastTimestamp & 0x1f) ? 0x20 : 0);
          compressedTimestamp = lastTimestamp;
        } else {
          local = header & 0x0f;
          if (header & 0x40) {
            const le = fit[pos + 1] === 0;
            const def: Definition = { global: dv.getUint16(pos + 2, le), le, fields: [], devSize: 0 };
            const count = fit[pos + 4];
            pos += 5;
            for (let i = 0; i < count; i++, pos += 3) def.fields.push([fit[pos], fit[pos + 1], fit[pos + 2]]);
            if (header & 0x20) {
              const devCount = fit[pos++];
              for (let i = 0; i < devCount; i++, pos += 3) def.devSize += fit[pos + 1];
            }
            defs.set(local, def);
            continue;
          }
        }

        const def = defs.get(local);
        if (!def) throw new Error(`FIT: data message for undefined local type ${local}`);
        const spec = PROFILE[def.global];
        const mesg: Mesg = {};

        for (const [num, size, baseType] of def.fields) {
          if (pos + size > end) throw new Error("FIT: truncated message");
          if (num === TIMESTAMP || spec?.[num]) {
            const raw = readValue(dv, pos, size, baseType, def.le);
            if (num === TIMESTAMP && raw !== null) lastTimestamp = raw;
            const field = spec?.[num];
            if (field && raw !== null) {
              const [name, scale = 1, offset = 0] = field;
              mesg[name] = DATE_FIELDS.has(name) ? new Date(FIT_EPOCH_MS + raw * 1000) : raw / scale - offset;
            }
          }
          pos += size;
        }
        pos += def.devSize;

        if (spec) {
          if (compressedTimestamp !== null) mesg.timestamp = new Date(FIT_EPOCH_MS + compressedTimestamp * 1000);
          for (const [from, to] of ENHANCED) if (mesg[to] === undefined && mesg[from] !== undefined) mesg[to] = mesg[from];
          target[def.global].push(mesg);
        }
      }
      start = end + 2; // skip file CRC
    }
  } catch (e) {
    // Keep what was read from a damaged file, as long as there is something to show.
    if (!out.records.length) throw e;
  }
  return out;
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
  const { records: allRecords, laps, sessions } = decode(extractFit(download));
  const records = allRecords.filter((r) => r.timestamp instanceof Date);
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

  return { streams: s, laps, session: sessions[0] ?? null };
}
