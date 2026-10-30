// Endpoint catalog from Garmin's official Python client.
// Response schemas are not published yet, so the sync stores payloads raw
// and analytics extract fields defensively.

export interface RangeEndpoint {
  key: string;
  /** Max days per request; Garmin has not documented limits, so stay conservative. */
  chunkDays: number;
  build: (start: string, end: string) => { path: string; params?: Record<string, string> };
}

export const rangeEndpoints: RangeEndpoint[] = [
  {
    key: "daily_summaries",
    chunkDays: 28,
    build: (s, e) => ({ path: "/usersummary-service/v2/dailysummaries", params: { startDate: s, endDate: e } }),
  },
  {
    key: "sleep_summaries",
    chunkDays: 28,
    build: (s, e) => ({ path: "/sleep-service/sleep/dailySleepSummariesByDate", params: { startDate: s, endDate: e } }),
  },
  { key: "hrv", chunkDays: 28, build: (s, e) => ({ path: `/hrv-service/hrv/daily/${s}/${e}` }) },
  { key: "stress", chunkDays: 28, build: (s, e) => ({ path: `/usersummary-service/stats/stress/daily/${s}/${e}` }) },
  { key: "steps", chunkDays: 28, build: (s, e) => ({ path: `/usersummary-service/stats/steps/daily/${s}/${e}` }) },
  {
    key: "body_battery",
    chunkDays: 28,
    build: (s, e) => ({ path: "/wellness-service/wellness/bodyBattery/reports/daily", params: { startDate: s, endDate: e } }),
  },
  {
    key: "weight",
    chunkDays: 90,
    build: (s, e) => ({ path: `/weight-service/weight/range/${s}/${e}`, params: { includeAll: "true" } }),
  },
];

export const singleEndpoints = {
  profile: "/userprofile-service/userprofile/settings",
  hrZones: "/biometric-service/heartRateZones/v2",
};

// One calendar day in 2-minute samples; fetched per night on demand, not synced.
export const dailyHeartRate = "/wellness-service/wellness/dailyHeartRate";

export const activitySearch = "/activitylist-service/activities/search/activities";
export const activityDetail = (id: number | string) => `/activity-service/activity/${id}`;
export const activityDownload = (id: number | string) => `/download-service/files/activity/${id}`;
