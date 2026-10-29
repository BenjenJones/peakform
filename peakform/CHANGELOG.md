# Changelog

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
