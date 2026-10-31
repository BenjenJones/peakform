import { useEffect, useRef, useState } from "react";
import { fmtDuration } from "./api";
import { useI18n } from "./i18n";

/** Replay speeds: seconds of activity per real second. */
const SPEEDS = [10, 30, 60, 120];

/** Replay clock from 0 to `endT` seconds; `t` is null until it is first started or moved. */
export function useReplay(endT: number) {
  const [t, setT] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(30);
  const ref = useRef(0);
  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    let raf = requestAnimationFrame(function tick(now) {
      ref.current = Math.min(endT, ref.current + ((now - last) / 1000) * speed);
      last = now;
      setT(ref.current);
      if (ref.current >= endT) setPlaying(false);
      else raf = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, endT]);
  const seek = (v: number) => {
    ref.current = v;
    setT(v);
  };
  const toggle = () => {
    if (!playing && ref.current >= endT) seek(0);
    setPlaying(!playing);
  };
  return { t, playing, speed, setSpeed, seek, toggle, endT };
}

/** Play/pause, time slider and speed select for a `useReplay` clock. */
export function ReplayControls({ r }: { r: ReturnType<typeof useReplay> }) {
  const { t } = useI18n();
  return (
    <div className="replay">
      <button type="button" className="btn" onClick={r.toggle} aria-label={t(r.playing ? "compare.pause" : "compare.play")} title={t(r.playing ? "compare.pause" : "compare.play")}>
        {r.playing ? "❚❚" : "▶"}
      </button>
      <input type="range" min={0} max={r.endT} step={1} value={r.t ?? 0} onChange={(e) => r.seek(Number(e.target.value))} aria-label={t("compare.replayTime")} />
      <span className="num">{fmtDuration(r.t ?? 0)}</span>
      <select value={r.speed} onChange={(e) => r.setSpeed(Number(e.target.value))} aria-label={t("compare.replaySpeed")}>
        {SPEEDS.map((s) => (
          <option key={s} value={s}>
            {s}×
          </option>
        ))}
      </select>
    </div>
  );
}
