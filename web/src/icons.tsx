import {
  IconActivity,
  IconActivityHeartbeat,
  IconArrowsSplit,
  IconBarbell,
  IconBattery2,
  IconBatteryCharging,
  IconBike,
  IconBolt,
  IconBrain,
  IconCalendarWeek,
  IconChartBar,
  IconChartDots,
  IconChartLine,
  IconClockBolt,
  IconClockHour4,
  IconFlame,
  IconGauge,
  IconHeart,
  IconHeartExclamation,
  IconHeartRateMonitor,
  IconKayak,
  IconLadder,
  IconMap2,
  IconMoon,
  IconMountain,
  IconPlusMinus,
  IconRepeat,
  IconRoute,
  IconRun,
  IconScale,
  IconShoe,
  IconSparkles,
  IconStopwatch,
  IconSwimming,
  IconTable,
  IconTrekking,
  IconTrendingUp,
  IconWalk,
  IconYoga,
  IconZzz,
  type Icon,
} from "@tabler/icons-react";

// Tabler Icons (MIT). One icon per metric, the same wherever the metric appears.
const METRIC = {
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
  aerobicTe: IconFlame,
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
  steps: IconWalk,
} satisfies Record<string, Icon>;

export type MetricKey = keyof typeof METRIC;

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
