/**
 * Stage 2 — feature engineering.
 *
 * Turns raw readings into a model-ready design matrix. Every feature here is
 * knowable at 06:00 on the day before the target period, so the same builder
 * serves both training and day-ahead inference.
 */

import { SLOTS_PER_DAY } from "./calendar";
import type { Reading } from "./ingest";

export const FEATURE_NAMES = [
  "bias",
  "sin1", "cos1", "sin2", "cos2", "sin3", "cos3",
  "dow1", "dow2", "dow3", "dow4", "dow5", "dow6",
  "weekend",
  "holiday",
  "monthSin", "monthCos",
  "temp", "tempExcess", "tempExcessSq",
  "clearSky", "clearSkyCloud",
  "lag1d", "lag7d", "lag1dRoll",
] as const;

export type FeatureRow = number[];

export interface FrameRow {
  ts: number;
  x: FeatureRow;
  y: number;
}

const harmonic = (h: number, k: number) => [
  Math.sin((2 * Math.PI * k * h) / 24),
  Math.cos((2 * Math.PI * k * h) / 24),
];

function solarClearSky(h: number) {
  if (h <= 6.1 || h >= 18.3) return 0;
  return Math.sin((Math.PI * (h - 6.1)) / 12.2) ** 1.35;
}

export interface FeatureContext {
  decimalHour: number;
  weekday: number;
  month: number;
  isHoliday: boolean;
  tempC: number;
  cloud: number;
  /** Load at the same slot 24 h earlier, MW. */
  lag1d: number;
  /** Load at the same slot 7 days earlier, MW. */
  lag7d: number;
  /** Mean load over the 24 h ending one day before the slot, MW. */
  lag1dRoll: number;
}

export function buildRow(c: FeatureContext): FeatureRow {
  const [s1, c1] = harmonic(c.decimalHour, 1);
  const [s2, c2] = harmonic(c.decimalHour, 2);
  const [s3, c3] = harmonic(c.decimalHour, 3);
  const dow = [0, 0, 0, 0, 0, 0];
  if (c.weekday >= 1) dow[c.weekday - 1] = 1; // Sunday is the reference level
  const tempExcess = Math.max(0, c.tempC - 26);
  const clear = solarClearSky(c.decimalHour);
  return [
    1,
    s1, c1, s2, c2, s3, c3,
    ...dow,
    c.weekday === 0 || c.weekday === 6 ? 1 : 0,
    c.isHoliday ? 1 : 0,
    Math.sin((2 * Math.PI * c.month) / 12),
    Math.cos((2 * Math.PI * c.month) / 12),
    c.tempC,
    tempExcess,
    tempExcess * tempExcess,
    clear,
    clear * c.cloud,
    c.lag1d,
    c.lag7d,
    c.lag1dRoll,
  ];
}

/**
 * Assemble the training frame. Rows without complete lag history are dropped.
 */
export function buildFrame(readings: Reading[], parts: LocalPartsLike[]): FrameRow[] {
  const rows: FrameRow[] = [];
  const day = SLOTS_PER_DAY;
  const week = 7 * SLOTS_PER_DAY;

  // Prefix sums give the trailing 24 h mean in O(1) per row.
  const cumulative = new Float64Array(readings.length + 1);
  for (let i = 0; i < readings.length; i++) {
    cumulative[i + 1] = cumulative[i] + readings[i].loadMW;
  }

  for (let i = week; i < readings.length; i++) {
    const p = parts[i];
    rows.push({
      ts: readings[i].ts,
      y: readings[i].loadMW,
      x: buildRow({
        decimalHour: p.decimalHour,
        weekday: p.weekday,
        month: p.month,
        isHoliday: readings[i].isHoliday,
        tempC: readings[i].tempC,
        cloud: readings[i].cloud,
        lag1d: readings[i - day].loadMW,
        lag7d: readings[i - week].loadMW,
        lag1dRoll: (cumulative[i - day] - cumulative[i - 2 * day]) / day,
      }),
    });
  }
  return rows;
}

/** Trailing 24 h mean load ending `daysBack` days before index `i`. */
export function trailingMean(readings: Reading[], endIndex: number): number {
  const day = SLOTS_PER_DAY;
  let sum = 0;
  for (let i = endIndex - day; i < endIndex; i++) sum += readings[i].loadMW;
  return sum / day;
}

export interface LocalPartsLike {
  decimalHour: number;
  weekday: number;
  month: number;
}
