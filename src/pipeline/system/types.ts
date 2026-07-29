/**
 * Grid balance — canonical schemas.
 *
 * The product goal is narrow and it shapes every type here: **carry as much
 * solar as the grid can absorb, without losing balance**. So solar is modelled
 * asset by asset, storage is modelled as the thing that buys solar more room,
 * and everything else on the system is collapsed into a single `conventional`
 * term.
 *
 * That collapse is deliberate. Conventional plant is not a subject of this
 * product — but its *minimum stable generation* is the hard floor that forces
 * solar to be curtailed, so it has to be present as a constraint even though it
 * is never presented as a fleet.
 */

/** How fast a resource can answer a frequency deviation. */
export type ResponseClass = "primary" | "secondary" | "tertiary";

/** Only the assets this product manages are modelled individually. */
export type UnitKind = "solar" | "battery";

export type UnitStatus = "running" | "standby" | "forced-outage" | "planned-outage";

/** Stack order for the supply chart — also the categorical colour order. */
export const SOURCE_ORDER = ["solar", "other"] as const;
export type SourceId = (typeof SOURCE_ORDER)[number];

export const SOURCE_LABEL: Record<SourceId, string> = {
  solar: "Solar",
  other: "Other",
};

/** Nameplate description of a solar farm or battery. */
export interface Unit {
  id: string;
  name: string;
  station: string;
  kind: UnitKind;
  /** Maximum continuous rating, MW. */
  capacityMW: number;
  /** Sustained ramp capability, MW/min. `Infinity` for inverter-coupled plant. */
  rampMWPerMin: number;
  responseClass: ResponseClass;
  /** Usable energy, MWh. Batteries only. */
  energyMWh?: number;
  /** Aggregated behind-the-meter fleet rather than a single site. */
  distributed?: boolean;
  status: UnitStatus;
  /** Bus this unit connects at. */
  busId: string;
}

/** One unit's telemetry at an instant. */
export interface UnitTick {
  unitId: string;
  ts: number;
  outputMW: number;
  reactiveMVAr: number;
  /** How much more it could produce if the grid would take it, MW. */
  availableUpMW: number;
  /** How much it can back off, MW. For solar this is spillable output. */
  availableDownMW: number;
  /** Output being spilled right now on dispatch instruction, MW. */
  curtailedMW: number;
  status: UnitStatus;
}

/** A battery's telemetry. Extends the unit tick with the state that bounds it. */
export interface BessTick extends UnitTick {
  socPct: number;
  sohPct: number;
  cellTempC: number;
  roundTripEff: number;
  /** Current discharge/charge C-rate relative to rated energy capacity (e.g., 0.5C). */
  cRate: number;
  /** Active BMS thermal management state. */
  hvacStatus: "Off" | "Stage 1 (Eco)" | "Stage 2 (Max)";
  /** Effective usable capacity accounting for SOH degradation, MWh. */
  usableEnergyMWh: number;
  /** Operational mode classification based on dispatch schedule and grid response. */
  mode: "Solar Soak Charging" | "Evening Peak Discharge" | "Night Grid Top-Up" | "FFR Frequency Support" | "Standby";
  /** Health flags raised by the BMS. Empty when nominal. */
  flags: string[];
}

export interface Bus {
  id: string;
  name: string;
  nominalKV: number;
  /** Installed solar at this bus, MW — the hosting-capacity denominator. */
  solarMW: number;
}

export interface BusTick {
  busId: string;
  ts: number;
  voltagePu: number;
  /** Distance to the voltage collapse point as a share of nominal, %. */
  stabilityMarginPct: number;
  /** Net export up the feeder, MW. Positive means solar is back-feeding. */
  reverseFlowMW: number;
}

/**
 * The system state at an instant.
 *
 * `imbalanceMW` is `generationMW + interchangeMW − loadMW`, carried on the tick
 * so every consumer reads the same arithmetic rather than re-deriving it.
 */
export interface SystemTick {
  ts: number;
  frequencyHz: number;
  /** Rate of change of frequency, Hz/s. Negative = falling. */
  rocofHzPerS: number;
  generationMW: number;
  loadMW: number;
  /** Signed tie-line flow, MW. Positive = importing. */
  interchangeMW: number;
  imbalanceMW: number;
  /** Synchronous inertia currently on the system, GW·s. */
  inertiaGWs: number;

  /* --- the metrics this product exists for -------------------------- */

  /** Solar actually delivered, MW. The headline quantity. */
  solarMW: number;
  /** Solar being spilled right now, MW. */
  curtailedMW: number;
  /** Solar the grid could still absorb before hitting the floor, MW. */
  solarHeadroomMW: number;
  /** Lumped non-solar synchronous generation, MW. */
  conventionalMW: number;
  /** Minimum stable generation of must-run plant, MW. The binding constraint. */
  conventionalFloorMW: number;
  batteryMW?: number;

  /** Supply split by source, MW. Sums to `generationMW` plus interchange. */
  bySource: Record<SourceId, number>;

  /** Weather inputs driving the solar term. */
  weather: { tempC: number; cloud: number };
}

export type Severity = "critical" | "warning" | "info";

export interface Alarm {
  id: string;
  ts: number;
  severity: Severity;
  source: { kind: "unit" | "bus" | "system"; id: string; label: string };
  message: string;
  acknowledgedAt: number | null;
}
