/**
 * Derived balance quantities.
 *
 * Nothing here is stored — every value is computed from a tick plus the
 * registry, so a derived number can never drift out of step with the telemetry
 * it came from. This is where the operator-facing translation happens: a set of
 * physical constraints becomes a ramp the fleet either can or cannot follow, and
 * a stream of instantaneous megawatts becomes the day's energy.
 */

import { CONVENTIONAL, UNIT_BY_ID } from "./fleet";
import { sampleSystemTick } from "./source";
import type { BessTick, SystemTick, UnitTick } from "./types";

const isBess = (t: UnitTick): t is BessTick =>
  "socPct" in t && UNIT_BY_ID[t.unitId]?.kind === "battery";

/* ------------------------------------------------------------------ */
/* reserve                                                             */

/**
 * Primary response requirement as a share of demand.
 *
 * Measured against demand rather than against the largest single infeed:
 * conventional plant is lumped here, so there is no meaningful "biggest unit"
 * to size against, and a 90 MW storage fleet would never cover a 300 MW block
 * loss — which would make the indicator permanently red and therefore useless.
 */
const PRIMARY_REQUIREMENT_PCT = 4;

export const primaryRequirementMW = (demandMW: number) =>
  (demandMW * PRIMARY_REQUIREMENT_PCT) / 100;

/** Storage reserve as a share of the primary response requirement, %. */
export function reserveCoverPct(ticks: UnitTick[], tick: SystemTick): number {
  const bessUp = ticks
    .filter(isBess)
    .filter((t) => t.status === "running")
    .reduce((a, t) => a + t.availableUpMW, 0);
  const required = primaryRequirementMW(tick.loadMW);
  return required > 0 ? (bessUp / required) * 100 : 0;
}

export interface RampRisk {
  /** Steepest net-load ramp over the look-ahead, MW/min. Signed. */
  requiredMWPerMin: number;
  /** Sustained ramp the fleet can follow, MW/min. */
  capabilityMWPerMin: number;
  /** When the steepest ramp occurs. */
  at: number;
  status: "normal" | "warning" | "critical";
}

/**
 * Net-load ramp risk over the next few hours.
 *
 * Net load is demand minus solar; its slope is what conventional plant and
 * storage have to follow. The binding case is always the same one: the sun
 * setting into the evening peak. Every megawatt of added solar makes it steeper,
 * which is why the dashboard gives it a panel of its own rather than a corner.
 */
export function buildRampRisk(now: number, ticks: UnitTick[], lookAheadHours = 4): RampRisk {
  const stepMs = 15 * 60_000;
  const netLoad = (ts: number) => {
    const t = sampleSystemTick(ts);
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
    .filter(isBess)
    .filter((t) => t.status === "running")
    .reduce((a, t) => a + t.availableUpMW, 0);
  const capability = CONVENTIONAL.rampMWPerMin + bessMW;

  const ratio = capability > 0 ? Math.abs(worst) / capability : Infinity;
  return {
    requiredMWPerMin: worst,
    capabilityMWPerMin: capability,
    at,
    status: ratio >= 1 ? "critical" : ratio >= 0.7 ? "warning" : "normal",
  };
}

/** Solar energy and spill over a window, MWh — the daily scorecard. */
export function solarDayTotals(from: number, to: number, stepMs = 15 * 60_000) {
  let deliveredMWh = 0;
  let spilledMWh = 0;
  let peakMW = 0;
  const hours = stepMs / 3600_000;

  for (let ts = from; ts <= to; ts += stepMs) {
    const t = sampleSystemTick(ts);
    deliveredMWh += t.solarMW * hours;
    spilledMWh += t.curtailedMW * hours;
    peakMW = Math.max(peakMW, t.solarMW);
  }

  return { deliveredMWh, spilledMWh, peakMW };
}
