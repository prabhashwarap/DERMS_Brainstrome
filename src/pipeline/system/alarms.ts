/**
 * The alarm engine.
 *
 * Alarms are *evaluated*, never authored: every condition below reads the same
 * `THRESHOLDS` table the charts and readouts read, so an amber tile and an
 * amber alarm always mean the same thing.
 *
 * The conditions are the ones that cost solar: curtailment in effect, headroom
 * exhausted, voltage rise under back-feed, storage unavailable to soak a peak.
 * Frequency and reserve are here too, because losing balance is the one thing
 * that would force solar off the system entirely.
 *
 * `evaluateAlarms` is pure and emits *conditions* — it has no memory, so it
 * cannot know when a condition started or whether it was acknowledged. The
 * provider that calls it owns that lifecycle (see `lib/alarms.tsx`).
 */

import { BUS_BY_ID, UNITS, UNIT_BY_ID } from "./fleet";
import { reserveCoverPct } from "./derive";
import {
  THRESHOLDS,
  classifyCeiling,
  classifyDeviation,
  classifyFloor,
} from "./thresholds";
import type { Alarm, BessTick, BusTick, SystemTick, UnitTick } from "./types";

/** A live alarm condition, before the lifecycle fields are attached. */
export type AlarmCondition = Pick<Alarm, "id" | "severity" | "source" | "message">;

const isBess = (t: UnitTick): t is BessTick => UNIT_BY_ID[t.unitId]?.kind === "battery";

export function evaluateAlarms(
  tick: SystemTick,
  unitTicks: UnitTick[],
  busTicks: BusTick[]
): AlarmCondition[] {
  const out: AlarmCondition[] = [];
  const system = (id: string) => ({ kind: "system" as const, id, label: "System" });

  /* --- solar: the conditions this product exists to catch ----------- */

  if (tick.curtailedMW > 0.5) {
    const pct = (100 * tick.curtailedMW) / Math.max(1, tick.solarMW + tick.curtailedMW);
    out.push({
      id: "curtailment",
      severity: pct >= 15 ? "warning" : "info",
      source: system("solar"),
      message: `Curtailing ${tick.curtailedMW.toFixed(0)} MW of solar (${pct.toFixed(
        0
      )} % of available) — minimum generation floor reached`,
    });
  } else if (tick.solarHeadroomMW < 40 && tick.solarMW > 1) {
    out.push({
      id: "headroom-tight",
      severity: "info",
      source: system("solar"),
      message: `Only ${tick.solarHeadroomMW.toFixed(0)} MW of room left before solar must be spilled`,
    });
  }

  for (const u of UNITS) {
    if (u.kind !== "solar") continue;
    if (u.status === "forced-outage") {
      out.push({
        id: `outage-${u.id}`,
        severity: "warning",
        source: { kind: "unit", id: u.id, label: u.name },
        message: `Forced outage — ${u.capacityMW} MW of solar unavailable`,
      });
    } else if (u.status === "planned-outage") {
      out.push({
        id: `planned-${u.id}`,
        severity: "info",
        source: { kind: "unit", id: u.id, label: u.name },
        message: `Planned outage — ${u.capacityMW} MW of solar out of service`,
      });
    }
  }

  /* --- frequency ---------------------------------------------------- */

  const freqLevel = classifyDeviation(tick.frequencyHz - 50, THRESHOLDS.frequencyHz);
  if (freqLevel !== "normal") {
    const dir = tick.frequencyHz > 50 ? "high" : "low";
    out.push({
      id: `freq-${dir}`,
      severity: freqLevel === "critical" ? "critical" : "warning",
      source: system("frequency"),
      message: `Frequency ${dir} — ${tick.frequencyHz.toFixed(3)} Hz (${
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
      message: `Synchronous inertia down to ${tick.inertiaGWs.toFixed(
        2
      )} GW·s — conventional plant at minimum to make room for solar`,
    });
  }

  /* --- reserve ------------------------------------------------------ */

  const cover = reserveCoverPct(unitTicks, tick);
  const coverLevel = classifyFloor(cover, THRESHOLDS.reserveCoverPct);
  if (coverLevel !== "normal") {
    out.push({
      id: "reserve-cover",
      severity: coverLevel === "critical" ? "critical" : "warning",
      source: system("reserve"),
      message: `Storage reserve at ${cover.toFixed(0)} % of the primary response requirement`,
    });
  }

  /* --- storage health ----------------------------------------------- */

  for (const t of unitTicks) {
    if (!isBess(t) || t.status !== "running") continue;
    const unit = UNIT_BY_ID[t.unitId];

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

  /* --- network: the distribution-side limit on solar ----------------- */

  for (const b of busTicks) {
    const bus = BUS_BY_ID[b.busId];
    const vLevel = classifyDeviation(b.voltagePu - 1, THRESHOLDS.voltagePu);
    if (vLevel !== "normal") {
      const rising = b.voltagePu > 1 && b.reverseFlowMW > 0;
      out.push({
        id: `volt-${b.busId}`,
        severity: vLevel === "critical" ? "critical" : "warning",
        source: { kind: "bus", id: b.busId, label: bus?.name ?? b.busId },
        message: rising
          ? `Voltage ${b.voltagePu.toFixed(3)} pu under ${b.reverseFlowMW.toFixed(
              0
            )} MW reverse flow — solar back-feed`
          : `Bus voltage ${b.voltagePu.toFixed(3)} pu at ${bus?.nominalKV ?? "?"} kV`,
      });
    }

    const marginLevel = classifyFloor(b.stabilityMarginPct, THRESHOLDS.stabilityMarginPct);
    if (marginLevel !== "normal") {
      out.push({
        id: `margin-${b.busId}`,
        severity: marginLevel === "critical" ? "critical" : "warning",
        source: { kind: "bus", id: b.busId, label: bus?.name ?? b.busId },
        message: `Voltage stability margin ${b.stabilityMarginPct.toFixed(0)} %`,
      });
    }
  }

  return out;
}

const RANK = { critical: 0, warning: 1, info: 2 } as const;

/** Most severe first, then most recent. */
export const sortAlarms = (a: Alarm, b: Alarm) =>
  RANK[a.severity] - RANK[b.severity] || b.ts - a.ts;
