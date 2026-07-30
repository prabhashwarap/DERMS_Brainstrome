/**
 * The alarm engine.
 *
 * Alarms are *evaluated*, never authored: every condition below reads the same
 * `THRESHOLDS` table the charts and readouts read, so an amber tile and an
 * amber alarm always mean the same thing.
 *
 * The conditions are the ones that cost rooftop PV: volt-watt curtailment in
 * effect, export headroom exhausted, voltage rise under back-feed at the tail
 * far end, storage unavailable to shave a peak. National frequency and inertia are
 * here too — observed, not actionable, but a DSO operator watches them.
 *
 * `evaluateAlarms` is pure and emits *conditions* — it has no memory, so it
 * cannot know when a condition started or whether it was acknowledged. The
 * provider that calls it owns that lifecycle (see `lib/alarms.tsx`).
 */

import { busById, hasStorage, feederModel, phaseVoltageKV, unitById } from "./fleet";
import { reserveCoverPct } from "./derive";
import {
  THRESHOLDS,
  classifyCeiling,
  classifyDeviation,
  classifyFloor,
} from "./thresholds";
import type { Alarm, BessTick, BusTick, FeederModel, SystemTick, UnitTick } from "./types";

/** A live alarm condition, before the lifecycle fields are attached. */
export type AlarmCondition = Pick<Alarm, "id" | "severity" | "source" | "message">;

const isBess = (f: FeederModel) => (t: UnitTick): t is BessTick =>
  unitById(f, t.unitId)?.kind === "battery";

/** Feeder power for message text, MW. */
const mw = (v: number, dp = 2) => v.toFixed(dp);

export function evaluateAlarms(
  tick: SystemTick,
  unitTicks: UnitTick[],
  busTicks: BusTick[],
  feederId: string
): AlarmCondition[] {
  const f = feederModel(feederId);
  const out: AlarmCondition[] = [];
  // Labelled with the feeder, so an alarm raised on one way is never mistaken
  // for the same condition on another after the operator switches.
  const system = (id: string) => ({ kind: "system" as const, id, label: f.shortName });

  /* --- rooftop PV: the conditions this product exists to catch ------- */

  // 30 kW: below that the volt-watt response is doing nothing an operator
  // needs to know about.
  if (tick.curtailedMW > 0.0003) {
    const pct = (100 * tick.curtailedMW) / Math.max(1e-6, tick.solarMW + tick.curtailedMW);
    out.push({
      id: "curtailment",
      severity: pct >= 15 ? "warning" : "info",
      source: system("solar"),
      message: `Volt-watt curtailing ${mw(tick.curtailedMW)} MW of rooftop PV (${pct.toFixed(
        0
      )} % of available) — feeder export limit reached`,
    });
  } else if (tick.solarHeadroomMW < 0.01 && tick.solarMW > 0.002) {
    out.push({
      id: "headroom-tight",
      severity: "info",
      source: system("solar"),
      message: `Only ${mw(tick.solarHeadroomMW)} MW of export room left before rooftop PV must be curtailed`,
    });
  }

  for (const u of f.units) {
    if (u.kind !== "solar") continue;
    if (u.status === "forced-outage") {
      out.push({
        id: `outage-${u.id}`,
        severity: "warning",
        source: { kind: "unit", id: u.id, label: u.name },
        message: `Forced outage — ${mw(u.capacityMW)} MW of rooftop PV unavailable`,
      });
    } else if (u.status === "planned-outage") {
      out.push({
        id: `planned-${u.id}`,
        severity: "info",
        source: { kind: "unit", id: u.id, label: u.name },
        message: `Planned outage — ${mw(u.capacityMW)} MW of rooftop PV out of service`,
      });
    }
  }

  /* --- national frequency: observed, not actionable ------------------ */

  const freqLevel = classifyDeviation(tick.frequencyHz - 50, THRESHOLDS.frequencyHz);
  if (freqLevel !== "normal") {
    const dir = tick.frequencyHz > 50 ? "high" : "low";
    out.push({
      id: `freq-${dir}`,
      severity: freqLevel === "critical" ? "critical" : "warning",
      source: system("frequency"),
      message: `Grid system frequency ${dir} — ${tick.frequencyHz.toFixed(3)} Hz (${
        tick.frequencyHz > 50 ? "+" : ""
      }${(tick.frequencyHz - 50).toFixed(3)})`,
    });
  }

  const rocofLevel = classifyDeviation(tick.rocofHzPerS, THRESHOLDS.rocofHzPerS);
  if (rocofLevel !== "normal") {
    out.push({
      id: "rocof",
      severity: rocofLevel === "critical" ? "critical" : "warning",
      source: system("frequency"),
      message: `RoCoF ${tick.rocofHzPerS.toFixed(3)} Hz/s with ${tick.inertiaGWs.toFixed(
        2
      )} GW·s inertia online`,
    });
  }

  const inertiaLevel = classifyFloor(tick.inertiaGWs, THRESHOLDS.inertiaGWs);
  if (inertiaLevel !== "normal") {
    out.push({
      id: "inertia",
      severity: inertiaLevel === "critical" ? "warning" : "info",
      source: system("frequency"),
      message: `Grid synchronous inertia down to ${tick.inertiaGWs.toFixed(
        2
      )} GW·s — national plant backed off for solar`,
    });
  }

  /* --- reserve ------------------------------------------------------ */

  const cover = reserveCoverPct(unitTicks, tick, feederId);
  const coverLevel = classifyFloor(cover, THRESHOLDS.reserveCoverPct);
  // Only meaningful where there is storage to cover with. A feeder without a
  // cabinet is not failing a requirement it was never given.
  if (hasStorage(f) && coverLevel !== "normal") {
    out.push({
      id: "reserve-cover",
      severity: coverLevel === "critical" ? "critical" : "warning",
      source: system("reserve"),
      message: `Storage reserve at ${cover.toFixed(0)} % of the evening peak-shaving requirement`,
    });
  }

  /* --- storage health ----------------------------------------------- */

  for (const t of unitTicks) {
    if (!isBess(f)(t) || t.status !== "running") continue;
    const unit = unitById(f, t.unitId);

    const tempLevel = classifyCeiling(t.cellTempC, THRESHOLDS.cellTempC);
    if (tempLevel !== "normal") {
      out.push({
        id: `bess-temp-${t.unitId}`,
        severity: tempLevel === "critical" ? "critical" : "warning",
        source: { kind: "unit", id: t.unitId, label: unit?.name ?? t.unitId },
        message: `Cell temperature ${t.cellTempC.toFixed(1)} °C`,
      });
    }

    const sohLevel = classifyFloor(t.sohPct, THRESHOLDS.sohPct);
    if (sohLevel !== "normal") {
      out.push({
        id: `bess-soh-${t.unitId}`,
        severity: sohLevel === "critical" ? "warning" : "info",
        source: { kind: "unit", id: t.unitId, label: unit?.name ?? t.unitId },
        message: `State of health ${t.sohPct.toFixed(1)} % — derate on next review`,
      });
    }
  }

  /* --- the network: the constraint that actually binds --------------- */

  for (const b of busTicks) {
    const bus = busById(f, b.busId);
    const vLevel = classifyDeviation(b.voltagePu - 1, THRESHOLDS.voltagePu);
    if (vLevel !== "normal") {
      const rising = b.voltagePu > 1 && b.reverseFlowMW > 0;
      // Phase-to-neutral volts, which is what a complaint arrives in.
      const kv = (b.voltagePu * phaseVoltageKV(f)).toFixed(2);
      const pct = ((b.voltagePu - 1) * 100).toFixed(1);
      out.push({
        id: `volt-${b.busId}`,
        severity: vLevel === "critical" ? "critical" : "warning",
        source: { kind: "bus", id: b.busId, label: bus?.name ?? b.busId },
        message: rising
          ? `${kv} kV (+${pct} %) under ${mw(b.reverseFlowMW)} MW of PV back-feed — voltage rise`
          : `${kv} kV (${pct} %) at ${bus?.distanceKm ?? 0} km from the primary — volt drop under load`,
      });
    }

    const marginLevel = classifyFloor(b.stabilityMarginPct, THRESHOLDS.stabilityMarginPct);
    if (marginLevel !== "normal") {
      out.push({
        id: `margin-${b.busId}`,
        severity: marginLevel === "critical" ? "critical" : "warning",
        source: { kind: "bus", id: b.busId, label: bus?.name ?? b.busId },
        message: `Only ${b.stabilityMarginPct.toFixed(0)} % of the statutory ±5 % band left`,
      });
    }
  }

  return out;
}

const RANK = { critical: 0, warning: 1, info: 2 } as const;

/** Most severe first, then most recent. */
export const sortAlarms = (a: Alarm, b: Alarm) =>
  RANK[a.severity] - RANK[b.severity] || b.ts - a.ts;
