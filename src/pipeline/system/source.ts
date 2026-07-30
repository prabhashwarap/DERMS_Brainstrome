/**
 * Feeder balance — the source.
 *
 * `sampleSystemTick` is a *pure function of the timestamp*. Nothing accumulates,
 * so the same instant always yields the same state, history can be reconstructed
 * by sampling backwards, and RoCoF is a genuine derivative of the frequency
 * series rather than a separately invented number.
 *
 * The dispatch order encodes the product's goal: **rooftop PV is taken first and
 * curtailed last**. Storage soaks what feeder demand cannot, the primary infeed
 * carries whatever is left over in either direction, and only when the export
 * limit is reached does PV get curtailed — and then only the DERMS-enrolled
 * inverters, because legacy net-metered installations take no instruction. That
 * single constraint is what the whole dashboard is about.
 *
 * Frequency and inertia are the exception to all of the above: they are national
 * grid quantities, modelled exogenously and merely observed here. A distribution
 * feeder of 12 MW does not move the frequency of a 2,500 MW island system, and
 * deriving one from the other would be a lie the numbers would eventually tell.
 *
 * Every sampler takes a feeder id. The feeders in the register are different
 * networks — different load shape, assets, limits and conductor — so the model is
 * genuinely re-evaluated per feeder rather than rescaled.
 *
 * For v1 the "source" is a physical toy model, the same posture `ingest.ts`
 * takes for feeder load. When a real AMI/SCADA feed lands, this file is the only
 * one that changes.
 */

import { localParts } from "../calendar";
import { evShape } from "../der";
import {
  DEFAULT_FEEDER_ID,
  NATIONAL_GRID,
  evEnrolledShare,
  feederModel,
  hasStorage,
} from "./fleet";
import type {
  BessTick,
  BusTick,
  FeederModel,
  SourceId,
  SystemTick,
  UnitTick,
} from "./types";

/**
 * PV system derate: inverter efficiency, cabling and soiling.
 *
 * Applied on top of the temperature derate below, so a clear Colombo noon lands
 * at ~0.80 of nameplate — which is what a Sri Lankan rooftop fleet delivers.
 */
const PV_SYSTEM_DERATE = 0.94;

/** Module temperature coefficient of power, per °C above 25 °C. */
const PV_TEMP_COEFF = 0.0038;

/** Statutory MV voltage band, ± pu. PUCSL distribution licence condition. */
const MV_VOLTAGE_BAND_PU = 0.05;

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
  // important input in this model — it is what moves PV. A feeder spans a few
  // kilometres, so cloud edges are partly averaged out — but only partly, which
  // is why it still walks faster here than across an island.
  const monsoon = 0.16 * bell(p.month, 5.5, 1.3) + 0.2 * bell(p.month, 10.5, 1.4);
  const cloud = clamp(0.4 + monsoon + 0.3 * noise(ts, 110 * 60_000, 11), 0.02, 0.98);

  const seasonMean = 27.4 + 1.9 * Math.cos((2 * Math.PI * (p.dayOfYear - 96)) / 365);
  const diurnal = 3.6 * Math.cos((2 * Math.PI * (h - 14.2)) / 24);
  const tempC = seasonMean + diurnal - 1.6 * (cloud - 0.45) + 1.1 * noise(ts, 6 * 3600_000, 12);

  return { tempC, cloud };
}

/* ------------------------------------------------------------------ */
/* demand                                                             */

/**
 * Non-EV base demand, MW.
 *
 * A distribution feeder is not a national load curve, and the feeders in the
 * register are not each other's curve either — the humps come from the feeder
 * record, so an industrial feeder genuinely peaks at one o'clock and a
 * residential one genuinely peaks after dark. The gap between a residential
 * evening peak and the midday PV surplus is the entire reason such a feeder needs
 * storage; on an industrial feeder that gap does not exist, and neither does the
 * need.
 *
 * Weekends move in opposite directions by design: domestic occupancy rises when
 * people are at home, and an industrial estate shuts.
 */
function baseLoadMW(f: FeederModel, ts: number, tempC: number): number {
  const p = localParts(ts);
  const h = p.decimalHour;

  const hump = ([amp, mu, sigma]: readonly [number, number, number]) => amp * bell(h, mu, sigma);
  const shape =
    f.baseShare + hump(f.morningHump) + hump(f.middayHump) + hump(f.eveningHump);

  const weekend = p.weekday === 0 ? f.weekend[0] : p.weekday === 6 ? f.weekend[1] : 1;
  // Split-unit air conditioning in the Colombo suburbs is real and it is the
  // reason the peak moves with temperature at all. A commercial way is more
  // exposed to it than a domestic one.
  const cooling = 1 + f.coolingCoeff * Math.max(0, tempC - 26);
  // Thousands of consumers give a lot of diversity, so a feeder trace is close to
  // smooth — the residual wobble is metering noise, not load.
  const jitter = 1 + f.jitterAmp * noise(ts, 9 * 60_000, 21 + f.seed);

  return f.basePeakMW * shape * weekend * cooling * jitter;
}

/**
 * EV charging on the feeder, managed and unmanaged, MW.
 *
 * The uncontrolled shape is the after-diversity demand of the whole charger
 * population. DERMS V1G then moves the enrolled domestic units — kerbside and
 * DC public units are not enrolled and are not touched — soaking the midday PV
 * surplus and standing down through the evening peak. The enrolled share bounds
 * how much can be shifted, so the flexibility can never exceed the hardware that
 * provides it.
 */
function evLoadMW(f: FeederModel, ts: number): { managedMW: number; unmanagedMW: number } {
  const h = localParts(ts).decimalHour;
  const unmanagedMW = f.ev.diversifiedPeakMW * evShape(ts, f.ev.profile);

  // Solar-soak window and evening-peak stand-down, as fractions of the enrolled
  // load. A charger deferred out of the peak has to charge somewhere, which is
  // why the midday gain and the evening reduction are of similar size.
  const flex = h >= 10 && h <= 14.5 ? 0.42 : h >= 18.5 && h <= 21.5 ? -0.38 : 0;

  return {
    managedMW: unmanagedMW * (1 + evEnrolledShare(f.ev) * flex),
    unmanagedMW,
  };
}

/* ------------------------------------------------------------------ */
/* rooftop PV and storage                                             */

/** Clear-sky PV shape for 6.9° N, normalised to 1 at solar noon. */
function solarShape(h: number): number {
  if (h <= 6.1 || h >= 18.3) return 0;
  return Math.sin((Math.PI * (h - 6.1)) / 12.2) ** 1.35;
}

/**
 * State of charge over the day, %.
 *
 * Tuned to the LECO time-of-use tariff and to what feeder-level storage is
 * actually for:
 * - Off-peak window (22:30–05:30): cheap grid charge back up to ~86 %
 * - Morning peak (05:30–08:00): discharge into the domestic morning ramp
 * - Late morning (08:00–11:00): draw down to make room for the PV surplus
 * - Solar soak (11:00–15:30): charge to 96 % on rooftop PV that would otherwise
 *   push the tail-end node past +5 %
 * - Pre-peak hold (15:30–18:30): sit high, waiting
 * - Evening peak (18:30–22:30): peak-shaving discharge to 16 %
 *
 * Battery power is derived from the *slope* of this curve rather than specified
 * separately, so power and energy can never disagree. Every segment stays inside
 * the unit's power rating — the steepest is the evening discharge, at about
 * 0.19 C on a two-hour battery.
 */
const SOC_CURVE: [number, number][] = [
  [0, 58],
  [5, 86],
  [8, 60],
  [11, 48],
  [15.5, 96],
  [18.5, 93],
  [22.5, 16],
  [24, 34],
];

export const socAt = (h: number) => piecewise(SOC_CURVE, h);

/** Discharge power implied by the SOC slope & RTE, MW. Positive = discharging. */
function batteryPowerMW(h: number, energyMWh: number, rte = 0.9): number {
  const dt = 0.05; // hours
  const hi = Math.min(24, h + dt);
  const lo = Math.max(0, h - dt);
  const span = hi - lo;
  if (span <= 0) return 0;
  const dSoc = socAt(hi) - socAt(lo);
  const internalPowerMW = -(dSoc / 100) * energyMWh / span;
  const eta = Math.sqrt(rte);
  return internalPowerMW > 0 ? internalPowerMW * eta : internalPowerMW / eta;
}

/* ------------------------------------------------------------------ */
/* national grid — observed, not derived                               */

/**
 * National grid system frequency, Hz.
 *
 * Exogenous by construction. Sri Lanka is a small island system and its
 * frequency genuinely wanders further than an interconnected one: excursions
 * past ±0.05 Hz are routine, past ±0.15 Hz are not. Three noise scales give the
 * slow drift, the dispatch-interval steps and the second-to-second ripple.
 */
function nationalFrequencyHz(ts: number): number {
  return (
    50 +
    0.018 * noise(ts, 11 * 60_000, 71) +
    0.008 * noise(ts, 45_000, 72) +
    0.002 * noise(ts, 2_500, 73)
  );
}

/**
 * Synchronous inertia on the national grid system, GW·s.
 *
 * Falls through the middle of the day as utility and rooftop solar displace
 * spinning plant nationally — the reason a distribution operator watches a
 * transmission quantity at all.
 */
function nationalInertiaGWs(ts: number): number {
  const h = localParts(ts).decimalHour;
  return (
    NATIONAL_GRID.inertiaNightGWs -
    NATIONAL_GRID.inertiaSolarDisplacementGWs * solarShape(h) +
    0.11 * noise(ts, 20 * 60_000, 77)
  );
}

/* ------------------------------------------------------------------ */

interface State {
  ts: number;
  loadMW: number;
  evMW: number;
  evUnmanagedMW: number;
  outputs: Record<string, number>;
  curtailPerUnit: Record<string, number>;
  bySource: Record<SourceId, number>;
  generationMW: number;
  gridImportMW: number;
  transformerFlowMW: number;
  solarMW: number;
  /** PV available before any curtailment, MW. */
  solarPotentialMW: number;
  curtailedMW: number;
  solarHeadroomMW: number;
  batteryMW: number;
  socPct: number;
  imbalanceMW: number;
  frequencyHz: number;
  weather: { tempC: number; cloud: number };
}

function computeState(f: FeederModel, ts: number): State {
  const p = localParts(ts);
  const h = p.decimalHour;
  const weather = weatherAt(ts);

  const ev = evLoadMW(f, ts);
  const loadMW = baseLoadMW(f, ts, weather.tempC) + ev.managedMW;

  const outputs: Record<string, number> = {};
  const curtailPerUnit: Record<string, number> = {};
  const running = f.units.filter((u) => u.status === "running");
  for (const u of f.units) {
    outputs[u.id] = 0;
    curtailPerUnit[u.id] = 0;
  }

  // 1. Rooftop PV is taken first, in full, before anything else is dispatched.
  const clearSky = solarShape(h);
  // Modules run well above ambient in Colombo; the derate is worth about 8 % of
  // output at the middle of a clear day and is why measured peaks sit below kWp.
  const cellTempC = weather.tempC + 25 * clearSky;
  const tempDerate = 1 - PV_TEMP_COEFF * Math.max(0, cellTempC - 25);
  let solarPotentialMW = 0;
  for (const u of running) {
    if (u.kind !== "solar") continue;
    // Clusters spread over kilometres of feeder, so cloud edges are partly
    // averaged out — but only partly, which is why the local term is still large
    // next to what a national model would use.
    const spread = u.distributed ? 0.9 : 1;
    const local = 1 + 0.1 * spread * noise(ts, 9 * 60_000, u.id.length + 30 + f.seed);
    const mw =
      u.capacityMW *
      clearSky *
      (1 - 0.78 * spread * weather.cloud) *
      tempDerate *
      PV_SYSTEM_DERATE *
      local;
    outputs[u.id] = Math.max(0, mw);
    solarPotentialMW += outputs[u.id];
  }

  // 2. Storage follows its tariff- and solar-shaped schedule, within RTE bounds.
  let batteryMW = 0;
  for (const u of running) {
    if (u.kind !== "battery") continue;
    const mw = clamp(batteryPowerMW(h, u.energyMWh ?? 0, 0.9), -u.capacityMW, u.capacityMW);
    outputs[u.id] = mw;
    batteryMW += mw;
  }

  // 3. The export limit, and the curtailment it forces.
  //
  //    Room for PV is feeder demand plus whatever the network can push back up to
  //    the primary before the reverse-power setting binds, less whatever storage
  //    is already taking. When PV exceeds that room it is curtailed by volt-watt
  //    response — and only the *DERMS-enrolled* inverters respond, because legacy
  //    net-metered installations sit behind the meter and take no instruction.
  //    That asymmetry is the hard part of the penetration problem, so the model
  //    keeps it rather than smoothing it away.
  const exportLimitMW = f.exportLimitMW;
  const roomForSolarMW = loadMW + exportLimitMW - batteryMW;
  const solarHeadroomMW = roomForSolarMW - solarPotentialMW;

  let solarMW = solarPotentialMW;
  let curtailedMW = 0;
  if (solarHeadroomMW < 0) {
    const controllable = running.filter((u) => u.kind === "solar" && !u.distributed);
    const spillable = controllable.reduce((a, u) => a + outputs[u.id], 0);
    curtailedMW = Math.min(-solarHeadroomMW, spillable);
    const factor = spillable > 0 ? (spillable - curtailedMW) / spillable : 1;
    for (const u of controllable) {
      curtailPerUnit[u.id] = outputs[u.id] * (1 - factor);
      outputs[u.id] *= factor;
    }
    solarMW = solarPotentialMW - curtailedMW;
  }

  // 4. The primary infeed carries the residual, in whichever direction it falls.
  //    Unlike a generator it has no minimum output: it follows demand exactly,
  //    down through zero and into export up to the primary substation.
  const transformerFlowMW = clamp(loadMW - solarMW - batteryMW, -exportLimitMW, f.firmMW);

  const generationMW = solarMW + Math.max(0, batteryMW);
  const imbalanceMW = solarMW + batteryMW + transformerFlowMW - loadMW;

  return {
    ts,
    loadMW,
    evMW: ev.managedMW,
    evUnmanagedMW: ev.unmanagedMW,
    outputs,
    curtailPerUnit,
    bySource: {
      // The three terms sum to demand exactly, so the stack and the demand line
      // on the chart cannot disagree. Storage is signed and stays its own term:
      // a battery charging on the midday surplus is negative supply, and folding
      // it into the grid term would cancel both to nothing.
      solar: solarMW,
      battery: batteryMW,
      grid: transformerFlowMW,
    },
    generationMW,
    gridImportMW: Math.max(0, transformerFlowMW),
    transformerFlowMW,
    solarMW,
    solarPotentialMW,
    curtailedMW,
    solarHeadroomMW,
    batteryMW,
    // A feeder with no storage has no state of charge. Reporting the schedule
    // anyway would put a plausible number on a cabinet that does not exist.
    socPct: hasStorage(f) ? socAt(h) : 0,
    imbalanceMW,
    frequencyHz: nationalFrequencyHz(ts),
    weather,
  };
}

/* ------------------------------------------------------------------ */
/* public sampling                                                     */

/**
 * The feeder tick. RoCoF is differentiated from the frequency one second back.
 *
 * `feederId` defaults so that a caller who has not yet chosen still gets a valid
 * feeder rather than a crash, but every caller on the dashboard passes one — the
 * selector would be decoration otherwise.
 */
export function sampleSystemTick(ts: number, feederId: string = DEFAULT_FEEDER_ID): SystemTick {
  const f = feederModel(feederId);
  const now = computeState(f, ts);

  return {
    ts,
    frequencyHz: now.frequencyHz,
    rocofHzPerS: now.frequencyHz - nationalFrequencyHz(ts - 1000),
    generationMW: now.generationMW,
    loadMW: now.loadMW,
    transformerFlowMW: now.transformerFlowMW,
    transformerLoadingPct: (100 * Math.abs(now.transformerFlowMW)) / f.firmMW,
    imbalanceMW: now.imbalanceMW,
    inertiaGWs: nationalInertiaGWs(ts),
    solarMW: now.solarMW,
    curtailedMW: now.curtailedMW,
    solarHeadroomMW: now.solarHeadroomMW,
    gridImportMW: now.gridImportMW,
    gridExportLimitMW: f.exportLimitMW,
    batteryMW: now.batteryMW,
    socPct: now.socPct,
    evMW: now.evMW,
    evUnmanagedMW: now.evUnmanagedMW,
    bySource: now.bySource,
    weather: now.weather,
  };
}

/** Per-unit telemetry, the battery included (narrowed at the call site). */
export function sampleUnitTicks(
  ts: number,
  feederId: string = DEFAULT_FEEDER_ID
): (UnitTick | BessTick)[] {
  const f = feederModel(feederId);
  const state = computeState(f, ts);
  const h = localParts(ts).decimalHour;

  return f.units.map((u): UnitTick | BessTick => {
    const outputMW = state.outputs[u.id] ?? 0;
    const offline = u.status !== "running";
    const curtailedMW = state.curtailPerUnit[u.id] ?? 0;

    if (u.kind === "solar") {
      // A PV cluster's headroom is what the resource would give if the network
      // would take it — at night nothing, at noon whatever is being curtailed.
      return {
        unitId: u.id,
        ts,
        outputMW,
        // Rooftop inverters run near unity power factor unless volt-var is
        // active, which on this feeder it is not.
        reactiveMVAr: offline ? 0 : outputMW * 0.02,
        availableUpMW: offline ? 0 : curtailedMW,
        availableDownMW: offline || u.distributed ? 0 : outputMW,
        curtailedMW,
        status: u.status,
      };
    }

    const rte = 0.9;
    // A 2023-commissioned LFP unit, lightly cycled: capacity fade is small.
    const sohPct = 96.4;
    const usableEnergyMWh = (u.energyMWh ?? 0) * (sohPct / 100);
    const socPct = Math.round(socAt(h) * 10) / 10;

    // Autonomous droop response to national frequency: a 0.05 Hz deadband, then
    // a standard 4 % droop — full rated power would need a 2 Hz deviation, which
    // is why the answer is always a small fraction of the rating. A 4 MW unit can
    // only ever contribute a few hundred kW to a 2,500 MW system, and saying so is
    // the point: it is a real service at distribution scale, not a
    // transmission-sized one.
    const freqDev = state.frequencyHz - 50.0;
    const deadbandHz = 0.05;
    const droopMW =
      Math.abs(freqDev) > deadbandHz
        ? (-u.capacityMW * (freqDev - Math.sign(freqDev) * deadbandHz)) / (0.04 * 50)
        : 0;
    const netOutputMW = clamp(outputMW + droopMW, -u.capacityMW, u.capacityMW);

    // C-rate against rated energy — the number that says whether the duty is
    // gentle. This schedule never exceeds about 0.2 C.
    const cRate = Math.round((Math.abs(netOutputMW) / (u.energyMWh ?? 1)) * 100) / 100;

    // Thermal physics with the unit's own chiller responding in stages. A
    // container in Colombo sits in 27–33 °C ambient all year, so the HVAC is the
    // thing keeping the cells alive.
    const ambC = state.weather.tempC;
    const jHeating = 9 * Math.pow(Math.abs(netOutputMW) / u.capacityMW, 1.35);
    const rawTemp = ambC + jHeating + 1.2 * noise(ts, 25 * 60_000, u.id.length + 80 + f.seed);

    let cellTempC = rawTemp;
    let hvacStatus: "Off" | "Stage 1 (Eco)" | "Stage 2 (Max)" = "Off";
    if (rawTemp >= 34) {
      hvacStatus = "Stage 2 (Max)";
      cellTempC = 26 + 0.25 * (rawTemp - 26);
    } else if (rawTemp >= 28) {
      hvacStatus = "Stage 1 (Eco)";
      cellTempC = 25 + 0.45 * (rawTemp - 25);
    } else {
      hvacStatus = "Off";
      cellTempC = rawTemp;
    }
    cellTempC = Math.round(cellTempC * 10) / 10;

    // Dead band scaled to the unit rather than fixed: 4 % of rating is a real
    // standby window on any size of battery, where a hardcoded threshold would be
    // meaningless on one and the whole output on another.
    const standbyMW = 0.04 * u.capacityMW;
    let mode: BessTick["mode"] = "Standby";
    if (netOutputMW < -standbyMW) {
      mode = h >= 10.5 && h <= 16 ? "Solar Soak Charging" : "Night Grid Top-Up";
    } else if (netOutputMW > standbyMW) {
      mode = "Evening Peak Discharge";
    } else if (Math.abs(freqDev) > 0.03) {
      mode = "FFR Frequency Support";
    }

    const flags: string[] = [];
    if (sohPct < 92) flags.push("Capacity fade > 8%");
    if (cellTempC > 37) flags.push("High cell temp (HVAC Stage 2)");
    if (cRate > 0.45) flags.push("High C-rate operational stress");
    if (socPct > 95) flags.push("Solar soak buffer full (SoC > 95%)");
    if (socPct < 15) flags.push("Low reserve warning (SoC < 15%)");

    const base: UnitTick = {
      unitId: u.id,
      ts,
      outputMW: netOutputMW,
      reactiveMVAr:
        offline ? 0 : netOutputMW * (0.12 + 0.04 * noise(ts, 8 * 60_000, u.id.length + f.seed)),
      availableUpMW:
        offline || socPct <= 5
          ? 0
          : Math.min(u.capacityMW - netOutputMW, (socPct / 100) * usableEnergyMWh * 2),
      availableDownMW:
        offline || socPct >= 95
          ? 0
          : Math.min(u.capacityMW + netOutputMW, ((100 - socPct) / 100) * usableEnergyMWh * 2),
      curtailedMW: 0,
      status: u.status,
    };

    return {
      ...base,
      socPct,
      sohPct,
      cellTempC,
      roundTripEff: rte,
      cRate,
      hvacStatus,
      usableEnergyMWh,
      mode,
      flags,
    };
  });
}

/**
 * Feeder node telemetry.
 *
 * Voltage is the *distribution-side* limit on rooftop PV: long before an 11 kV
 * feeder runs out of amps, its far end runs out of volts. Drop and rise both
 * scale with route distance from the primary substation, so the tail-end recloser
 * sees the statutory ±5 % first — in the evening peak from below, and under
 * back-feed from above.
 */
export function sampleBusTicks(ts: number, feederId: string = DEFAULT_FEEDER_ID): BusTick[] {
  const f = feederModel(feederId);
  const state = computeState(f, ts);
  // Signed: positive when importing, negative when the feeder back-feeds.
  const flowRatio = state.transformerFlowMW / f.peakMW;
  const installedPvMW = f.units
    .filter((u) => u.kind === "solar")
    .reduce((a, u) => a + u.capacityMW, 0);
  const pvShareOfInstalled = state.solarMW / Math.max(1e-6, installedPvMW);

  return f.buses.map((b, i) => {
    const distanceShare = (b.distanceKm ?? 0) / f.routeLengthKm;

    // What this node's own rooftops are pushing out, against its share of load.
    const nodeSolarMW = b.solarMW * pvShareOfInstalled;
    const nodeLoadShare = 0.15 + 0.25 * hash01(i * 977 + f.seed);
    const nodeLoadMW = state.loadMW * nodeLoadShare;
    const reverseFlowMW = nodeSolarMW - nodeLoadMW;

    // Tap set to hold the busbar a little high, so the tail end still has margin
    // at peak. That is what an on-load tap change at the primary actually buys.
    const voltagePu =
      f.busbarNoLoadPu -
      f.tailVoltageSwingPu * distanceShare * flowRatio +
      // Local injection lifts the node further than the aggregate flow implies.
      // Coefficient is pu per MW of local back-feed at the far end.
      0.011 * distanceShare * Math.max(0, reverseFlowMW) +
      0.0035 * noise(ts, 4 * 60_000, 90 + i + f.seed);

    // Room left inside the statutory band, as a share of the band. Zero means
    // the node is sitting on the limit.
    const stabilityMarginPct = clamp(
      100 * (1 - Math.abs(voltagePu - 1) / MV_VOLTAGE_BAND_PU),
      0,
      100
    );

    return { busId: b.id, ts, voltagePu, stabilityMarginPct, reverseFlowMW };
  });
}

/** Sample a series backwards from `to`, for reconstructing chart history. */
export function sampleSystemSeries(
  from: number,
  to: number,
  stepMs: number,
  feederId: string = DEFAULT_FEEDER_ID
): SystemTick[] {
  const out: SystemTick[] = [];
  for (let ts = from; ts <= to; ts += stepMs) out.push(sampleSystemTick(ts, feederId));
  return out;
}

export { MV_VOLTAGE_BAND_PU };
