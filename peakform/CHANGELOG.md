# Changelog

## 0.10.0 – Activity reviews by Claude

### Added

- **Activity reviews by Claude**: every sport activity (running, cycling, hiking, rowing, strength
  and more, not walks) is reviewed by Claude right after its import, billed to your own Anthropic
  API key (a few cents per review). The review gives a score from 1 to 10, a short summary, what went well, what to
  improve, recovery advice and a suggestion for the next session. It takes the session's data,
  laps and heart rate drift, your sleep, HRV and resting heart rate around it, your training load
  and earlier sessions of the same sport into account.
- Only activities imported from the day of this update on are reviewed automatically. Older ones
  get a **Review now** button on their page; any review can be run again.
- **Account → Activity reviews by Claude**: paste an API key from the Claude Console, enter sex
  and birth date (Garmin does not share them), pick the model (Opus, Sonnet or Haiku) and add
  information that goes into every review, such as goals, upcoming races or injuries.
- **Activities**: new column with the score.
- When a review could not run because the key's credit is used up (or the key stopped working), a
  notice appears at the top of the app. Such reviews are retried automatically later.

## 0.9.2 – Day and night resting heart rate

### Changed

- **Resting heart rate** is now split into a **night** and a **day** value on **Day**,
  **Overview** and **Recovery**, and in the heart rate chart with its history. Each is the lowest
  30-minute average: the night value while asleep, the day value while awake, leaving out naps and
  the 30 minutes around sleep. Past days fill in during the next syncs. Readiness and training
  load keep using Garmin's own resting heart rate.

## 0.9.1 – Partial route matches

### Added

- **Compare with**: when no activity runs exactly the same route, a new group **Partly the same
  route** suggests activities that share more than just start and finish, sorted by how much of
  the route they have in common (shown as "x % shared").

## 0.9.0 – Key metrics on top

### Added

- **Day**: the most important values sit as single widgets right at the top: sleep, sleep score,
  HRV, resting heart rate, Body Battery, stress, steps and training load. Each shows the change
  against the last 7 days and a small trend, and opens its history when tapped. Body Battery
  shows the current level with the time of the reading, past days the level at the end of the
  day.

## 0.8.1

### Changed

- **Compare with** suggests only activities that also pass the same points along the way, not
  just with the same start, finish and distance. A different loop from the same front door no
  longer shows up as the same route.

## 0.8.0

### Added

- **Day**: new **Heart rate** card with the heart rate over the whole day in 2-minute values,
  the resting heart rate as a dashed line and the day's activities shaded. Tiles for resting,
  lowest and highest heart rate of the day.
- Tap any value tile on **Day** and **Overview** (also the sleep and stress phases and the step
  and intensity bars) to open its history as a big chart: 7 days to 2 years, 7-day average,
  pinch/scroll zoom with a slider, average, min and max. Tapping a point opens that day. The
  chart opens on 7 days. Resting, lowest and highest heart rate share one chart: the daily span
  from lowest to highest as a band, resting heart rate inside it, the tapped one emphasized.
- Every chart on **Day**, **Overview**, **Recovery**, **Training**, activities and comparisons has
  an enlarge button in its top right corner.
- The big chart opens as a dialog; a click next to it, Escape or the close button closes it. On
  phones it fills the screen, also in landscape; on Android a button switches to fullscreen
  landscape, and the phone's back button closes it.

### Changed

- **Day**: resting heart rate moved from the recovery card and the day's max heart rate from the
  movement card to the new heart rate card.

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
