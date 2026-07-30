/**
 * The single threshold table.
 *
 * Chart bands, numeric readouts and the alarm engine all read from here, so a
 * value can never be amber in one place and green in another. Everything is
 * expressed as a deviation from a nominal, because that is what an operator
 * acts on — nobody responds to "49.87 Hz", they respond to "−0.13".
 *
 * Values are indicative for a Sri Lankan 11 kV feeder on a 50 Hz island system,
 * and are the one thing a deployment is expected to retune. The voltage bands are
 * not indicative: ±5 % is the PUCSL distribution licence condition, and it is what
 * the tail-end node is actually judged against.
 */

export type Level = "normal" | "warning" | "critical";

export const NOMINAL_HZ = 50;

export const THRESHOLDS = {
  /** Absolute deviation from 50 Hz. */
  frequencyHz: { warning: 0.05, critical: 0.15 },
  /** Absolute RoCoF. Sub-0.1 is quiet; above 0.5 the system is losing control. */
  rocofHzPerS: { warning: 0.1, critical: 0.5 },
  /** Absolute deviation from 1.0 pu at a feeder node. Warning is the PUCSL ±5 %
   *  licence condition for MV supply; critical is where LV customers behind it
   *  start leaving their own band. */
  voltagePu: { warning: 0.05, critical: 0.09 },
  /** Room left inside the ±5 % band, % of the band — lower is worse, so inverted. */
  stabilityMarginPct: { warning: 15, critical: 8 },
  /** Storage reserve as a share of the peak-shaving requirement, %. Inverted. */
  reserveCoverPct: { warning: 100, critical: 70 },
  /** Synchronous inertia on the CEB system, GW·s. Inverted, and observed only. */
  inertiaGWs: { warning: 2.9, critical: 2.6 },
  /** Rooftop PV curtailed as a share of what was available, %. */
  curtailmentPct: { warning: 15, critical: 35 },
  /** BESS cell temperature, °C. */
  cellTempC: { warning: 38, critical: 45 },
  /** State of health, %. Inverted. */
  sohPct: { warning: 90, critical: 80 },
} as const;

/** Classify a signed deviation against a symmetric band. */
export function classifyDeviation(deviation: number, band: { warning: number; critical: number }): Level {
  const d = Math.abs(deviation);
  if (d >= band.critical) return "critical";
  if (d >= band.warning) return "warning";
  return "normal";
}

/** Classify a value where *lower is worse* (reserve cover, margin, SoH). */
export function classifyFloor(value: number, band: { warning: number; critical: number }): Level {
  if (value <= band.critical) return "critical";
  if (value <= band.warning) return "warning";
  return "normal";
}

/** Classify a value where *higher is worse* (temperature). */
export function classifyCeiling(value: number, band: { warning: number; critical: number }): Level {
  if (value >= band.critical) return "critical";
  if (value >= band.warning) return "warning";
  return "normal";
}

export const LEVEL_CLASS: Record<Level, { text: string; bg: string; dot: string }> = {
  normal: { text: "text-foreground", bg: "bg-muted", dot: "bg-[var(--status-normal)]" },
  warning: { text: "text-[var(--status-warning)]", bg: "bg-[var(--status-warning)]/12", dot: "bg-[var(--status-warning)]" },
  critical: { text: "text-[var(--status-critical)]", bg: "bg-[var(--status-critical)]/12", dot: "bg-[var(--status-critical)]" },
};

/**
 * A feed is stale once it has missed three expected updates. In a balancing
 * view a frozen number is more dangerous than a missing one, so this is
 * surfaced rather than silently tolerated.
 */
export const STALE_AFTER = (expectedIntervalMs: number) => expectedIntervalMs * 3;
