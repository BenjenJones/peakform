import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react";

export type Lang = "en" | "de";

const en = {
  // App shell
  "tab.overview": "Overview",
  "tab.recovery": "Recovery",
  "tab.training": "Training",
  "tab.activities": "Activities",
  "tab.insights": "Insights",
  "tab.data": "Data",
  "tab.account": "Account",
  "range.label": "Date range",
  "range.days": "Last {n} days",
  "lang.label": "Language",
  "sync.running": "Syncing: {step}",
  "sync.done": "Synced {time} ({status})",
  "sync.never": "Not synced",
  "sync.now": "Sync now",
  "sync.status.ok": "ok",
  "sync.status.partial": "partial",
  "sync.status.error": "error",
  "sync.status.running": "running",
  "banner.noKey": "No Garmin API key stored yet.",
  "banner.addKey": "Add your Personal API key",
  "banner.toStart": "to start syncing.",
  "help.label": "Explanation",
  "common.noData": "no data",
  "common.loading": "Loading…",
  "common.vs7d": "vs 7-day avg",
  "common.today": "today",
  "common.nextDay": "next day",

  // Metric names
  "metric.rhr": "Resting HR",
  "metric.hrv_night": "HRV",
  "metric.hrv_weekly": "HRV (7-day avg)",
  "metric.hrv_base_low": "HRV baseline low",
  "metric.hrv_base_high": "HRV baseline high",
  "metric.sleep_score": "Sleep score",
  "metric.sleep_hours": "Sleep",
  "metric.deep_sleep_hours": "Deep sleep",
  "metric.rem_sleep_hours": "REM sleep",
  "metric.light_sleep_hours": "Light sleep",
  "metric.awake_hours": "Awake (night)",
  "metric.stress_avg": "Avg stress",
  "metric.bb_high": "Body Battery high",
  "metric.bb_low": "Body Battery low",
  "metric.steps": "Steps",
  "metric.weight": "Weight",
  "metric.load.load": "Training load",
  "metric.load.tsb": "Form (TSB)",
  "metric.load.atl": "Fatigue (ATL)",
  "metric.load.ctl": "Fitness (CTL)",
  "metric.body_battery": "Body Battery",

  // Overview
  "overview.readiness": "Readiness",
  "overview.readinessSub": "Today vs your 60-day baseline (own model, not Garmin's)",
  "overview.readinessEmpty": "Needs ~14 days of HRV / resting HR / sleep data",
  "overview.fitnessFatigue": "Fitness & fatigue",
  "overview.fitnessFatigueSub": "42-day (CTL) and 7-day (ATL) training load averages",
  "overview.form": "Form (TSB)",
  "overview.formSub": "Fitness minus fatigue. Below −20: heavy block. Above +5: fresh.",
  "overview.recent": "Last 14 days",
  "overview.recentCount": "{n} activities",
  "part.hrv_night": "HRV",
  "part.rhr": "Resting HR",
  "part.sleep_score": "Sleep",
  "part.load.tsb": "Form",

  // Recovery
  "recovery.hrv": "Overnight HRV",
  "recovery.hrvSub": "Shaded: Garmin's personal balanced range",
  "recovery.rhr": "Resting heart rate",
  "recovery.bb": "Body Battery",
  "recovery.bbSub": "Daily high and low",
  "recovery.high": "High",
  "recovery.low": "Low",
  "recovery.stages": "Sleep stages",
  "recovery.stagesSub": "Hours per night",
  "recovery.deep": "Deep",
  "recovery.rem": "REM",
  "recovery.light": "Light",
  "recovery.awake": "Awake",
  "recovery.score": "Sleep score",
  "recovery.stress": "Stress",
  "recovery.stressSub": "Daily average",
  "recovery.weight": "Weight",

  // Training
  "training.load": "Daily load & fitness",
  "training.loadSub": "Garmin training load when present, otherwise heart-rate based TRIMP",
  "training.dailyLoad": "Daily load",
  "training.acwr": "Acute : chronic ratio",
  "training.acwrSub": "Shaded 0.8–1.3: commonly cited balanced zone",
  "training.weekly": "Weekly volume",
  "training.weeklySub": "Hours per week by sport",
  "training.other": "Other",
  "training.curve": "Mean-max curve",
  "training.curveSub": "Best average sustained for each duration, from FIT streams",
  "training.power": "Power",
  "training.speed": "Pace / speed",
  "training.hr": "Heart rate",
  "training.allSports": "All sports",
  "training.lastDays": "Last {n} days",
  "training.best2y": "Best, 2 years",
  "training.noStreams": "No data streams in range",

  // Activities
  "activities.title": "Activities",
  "activities.inRange": "{n} in range",
  "activities.date": "Date",
  "activities.name": "Name",
  "activities.sport": "Sport",
  "activities.time": "Time",
  "activities.distance": "Distance",
  "activities.avgHr": "Avg HR",
  "activities.avgPower": "Avg power",
  "activities.avgW": "Avg W",
  "activities.elev": "Elevation",
  "activities.load": "Load",
  "activities.back": "← Activities",
  "activities.np": "NP",
  "activities.decoupling": "Aerobic decoupling",
  "activities.steady": "Steady (< 5%)",
  "activities.drifted": "Drifted (≥ 5%)",
  "activities.aerobicTe": "Aerobic TE",
  "activities.fitStatus": "FIT file {status}{error}. Streams appear after the next sync.",
  "activities.route": "Route",
  "activities.hrChart": "Heart rate (bpm)",
  "activities.powerChart": "Power (W)",
  "activities.paceChart": "Pace",
  "activities.elevChart": "Elevation (m)",
  "activities.alt": "Elevation",
  "activities.noStreams": "No streams",
  "activities.curve": "Mean-max",
  "activities.curveSub": "Best average sustained in this activity",
  "activities.laps": "Laps",
  "activities.pace": "Pace",

  // Insights
  "insights.title": "What moves what",
  "insights.sub": "Pearson correlation over {days} days. Correlation, not causation. Click a cell for the scatter plot.",
  "insights.lagNext": "Today → next day",
  "insights.lagSame": "Same day",
  "insights.top": "Strongest relationships",
  "insights.topSub": "↑ = higher than usual. n ≥ {n} days, excluding same-source pairs",
  "insights.finding": "{x} ↑ → {y} {dir}",
  "insights.higher": "↑",
  "insights.lower": "↓",
  "insights.notEnough": "Not enough overlapping data yet",
  "insights.waiting": "Waiting for data",
  "insights.scatterSub": "r = {r} · n = {n} days · line: least-squares fit",
  "insights.vs": "vs",
  "insights.days": "One dot per day",
  "insights.trend": "Trend (linear regression)",

  // Data
  "data.sync": "Sync",
  "data.days": "Days with metrics",
  "data.metrics": "Distinct raw metrics",
  "data.activities": "Activities",
  "data.fitPending": "FIT files pending",
  "data.fitFailed": "FIT files failed",
  "data.runs": "Recent runs",
  "data.mapping": "Curated metric mapping",
  "data.mappingSub": "Which raw field each dashboard metric uses.",
  "data.unresolved": "unresolved",
  "data.raw": "All raw metrics",
  "data.filter": "Filter…",
  "data.metric": "Metric",
  "data.daysCol": "Days",
  "data.range": "Range",
  "data.payload": "Raw payload",
  "data.noData": "No data for {ep}",
  "data.latest": "Latest chunk: {from} → {to}",

  // Login
  "login.signIn": "Sign in",
  "login.create": "Create account",
  "login.username": "Username",
  "login.password": "Password",
  "login.repeat": "Repeat password",
  "login.mismatch": "Passwords do not match",
  "login.toRegister": "No account yet? Create one",
  "login.toLogin": "Already have an account? Sign in",
  "login.haTitle": "Not signed in",
  "login.haText": "Home Assistant did not pass a user identity. Open the dashboard from the Home Assistant sidebar.",

  // Account
  "account.keyTitle": "Garmin Personal API key",
  "account.keySub":
    "Create one in Garmin Connect under Settings → Personal API Key (shown only once). It is checked with Garmin, then stored encrypted with AES-256-GCM. It is never shown again, not even to you.",
  "account.keyStored": "Stored since {date}",
  "account.keyNone": "No key stored",
  "account.keyRejected": "Garmin rejected the key during the last sync: it may have expired or been revoked. Paste a new one.",
  "account.keyPlaceholderNew": "Paste your API key",
  "account.keyPlaceholderReplace": "Paste a new key to replace it",
  "account.keySaved": "Key verified with Garmin and stored encrypted. First sync started.",
  "account.keyChecking": "Checking with Garmin…",
  "account.keySave": "Save key",
  "account.keyReplace": "Replace key",
  "account.keyRemove": "Remove key",
  "account.keyRemoveConfirm": "Remove the stored Garmin API key? Synced data stays until you delete your account.",
  "account.pwTitle": "Password",
  "account.pwSub": "Changing it signs you out everywhere.",
  "account.pwCurrent": "Current password",
  "account.pwNew": "New password (min. 10 characters)",
  "account.pwChange": "Change password",
  "account.title": "Account",
  "account.signedInAs": "Signed in as",
  "account.viaHa": "via Home Assistant",
  "account.signOut": "Sign out",
  "account.delete": "Delete account and data",
  "account.deleteConfirm": 'This permanently deletes your account, API key and all synced data. Type "{name}" to confirm.',

  // Server error codes
  "err.username_invalid": "Username: 3–32 characters, letters, digits, . _ -",
  "err.username_reserved": 'Usernames starting with "ha." are reserved',
  "err.username_taken": "Username is taken",
  "err.password_too_short": "Password must be at least 10 characters",
  "err.registration_disabled": "Registration is disabled",
  "err.too_many_attempts": "Too many attempts, try again later",
  "err.wrong_credentials": "Wrong username or password",
  "err.wrong_current_password": "Current password is wrong",
  "err.key_format": "That does not look like an API key",
  "err.key_rejected": "Garmin rejected this key",
  "err.key_verify_failed": "Could not reach Garmin to verify the key. Try again later.",

  // Help texts (? tooltips)
  "help.readiness":
    "Own model, not Garmin's Training Readiness. Compares today's HRV, resting HR, sleep score and form (TSB) with your personal average of the last 60 days. 50 = normal for you, above 60 = better recovered than usual, below 40 = worse. The σ values show how far each factor is from your normal (resting HR counts inverted: lower is better).",
  "help.hrv":
    "Heart rate variability: average variation between heartbeats during the night (ms, RMSSD). Above your normal range usually means good recovery; clearly below can mean stress, illness, alcohol or training fatigue. Only compare with yourself, not with others.",
  "help.rhr":
    "Lowest stable heart rate of the day. A rise of 5+ bpm above your normal can indicate fatigue, an infection or poor sleep. Drops over months as endurance improves.",
  "help.sleep": "Total sleep last night, excluding awake time.",
  "help.sleep_score":
    "Garmin's sleep rating 0–100 from duration, sleep stages, restlessness and stress during sleep. 80+ good, 60–79 fair, below 60 poor.",
  "help.bb":
    "Body Battery 0–100: Garmin's estimate of your energy reserve from HRV, stress and activity. Charges during sleep and rest, drains with exercise and stress. Shown: the daily high, usually right after waking up.",
  "help.stress":
    "Average stress level 0–100 derived from HRV during the day (activities excluded). 0–25 rest, 26–50 low, 51–75 medium, 76–100 high.",
  "help.fitness_fatigue":
    "Fitness (CTL): 42-day weighted average of your training load. Rises slowly and shows the fitness you have built. Fatigue (ATL): 7-day average, reacts quickly to hard days. Fitness only grows if you load more than you recover, over weeks.",
  "help.tsb":
    "Form (TSB) = yesterday's fitness minus yesterday's fatigue. Clearly negative (below −20): hard training block, high fatigue. Around 0: balanced. Positive (+5 to +25): fresh, e.g. tapering before a race. Staying high positive for long means fitness is fading.",
  "help.load":
    "Training load per activity: Garmin's own training load when the activity has one. Otherwise our own value from duration and heart rate (Banister TRIMP, using your resting and maximum HR). The two scales are similar but not identical.",
  "help.acwr":
    "Acute (7-day) to chronic (42-day) load ratio. 0.8–1.3 is commonly considered balanced. Above 1.5 load is rising faster than your body adapts, often linked to higher injury risk. Below 0.8: maintaining or recovering. The research is debated; use it as orientation.",
  "help.weekly":
    "Training hours per week (Monday–Sunday) by sport. The three most frequent sports get their own color, the rest is grouped as \"Other\".",
  "help.meanmax":
    "The best average you held for each duration, e.g. your best 5-minute power. Calculated from the per-second FIT data. Solid: selected period, dashed: best of the last 2 years. The closer solid gets to dashed, the closer you are to your best form.",
  "help.decoupling":
    "Aerobic decoupling (Pa:HR): compares power or pace per heartbeat between the first and second half. Below 5%: heart rate stayed in line with output, good aerobic endurance for this effort. Above 5%: heart rate drifted (fatigue, heat, dehydration). Only meaningful for steady sessions of about an hour or more.",
  "help.aerobic_te":
    "Garmin's aerobic training effect (0–5): the session's impact on aerobic fitness. 0–0.9 none, 1–1.9 minor, 2–2.9 maintaining, 3–3.9 improving, 4–4.9 highly improving, 5 overreaching.",
  "help.np":
    "Normalized Power: the steady power that would have cost the same physiologically as your variable power. Weights hard surges more than a plain average.",
  "help.weight": "Last weigh-in of each day. Days without a weigh-in stay empty.",
  "help.sleep_stages":
    "Deep: physical recovery. Light: the largest share, transition between stages. REM: mental recovery and memory. Awake: wake periods during the night; short ones are normal, frequent or long ones (e.g. after alcohol or late meals) cost recovery. The watch estimates stages from heart rate, HRV and movement, so trends say more than single nights.",
  "help.hrv_chart":
    "Line: average HRV of each night. Band: Garmin's personal balanced range, based on your last weeks. Values inside are normal for you; several days below suggest incomplete recovery.",
  "help.bb_range":
    "Daily Body Battery high and low. A low morning high means the night did not fully recharge you. A low daily low means a draining day.",
  "help.correlations":
    "Pearson correlation r from −1 to +1 between two metrics over all days with values for both. Blue: rise together, red: move in opposite directions, grey: no relationship. From about |r| 0.3 it is worth a look. Correlation is not causation. \"Next day\" compares today with tomorrow, e.g. training load today with HRV tomorrow.",
  "help.findings":
    "The strongest relationships from the matrix, with at least 20 shared days. Pairs from the same source (e.g. sleep duration and deep sleep) are hidden because they are trivially related.",
  "help.mapping": "Which raw field from Garmin's responses each dashboard metric uses. Unresolved metrics have no matching field in your data yet.",
} as const;

export type Key = keyof typeof en;

const de: Record<Key, string> = {
  "tab.overview": "Übersicht",
  "tab.recovery": "Erholung",
  "tab.training": "Training",
  "tab.activities": "Aktivitäten",
  "tab.insights": "Zusammenhänge",
  "tab.data": "Daten",
  "tab.account": "Konto",
  "range.label": "Zeitraum",
  "range.days": "Letzte {n} Tage",
  "lang.label": "Sprache",
  "sync.running": "Synchronisiere: {step}",
  "sync.done": "Synchronisiert {time} ({status})",
  "sync.never": "Noch nicht synchronisiert",
  "sync.now": "Jetzt synchronisieren",
  "sync.status.ok": "ok",
  "sync.status.partial": "teilweise",
  "sync.status.error": "Fehler",
  "sync.status.running": "läuft",
  "banner.noKey": "Noch kein Garmin API-Key hinterlegt.",
  "banner.addKey": "Personal API Key eintragen",
  "banner.toStart": ", um die Synchronisierung zu starten.",
  "help.label": "Erklärung",
  "common.noData": "keine Daten",
  "common.loading": "Lädt…",
  "common.vs7d": "ggü. 7-Tage-Schnitt",
  "common.today": "heute",
  "common.nextDay": "nächster Tag",

  "metric.rhr": "Ruhepuls",
  "metric.hrv_night": "HRV",
  "metric.hrv_weekly": "HRV (7-Tage-Schnitt)",
  "metric.hrv_base_low": "HRV-Basis unten",
  "metric.hrv_base_high": "HRV-Basis oben",
  "metric.sleep_score": "Schlafscore",
  "metric.sleep_hours": "Schlaf",
  "metric.deep_sleep_hours": "Tiefschlaf",
  "metric.rem_sleep_hours": "REM-Schlaf",
  "metric.light_sleep_hours": "Leichtschlaf",
  "metric.awake_hours": "Wach (nachts)",
  "metric.stress_avg": "Ø Stress",
  "metric.bb_high": "Body Battery hoch",
  "metric.bb_low": "Body Battery tief",
  "metric.steps": "Schritte",
  "metric.weight": "Gewicht",
  "metric.load.load": "Trainingslast",
  "metric.load.tsb": "Form (TSB)",
  "metric.load.atl": "Ermüdung (ATL)",
  "metric.load.ctl": "Fitness (CTL)",
  "metric.body_battery": "Body Battery",

  "overview.readiness": "Bereitschaft",
  "overview.readinessSub": "Heute ggü. deinem 60-Tage-Schnitt (eigenes Modell, nicht Garmins)",
  "overview.readinessEmpty": "Braucht ca. 14 Tage HRV-, Ruhepuls- und Schlafdaten",
  "overview.fitnessFatigue": "Fitness & Ermüdung",
  "overview.fitnessFatigueSub": "42-Tage- (CTL) und 7-Tage-Schnitt (ATL) der Trainingslast",
  "overview.form": "Form (TSB)",
  "overview.formSub": "Fitness minus Ermüdung. Unter −20: harter Block. Über +5: erholt.",
  "overview.recent": "Letzte 14 Tage",
  "overview.recentCount": "{n} Aktivitäten",
  "part.hrv_night": "HRV",
  "part.rhr": "Ruhepuls",
  "part.sleep_score": "Schlaf",
  "part.load.tsb": "Form",

  "recovery.hrv": "HRV in der Nacht",
  "recovery.hrvSub": "Fläche: Garmins persönlicher Normalbereich",
  "recovery.rhr": "Ruhepuls",
  "recovery.bb": "Body Battery",
  "recovery.bbSub": "Tageshoch und -tief",
  "recovery.high": "Hoch",
  "recovery.low": "Tief",
  "recovery.stages": "Schlafphasen",
  "recovery.stagesSub": "Stunden pro Nacht",
  "recovery.deep": "Tief",
  "recovery.rem": "REM",
  "recovery.light": "Leicht",
  "recovery.awake": "Wach",
  "recovery.score": "Schlafscore",
  "recovery.stress": "Stress",
  "recovery.stressSub": "Tagesdurchschnitt",
  "recovery.weight": "Gewicht",

  "training.load": "Tageslast & Fitness",
  "training.loadSub": "Garmins Trainingslast, falls vorhanden, sonst herzfrequenzbasiertes TRIMP",
  "training.dailyLoad": "Tageslast",
  "training.acwr": "Akut : chronisch",
  "training.acwrSub": "Fläche 0,8–1,3: häufig genannter ausgewogener Bereich",
  "training.weekly": "Wochenumfang",
  "training.weeklySub": "Stunden pro Woche nach Sportart",
  "training.other": "Sonstige",
  "training.curve": "Bestleistungskurve",
  "training.curveSub": "Bester Durchschnitt je Dauer, aus den FIT-Daten",
  "training.power": "Leistung",
  "training.speed": "Pace / Tempo",
  "training.hr": "Herzfrequenz",
  "training.allSports": "Alle Sportarten",
  "training.lastDays": "Letzte {n} Tage",
  "training.best2y": "Bestwerte, 2 Jahre",
  "training.noStreams": "Keine Datenreihen im Zeitraum",

  "activities.title": "Aktivitäten",
  "activities.inRange": "{n} im Zeitraum",
  "activities.date": "Datum",
  "activities.name": "Name",
  "activities.sport": "Sportart",
  "activities.time": "Zeit",
  "activities.distance": "Distanz",
  "activities.avgHr": "Ø Puls",
  "activities.avgPower": "Ø Leistung",
  "activities.avgW": "Ø W",
  "activities.elev": "Höhenmeter",
  "activities.load": "Last",
  "activities.back": "← Aktivitäten",
  "activities.np": "NP",
  "activities.decoupling": "Aerobe Entkopplung",
  "activities.steady": "Stabil (< 5 %)",
  "activities.drifted": "Gedriftet (≥ 5 %)",
  "activities.aerobicTe": "Aerober TE",
  "activities.fitStatus": "FIT-Datei {status}{error}. Datenreihen erscheinen nach dem nächsten Sync.",
  "activities.route": "Strecke",
  "activities.hrChart": "Herzfrequenz (bpm)",
  "activities.powerChart": "Leistung (W)",
  "activities.paceChart": "Pace",
  "activities.elevChart": "Höhe (m)",
  "activities.alt": "Höhe",
  "activities.noStreams": "Keine Datenreihen",
  "activities.curve": "Bestleistungskurve",
  "activities.curveSub": "Bester Durchschnitt je Dauer in dieser Aktivität",
  "activities.laps": "Runden",
  "activities.pace": "Pace",

  "insights.title": "Was hängt womit zusammen",
  "insights.sub": "Pearson-Korrelation über {days} Tage. Korrelation, keine Ursache. Zelle anklicken für das Streudiagramm.",
  "insights.lagNext": "Heute → nächster Tag",
  "insights.lagSame": "Gleicher Tag",
  "insights.top": "Stärkste Zusammenhänge",
  "insights.topSub": "↑ = höher als üblich. n ≥ {n} Tage, ohne Paare aus derselben Quelle",
  "insights.finding": "{x} ↑ → {y} {dir}",
  "insights.higher": "↑",
  "insights.lower": "↓",
  "insights.notEnough": "Noch nicht genug gemeinsame Daten",
  "insights.waiting": "Warte auf Daten",
  "insights.scatterSub": "r = {r} · n = {n} Tage · Linie: lineare Regression",
  "insights.vs": "vs.",
  "insights.days": "Ein Punkt pro Tag",
  "insights.trend": "Trend (lineare Regression)",

  "data.sync": "Synchronisierung",
  "data.days": "Tage mit Metriken",
  "data.metrics": "Verschiedene Rohmetriken",
  "data.activities": "Aktivitäten",
  "data.fitPending": "FIT-Dateien ausstehend",
  "data.fitFailed": "FIT-Dateien fehlgeschlagen",
  "data.runs": "Letzte Läufe",
  "data.mapping": "Zuordnung der Metriken",
  "data.mappingSub": "Welches Rohfeld jede Dashboard-Metrik verwendet.",
  "data.unresolved": "nicht zugeordnet",
  "data.raw": "Alle Rohmetriken",
  "data.filter": "Filtern…",
  "data.metric": "Metrik",
  "data.daysCol": "Tage",
  "data.range": "Zeitraum",
  "data.payload": "Rohdaten",
  "data.noData": "Keine Daten für {ep}",
  "data.latest": "Letzter Abschnitt: {from} → {to}",

  "login.signIn": "Anmelden",
  "login.create": "Konto erstellen",
  "login.username": "Benutzername",
  "login.password": "Passwort",
  "login.repeat": "Passwort wiederholen",
  "login.mismatch": "Passwörter stimmen nicht überein",
  "login.toRegister": "Noch kein Konto? Jetzt erstellen",
  "login.toLogin": "Schon ein Konto? Anmelden",
  "login.haTitle": "Nicht angemeldet",
  "login.haText": "Home Assistant hat keine Benutzeridentität übergeben. Öffne das Dashboard über die Home-Assistant-Seitenleiste.",

  "account.keyTitle": "Garmin Personal API Key",
  "account.keySub":
    "Erstellen in Garmin Connect unter Einstellungen → Personal API Key (wird nur einmal angezeigt). Der Key wird bei Garmin geprüft und dann mit AES-256-GCM verschlüsselt gespeichert. Er wird nie wieder angezeigt, auch dir nicht.",
  "account.keyStored": "Gespeichert seit {date}",
  "account.keyNone": "Kein Key gespeichert",
  "account.keyRejected": "Garmin hat den Key beim letzten Sync abgelehnt: Er ist vermutlich abgelaufen oder widerrufen. Bitte einen neuen eintragen.",
  "account.keyPlaceholderNew": "API-Key einfügen",
  "account.keyPlaceholderReplace": "Neuen Key einfügen, um ihn zu ersetzen",
  "account.keySaved": "Key von Garmin bestätigt und verschlüsselt gespeichert. Erster Sync läuft.",
  "account.keyChecking": "Prüfe bei Garmin…",
  "account.keySave": "Key speichern",
  "account.keyReplace": "Key ersetzen",
  "account.keyRemove": "Key entfernen",
  "account.keyRemoveConfirm": "Gespeicherten Garmin API-Key entfernen? Bereits synchronisierte Daten bleiben erhalten, bis du dein Konto löschst.",
  "account.pwTitle": "Passwort",
  "account.pwSub": "Nach der Änderung wirst du überall abgemeldet.",
  "account.pwCurrent": "Aktuelles Passwort",
  "account.pwNew": "Neues Passwort (mind. 10 Zeichen)",
  "account.pwChange": "Passwort ändern",
  "account.title": "Konto",
  "account.signedInAs": "Angemeldet als",
  "account.viaHa": "über Home Assistant",
  "account.signOut": "Abmelden",
  "account.delete": "Konto und Daten löschen",
  "account.deleteConfirm": "Löscht dein Konto, den API-Key und alle synchronisierten Daten endgültig. Zum Bestätigen „{name}“ eingeben.",

  "err.username_invalid": "Benutzername: 3–32 Zeichen, Buchstaben, Ziffern, . _ -",
  "err.username_reserved": "Benutzernamen mit „ha.“ am Anfang sind reserviert",
  "err.username_taken": "Benutzername ist vergeben",
  "err.password_too_short": "Passwort muss mindestens 10 Zeichen haben",
  "err.registration_disabled": "Registrierung ist deaktiviert",
  "err.too_many_attempts": "Zu viele Versuche, bitte später erneut versuchen",
  "err.wrong_credentials": "Benutzername oder Passwort falsch",
  "err.wrong_current_password": "Aktuelles Passwort ist falsch",
  "err.key_format": "Das sieht nicht nach einem API-Key aus",
  "err.key_rejected": "Garmin hat diesen Key abgelehnt",
  "err.key_verify_failed": "Garmin war zur Prüfung des Keys nicht erreichbar. Bitte später erneut versuchen.",

  "help.readiness":
    "Eigenes Modell, nicht Garmins Trainingsbereitschaft. Vergleicht HRV, Ruhepuls, Schlafscore und Form (TSB) von heute mit deinem persönlichen Durchschnitt der letzten 60 Tage. 50 = normal für dich, über 60 = besser erholt als sonst, unter 40 = schlechter. Die σ-Werte zeigen, wie weit jeder Faktor von deinem Normalwert abweicht (Ruhepuls zählt umgekehrt: niedriger ist besser).",
  "help.hrv":
    "Herzfrequenzvariabilität: durchschnittliche Schwankung der Abstände zwischen Herzschlägen in der Nacht (ms, RMSSD). Über deinem Normalbereich spricht meist für gute Erholung; deutlich darunter kann Stress, Krankheit, Alkohol oder Trainingsermüdung bedeuten. Nur mit dir selbst vergleichen, nicht mit anderen.",
  "help.rhr":
    "Niedrigste stabile Herzfrequenz des Tages. Ein Anstieg um 5+ Schläge über deinen Normalwert kann auf Ermüdung, einen Infekt oder schlechten Schlaf hinweisen. Sinkt über Monate mit besserer Ausdauer.",
  "help.sleep": "Gesamte Schlafdauer der letzten Nacht, ohne Wachphasen.",
  "help.sleep_score":
    "Garmins Schlafbewertung 0–100 aus Dauer, Schlafphasen, Unruhe und Stress im Schlaf. 80+ gut, 60–79 ordentlich, unter 60 schwach.",
  "help.bb":
    "Body Battery 0–100: Garmins Schätzung deiner Energiereserve aus HRV, Stress und Aktivität. Lädt im Schlaf und in Ruhe, entlädt sich durch Belastung und Stress. Angezeigt: der Tageshöchstwert, meist direkt nach dem Aufwachen.",
  "help.stress":
    "Durchschnittliches Stresslevel 0–100, abgeleitet aus der HRV über den Tag (ohne Aktivitäten). 0–25 Ruhe, 26–50 gering, 51–75 mittel, 76–100 hoch.",
  "help.fitness_fatigue":
    "Fitness (CTL): gewichteter 42-Tage-Durchschnitt deiner Trainingslast. Steigt langsam und zeigt die aufgebaute Form. Ermüdung (ATL): 7-Tage-Durchschnitt, reagiert schnell auf harte Tage. Fitness wächst nur, wenn du über Wochen mehr belastest, als du dich erholst.",
  "help.tsb":
    "Form (TSB) = Fitness minus Ermüdung vom Vortag. Deutlich negativ (unter −20): harter Trainingsblock, hohe Ermüdung. Um 0: ausgeglichen. Positiv (+5 bis +25): erholt, z. B. beim Tapering vor einem Wettkampf. Bleibt sie lange deutlich positiv, geht Fitness verloren.",
  "help.load":
    "Trainingslast je Aktivität: Garmins eigene Trainingslast, sofern die Aktivität eine hat. Sonst eigener Wert aus Dauer und Herzfrequenz (Banister-TRIMP, mit deinem Ruhe- und Maximalpuls). Beide Skalen sind ähnlich, aber nicht identisch.",
  "help.acwr":
    "Verhältnis von akuter (7 Tage) zu chronischer (42 Tage) Belastung. 0,8–1,3 gilt häufig als ausgewogen. Über 1,5 steigt die Belastung schneller, als sich der Körper anpasst; das wird oft mit höherem Verletzungsrisiko verbunden. Unter 0,8: Erhalt oder Erholung. Die Forschung dazu ist umstritten, als Orientierung nutzen.",
  "help.weekly":
    "Trainingsstunden pro Woche (Montag–Sonntag) nach Sportart. Die drei häufigsten Sportarten haben eigene Farben, der Rest ist unter „Sonstige“ zusammengefasst.",
  "help.meanmax":
    "Der beste Durchschnitt, den du für jede Dauer gehalten hast, z. B. deine beste 5-Minuten-Leistung. Berechnet aus den sekündlichen FIT-Daten. Durchgezogen: gewählter Zeitraum, gestrichelt: Bestwerte der letzten 2 Jahre. Je näher durchgezogen an gestrichelt, desto näher bist du an deiner Bestform.",
  "help.decoupling":
    "Aerobe Entkopplung (Pa:HR): vergleicht Leistung bzw. Tempo pro Herzschlag in der ersten und zweiten Hälfte. Unter 5 %: Puls blieb im Verhältnis zur Leistung stabil, gute aerobe Ausdauer für diese Belastung. Über 5 %: Puls ist gedriftet (Ermüdung, Hitze, Flüssigkeitsmangel). Nur bei gleichmäßigen Einheiten ab etwa einer Stunde aussagekräftig.",
  "help.aerobic_te":
    "Garmins aerober Trainingseffekt (0–5): Wirkung der Einheit auf deine aerobe Fitness. 0–0,9 keiner, 1–1,9 gering, 2–2,9 erhaltend, 3–3,9 verbessernd, 4–4,9 stark verbessernd, 5 Überlastung.",
  "help.np":
    "Normalized Power: die gleichmäßige Leistung, die physiologisch so anstrengend gewesen wäre wie deine schwankende Leistung. Gewichtet harte Spitzen stärker als der einfache Durchschnitt.",
  "help.weight": "Letzte Wägung des Tages. Tage ohne Wägung bleiben leer.",
  "help.sleep_stages":
    "Tief: körperliche Erholung. Leicht: der größte Anteil, Übergang zwischen den Phasen. REM: geistige Erholung und Gedächtnis. Wach: Wachphasen in der Nacht; kurze sind normal, häufige oder lange (z. B. nach Alkohol oder spätem Essen) kosten Erholung. Die Uhr schätzt die Phasen aus Herzfrequenz, HRV und Bewegung, daher sagen Trends mehr als einzelne Nächte.",
  "help.hrv_chart":
    "Linie: durchschnittliche HRV jeder Nacht. Fläche: Garmins persönlicher ausgeglichener Bereich, berechnet aus deinen letzten Wochen. Werte darin sind normal für dich; mehrere Tage darunter deuten auf unvollständige Erholung.",
  "help.bb_range":
    "Tageshöchst- und Tiefstwert der Body Battery. Ein niedriger Höchstwert am Morgen heißt: Die Nacht hat nicht voll aufgeladen. Ein niedriger Tiefstwert heißt: anstrengender Tag.",
  "help.correlations":
    "Pearson-Korrelation r von −1 bis +1 zwischen zwei Metriken über alle Tage, an denen beide Werte haben. Blau: steigen gemeinsam, Rot: gegenläufig, Grau: kein Zusammenhang. Ab etwa |r| 0,3 lohnt ein Blick. Korrelation ist keine Ursache. „Nächster Tag“ vergleicht heute mit morgen, z. B. Trainingslast heute mit HRV morgen.",
  "help.findings":
    "Die stärksten Zusammenhänge aus der Matrix, mit mindestens 20 gemeinsamen Tagen. Paare aus derselben Quelle (z. B. Schlafdauer und Tiefschlaf) sind ausgeblendet, weil sie trivial zusammenhängen.",
  "help.mapping": "Welches Rohfeld aus Garmins Antworten jede Dashboard-Metrik verwendet. Nicht zugeordnete Metriken haben in deinen Daten (noch) kein passendes Feld.",
};

const DICTS: Record<Lang, Record<Key, string>> = { en, de };

// Garmin activity typeKeys; unknown ones fall back to the key with spaces.
const SPORTS: Record<Lang, Record<string, string>> = {
  en: {},
  de: {
    running: "Laufen",
    trail_running: "Trailrunning",
    treadmill_running: "Laufband",
    track_running: "Bahnlauf",
    cycling: "Radfahren",
    road_biking: "Rennrad",
    mountain_biking: "Mountainbike",
    gravel_cycling: "Gravel",
    indoor_cycling: "Indoor-Radfahren",
    virtual_ride: "Virtuelles Radfahren",
    e_bike_fitness: "E-Bike",
    walking: "Gehen",
    hiking: "Wandern",
    swimming: "Schwimmen",
    lap_swimming: "Schwimmbad",
    open_water_swimming: "Freiwasserschwimmen",
    strength_training: "Krafttraining",
    cardio: "Cardio",
    hiit: "HIIT",
    yoga: "Yoga",
    pilates: "Pilates",
    elliptical: "Crosstrainer",
    indoor_rowing: "Indoor-Rudern",
    rowing: "Rudern",
    resort_skiing_snowboarding_ws: "Ski/Snowboard",
    backcountry_skiing: "Skitour",
    cross_country_skiing_ws: "Langlauf",
    other: "Sonstiges",
  },
};

export function detectLang(): Lang {
  try {
    const saved = localStorage.getItem("lang");
    if (saved === "de" || saved === "en") return saved;
  } catch {}
  return navigator.language?.toLowerCase().startsWith("de") ? "de" : "en";
}

// Module-level copy for chart formatters, which are built outside React's tree.
let currentLang: Lang = detectLang();
export const locale = () => (currentLang === "de" ? "de-DE" : "en-GB");

export function fmtNum(v: number, digits = 0) {
  return new Intl.NumberFormat(locale(), { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v);
}

/** Formats a "YYYY-MM-DD…" string as a calendar date, without timezone shifts. */
export function fmtDate(iso: string, opts: Intl.DateTimeFormatOptions = { day: "2-digit", month: "2-digit", year: "numeric" }) {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(locale(), opts);
}
export const fmtDayShort = (iso: string) => fmtDate(iso, { day: "2-digit", month: "2-digit" });

/** Tooltip header for date axes: category axes pass the "YYYY-MM-DD" string, time axes a local-midnight timestamp. */
export const dateAxisPointer = {
  label: {
    formatter: ({ value }: { value: string | number }) =>
      typeof value === "number" ? new Date(value).toLocaleDateString(locale(), { day: "2-digit", month: "2-digit", year: "numeric" }) : fmtDate(value),
  },
};

export type T = (key: Key, vars?: Record<string, string | number>) => string;

interface I18n {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: T;
  sport: (typeKey: string) => string;
  metric: (key: string) => string;
}

const Ctx = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(currentLang);

  const setLang = useCallback((l: Lang) => {
    currentLang = l;
    document.documentElement.lang = l;
    try {
      localStorage.setItem("lang", l);
    } catch {}
    setLangState(l);
  }, []);

  const value = useMemo<I18n>(() => {
    document.documentElement.lang = lang;
    const dict = DICTS[lang];
    const t: T = (key, vars) => {
      let s = dict[key] ?? en[key] ?? key;
      if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
      return s;
    };
    return {
      lang,
      setLang,
      t,
      sport: (k) => SPORTS[lang][k] ?? k.replace(/_/g, " "),
      metric: (k) => (`metric.${k}` in dict ? dict[`metric.${k}` as Key] : k),
    };
  }, [lang, setLang]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useI18n outside I18nProvider");
  return v;
}

/** Translate a server error: prefer its code, fall back to the server's English message. */
export function errorText(t: T, e: unknown) {
  const code = (e as { code?: string }).code;
  const key = `err.${code}` as Key;
  return code && key in en ? t(key) : (e as Error).message;
}
