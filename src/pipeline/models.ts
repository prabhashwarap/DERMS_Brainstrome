/**
 * Stage 3 — models.
 *
 * Two of them, in the order the brief calls for:
 *   1. similar-day baseline — the bar every later model has to clear;
 *   2. ridge regression on the engineered features — the v1 production model.
 *
 * Both are real: they fit and predict from the data in the browser. Nothing
 * here is a canned curve.
 */

import { SLOTS_PER_DAY } from "./calendar";
import type { FrameRow } from "./features";
import type { Reading } from "./ingest";
import type { LocalParts } from "./calendar";

/* ------------------------------------------------------------------ */
/* 1. Similar-day baseline                                             */

/**
 * Forecast each slot of the target day as the mean of that slot across the last
 * `k` matching days (same weekday, non-holiday), then apply a damped correction
 * for recent level drift.
 */
export function similarDayForecast(
  readings: Reading[],
  parts: LocalParts[],
  originIndex: number,
  targetWeekday: number,
  targetIsHoliday: boolean,
  k = 4
): number[] {
  const day = SLOTS_PER_DAY;
  const candidates: number[] = []; // start index of each matching day

  for (let start = originIndex - day; start >= 0; start -= day) {
    const p = parts[start];
    if (p.weekday !== targetWeekday) continue;
    if (readings[start].isHoliday !== targetIsHoliday) continue;
    candidates.push(start);
    if (candidates.length === k) break;
  }
  if (!candidates.length) {
    return Array.from({ length: day }, (_, s) => readings[originIndex - day + s].loadMW);
  }

  const profile = new Array<number>(day).fill(0);
  for (const start of candidates) {
    for (let s = 0; s < day; s++) profile[s] += readings[start + s].loadMW;
  }
  for (let s = 0; s < day; s++) profile[s] /= candidates.length;

  // Recent-trend adjustment: last 7 days' level vs. the level of the days we
  // averaged. Damped, because a week of weather is not a trend.
  const recentMean = mean(readings.slice(originIndex - 7 * day, originIndex).map((r) => r.loadMW));
  const similarMean = mean(
    candidates.flatMap((start) =>
      readings.slice(start, start + day).map((r) => r.loadMW)
    )
  );
  const ratio = similarMean > 0 ? recentMean / similarMean : 1;
  const damped = 1 + 0.5 * (ratio - 1);

  return profile.map((v) => v * damped);
}

/* ------------------------------------------------------------------ */
/* 2. Ridge regression                                                 */

export interface RidgeModel {
  weights: Float64Array;
  mu: Float64Array;
  sigma: Float64Array;
  predict: (x: number[]) => number;
}

/**
 * Ordinary ridge via the normal equations, on standardised columns.
 * The feature count is small (~25) so a dense Cholesky solve is instant.
 */
export function fitRidge(rows: FrameRow[], lambda = 1.0): RidgeModel {
  const n = rows.length;
  const d = rows[0].x.length;

  const mu = new Float64Array(d);
  const sigma = new Float64Array(d);
  for (let j = 0; j < d; j++) {
    let s = 0;
    for (let i = 0; i < n; i++) s += rows[i].x[j];
    mu[j] = s / n;
    let v = 0;
    for (let i = 0; i < n; i++) v += (rows[i].x[j] - mu[j]) ** 2;
    sigma[j] = Math.sqrt(v / n) || 1;
  }
  // Keep the intercept column untouched.
  mu[0] = 0;
  sigma[0] = 1;

  const z = (i: number, j: number) => (rows[i].x[j] - mu[j]) / sigma[j];

  const ata = new Float64Array(d * d);
  const atb = new Float64Array(d);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < d; j++) {
      const zj = z(i, j);
      atb[j] += zj * rows[i].y;
      for (let k = j; k < d; k++) ata[j * d + k] += zj * z(i, k);
    }
  }
  for (let j = 0; j < d; j++) {
    for (let k = 0; k < j; k++) ata[j * d + k] = ata[k * d + j];
    if (j > 0) ata[j * d + j] += lambda * n * 0.001;
  }

  const weights = solveSymmetric(ata, atb, d);

  return {
    weights,
    mu,
    sigma,
    predict(x: number[]) {
      let acc = 0;
      for (let j = 0; j < d; j++) acc += weights[j] * ((x[j] - mu[j]) / sigma[j]);
      return acc;
    },
  };
}

/** Cholesky solve of a symmetric positive-definite system. */
function solveSymmetric(a: Float64Array, b: Float64Array, d: number): Float64Array {
  const l = new Float64Array(d * d);
  for (let i = 0; i < d; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = a[i * d + j];
      for (let k = 0; k < j; k++) sum -= l[i * d + k] * l[j * d + k];
      if (i === j) {
        l[i * d + j] = Math.sqrt(Math.max(sum, 1e-9));
      } else {
        l[i * d + j] = sum / l[j * d + j];
      }
    }
  }
  const y = new Float64Array(d);
  for (let i = 0; i < d; i++) {
    let sum = b[i];
    for (let k = 0; k < i; k++) sum -= l[i * d + k] * y[k];
    y[i] = sum / l[i * d + i];
  }
  const x = new Float64Array(d);
  for (let i = d - 1; i >= 0; i--) {
    let sum = y[i];
    for (let k = i + 1; k < d; k++) sum -= l[k * d + i] * x[k];
    x[i] = sum / l[i * d + i];
  }
  return x;
}

export const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
