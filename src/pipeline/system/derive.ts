/**
 * Derived balance quantities.
 *
 * Nothing here is stored — every value is computed from a tick plus the
 * registry, so a derived number can never drift out of step with the telemetry
 * it came from. This is where the operator-facing translation happens: a set of
 * physical constraints becomes a ramp the DER either can or cannot follow, and a
 * stream of instantaneous kilowatts becomes the day's energy.
 */

import { FEEDER_RAMP_MW_PER_MIN, feederModel, unitById } from "./fleet";
import { sampleSystemTick } from "./source";
import type { BessTick, FeederModel, SystemTick, UnitTick } from "./types";

const isBess = (f: FeederModel) => (t: UnitTick): t is BessTick =>
  "socPct" in t && unitById(f, t.unitId)?.kind === "battery";

/* ------------------------------------------------------------------ */
/* reserve                                                             */

/**
 * Peak-shaving requirement as a share of demand.
 *
 * At LV there is no primary frequency response to size against — that is a
 * transmission service this feeder observes and does not provide. What the
 * storage on the feeder is actually for is holding the evening peak below the
 * transformer's comfortable loading, so the requirement is stated as a share of
 * demand: on the 400 kVA way, 12 % of a 185 kW peak is ~22 kW, which is what its
 * cabinet delivers. A feeder with no storage reads zero, which is the truth.
 */
const PEAK_SHAVE_REQUIREMENT_PCT = 12;

export const peakShaveRequirementMW = (demandMW: number) =>
  (demandMW * PEAK_SHAVE_REQUIREMENT_PCT) / 100;

/** Storage reserve as a share of the peak-shaving requirement, %. */
export function reserveCoverPct(ticks: UnitTick[], tick: SystemTick, feederId: string): number {
  const f = feederModel(feederId);
  const bessUp = ticks
    .filter(isBess(f))
    .filter((t) => t.status === "running")
    .reduce((a, t) => a + t.availableUpMW, 0);
  const required = peakShaveRequirementMW(tick.loadMW);
  return required > 0 ? (bessUp / required) * 100 : 0;
}

export interface RampRisk {
  /** Steepest net-load ramp over the look-ahead, MW/min. Signed. */
  requiredMWPerMin: number;
  /** Sustained ramp the DER on the feeder can follow, MW/min. */
  capabilityMWPerMin: number;
  /** When the steepest ramp occurs. */
  at: number;
  status: "normal" | "warning" | "critical";
}

/**
 * Net-load ramp risk over the next few hours.
 *
 * Net load is feeder demand minus rooftop PV; its slope is what storage and the
 * transformer have to follow. The binding case is always the same one: the sun
 * setting into the domestic evening peak, which on this feeder are only two
 * hours apart. Every kilowatt of added rooftop PV makes it steeper.
 */
export function buildRampRisk(
  now: number,
  ticks: UnitTick[],
  feederId: string,
  lookAheadHours = 4
): RampRisk {
  const f = feederModel(feederId);
  const stepMs = 15 * 60_000;
  const netLoad = (ts: number) => {
    const t = sampleSystemTick(ts, feederId);
    return t.loadMW - t.solarMW;
  };

  let worst = 0;
  let at = now;
  for (let ts = now; ts < now + lookAheadHours * 3600_000; ts += stepMs) {
    const slope = (netLoad(ts + stepMs) - netLoad(ts)) / (stepMs / 60_000);
    if (Math.abs(slope) > Math.abs(worst)) {
      worst = slope;
      at = ts;
    }
  }

  // Storage answers instantly, so its full power counts toward ramp capability.
  const bessMW = ticks
    .filter(isBess(f))
    .filter((t) => t.status === "running")
    .reduce((a, t) => a + t.availableUpMW, 0);
  const capability = FEEDER_RAMP_MW_PER_MIN + bessMW;

  const ratio = capability > 0 ? Math.abs(worst) / capability : Infinity;
  return {
    requiredMWPerMin: worst,
    capabilityMWPerMin: capability,
    at,
    status: ratio >= 1 ? "critical" : ratio >= 0.7 ? "warning" : "normal",
  };
}

/**
 * Rooftop PV energy and curtailment over a window, MWh — the daily scorecard.
 *
 * `minHeadroomMW` is the day's *tightest* moment, not its average: hosting
 * capacity is decided by the worst instant, and a feeder that spends 23 hours
 * with room to spare and one hour on the limit has no room at all. On a feeder
 * that never curtails it is the only live number in this group, and it answers
 * the question an operator actually asks about PV — how much more can I connect.
 */
export function solarDayTotals(
  from: number,
  to: number,
  feederId: string,
  stepMs = 15 * 60_000
) {
  let deliveredMWh = 0;
  let spilledMWh = 0;
  let peakMW = 0;
  let minHeadroomMW = Infinity;
  const hours = stepMs / 3600_000;

  for (let ts = from; ts <= to; ts += stepMs) {
    const t = sampleSystemTick(ts, feederId);
    deliveredMWh += t.solarMW * hours;
    spilledMWh += t.curtailedMW * hours;
    peakMW = Math.max(peakMW, t.solarMW);
    // Only daylight hours can bind: at night there is no PV to have room for, and
    // including 2 a.m. would report a headroom no PV could ever use.
    if (t.solarMW > 0.01) minHeadroomMW = Math.min(minHeadroomMW, t.solarHeadroomMW);
  }

  return {
    deliveredMWh,
    spilledMWh,
    peakMW,
    minHeadroomMW: Number.isFinite(minHeadroomMW) ? Math.max(0, minHeadroomMW) : 0,
  };
}

/**
 * Feeder energy over a window, MWh — what the AMI headend would total.
 *
 * `importedMWh` and `exportedMWh` are kept separate rather than netted, because
 * that is how the feeder is settled and because a net figure hides the thing the
 * dashboard exists to show: a feeder can import and export the same amount and
 * still be in trouble at both ends of the day.
 */
export function feederDayTotals(
  from: number,
  to: number,
  feederId: string,
  stepMs = 15 * 60_000
) {
  let importedMWh = 0;
  let exportedMWh = 0;
  let consumedMWh = 0;
  let deliveredPvMWh = 0;
  let evMWh = 0;
  let peakMW = 0;
  let minMW = Infinity;
  const hours = stepMs / 3600_000;

  for (let ts = from; ts <= to; ts += stepMs) {
    const t = sampleSystemTick(ts, feederId);
    consumedMWh += t.loadMW * hours;
    deliveredPvMWh += t.solarMW * hours;
    evMWh += t.evMW * hours;
    importedMWh += Math.max(0, t.transformerFlowMW) * hours;
    exportedMWh += Math.max(0, -t.transformerFlowMW) * hours;
    peakMW = Math.max(peakMW, t.loadMW);
    minMW = Math.min(minMW, t.loadMW);
  }

  return {
    consumedMWh,
    deliveredPvMWh,
    evMWh,
    importedMWh,
    exportedMWh,
    peakMW,
    minMW: Number.isFinite(minMW) ? minMW : 0,
  };
}
