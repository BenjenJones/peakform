import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useRef } from "react";
import type { Streams } from "./api";

// OpenStreetMap's standard tiles: fine for personal, low-volume use with attribution.
// Note: the tile server learns which area is being viewed.
const TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';

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

/** Route on an OSM map; `hoverT` (seconds) moves a marker in sync with the stream charts. */
export function RouteMap({ streams, hoverT }: { streams: Streams; hoverT: number | null }) {
  const el = useRef<HTMLDivElement>(null);
  const marker = useRef<L.CircleMarker | null>(null);

  const points = useMemo(
    () =>
      streams.lat
        .map((lat, i) => (lat !== null && streams.lon[i] !== null ? ([lat, streams.lon[i]] as [number, number]) : null))
        .filter((p): p is [number, number] => p !== null),
    [streams],
  );

  useEffect(() => {
    if (!el.current || points.length < 2) return;
    const map = L.map(el.current, { scrollWheelZoom: false, zoomControl: true });
    // OSM's tile policy blocks browser requests without a Referer. The server sends
    // Referrer-Policy: no-referrer for everything else, so opt in per tile (origin only, no path).
    L.tileLayer(TILES, { maxZoom: 19, attribution: ATTRIBUTION, referrerPolicy: "strict-origin-when-cross-origin" }).addTo(map);
    // Colors come from CSS classes so the theme tokens (and dark mode) apply.
    const line = L.polyline(points, { className: "route-line", weight: 3 }).addTo(map);
    L.circleMarker(points[0], { className: "route-start", radius: 5, weight: 2 }).addTo(map);
    L.circleMarker(points[points.length - 1], { className: "route-end", radius: 5, weight: 2 }).addTo(map);
    marker.current = L.circleMarker(points[0], { className: "route-hover", radius: 7, weight: 3, opacity: 0, fillOpacity: 0 }).addTo(map);
    map.fitBounds(line.getBounds(), { padding: [16, 16] });
    // The card may still be laying out when Leaflet measures it.
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(el.current);
    return () => {
      ro.disconnect();
      marker.current = null;
      map.remove();
    };
  }, [points]);

  useEffect(() => {
    const m = marker.current;
    if (!m) return;
    if (hoverT === null) {
      m.setStyle({ opacity: 0, fillOpacity: 0 });
      return;
    }
    // Walk back from the time index to the nearest sample that has a position.
    let i = indexAt(streams.t, hoverT);
    while (i > 0 && (streams.lat[i] === null || streams.lon[i] === null)) i--;
    const lat = streams.lat[i];
    const lon = streams.lon[i];
    if (lat === null || lon === null) return;
    m.setLatLng([lat, lon]);
    m.setStyle({ opacity: 1, fillOpacity: 1 });
  }, [hoverT, streams]);

  if (points.length < 2) return null;
  return <div ref={el} className="route-map" />;
}
