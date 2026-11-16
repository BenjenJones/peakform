import type { BodyRef } from "./api";
import { fmtNum, type T } from "./i18n";
import type { RefLine } from "./Zoom";

/** Normal and ideal weight as reference lines; empty while the height is unknown. */
export function weightRefs(ref: BodyRef | null, t: T): RefLine[] {
  if (!ref) return [];
  return [
    ...(ref.normal !== null ? [{ label: t("weight.normal"), value: ref.normal, tone: "normal" as const }] : []),
    ...(ref.ideal !== null ? [{ label: t("weight.ideal"), value: ref.ideal, tone: "ideal" as const }] : []),
  ];
}

/** One line under a weight chart: both values and the height they come from. */
export function weightRefText(ref: BodyRef | null, t: T): string | null {
  if (!ref) return null;
  if (ref.normal === null || ref.heightCm === null) return t("day.weightRefNoHeight");
  const vars = { normal: fmtNum(ref.normal, 1), ideal: ref.ideal !== null ? fmtNum(ref.ideal, 1) : "", h: ref.heightCm };
  return t(ref.ideal !== null ? "day.weightRef" : "day.weightRefNoIdeal", vars);
}
