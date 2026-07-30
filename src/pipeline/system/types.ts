/**
 * Feeder balance — canonical schemas.
 *
 * The product goal is narrow and it shapes every type here: **carry as much
 * rooftop solar as the distribution network can absorb, without leaving the
 * statutory voltage band**. So PV is modelled cluster by cluster, storage is
 * modelled as the thing that buys PV more room, and the grid behind the primary
 * substation is collapsed into a single import term.
 *
 * That collapse is deliberate. The upstream network is not a subject of this
 * product — but the feeder's *export limit* is the hard constraint that forces PV
 * to be curtailed, so it has to be present even though it is never presented as
 * a fleet.
 *
 * Power is MW and energy is MWh throughout, as everywhere else in the app.
 */

/** How fast a resource can answer a frequency deviation. */
export type ResponseClass = "primary" | "secondary" | "tertiary";

/** Only the assets this product manages are modelled individually. */
export type UnitKind = "solar" | "battery";

export type UnitStatus = "running" | "standby" | "forced-outage" | "planned-outage";

/**
 * Stack order for the supply chart — also the categorical colour order.
 *
 * Storage is its own category and not folded into the grid term. A battery
 * charging from the midday PV surplus while the feeder is still importing would,
 * if netted against the import, cancel both to near zero — reporting almost no
 * grid supply and no storage activity at the exact moment storage is doing the
 * most work.
 */
export const SOURCE_ORDER = ["solar", "battery", "grid"] as const;
export type SourceId = (typeof SOURCE_ORDER)[number];

export const SOURCE_LABEL: Record<SourceId, string> = {
  solar: "Rooftop PV",
  battery: "Battery Storage",
  grid: "Grid infeed",
};

/** Nameplate description of a PV cluster or battery. */
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

/**
 * A demand hump: `[amplitude, centre hour, width]`, all relative to peak.
 *
 * Stated per feeder rather than derived from a profile name because the shape
 * *is* the feeder. An industrial feeder peaks at one o'clock and falls away after
 * the shift; a residential one is flat until six and then climbs for three hours.
 * Collapsing that into an enum would make every feeder the same feeder.
 */
export type LoadHump = [amplitude: number, centreHour: number, width: number];

/** The charger population on a feeder. */
export interface EvFleet {
  /** Single-phase domestic units, all DERMS-enrolled for V1G. */
  domesticChargers: number;
  domesticRatingKW: number;
  /** Public, kerbside and DC rapid units — uncontrolled. */
  publicChargers: number;
  publicRatingKW: number;
  /** After-diversity maximum demand of the whole population, MW. Not the sum of
   *  the ratings: chargers do not draw together, and using connected capacity as
   *  a load overstates the peak roughly threefold. Derived from the register's
   *  `evPenetration`, so it moves with the feeder's peak. */
  diversifiedPeakMW: number;
  /** Which charging population the feeder's mix implies. */
  profile: "residential" | "industrial" | "evse";
}

/**
 * One 11 kV feeder: nameplate, network, load shape and DER.
 *
 * Assembled in `fleet.ts` from the shared asset register plus a balance-model
 * supplement, so everything the dashboard shows for a feeder traces back to the
 * same record the forecast is built on.
 */
export interface FeederModel {
  id: string;
  name: string;
  shortName: string;
  /** Primary substation the feeder leaves from. */
  substation: string;
  operator: string;
  /** One-line character, from the register. Shown in the selector. */
  mix: string;
  profile: "residential" | "industrial";

  /* --- rating -------------------------------------------------------- */
  capacityMVA: number;
  powerFactor: number;
  /** Firm capacity in MW — `capacityMVA × powerFactor`. */
  firmMW: number;

  /* --- network ------------------------------------------------------- */
  nominalKV: number;
  conductor: string;
  /** Route length of the feeder main, km. */
  routeLengthKm: number;
  /** Voltage swing at the far node at full loading, pu. The number that decides
   *  how much PV the feeder can host. */
  tailVoltageSwingPu: number;
  /** Tap setting expressed as the no-load busbar voltage, pu. */
  busbarNoLoadPu: number;

  /* --- load ---------------------------------------------------------- */
  /** Consumers with a rooftop PV installation. */
  pvConsumers: number;
  /** Peak demand including EV charging, MW. Derived from firm capacity. */
  peakMW: number;
  /** Load factor (mean / peak), from the register. */
  loadFactor: number;
  /** Peak of the non-EV base load, MW. EV is added as its own term. */
  basePeakMW: number;
  /** Overnight baseline as a fraction of `basePeakMW`. */
  baseShare: number;
  morningHump: LoadHump;
  middayHump: LoadHump;
  eveningHump: LoadHump;
  /** Demand jitter amplitude. */
  jitterAmp: number;
  /** Demand multiplier on [Sunday, Saturday]. */
  weekend: [number, number];
  /** Sensitivity of demand to temperature above 26 °C, per °C. */
  coolingCoeff: number;
  /** Deterministic noise seed, so two feeders never share a jitter pattern. */
  seed: number;

  /* --- limits -------------------------------------------------------- */
  /** Net export up to the primary the DERMS will allow, MW. */
  exportLimitMW: number;
  /** Back-feed at which the far node would reach the statutory +5 %, MW. */
  voltageRiseLimitMW: number;

  /* --- DER ----------------------------------------------------------- */
  /** Rooftop PV as a fraction of peak demand, from the register. */
  solarPenetration: number;
  /** Installed rooftop PV, MW. */
  installedPvMW: number;
  units: Unit[];
  buses: Bus[];
  ev: EvFleet;
}

/** A measurement point on the feeder — busbar, sectionaliser, RMU or recloser. */
export interface Bus {
  id: string;
  name: string;
  /** Nominal line-to-line voltage, kV. */
  nominalKV: number;
  /** Installed rooftop PV downstream of this node, MW. */
  solarMW: number;
  /** Route distance from the primary substation, km. Drives volt drop and rise. */
  distanceKm?: number;
}

export interface BusTick {
  busId: string;
  ts: number;
  voltagePu: number;
  /** Room left inside the statutory ±5 % band, % of the band. Zero = at limit. */
  stabilityMarginPct: number;
  /** Net export from this node, MW. Positive means rooftop PV is back-feeding. */
  reverseFlowMW: number;
}

/**
 * The feeder state at an instant.
 *
 * `transformerFlowMW` is the headline: everything the LV network cannot generate
 * for itself comes through the 11 kV/400 V transformer, and when rooftop PV
 * exceeds local demand it goes back the other way. It is carried on the tick so
 * every consumer reads the same arithmetic rather than re-deriving it.
 *
 * Frequency, RoCoF and inertia are *national* CEB quantities. They are observed
 * here, never derived from this feeder's balance — a 185 kW feeder moves none of
 * them.
 */
export interface SystemTick {
  ts: number;
  frequencyHz: number;
  /** Rate of change of frequency, Hz/s. Negative = falling. Observed, national. */
  rocofHzPerS: number;
  /** Local generation on the feeder (PV + storage discharge), MW. */
  generationMW: number;
  /** Total feeder demand including EV charging, MW. */
  loadMW: number;
  /** Signed flow through the distribution transformer, MW. Positive = importing
   *  from 11 kV, negative = back-feeding up to the primary. */
  transformerFlowMW: number;
  /** Transformer flow as a share of its firm capacity, %. Always positive. */
  transformerLoadingPct: number;
  /** Residual after local generation and the transformer, MW. Kirchhoff keeps
   *  this at zero on a real feeder; it is carried to prove the model does too. */
  imbalanceMW: number;
  /** Synchronous inertia on the CEB system, GW·s. Observed, national. */
  inertiaGWs: number;

  /* --- the metrics this product exists for -------------------------- */

  /** Rooftop PV actually delivered, MW. The headline quantity. */
  solarMW: number;
  /** PV being curtailed by volt-watt response right now, MW. */
  curtailedMW: number;
  /** PV the feeder could still absorb before the export limit binds, MW. */
  solarHeadroomMW: number;
  /** Import through the transformer, MW. Zero when the feeder is back-feeding. */
  gridImportMW: number;
  /** Net export the LV network can carry before voltage rise binds, MW. */
  gridExportLimitMW: number;
  /** Storage output, MW. Positive = discharging, negative = charging. */
  batteryMW?: number;
  /** Storage state of charge, %. */
  socPct: number;

  /* --- EV charging --------------------------------------------------- */

  /** EV charging load as delivered under DERMS smart charging, MW. */
  evMW: number;
  /** What the same population would have drawn uncontrolled, MW. */
  evUnmanagedMW: number;

  /** Supply split by source, MW. Signed, and sums to `loadMW`. */
  bySource: Record<SourceId, number>;

  /** Weather inputs driving the PV term. */
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
