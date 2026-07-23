/**
 * The 06:00 job clock.
 *
 * In production a cron/worker fires `runForecast` at 06:00 Asia/Colombo and
 * writes the bundle the UI fetches. In the demo there is no server, so the same
 * cadence runs client-side: `scheduleDailyRun` arms a timer to the next 06:00
 * LKT, invokes the job, then re-arms for the following day. Either way the UI
 * only ever sees "a fresh bundle appeared at 06:00" — the trigger is an
 * implementation detail behind this module.
 */

import { LKT_OFFSET_MIN, startOfLocalDay } from "./calendar";
import { RUN_HOUR } from "./forecast";

const DAY_MS = 86_400_000;

/** Absolute instant of the most recent 06:00 LKT run at or before `now`. */
export function lastRunAtOrBefore(now: number): number {
  const run = startOfLocalDay(now) + RUN_HOUR * 3600_000;
  return run <= now ? run : run - DAY_MS;
}

/** Absolute instant of the first 06:00 LKT run strictly after `now`. */
export function nextRunAfter(now: number): number {
  return lastRunAtOrBefore(now) + DAY_MS;
}

/**
 * Arm the daily 06:00 job. Fires `onRun` with the instant the job represents,
 * then reschedules for the next day. Returns a disposer that cancels the
 * pending timer.
 *
 * `onRun` is invoked with the scheduled run instant, not `Date.now()`, so the
 * forecast is always anchored to a clean 06:00 boundary even if the timer wakes
 * a few milliseconds late.
 *
 * `clock` is injectable so the schedule can be exercised deterministically in
 * tests; it defaults to `Date.now`.
 */
export function scheduleDailyRun(
  onRun: (runAt: number) => void,
  clock: () => number = Date.now
): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancelled = false;

  const arm = () => {
    if (cancelled) return;
    const now = clock();
    const next = nextRunAfter(now);
    // setTimeout tops out around 24.8 days; a daily delay is always well inside
    // that, but clamp defensively so a bad clock can't overflow to a fire-now.
    const delay = Math.max(0, Math.min(next - now, 2_147_483_647));
    timer = setTimeout(() => {
      onRun(lastRunAtOrBefore(clock()));
      arm();
    }, delay);
  };

  arm();

  return () => {
    cancelled = true;
    if (timer !== undefined) clearTimeout(timer);
  };
}

export { LKT_OFFSET_MIN };
