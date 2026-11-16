import { reviewProfile } from "./review.js";

export interface BodyRef {
  sex: "male" | "female" | null;
  /** From Account → About you; the Personal API does not share the Garmin profile's height. */
  heightCm: number | null;
  /** Broca normal weight: height in cm − 100. */
  normal: number | null;
  /** Broca ideal weight: normal weight − 10 % for men, − 15 % for women. */
  ideal: number | null;
}

/** Reference weights for the weight charts. */
export function bodyRef(uid: number): BodyRef {
  const { sex, heightCm } = reviewProfile(uid);
  const normal = heightCm !== null ? heightCm - 100 : null;
  return {
    sex,
    heightCm,
    normal,
    ideal: normal !== null && sex ? Math.round(normal * (sex === "male" ? 0.9 : 0.85) * 10) / 10 : null,
  };
}
