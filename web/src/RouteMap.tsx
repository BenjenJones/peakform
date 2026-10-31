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
export function indexAt(ts: number[], t: number) {
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

/**
 * Last position at or before index `i`, walking back over samples without a fix. Before the
 * first fix (the watch often needs a few seconds to find GPS) it is the first fix, i.e. the start.
 */
export function positionAt(lat: (number | null)[], lon: (number | null)[], i: number): LatLon | null {
  const has = (j: number) => lat[j] != null && lon[j] != null;
  let j = Math.min(i, lat.length - 1);
  while (j >= 0 && !has(j)) j--;
  if (j < 0) for (j = i + 1; j < lat.length && !has(j); j++);
  return j >= 0 && j < lat.length && has(j) ? [lat[j]!, lon[j]!] : null;
}

export interface Track {
  points: LatLon[];
  /** CSS classes for the line and the hover marker, so theme tokens (and dark mode) apply. */
  lineClass: string;
  hoverClass: string;
}

/**
 * One or more routes on an OSM map. `hover` holds a marker position per track (null hides it),
 * moved in sync with the charts. Start and finish are marked for the first track. `labels` puts
 * a tooltip on a marker, e.g. the current values during a replay (one string per line).
 */
export function TrackMap({ tracks, hover, labels }: { tracks: Track[]; hover: (LatLon | null)[]; labels?: (string[] | null)[] }) {
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
      const label = p ? labels?.[i] : null;
      if (!label?.length) m.unbindTooltip();
      else {
        // Text nodes, not an HTML string: no escaping to get wrong.
        const box = document.createElement("div");
        for (const line of label) box.appendChild(document.createElement("div")).textContent = line;
        if (m.getTooltip()) m.setTooltipContent(box);
        else m.bindTooltip(box, { permanent: true, direction: "top", offset: [0, -8], className: "replay-tip" }).openTooltip();
      }
      if (!p) return m.setStyle({ opacity: 0, fillOpacity: 0 });
      m.setLatLng(p);
      m.setStyle({ opacity: 1, fillOpacity: 1 });
    });
  }, [hover, labels]);

  if (!drawn.length) return null;
  return <div ref={el} className="route-map" />;
}

/** Position at second `t`, interpolated between samples so a replay glides instead of jumping. */
function positionAtTime(s: Streams, t: number): LatLon | null {
  const i = indexAt(s.t, t);
  const a = positionAt(s.lat, s.lon, i);
  const t0 = s.t[i];
  const t1 = s.t[i + 1];
  if (!a || t1 === undefined || t1 <= t0 || t <= t0) return a;
  const b = positionAt(s.lat, s.lon, i + 1);
  const f = Math.min(1, (t - t0) / (t1 - t0));
  return b ? [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f] : a;
}

/** Route of one activity; `hoverT` (seconds) moves a marker in sync with the stream charts. */
export function RouteMap({ streams, hoverT, label }: { streams: Streams; hoverT: number | null; label?: string[] | null }) {
  const tracks = useMemo(() => [{ points: latLons(streams.lat, streams.lon), lineClass: "route-line", hoverClass: "route-hover" }], [streams]);
  const hover = useMemo(() => [hoverT === null ? null : positionAtTime(streams, hoverT)], [hoverT, streams]);
  const labels = useMemo(() => [label ?? null], [label]);
  return <TrackMap tracks={tracks} hover={hover} labels={labels} />;
}
