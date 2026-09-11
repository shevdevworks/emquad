/**
 * In-memory save throttle, keyed by client address.
 *
 * Vercel runs several short-lived instances, so this limit only holds within
 * one warm instance: it stops a stuck client or a simple script hammering the
 * Server Action, not a distributed flood. Chosen over a database counter to
 * keep Save at a single round trip, and accepted as a demo-grade limit.
 *
 * checkRateLimit takes its store and its clock as arguments so the window
 * logic can be exercised on its own, without a server and without touching
 * the database - the same reason parseSyncArgs was split out in stage 7.3.
 */

export const WINDOW_MS = 60_000;
export const MAX_SAVES_PER_WINDOW = 10;

// Reached only under a spray of forged x-forwarded-for values. Dropping the
// whole map costs one window of throttling accuracy and bounds the memory.
const MAX_KEYS = 1000;

export function checkRateLimit(store: Map<string, number[]>, key: string, now: number): boolean {
  const windowStart = now - WINDOW_MS;

  if (store.size >= MAX_KEYS) {
    for (const [existingKey, times] of store) {
      if (times.every((time) => time <= windowStart)) store.delete(existingKey);
    }
    if (store.size >= MAX_KEYS) store.clear();
  }

  const recent = (store.get(key) ?? []).filter((time) => time > windowStart);
  if (recent.length >= MAX_SAVES_PER_WINDOW) {
    store.set(key, recent);
    return false;
  }

  recent.push(now);
  store.set(key, recent);
  return true;
}

const saves = new Map<string, number[]>();

export function allowSave(key: string): boolean {
  return checkRateLimit(saves, key, Date.now());
}
