import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useRef } from "react";
import type { Streams } from "./api";

// OpenStreetMap's standard tiles: fine for personal, low-volume use with attribution.
// Note: the tile server learns which area is being viewed.
const TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';

export type LatLon = [number, number];

/** Index of the last sample at or before second `t` (streams are time-sorted). */
function indexAt(ts: number[], t: number) {
  let lo = 0;
  let hi = ts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (ts[mid] <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** Positions with a fix; samples without GPS are dropped. */
export function latLons(lat: (number | null)[], lon: (number | null)[]): LatLon[] {
  return lat.map((a, i) => (a !== null && lon[i] !== null ? ([a, lon[i]] as LatLon) : null)).filter((p): p is LatLon => p !== null);
}

/** Last position at or before index `i`, walking back over samples without a fix. */
export function positionAt(lat: (number | null)[], lon: (number | null)[], i: number): LatLon | null {
  while (i > 0 && (lat[i] === null || lon[i] === null)) i--;
  const a = lat[i];
  const o = lon[i];
  return a === null || o === null ? null : [a, o];
}

export interface Track {
  points: LatLon[];
  /** CSS classes for the line and the hover marker, so theme tokens (and dark mode) apply. */
  lineClass: string;
  hoverClass: string;
}

/**
 * One or more routes on an OSM map. `hover` holds a marker position per track (null hides it),
 * moved in sync with the charts. Start and finish are marked for the first track.
 */
export function TrackMap({ tracks, hover }: { tracks: Track[]; hover: (LatLon | null)[] }) {
  const el = useRef<HTMLDivElement>(null);
  const markers = useRef<L.CircleMarker[]>([]);
  const drawn = tracks.filter((t) => t.points.length >= 2);

  useEffect(() => {
    if (!el.current || !drawn.length) return;
    const map = L.map(el.current, { scrollWheelZoom: false, zoomControl: true });
    // OSM's tile policy blocks browser requests without a Referer. The server sends
    // Referrer-Policy: no-referrer for everything else, so opt in per tile (origin only, no path).
    L.tileLayer(TILES, { maxZoom: 19, attribution: ATTRIBUTION, referrerPolicy: "strict-origin-when-cross-origin" }).addTo(map);
    const bounds = L.latLngBounds([]);
    // Drawn last-first so the first track stays on top where routes overlap.
    for (const t of [...drawn].reverse()) bounds.extend(L.polyline(t.points, { className: t.lineClass, weight: 3 }).addTo(map).getBounds());
    const first = drawn[0].points;
    L.circleMarker(first[0], { className: "route-start", radius: 5, weight: 2 }).addTo(map);
    L.circleMarker(first[first.length - 1], { className: "route-end", radius: 5, weight: 2 }).addTo(map);
    markers.current = tracks.map((t) =>
      L.circleMarker(t.points[0] ?? first[0], { className: t.hoverClass, radius: 7, weight: 3, opacity: 0, fillOpacity: 0 }).addTo(map),
    );
    map.fitBounds(bounds, { padding: [16, 16] });
    // The card may still be laying out when Leaflet measures it.
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(el.current);
    return () => {
      ro.disconnect();
      markers.current = [];
      map.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracks]);

  useEffect(() => {
    markers.current.forEach((m, i) => {
      const p = hover[i];
      if (!p) return m.setStyle({ opacity: 0, fillOpacity: 0 });
      m.setLatLng(p);
      m.setStyle({ opacity: 1, fillOpacity: 1 });
    });
  }, [hover]);

  if (!drawn.length) return null;
  return <div ref={el} className="route-map" />;
}

/** Route of one activity; `hoverT` (seconds) moves a marker in sync with the stream charts. */
export function RouteMap({ streams, hoverT }: { streams: Streams; hoverT: number | null }) {
  const tracks = useMemo(() => [{ points: latLons(streams.lat, streams.lon), lineClass: "route-line", hoverClass: "route-hover" }], [streams]);
  const hover = useMemo(
    () => [hoverT === null ? null : positionAt(streams.lat, streams.lon, indexAt(streams.t, hoverT))],
    [hoverT, streams],
  );
  return <TrackMap tracks={tracks} hover={hover} />;
}
