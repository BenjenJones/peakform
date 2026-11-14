import {
  IconActivity,
  IconActivityHeartbeat,
  IconArmchair,
  IconArrowsSplit,
  IconBarbell,
  IconBattery1,
  IconBattery2,
  IconBatteryCharging,
  IconBatteryExclamation,
  IconBed,
  IconBike,
  IconBone,
  IconBolt,
  IconBrain,
  IconCalendarWeek,
  IconChartBar,
  IconChartDots,
  IconChartLine,
  IconClockBolt,
  IconClockHour4,
  IconDroplet,
  IconDropletHalf,
  IconDropletHalf2,
  IconEye,
  IconFlame,
  IconGauge,
  IconHeart,
  IconHeartDown,
  IconHeartExclamation,
  IconHeartRateMonitor,
  IconHeartUp,
  IconKayak,
  IconLadder,
  IconLungs,
  IconMap2,
  IconMoodCry,
  IconMoodEmpty,
  IconMoodHappy,
  IconMoodSad,
  IconMoodSmile,
  IconMoon,
  IconMountain,
  IconPlusMinus,
  IconRepeat,
  IconRoute,
  IconRun,
  IconRulerMeasure,
  IconScale,
  IconShoe,
  IconSparkles,
  IconStairsUp,
  IconStopwatch,
  IconStretching,
  IconSwimming,
  IconTable,
  IconTarget,
  IconTrekking,
  IconTrendingUp,
  IconWalk,
  IconYoga,
  IconZzz,
  type Icon,
} from "@tabler/icons-react";

// Tabler Icons (MIT). One icon per metric, the same wherever the metric appears.
const METRIC = {
  feedback: IconMoodSmile,
  hr: IconHeartRateMonitor,
  rhr: IconHeart,
  hrv: IconActivityHeartbeat,
  hrLimit: IconHeartExclamation,
  decoupling: IconArrowsSplit,
  power: IconBolt,
  np: IconGauge,
  pace: IconStopwatch,
  cadence: IconShoe,
  curve: IconChartDots,
  distance: IconRoute,
  time: IconClockHour4,
  elev: IconMountain,
  route: IconMap2,
  laps: IconRepeat,
  splits: IconTable,
  aerobicTe: IconTarget,
  load: IconBarbell,
  fitness: IconTrendingUp,
  fatigue: IconBattery2,
  form: IconPlusMinus,
  acwr: IconChartLine,
  weekly: IconCalendarWeek,
  intensity: IconClockBolt,
  sleep: IconMoon,
  sleepScore: IconZzz,
  stages: IconChartBar,
  stress: IconBrain,
  bodyBattery: IconBatteryCharging,
  readiness: IconSparkles,
  weight: IconScale,
  bmi: IconRulerMeasure,
  bodyFat: IconDropletHalf,
  bodyWater: IconDropletHalf2,
  muscle: IconStretching,
  bone: IconBone,
  steps: IconWalk,
  floors: IconStairsUp,
  calories: IconFlame,
  hrMax: IconHeartUp,
  hrMin: IconHeartDown,
  resp: IconLungs,
  spo2: IconDroplet,
  sleepNeed: IconBed,
  awake: IconEye,
  rest: IconArmchair,
  bbLow: IconBattery1,
  bbDrained: IconBatteryExclamation,
} satisfies Record<string, Icon>;

export type MetricKey = keyof typeof METRIC;

/** Daily metric column (as in metric.<key>) to its icon. */
const FIELD: Record<string, MetricKey> = {
  rhr: "rhr",
  rhr_night: "rhr",
  rhr_day: "rhr",
  hr_max: "hrMax",
  hr_min: "hrMin",
  sleep_hr: "hr",
  hrv_night: "hrv",
  hrv_weekly: "hrv",
  hrv_base_low: "hrv",
  hrv_base_high: "hrv",
  sleep_hours: "sleep",
  sleep_need_hours: "sleepNeed",
  sleep_score: "sleepScore",
  deep_sleep_hours: "stages",
  light_sleep_hours: "stages",
  rem_sleep_hours: "stages",
  awake_hours: "awake",
  sleep_resp: "resp",
  spo2_avg: "spo2",
  sleep_stress: "stress",
  stress_avg: "stress",
  stress_rest_hours: "rest",
  stress_low_hours: "stress",
  stress_medium_hours: "stress",
  stress_high_hours: "stress",
  body_battery: "bodyBattery",
  bb_high: "bodyBattery",
  bb_charged: "bodyBattery",
  bb_low: "bbLow",
  bb_drained: "bbDrained",
  steps: "steps",
  steps_goal: "steps",
  distance_km: "distance",
  floors: "floors",
  calories_total: "calories",
  calories_active: "calories",
  intensity_moderate: "intensity",
  intensity_vigorous: "intensity",
  intensity_goal: "intensity",
  weight: "weight",
  bmi: "bmi",
  body_fat: "bodyFat",
  body_water: "bodyWater",
  muscle_mass: "muscle",
  bone_mass: "bone",
  "load.load": "load",
  "load.ctl": "fitness",
  "load.atl": "fatigue",
  "load.tsb": "form",
  "load.acwr": "acwr",
};

export const fieldIcon = (key: string): MetricKey | undefined => FIELD[key];

/** Small icon in front of a metric's label or card title; decorative, the text names the metric. */
export function MetricIcon({ m, size = 16 }: { m: MetricKey; size?: number }) {
  const C = METRIC[m];
  return <C className="mi" size={size} stroke={1.75} aria-hidden="true" />;
}

/** Garmin activity type (running, indoor_rowing, …) to an icon; generic pulse line for the rest. */
function sportIcon(type: string): Icon {
  if (/run/.test(type)) return IconRun;
  if (/hik/.test(type)) return IconTrekking;
  if (/walk/.test(type)) return IconWalk;
  if (/cycl|bik/.test(type)) return IconBike;
  if (/row|kayak|paddl/.test(type)) return IconKayak;
  if (/swim/.test(type)) return IconSwimming;
  if (/strength/.test(type)) return IconBarbell;
  if (/yoga|pilates/.test(type)) return IconYoga;
  if (/climb|bouldering/.test(type)) return IconLadder;
  return IconActivity;
}

export function SportIcon({ type, size = 16 }: { type: string | null | undefined; size?: number }) {
  const C = sportIcon(type ?? "");
  return <C className="mi" size={size} stroke={1.75} aria-hidden="true" />;
}

const MOODS = [IconMoodCry, IconMoodSad, IconMoodEmpty, IconMoodSmile, IconMoodHappy];

/** Smiley for a feeling of 1 (awful) … 5 (great); decorative, the label names it. */
export function MoodIcon({ feeling, size = 16 }: { feeling: number; size?: number }) {
  const C = MOODS[Math.min(Math.max(feeling, 1), 5) - 1];
  return <C className="mi" size={size} stroke={1.75} aria-hidden="true" />;
}
