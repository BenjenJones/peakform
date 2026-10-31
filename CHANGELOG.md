# Changelog

## 0.7.1

### Added

- App icon: in the browser tab, next to the name in the header, on the sign-in page and for the
  add-on in Home Assistant.

## 0.7.0

### Added

- Icons for metrics and sports, so the right tile or chart is quicker to find: in front of the
  tiles, chart and card titles on all pages, every single value on the **Day** tab (steps,
  floors, calories, SpO2, …), the metric mapping on the **Data** tab, and the sport in the
  activity list and header. The same metric has the same icon everywhere. Icons are from Tabler
  Icons (MIT).

## 0.6.0

### Added

- Activity: replay on the route map, with play/pause, a time slider and 10× to 120× speed, as in
  comparisons. Runs by elapsed time like the charts, so the dot stands still during pauses; dots
  on the charts follow along. A label at the dot shows time, distance, heart rate, pace, power,
  cadence and altitude at that moment.

### Fixed

- Route map: the dot that follows the charts now matches the time under the pointer. In the first
  minutes of activities with an aerobic decoupling card it jumped ahead to the 5-minute mark or
  later.
- Route map: at the beginning of an activity the dot sits at the start of the route, also when
  the watch needed a few seconds to find GPS. Before, it was hidden there.

## 0.5.0

### Added

- Heart rate limit per sport under **Account**: shown as a dashed line in the heart rate charts
  of activities and comparisons, plus a tile with the time spent above it.
- Runs: cadence in steps per minute as a tile and a chart, also in comparisons of two runs.
- Comparison: replay both activities on the map by moving time, with play/pause, a time slider
  and 10× to 120× speed. Shows how far each has got and the gap between them; dots on the
  charts follow both positions.
- Aerobic decoupling card: output per heartbeat over the activity, the mean of each half, and
  pace (or power) and heart rate per half.

### Changed

- Settings are stored with your account instead of the browser: start page, date range and
  language now apply on every device. Settings made in a browser before are taken over on the
  next sign-in.
- Comparison: activities are no longer stretched to the same length. Each is shown over the
  distance it actually measured; the lead curve ends where the shorter one ends.
- Aerobic decoupling: runs always use pace, also when the watch records running power. Halves
  are split by moving time and records weighted by duration, so smart recording no longer skews
  it. Shown from 20 minutes of moving time instead of 600 records.

### Fixed

- Help popovers and tooltips no longer disappear behind the route map.

## 0.4.0

### Added

- Compare two activities, e.g. two runs over the same route: **Compare with** on an
  activity's page suggests activities of the same sport with a similar distance, start and
  finish first.
  - Lead curve: how many seconds A is ahead of or behind B at each point of the route.
  - Pace, heart rate, power and elevation of both on one distance axis.
  - Kilometre splits side by side with the difference per kilometre.
  - Both routes on one map, with markers following the charts.
  - Based on moving time, so stops at traffic lights do not count. If GPS measured one route a
    little longer, it is stretched to fit so the same spot lines up.

## 0.3.0

### Added

- **Day** tab: the sleep card shows when you slept (bedtime, wake-up, time in bed) and your
  overnight heart rate on a clock axis. Garmin's Personal API only shares stage totals, not when
  each stage happened; restless phases and waking show up as heart rate peaks instead.
- Choose the start page under **Account** → Display. Stored per browser.

### Fixed

- The sync button now reacts right away: spinner, "Syncing…" and a pulsing status dot while the
  sync runs, and an error message if it fails to start.

## 0.2.0

### Added

- **Day** tab: one calendar day at a glance, with day-by-day navigation and a date picker.
  - Readiness score with a short verdict.
  - Summary of what stands out: HRV against your balanced range, sleep against Garmin's sleep
    need, resting HR and stress against your 60-day average, form, load spikes, step and
    intensity goals.
  - Sleep stages, sleep need, sleep HR, respiration, SpO2 and sleep stress.
  - HRV in your balanced range, resting HR, Body Battery high, low, charged and drained, weight.
  - Steps and weekly intensity minutes against their goals, distance, floors, calories.
  - Time per stress level.
  - Training load over the last 14 days and the day's activities.
  - Every value shows its change against the 7 days before and a 14-day trend line.
- New metrics on the **Data** tab: calories, intensity minutes, floors, max HR, sleep HR,
  respiration, SpO2, sleep stress, sleep need, Body Battery charged/drained and time per stress
  level.

### Fixed

- Help popovers no longer run off the screen on phones.

## 0.1.0

First release.

- Hourly sync from the Garmin Connect Personal API, per Home Assistant user.
- Overview, Recovery, Training, Activities, Insights and Data tabs, in English and German.
- Activity details from the original FIT files, decoded by a built-in parser.
- Garmin API keys stored encrypted (AES-256-GCM) with a master key outside the database.
