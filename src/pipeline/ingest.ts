/**
 * Stage 1 — ingestion.
 *
 * Reads a source and emits the canonical reading schema. For v1 the "source" is
 * a synthetic generator; when the LECO feed lands, `loadFeederHistory` is the
 * single function that changes. Everything downstream consumes `Reading[]`.
 *
 * The generator is a parametric model:
 *   load = base × shape(hour) × weekday × season × weather × holiday
 *          − rooftop solar + AR(1) noise
 * seeded per feeder, so the demo is byte-identical on every reload.
 */

import {
  QUARTER_MS,
  SLOTS_PER_DAY,
  isHoliday,
  localParts,
  startOfLocalDay,
} from "./calendar";
import { capacityMW, type Feeder } from "./feeders";

/** Canonical schema every downstream stage reads. */
export interface Reading {
  ts: number;
  /** Net load at the feeder head, MW (what the meter actually sees). */
  loadMW: number;
  /** Dry-bulb temperature, °C. */
  tempC: number;
  /** Cloud cover fraction, 0 = clear. */
  cloud: number;
  /** Modelled rooftop PV output behind the meter, MW. */
  solarMW: number;
  isHoliday: boolean;
}

/* ------------------------------------------------------------------ */
/* deterministic PRNG                                                  */

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box–Muller, drawing from a supplied uniform source. */
function gaussian(rand: () => number) {
  const u = Math.max(rand(), 1e-9);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

const bell = (x: number, mu: number, sigma: number) =>
  Math.exp(-((x - mu) ** 2) / (2 * sigma * sigma));

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/* ------------------------------------------------------------------ */
/* load shape                                                          */

/**
 * Normalised gross demand by hour of day, before solar is netted off.
 * Residential is the classic Sri Lankan double hump: a modest 05:30–06:30
 * domestic peak and the dominant 18:30–22:30 evening peak.
 */
function grossShape(profile: Feeder["profile"], h: number): number {
  if (profile === "residential") {
    return (
      0.54 +
      0.20 * bell(h, 6.7, 1.15) +
      0.13 * bell(h, 12.8, 2.8) +
      0.46 * bell(h, 19.6, 1.95) +
      0.10 * bell(h, 21.6, 1.7)
    );
  }
  // Industrial + commercial: a broad shift plateau with an evening domestic tail.
  const shift = smoothstep(5.4, 8.0, h) * (1 - smoothstep(15.5, 18.5, h));
  return (
    0.56 +
    0.40 * shift +
    0.05 * bell(h, 12.5, 1.8) +
    0.38 * bell(h, 19.5, 1.9)
  );
}

/** Normalised rooftop PV output by hour of day (clear sky). */
function solarShape(h: number): number {
  if (h <= 6.1 || h >= 18.3) return 0;
  return Math.sin((Math.PI * (h - 6.1)) / 12.2) ** 1.35;
}

const weekdayFactor = (profile: Feeder["profile"], weekday: number) => {
  if (profile === "residential") return weekday === 0 ? 0.65 : weekday === 6 ? 0.94 : 1;
  return weekday === 0 ? 0.40 : weekday === 6 ? 0.84 : 1;
};

/* ------------------------------------------------------------------ */

export interface HistoryOptions {
  /** Instant the history ends at (exclusive of partially-complete slots). */
  now: number;
  /** How many days of 15-minute history to synthesise. */
  days?: number;
}

/**
 * Twelve months of 15-minute readings for one feeder.
 *
 * Weather is generated first as its own series (daily mean temperature and
 * cloud both follow AR(1) walks with seasonal means) so that load can depend on
 * it — the same causal direction the real feeder has.
 */
export function loadFeederHistory(feeder: Feeder, opts: HistoryOptions): Reading[] {
  const days = opts.days ?? 365;
  const rand = mulberry32(feeder.seed);

  // Forecast horizon needs one extra day of weather beyond the history end.
  const endDay = startOfLocalDay(opts.now) + 2 * 86_400_000;
  const startDay = endDay - (days + 2) * 86_400_000;

  // The synthetic feeder is sized to typical medium-voltage utility loading,
  // keeping peaks below firm capacity while still showing the seasonal and
  // diurnal shape expected in field telemetry.
  const peakMW = capacityMW(feeder) * (feeder.profile === "industrial" ? 0.66 : 0.6);
  // Rooftop PV is sized against the feeder's own peak and is deliberately
  // strong enough to create a visible midday dip on higher-penetration feeders.
  const solarPeak = peakMW * Math.min(0.4, feeder.solarPenetration * 1.4 + 0.06);

  const readings: Reading[] = [];
  let tempAnom = 0;
  let cloudState = 0.45;
  let noise = 0;

  for (let ts = startDay; ts < endDay; ts += QUARTER_MS) {
    const p = localParts(ts);
    const newDay = p.hour === 0 && p.minute === 0;

    if (newDay) {
      tempAnom = 0.72 * tempAnom + 1.15 * gaussian(rand);
      // Sri Lanka's two monsoons: cloudier May–Jun and Oct–Nov.
      const monsoon =
        0.16 * bell(p.month, 5.5, 1.3) + 0.20 * bell(p.month, 10.5, 1.4);
      cloudState = Math.min(
        0.97,
        Math.max(0.03, 0.55 * cloudState + 0.45 * (0.34 + monsoon + 0.22 * gaussian(rand)))
      );
    }

    const h = p.decimalHour;
    const holiday = isHoliday(p);

    // Seasonal mean temperature: warmest around March–April.
    const seasonMean =
      27.4 + 1.9 * Math.cos((2 * Math.PI * (p.dayOfYear - 96)) / 365);
    const diurnal = 3.6 * Math.cos((2 * Math.PI * (h - 14.2)) / 24);
    const tempC = seasonMean + diurnal + tempAnom - 1.6 * (cloudState - 0.45);

    const clearSky = solarShape(h);
    const solarMW = solarPeak * clearSky * (1 - 0.78 * cloudState);

    // Cooling response: load lifts once it is warmer than ~26 °C, and the
    // response is strongest in the afternoon and evening when people are home.
    const coolingWindow = 0.35 + 0.65 * smoothstep(10, 15, h) * (1 - smoothstep(22, 24.5, h));
    const weather = 1 + 0.026 * Math.max(0, tempC - 26) * coolingWindow;

    const season = 1 + 0.055 * Math.cos((2 * Math.PI * (p.dayOfYear - 96)) / 365);
    const holidayFactor = holiday
      ? feeder.profile === "residential"
        ? 0.88
        : 0.74
      : 1;

    noise = 0.86 * noise + 0.0125 * gaussian(rand);

    const gross =
      peakMW *
      grossShape(feeder.profile, h) *
      weekdayFactor(feeder.profile, p.weekday) *
      season *
      weather *
      holidayFactor;

    const loadMW = Math.max(0.05 * peakMW, gross - solarMW) * (1 + noise);

    readings.push({
      ts,
      loadMW: Math.round(loadMW * 1000) / 1000,
      tempC: Math.round(tempC * 10) / 10,
      cloud: Math.round(cloudState * 100) / 100,
      solarMW: Math.round(solarMW * 1000) / 1000,
      isHoliday: holiday,
    });
  }

  return readings;
}

export { SLOTS_PER_DAY };
