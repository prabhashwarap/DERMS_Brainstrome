/**
 * Stages 3–4 — prediction, evaluation and serving.
 *
 * `runForecast` is the scheduled job: at 06:00 LKT it trains on everything up
 * to the cut-off, predicts the next 24 hours, backtests on a held-out tail, and
 * writes the bundle the UI reads. In production this runs server-side and the
 * UI fetches the result; the shape of what the UI consumes is identical.
 */

import {
  QUARTER_MS,
  SLOTS_PER_DAY,
  WEEKDAYS,
  getHolidayName,
  isHoliday,
  localParts,
  startOfLocalDay,
  type LocalParts,
} from "./calendar";
import { buildFrame, buildRow, type FrameRow } from "./features";
import { loadFeederHistory, type Reading } from "./ingest";
import { fitRidge, similarDayForecast, mean, type RidgeModel } from "./models";
import { capacityMW, type Feeder } from "./feeders";

export interface ForecastPoint {
  ts: number;
  expected: number;
  lower: number;
  upper: number;
  baseline: number;
  tempC: number;
  cloud: number;
  solarMW?: number;
}

export interface HistoryPoint {
  ts: number;
  actual: number;
  tempC: number;
  cloud: number;
}

export interface Accuracy {
  /** Mean absolute percentage error of the production model, %. */
  mape: number;
  /** MAPE of the similar-day baseline, %. */
  baselineMape: number;
  /** Mean absolute error, MW. */
  maeMW: number;
  /** Number of held-out days the metrics were computed over. */
  holdoutDays: number;
}

export interface DayTypeInfo {
  /** High-level classification: "Weekday" | "Saturday" | "Sunday" | "Public Holiday" */
  type: "Weekday" | "Saturday" | "Sunday" | "Public Holiday";
  /** Full descriptive name: e.g. "Friday (Weekday)", "Public Holiday (Tamil Thai Pongal)" */
  label: string;
  /** Short badge text: e.g. "Weekday (Fri)", "Public Holiday: Tamil Thai Pongal" */
  badgeText: string;
  /** Specific day or holiday description: e.g. "Friday" or "Tamil Thai Pongal" */
  dayName: string;
  isHoliday: boolean;
  isOverride: boolean;
}

export interface Bundle {
  feeder: Feeder;
  /** When the forecast job ran (06:00 LKT). */
  generatedAt: number;
  /** First slot of the forecast horizon. */
  horizonStart: number;
  /** Day type classification for the prediction horizon. */
  dayType: DayTypeInfo;
  history: HistoryPoint[];
  forecast: ForecastPoint[];
  accuracy: Accuracy;
  kpis: {
    peakMW: number;
    peakAt: number;
    peakLowerMW: number;
    peakUpperMW: number;
    energyMWh: number;
    energyLowerMWh: number;
    energyUpperMWh: number;
    /** Yesterday's actual peak, for the delta card. */
    prevPeakMW: number;
    prevEnergyMWh: number;
    /** Headroom of the P95 peak against firm capacity, %. */
    capacityUtilisation: number;
    minMW: number;
    minAt: number;
    /** Rooftop PV energy generated over the horizon, MWh. */
    solarEnergyMWh: number;
    /** Peak instantaneous rooftop PV output over the horizon, MW. */
    solarPeakMW: number;
  };
}

/** Derive the day type classification for a forecast horizon. */
export function deriveDayType(horizonStart: number, overrides?: PredictionOverrides): DayTypeInfo {
  const hp = localParts(horizonStart);

  if (overrides?.isHoliday === true) {
    return {
      type: "Public Holiday",
      label: "Public Holiday (Override)",
      badgeText: "Public Holiday (Override)",
      dayName: "Public Holiday",
      isHoliday: true,
      isOverride: true,
    };
  }

  const forcedNoHoliday = overrides?.isHoliday === false;
  const isCalHoliday = !forcedNoHoliday && isHoliday(hp);

  if (isCalHoliday) {
    const hName = getHolidayName(hp) ?? "Public Holiday";
    return {
      type: "Public Holiday",
      label: `Public Holiday (${hName})`,
      badgeText: `Public Holiday: ${hName}`,
      dayName: hName,
      isHoliday: true,
      isOverride: false,
    };
  }

  const weekday = overrides?.weekday != null ? overrides.weekday : hp.weekday;
  const isOverride = overrides?.weekday != null || forcedNoHoliday;

  if (weekday === 0) {
    return {
      type: "Sunday",
      label: isOverride ? "Sunday (Override)" : "Sunday (Weekend)",
      badgeText: isOverride ? "Sunday (Override)" : "Sunday (Weekend)",
      dayName: "Sunday",
      isHoliday: false,
      isOverride,
    };
  }

  if (weekday === 6) {
    return {
      type: "Saturday",
      label: isOverride ? "Saturday (Override)" : "Saturday (Weekend)",
      badgeText: isOverride ? "Saturday (Override)" : "Saturday (Weekend)",
      dayName: "Saturday",
      isHoliday: false,
      isOverride,
    };
  }

  const weekdayName = WEEKDAYS[weekday] ?? "Weekday";
  return {
    type: "Weekday",
    label: `${weekdayName} (Weekday${isOverride ? " Override" : ""})`,
    badgeText: `Weekday (${weekdayName}${isOverride ? "*" : ""})`,
    dayName: weekdayName,
    isHoliday: false,
    isOverride,
  };
}

/** The scheduled run time, in local hours. */
export const RUN_HOUR = 6;

export interface PredictionOverrides {
  tempC?: number | null;
  cloud?: number | null;
  isHoliday?: boolean | null;
  weekday?: number | null;
}

function ninetyFifth(residuals: number[]): number {
  if (!residuals.length) return 0;
  const sorted = [...residuals].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(0.95 * sorted.length))];
}

/**
 * Day-ahead forecast for the 24 hours following the next midnight after the
 * 06:00 run, plus the backtest that supports the accuracy indicator and the
 * width of the confidence band.
 */
export function runForecast(feeder: Feeder, now: number, overrides?: PredictionOverrides): Bundle {
  const readings = loadFeederHistory(feeder, { now });
  const parts: LocalParts[] = readings.map((r) => localParts(r.ts));
  const index = new Map<number, number>();
  readings.forEach((r, i) => index.set(r.ts, i));

  const today = startOfLocalDay(now);
  const generatedAt = today + RUN_HOUR * 3600_000;
  // A 06:00 run publishes the following calendar day.
  const horizonStart = today + 86_400_000;
  const originIndex = index.get(horizonStart)!;

  const frame = buildFrame(readings, parts);
  const frameStart = index.get(frame[0].ts)!;

  // Hold out the last 28 complete days before the horizon for evaluation.
  const holdoutDays = 28;
  const holdoutStart = originIndex - holdoutDays * SLOTS_PER_DAY;
  const trainRows = frame.filter((r) => index.get(r.ts)! < holdoutStart);
  const testRows = frame.filter((r) => {
    const i = index.get(r.ts)!;
    return i >= holdoutStart && i < originIndex;
  });

  const evalModel = fitRidge(trainRows);
  const { mape, maeMW, residualsByHour } = backtest(evalModel, testRows, parts, index);

  // Baseline scored on the same held-out window, one day at a time.
  const baselineMape = backtestBaseline(readings, parts, holdoutStart, originIndex);

  // Production model retrains on everything up to the horizon.
  const prodRows = frame.filter((r) => index.get(r.ts)! < originIndex);
  const model = fitRidge(prodRows);

  const baselineProfile = similarDayForecast(
    readings,
    parts,
    originIndex,
    overrides?.weekday ?? parts[originIndex].weekday,
    overrides?.isHoliday ?? isHoliday(parts[originIndex])
  );

  const forecast = predictHorizon(
    model,
    readings,
    parts,
    originIndex,
    residualsByHour,
    baselineProfile,
    overrides
  );

  const historyStart = Math.max(frameStart, originIndex - 30 * SLOTS_PER_DAY);
  const history: HistoryPoint[] = [];
  for (let i = historyStart; i < originIndex; i++) {
    history.push({
      ts: readings[i].ts,
      actual: readings[i].loadMW,
      tempC: readings[i].tempC,
      cloud: readings[i].cloud,
    });
  }

  const dayType = deriveDayType(horizonStart, overrides);

  return {
    feeder,
    generatedAt,
    horizonStart,
    dayType,
    history,
    forecast,
    accuracy: { mape, baselineMape, maeMW, holdoutDays },
    kpis: buildKpis(feeder, forecast, readings, originIndex),
  };
}

/* ------------------------------------------------------------------ */

function predictHorizon(
  model: RidgeModel,
  readings: Reading[],
  parts: LocalParts[],
  originIndex: number,
  residualsByHour: number[],
  baselineProfile: number[],
  overrides?: PredictionOverrides
): ForecastPoint[] {
  const day = SLOTS_PER_DAY;
  const week = 7 * day;

  let rollSum = 0;
  for (let i = originIndex - day; i < originIndex; i++) rollSum += readings[i].loadMW;
  const lag1dRoll = rollSum / day;

  const out: ForecastPoint[] = [];
  for (let s = 0; s < day; s++) {
    const i = originIndex + s;
    const p = parts[i];
    const r = readings[i]; // weather forecast for the horizon — an input, not a target
    
    const tempC = overrides?.tempC ?? r.tempC;
    const cloud = overrides?.cloud ?? r.cloud;
    const isHoliday = overrides?.isHoliday ?? r.isHoliday;
    const weekday = overrides?.weekday ?? p.weekday;

    const x = buildRow({
      decimalHour: p.decimalHour,
      weekday,
      month: p.month,
      isHoliday,
      tempC,
      cloud,
      lag1d: readings[i - day].loadMW,
      lag7d: readings[i - week].loadMW,
      lag1dRoll,
    });
    const expected = Math.max(0, model.predict(x));
    // Interval half-width from the held-out residual spread for this hour,
    // widened slightly with horizon distance.
    const spread = residualsByHour[p.hour] * (1 + 0.18 * (s / day));
    out.push({
      ts: r.ts,
      expected,
      lower: Math.max(0, expected - spread),
      upper: expected + spread,
      baseline: baselineProfile[s],
      tempC,
      cloud,
      solarMW: r.solarMW,
    });
  }
  return smoothBounds(out);
}

/**
 * Interpolate the band edges so the envelope reads as a smooth region rather
 * than a jagged join of 15-minute extremes.
 */
function smoothBounds(points: ForecastPoint[]): ForecastPoint[] {
  const k = [0.15, 0.7, 0.15];
  return points.map((p, i) => {
    let lo = 0;
    let hi = 0;
    for (let o = -1; o <= 1; o++) {
      const q = points[Math.min(points.length - 1, Math.max(0, i + o))];
      lo += k[o + 1] * q.lower;
      hi += k[o + 1] * q.upper;
    }
    return { ...p, lower: lo, upper: hi };
  });
}

function backtest(
  model: RidgeModel,
  rows: FrameRow[],
  parts: LocalParts[],
  index: Map<number, number>
) {
  const byHour: number[][] = Array.from({ length: 24 }, () => []);
  let apeSum = 0;
  let aeSum = 0;
  for (const row of rows) {
    const pred = Math.max(0, model.predict(row.x));
    const err = Math.abs(pred - row.y);
    aeSum += err;
    apeSum += row.y > 0.05 ? err / row.y : 0;
    byHour[parts[index.get(row.ts)!].hour].push(err);
  }
  // 95 % interval half-width per hour of day, lightly smoothed across
  // neighbouring hours so the envelope has no discontinuities on the hour.
  const raw = byHour.map((errs) => ninetyFifth(errs) * 1.15);
  const residualsByHour = raw.map((_, h) => {
    const a = raw[(h + 23) % 24];
    const b = raw[h];
    const c = raw[(h + 1) % 24];
    return 0.25 * a + 0.5 * b + 0.25 * c;
  });
  return {
    mape: (100 * apeSum) / rows.length,
    maeMW: aeSum / rows.length,
    residualsByHour,
  };
}

function backtestBaseline(
  readings: Reading[],
  parts: LocalParts[],
  holdoutStart: number,
  originIndex: number
): number {
  const day = SLOTS_PER_DAY;
  let apeSum = 0;
  let count = 0;
  for (let start = holdoutStart; start + day <= originIndex; start += day) {
    const profile = similarDayForecast(
      readings,
      parts,
      start,
      parts[start].weekday,
      readings[start].isHoliday
    );
    for (let s = 0; s < day; s++) {
      const actual = readings[start + s].loadMW;
      if (actual <= 0.05) continue;
      apeSum += Math.abs(profile[s] - actual) / actual;
      count++;
    }
  }
  return count ? (100 * apeSum) / count : 0;
}

function buildKpis(
  feeder: Feeder,
  forecast: ForecastPoint[],
  readings: Reading[],
  originIndex: number
): Bundle["kpis"] {
  const peak = forecast.reduce((a, b) => (b.expected > a.expected ? b : a));
  const trough = forecast.reduce((a, b) => (b.expected < a.expected ? b : a));
  const hours = QUARTER_MS / 3600_000;

  const day = SLOTS_PER_DAY;
  const yesterday = readings.slice(originIndex - day, originIndex);
  // Behind-the-meter rooftop PV over the same 24h horizon as the load forecast.
  const horizon = readings.slice(originIndex, originIndex + day);

  return {
    peakMW: peak.expected,
    peakAt: peak.ts,
    peakLowerMW: peak.lower,
    peakUpperMW: peak.upper,
    energyMWh: forecast.reduce((a, p) => a + p.expected * hours, 0),
    energyLowerMWh: forecast.reduce((a, p) => a + p.lower * hours, 0),
    energyUpperMWh: forecast.reduce((a, p) => a + p.upper * hours, 0),
    prevPeakMW: Math.max(...yesterday.map((r) => r.loadMW)),
    prevEnergyMWh: yesterday.reduce((a, r) => a + r.loadMW * hours, 0),
    capacityUtilisation: (100 * peak.upper) / capacityMW(feeder),
    minMW: trough.expected,
    minAt: trough.ts,
    solarEnergyMWh: horizon.reduce((a, r) => a + r.solarMW * hours, 0),
    solarPeakMW: horizon.length ? Math.max(...horizon.map((r) => r.solarMW)) : 0,
  };
}

export { mean };
