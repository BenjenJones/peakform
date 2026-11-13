// The athlete's own take on an activity: how it felt, what it was meant to be and quick notes.
// Entered on the activity page before asking for a review, and passed on to the review.

import { db } from "./db.js";

/** 1 = awful … 5 = great. */
export const FEELINGS = ["awful", "bad", "okay", "good", "great"] as const;

/** What the session was meant to be; judges pace and heart rate against the plan. */
export const INTENTS = ["recovery", "easy", "long", "tempo", "intervals", "race", "other"] as const;
export type Intent = (typeof INTENTS)[number];

/** Quick notes, wording for the review prompt. */
export const TAGS = {
  fresh_legs: "legs felt fresh",
  heavy_legs: "legs felt heavy",
  sore_muscles: "sore muscles from earlier training",
  pain: "pain or a niggle during the session",
  hard_breathing: "breathing felt hard",
  side_stitch: "side stitch",
  stomach: "stomach problems",
  hungry: "under-fuelled, hungry or low on energy",
  poor_sleep: "slept badly",
  stressed: "stressed",
  ill: "ill or coming down with something",
  heat: "hot weather",
  cold: "cold weather",
  wind: "strong wind",
  rain: "rain or snow",
  rough_terrain: "rough, slippery or technical ground",
  with_others: "with others, at their pace",
  with_dog: "with a dog or a stroller",
} as const;
export type Tag = keyof typeof TAGS;

export const MAX_NOTE = 1000;

export interface Feedback {
  feeling: number | null;
  intent: Intent | null;
  tags: Tag[];
  note: string;
  updatedAt: string;
}

export function getFeedback(uid: number, activityId: number): Feedback | null {
  const r = db.prepare("SELECT feeling, intent, tags, note, updated_at FROM activity_feedback WHERE user_id = ? AND activity_id = ?").get(uid, activityId) as
    | { feeling: number | null; intent: Intent | null; tags: string; note: string; updated_at: string }
    | undefined;
  return r ? { feeling: r.feeling, intent: r.intent, tags: JSON.parse(r.tags), note: r.note, updatedAt: r.updated_at } : null;
}

/** Feeling per activity, for lists. */
export function feelingMap(uid: number) {
  const rows = db.prepare("SELECT activity_id, feeling FROM activity_feedback WHERE user_id = ? AND feeling IS NOT NULL").all(uid) as { activity_id: number; feeling: number }[];
  return new Map(rows.map((r) => [r.activity_id, r.feeling]));
}

/** Validates a request body; returns an error message or the cleaned feedback. */
export function parseFeedback(b: Record<string, unknown>): Omit<Feedback, "updatedAt"> | string {
  const feeling = b.feeling === null || b.feeling === undefined ? null : Number(b.feeling);
  if (feeling !== null && !(Number.isInteger(feeling) && feeling >= 1 && feeling <= FEELINGS.length)) return "Invalid feeling";
  const intent = b.intent === null || b.intent === undefined ? null : INTENTS.find((i) => i === b.intent);
  if (intent === undefined) return "Invalid session type";
  const tags = Array.isArray(b.tags) ? b.tags : [];
  if (!tags.every((t): t is Tag => typeof t === "string" && t in TAGS)) return "Invalid note";
  const note = typeof b.note === "string" ? b.note.trim() : "";
  if (note.length > MAX_NOTE) return `At most ${MAX_NOTE} characters`;
  return { feeling, intent, tags: [...new Set(tags)], note };
}

export function setFeedback(uid: number, activityId: number, f: Omit<Feedback, "updatedAt">) {
  if (f.feeling === null && f.intent === null && !f.tags.length && !f.note) {
    db.prepare("DELETE FROM activity_feedback WHERE user_id = ? AND activity_id = ?").run(uid, activityId);
    return;
  }
  db.prepare(
    `INSERT INTO activity_feedback(user_id, activity_id, feeling, intent, tags, note, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, activity_id) DO UPDATE SET feeling = excluded.feeling, intent = excluded.intent, tags = excluded.tags,
       note = excluded.note, updated_at = excluded.updated_at`,
  ).run(uid, activityId, f.feeling, f.intent, JSON.stringify(f.tags), f.note, new Date().toISOString());
}

/** For the review prompt; undefined when the athlete said nothing. */
export function feedbackForPrompt(uid: number, activityId: number) {
  const f = getFeedback(uid, activityId);
  if (!f) return undefined;
  return {
    feeling: f.feeling ? `${f.feeling}/5 (${FEELINGS[f.feeling - 1]})` : undefined,
    plannedSession: f.intent ?? undefined,
    notes: f.tags.length ? f.tags.map((t) => TAGS[t]) : undefined,
    comment: f.note || undefined,
  };
}
