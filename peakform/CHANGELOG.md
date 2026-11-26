# Changelog

## 0.17.0 – Reviews by Claude or GPT

### Added

- **Activity reviews by GPT.** Under **Account → Activity reviews**, choose Anthropic (Claude) or
  OpenAI (GPT) and paste your own API key for it. OpenAI offers GPT Astra, Sol (the default) and
  Luna. As with Anthropic, the key is checked with OpenAI and stored encrypted, and reviews are
  billed to its credit. A ChatGPT Plus or Pro subscription does not include API credit.

### Changed

- **One key per provider.** You can store keys for both; reviews use the provider you chose.
  Saving a key switches reviews to that provider. Existing Anthropic keys and settings stay as
  they are.
- **Every tile has its ? explanation now.** On the Day page that adds min and max HR, sleep HR,
  respiration, SpO2, sleep stress, weekly HRV, Body Battery low and drained, steps, distance,
  floors, calories, the stress and sleep stage times, training load and fatigue. On an activity
  it adds time, distance, average HR, average power and elevation.

## 0.16.0 – Move from Home Assistant to Docker

### Added

- **Moving from Home Assistant to a Docker host** is now possible without losing anything: take
  the database from an HA backup, start the Docker container with it and give your account a
  password with `reset-password`. The README has the steps.
- **`reset-password --rename <name>`** gives an account a new username, e.g. to drop the `ha.`
  prefix of accounts from Home Assistant. Without a username the command lists all accounts.

### Changed

- **`reset-password`** also sets a password for accounts that came from Home Assistant, which had
  none. In the Home Assistant app itself it refuses, as everyone signs in through Home Assistant.

## 0.15.0 – Forgotten password

### Added

- **Forgot your password?** on the sign-in page (standalone Docker): PeakForm mails a link to set
  a new one. It works once, for an hour, and signs you out on every other device. Needs outgoing
  mail on the server (`SMTP_*` and `PUBLIC_URL` in `.env`, see the README).
- **Account → E-mail**: where that link goes. Optional, also asked when creating an account;
  changing it takes your current password.
- **`reset-password` command** for whoever runs the server, for accounts without an e-mail or a
  server without mail: `docker compose exec -it peakform node dist/server/reset-password.js <username>`.

In Home Assistant nothing changes: you sign in through Home Assistant, PeakForm has no password.

## 0.14.0 – Tiles that tell good from bad

### Added

- **Status on every tile** (Day and Overview): a colored edge and a word – **Good**, **Normal**,
  **High**, **Low**, **Goal reached**, **Below goal** – show at a glance whether a value is fine.
  Green is good, teal normal, yellow worth a look, red clearly off. Hover the word for the range
  and where it comes from. The range is also drawn as a shaded band in the tile's picture, and
  today's point takes the status color.
  - Fixed references where they exist: Garmin's HRV balanced range, your sleep need, the step and
    intensity goals, sleep score (80+), Body Battery high (75+), sleep stress (rest zone), SpO2
    (95 %+), BMI (18.5–25), body fat and water by sex, weight between ideal and normal weight,
    ACWR (0.8–1.3) and form (−30 to +25).
  - Your own usual range otherwise (last 60 days, average ± one standard deviation), e.g. resting
    heart rate, stress or breathing rate. It appears once there are 14 days of data.
  - Totals that still grow during the day (distance, floors, calories) get no status.

### Changed

- **Tiles on Day and Overview** no longer all carry the same sparkline. The small picture now fits
  the kind of metric, so tiles side by side are easy to tell apart:
  - **Ring** next to the value for 0–100 scores: sleep score, Body Battery, stress and the weekly
    intensity minutes against your goal, in the status color.
  - **Bars** for daily totals: steps, distance, floors, calories, load, hours of sleep and stress.
  - **Dots** for weigh-ins, so days without a measurement don't look like a trend.
  - **Range bar** for last night's HRV against your balanced range and for ACWR against 0.8–1.3.
  - **Bars above and below zero** for form (TSB).
  - **Line** for levels that drift, heart rate lines in the orange of the heart rate charts.
- **Compact day view** now shows these pictures too, smaller, and the status instead of the change
  against the last week.

## 0.13.1 – Correct splits in Compare

### Fixed

- **Compare → Splits** showed wrong kilometre times, often a minute or more off the watch's laps.
  Each split was effectively the pace at the very end of the kilometre instead of the time for the
  whole kilometre. Now they match the watch's auto laps.
- **Moving time** in Compare (splits, chart time axis, totals) was too short on runs with patchy
  GPS: a second where the distance stalled counted as standing still. It now follows the watch's
  speed. Stops at traffic lights still don't count, so a split can be shorter than the watch's lap
  when auto-pause is off.

## 0.13.0 – Compact day view and reference weights

### Added

- **Compact day view**: switch between **Detailed** (as before) and **Compact** at the top of the Day
  page. Compact shows only tiles, smaller and grouped, so the whole day fits on one screen. Tap a tile
  for its chart; the heart rate over the day and the night (sleep stages and heart rate) have tiles
  of their own. The choice is saved with your account.
- **Normal and ideal weight** as dashed lines in the weight charts (Health page and the weight tile's
  chart) and as a marker bar in Day → Body. Broca formula: normal weight = height in cm − 100, ideal
  weight 10 % (men) or 15 % (women) below it.
- **Account → About you → Height**, needed for the reference weights. Garmin's Personal API does not
  share the height from your Garmin profile. Activity reviews also get the height.

## 0.12.1 – Consistent backups

### Fixed

- **Home Assistant backups** now stop PeakForm for the few seconds the backup takes. Before, a
  backup during a sync could copy a half-written database. PeakForm starts again on its own.

## 0.12.0 – Health page and swiping between days

### Added

- **Health page** for weight and body composition from your Garmin scale: weight, **BMI**,
  **body fat** and **body water** (%), **muscle mass** and **bone mass** (kg) over the chosen
  range. Weight moves here from Recovery.
- **Day → Body** card with the same values from the day's weigh-in, or the latest one before it.
  Weigh-ins without a body composition reading (by hand, with socks) show only the weight.
- **Swipe between days** on phones: swipe left on the Day page for the next day, right for the
  previous one. Charts keep their own touch handling. On desktop the **← and → keys** do the same.

## 0.11.0 – Your own rating, map layers and adaptive heart rate limits

### Added

- **Your rating** on every activity: how it felt on five smileys, what was planned (recovery, easy,
  long, tempo, intervals, race) and quick notes such as heavy legs, sore muscles, pain, slept badly,
  heat, wind or running with others, plus an optional note. Saved right away; the smiley also
  shows in the activity list.
- **Route map layers**: colour the route by **pace**, **% heart rate reserve**, **cadence (SPM)**
  or **grade**, one at a time, from green (low) over yellow to red (high), with a legend below the
  map. Tap the active layer again to turn it
  off; the choice is remembered in this browser.
- **Account → Heart rate limits**: each sport's limit can now be set as **% of heart rate reserve**
  (Karvonen: resting HR + share × (max HR − resting HR)) instead of a fixed bpm value. The form
  shows today's limit in bpm next to the percentage.
- **Existing limits are converted once** from bpm to % of heart rate reserve at today's resting
  and max heart rate, so they stay where they were and follow your resting heart rate from now
  on. Sports without a limit suggest the percentage you use most.
- The resting heart rate for this is the **day** value, averaged over the 30 days up to the
  activity's day, so a single bad night does not raise the limit, and older activities keep the
  limit that applied then. Until day values exist, Garmin's resting heart rate is used. Max heart
  rate is taken from your Garmin heart rate zones, otherwise your highest recorded.

### Changed

- **Reviews by Claude run only when you press Review now**, no longer automatically after import,
  so you can add your rating first. Claude judges the session against what was planned, takes
  conditions and how it felt into account and remarks when the feeling and the data disagree.

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
