/**
 * Grid balance — the source.
 *
 * `sampleSystemTick` is a *pure function of the timestamp*. Nothing accumulates,
 * so the same instant always yields the same state, history can be reconstructed
 * by sampling backwards, and RoCoF is a genuine derivative of the frequency
 * series rather than a separately invented number.
 *
 * The dispatch order encodes the product's goal: **solar is taken first and
 * spilled last**. Conventional plant fills whatever demand solar and storage
 * leave behind, down to its minimum stable generation and no further — and when
 * that floor is reached, solar is curtailed. That single constraint is what the
 * whole Headroom tab is about.
 *
 * For v1 the "source" is a physical toy model, the same posture `ingest.ts`
 * takes for feeder load. When a real SCADA/EMS feed lands, this file is the only
 * one that changes.
 */

import { localParts } from "../calendar";
import { BUSES, CONVENTIONAL, UNITS } from "./fleet";
import type {
  BessTick,
  BusTick,
  SourceId,
  SystemTick,
  UnitTick,
} from "./types";

/** System peak demand, MW. Scales the whole model. */
const SYSTEM_PEAK_MW = 1450;

/** Frequency sensitivity to imbalance, Hz per MW. 20 MW ⇒ the 0.05 Hz warning. */
const HZ_PER_MW = 0.0025;

/* ------------------------------------------------------------------ */
/* deterministic smooth noise                                          */

function hash01(n: number): number {
  let a = n >>> 0;
  a = Math.imul(a ^ (a >>> 15), 0x2c1b3c6d);
  a = Math.imul(a ^ (a >>> 12), 0x297a2d39);
  return ((a ^ (a >>> 15)) >>> 0) / 4294967296;
}

/** Value noise in [-1, 1], smoothly interpolated over `periodMs`. */
function noise(ts: number, periodMs: number, seed: number): number {
  const x = ts / periodMs;
  const i = Math.floor(x);
  const f = x - i;
  const a = hash01(i * 374761393 + seed * 668265263);
  const b = hash01((i + 1) * 374761393 + seed * 668265263);
  const s = f * f * (3 - 2 * f);
  return (a + (b - a) * s) * 2 - 1;
}

const bell = (x: number, mu: number, sigma: number) =>
  Math.exp(-((x - mu) ** 2) / (2 * sigma * sigma));

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Piecewise-linear interpolation over `[x, y]` breakpoints. */
function piecewise(points: [number, number][], x: number): number {
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[i + 1];
    if (x >= x0 && x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return points[points.length - 1][1];
}

/* ------------------------------------------------------------------ */
/* weather                                                             */

function weatherAt(ts: number) {
  const p = localParts(ts);
  const h = p.decimalHour;

  // Cloud walks slowly; the two monsoons lift the mean. It is the single most
  // important input in this model — it is what moves solar.
  const monsoon = 0.16 * bell(p.month, 5.5, 1.3) + 0.2 * bell(p.month, 10.5, 1.4);
  const cloud = clamp(0.4 + monsoon + 0.3 * noise(ts, 3 * 3600_000, 11), 0.02, 0.98);

  const seasonMean = 27.4 + 1.9 * Math.cos((2 * Math.PI * (p.dayOfYear - 96)) / 365);
  const diurnal = 3.6 * Math.cos((2 * Math.PI * (h - 14.2)) / 24);
  const tempC = seasonMean + diurnal - 1.6 * (cloud - 0.45) + 1.1 * noise(ts, 6 * 3600_000, 12);

  return { tempC, cloud };
}

/* ------------------------------------------------------------------ */
/* demand                                                             */

function systemLoadMW(ts: number, tempC: number): number {
  const p = localParts(ts);
  const h = p.decimalHour;

  // The national double hump: modest domestic morning, dominant evening peak.
  // The evening peak lands after sunset, which is the whole reason solar
  // penetration is hard.
  const shape =
    0.55 + 0.16 * bell(h, 6.8, 1.2) + 0.12 * bell(h, 12.8, 3.0) + 0.42 * bell(h, 19.5, 2.0);

  const weekday = p.weekday === 0 ? 0.86 : p.weekday === 6 ? 0.95 : 1;
  const cooling = 1 + 0.02 * Math.max(0, tempC - 26);
  const jitter = 1 + 0.009 * noise(ts, 12 * 60_000, 21);

  return SYSTEM_PEAK_MW * shape * weekday * cooling * jitter;
}

/* ------------------------------------------------------------------ */
/* solar and storage                                                   */

/** Clear-sky PV shape, normalised to 1 at solar noon. */
function solarShape(h: number): number {
  if (h <= 6.1 || h >= 18.3) return 0;
  return Math.sin((Math.PI * (h - 6.1)) / 12.2) ** 1.35;
}

/**
 * State of charge over the day, %.
 *
 * The schedule is built for solar: charge through the middle of the day when
 * solar would otherwise be spilled, discharge into the evening peak after the
 * sun has gone. Battery power is derived from the *slope* of this curve rather
 * than specified separately, so power and energy can never disagree.
 */
const SOC_CURVE: [number, number][] = [
  [0, 46],
  [6, 38],
  [9, 36],
  [15, 94],
  [18, 92],
  [22, 32],
  [24, 46],
];

const socAt = (h: number) => piecewise(SOC_CURVE, h);

/** Discharge power implied by the SOC slope, MW. Positive = discharging. */
function batteryPowerMW(h: number, energyMWh: number): number {
  const dt = 0.05; // hours
  const hi = Math.min(24, h + dt);
  const lo = Math.max(0, h - dt);
  const span = hi - lo;
  return span > 0 ? (-(socAt(hi) - socAt(lo)) / 100) * energyMWh / span : 0;
}

/* ------------------------------------------------------------------ */

interface State {
  ts: number;
  loadMW: number;
  interchangeMW: number;
  outputs: Record<string, number>;
  curtailPerUnit: Record<string, number>;
  bySource: Record<SourceId, number>;
  generationMW: number;
  conventionalMW: number;
  solarMW: number;
  /** Solar available before any curtailment, MW. */
  solarPotentialMW: number;
  curtailedMW: number;
  solarHeadroomMW: number;
  imbalanceMW: number;
  frequencyHz: number;
  weather: { tempC: number; cloud: number };
}

function computeState(ts: number): State {
  const p = localParts(ts);
  const h = p.decimalHour;
  const weather = weatherAt(ts);
  const loadMW = systemLoadMW(ts, weather.tempC);

  const outputs: Record<string, number> = {};
  const curtailPerUnit: Record<string, number> = {};
  const running = UNITS.filter((u) => u.status === "running");
  for (const u of UNITS) {
    outputs[u.id] = 0;
    curtailPerUnit[u.id] = 0;
  }

  // 1. Solar is taken first, in full, before anything else is dispatched.
  const clearSky = solarShape(h);
  let solarPotentialMW = 0;
  for (const u of running) {
    if (u.kind !== "solar") continue;
    // Rooftop is spread across the network, so its aggregate sees smoother
    // cloud than a single farm does.
    const spread = u.distributed ? 0.55 : 1;
    const local = 1 + 0.07 * spread * noise(ts, 20 * 60_000, u.id.length + 30);
    const mw = u.capacityMW * clearSky * (1 - 0.78 * spread * weather.cloud) * local;
    outputs[u.id] = Math.max(0, mw);
    solarPotentialMW += outputs[u.id];
  }

  // 2. Storage follows its solar-shaped schedule.
  let batteryMW = 0;
  for (const u of running) {
    if (u.kind !== "battery") continue;
    const mw = clamp(batteryPowerMW(h, u.energyMWh ?? 0), -u.capacityMW, u.capacityMW);
    outputs[u.id] = mw;
    batteryMW += mw;
  }

  // 3. Scheduled tie-line flow, load-following so the tie is never exporting
  //    hard into the evening peak.
  const loadNorm = loadMW / SYSTEM_PEAK_MW;
  const interchangeMW = clamp(
    30 + 90 * noise(ts, 75 * 60_000, 55) + 150 * (loadNorm - 0.72),
    -100,
    220
  );

  // 4. A small AGC tracking lag — that lag is what becomes the imbalance,
  //    rather than being bolted on afterwards.
  const lag = 0.017 * noise(ts, 4 * 60_000, 61);
  const demand = loadMW * (1 + lag);

  // 5. The minimum-generation constraint, and the curtailment it forces.
  //
  //    Room for solar is whatever demand is left once must-run plant is at its
  //    floor and storage and the tie have taken their share. When solar exceeds
  //    that room it is spilled — and only *dispatchable* solar can be spilled,
  //    because rooftop PV sits behind the meter and takes no instruction. That
  //    asymmetry is the hard part of the penetration problem, so the model
  //    keeps it rather than smoothing it away.
  const roomForSolarMW = demand - CONVENTIONAL.floorMW - batteryMW - interchangeMW;
  const solarHeadroomMW = roomForSolarMW - solarPotentialMW;

  let solarMW = solarPotentialMW;
  let curtailedMW = 0;
  if (solarHeadroomMW < 0) {
    const dispatchable = running.filter((u) => u.kind === "solar" && !u.distributed);
    const spillable = dispatchable.reduce((a, u) => a + outputs[u.id], 0);
    curtailedMW = Math.min(-solarHeadroomMW, spillable);
    const factor = spillable > 0 ? (spillable - curtailedMW) / spillable : 1;
    for (const u of dispatchable) {
      curtailPerUnit[u.id] = outputs[u.id] * (1 - factor);
      outputs[u.id] *= factor;
    }
    solarMW = solarPotentialMW - curtailedMW;
  }

  // 6. Conventional plant fills what is left, bounded by its floor and cap.
  const conventionalMW = clamp(
    demand - solarMW - batteryMW - interchangeMW,
    CONVENTIONAL.floorMW,
    CONVENTIONAL.capMW
  );

  const generationMW = conventionalMW + solarMW + batteryMW;
  const imbalanceMW = generationMW + interchangeMW - loadMW;

  const frequencyHz =
    50 + HZ_PER_MW * imbalanceMW + 0.012 * noise(ts, 5_000, 71) + 0.006 * noise(ts, 1_400, 72);

  return {
    ts,
    loadMW,
    interchangeMW,
    outputs,
    curtailPerUnit,
    bySource: {
      conventional: conventionalMW,
      solar: solarMW,
      battery: batteryMW,
      import: interchangeMW,
    },
    generationMW,
    conventionalMW,
    solarMW,
    solarPotentialMW,
    curtailedMW,
    solarHeadroomMW,
    imbalanceMW,
    frequencyHz,
    weather,
  };
}

/* ------------------------------------------------------------------ */
/* public sampling                                                     */

/** Synchronous inertia, which falls as conventional plant backs off for solar. */
function inertiaGWs(conventionalMW: number): number {
  return (
    CONVENTIONAL.inertiaAtFloorGWs +
    Math.max(0, conventionalMW - CONVENTIONAL.floorMW) * CONVENTIONAL.inertiaPerMWGWs
  );
}

/** The system tick. RoCoF is differentiated from the frequency one second back. */
export function sampleSystemTick(ts: number): SystemTick {
  const now = computeState(ts);
  const prev = computeState(ts - 1000);

  return {
    ts,
    frequencyHz: now.frequencyHz,
    rocofHzPerS: now.frequencyHz - prev.frequencyHz,
    generationMW: now.generationMW,
    loadMW: now.loadMW,
    interchangeMW: now.interchangeMW,
    imbalanceMW: now.imbalanceMW,
    inertiaGWs: inertiaGWs(now.conventionalMW),
    solarMW: now.solarMW,
    curtailedMW: now.curtailedMW,
    solarHeadroomMW: now.solarHeadroomMW,
    conventionalMW: now.conventionalMW,
    conventionalFloorMW: CONVENTIONAL.floorMW,
    bySource: now.bySource,
    weather: now.weather,
  } as SystemTick;
}

/** Per-unit telemetry, batteries included (narrowed at the call site). */
export function sampleUnitTicks(ts: number): (UnitTick | BessTick)[] {
  const state = computeState(ts);
  const h = localParts(ts).decimalHour;
  const clearSky = solarShape(h);

  return UNITS.map((u): UnitTick | BessTick => {
    const outputMW = state.outputs[u.id] ?? 0;
    const offline = u.status !== "running";
    const curtailedMW = state.curtailPerUnit[u.id] ?? 0;

    if (u.kind === "solar") {
      // A solar farm's headroom is what the resource would give if the grid
      // would take it — which at night is nothing, and at noon is whatever is
      // being spilled.
      return {
        unitId: u.id,
        ts,
        outputMW,
        reactiveMVAr: offline ? 0 : outputMW * 0.04,
        availableUpMW: offline ? 0 : curtailedMW,
        availableDownMW: offline || u.distributed ? 0 : outputMW,
        curtailedMW,
        status: u.status,
      };
    }

    const base: UnitTick = {
      unitId: u.id,
      ts,
      outputMW,
      reactiveMVAr: offline ? 0 : outputMW * (0.14 + 0.05 * noise(ts, 8 * 60_000, u.id.length)),
      availableUpMW: 0,
      availableDownMW: 0,
      curtailedMW: 0,
      status: u.status,
    };

    const socPct = socAt(h);
    const cellTempC =
      26 + 6 * Math.abs(outputMW) / u.capacityMW + 2 * noise(ts, 30 * 60_000, 81) + 3 * clearSky;
    const sohPct = u.id === "colombo_bess" ? 94.2 : 91.2;
    const flags: string[] = [];
    if (sohPct < 90) flags.push("Capacity fade > 10 %");
    if (cellTempC > 38) flags.push("Cell temperature high");

    return {
      ...base,
      // Bounded by energy as well as power: it cannot discharge when empty or
      // absorb more solar when full.
      availableUpMW: offline || socPct <= 5 ? 0 : u.capacityMW - outputMW,
      availableDownMW: offline || socPct >= 95 ? 0 : u.capacityMW + outputMW,
      socPct,
      sohPct,
      cellTempC,
      roundTripEff: u.id === "colombo_bess" ? 0.882 : 0.861,
      flags,
    };
  });
}

/**
 * Bus telemetry.
 *
 * Voltage rise and reverse flow are the *distribution-side* limit on solar:
 * long before the system runs out of room, an individual feeder runs out of
 * volts. Buses with more installed solar see both effects more strongly.
 */
export function sampleBusTicks(ts: number): BusTick[] {
  const state = computeState(ts);
  const loading = state.loadMW / SYSTEM_PEAK_MW;
  const solarShareOfInstalled =
    state.solarMW / Math.max(1, UNITS.filter((u) => u.kind === "solar").reduce((a, u) => a + u.capacityMW, 0));

  return BUSES.map((b, i) => {
    // Local solar output, scaled from the system-wide share.
    const localSolarMW = b.solarMW * solarShareOfInstalled;
    // Rough local demand share, proportional to nothing in particular but
    // stable per bus — enough to make reverse flow behave sensibly.
    const localLoadMW = state.loadMW * (0.06 + 0.02 * hash01(i * 977));
    const reverseFlowMW = localSolarMW - localLoadMW;

    // Monaragala is the weak point: long rural feeder, heaviest solar. It only
    // gets tight under load and back-feed, not permanently.
    const weak = b.id === "monaragala";
    const voltagePu =
      1.002 -
      (weak ? 0.055 : 0.02) * loading +
      // Back-feed pushes voltage up — the classic high-penetration failure.
      0.00042 * Math.max(0, reverseFlowMW) +
      0.007 * noise(ts, 4 * 60_000, 90 + i);

    const stabilityMarginPct = clamp(
      (weak ? 34 : 46) - 20 * loading - 0.05 * Math.max(0, reverseFlowMW) +
        3 * noise(ts, 9 * 60_000, 100 + i),
      0,
      60
    );

    return { busId: b.id, ts, voltagePu, stabilityMarginPct, reverseFlowMW };
  });
}

/** Sample a series backwards from `to`, for reconstructing chart history. */
export function sampleSystemSeries(from: number, to: number, stepMs: number): SystemTick[] {
  const out: SystemTick[] = [];
  for (let ts = from; ts <= to; ts += stepMs) out.push(sampleSystemTick(ts));
  return out;
}

export { SYSTEM_PEAK_MW };
