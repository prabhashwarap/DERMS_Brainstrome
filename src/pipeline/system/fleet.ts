/**
 * The balance model's feeder register.
 *
 * Scope is one **11 kV distribution feeder** — the unit LECO plans, switches and
 * reports on, and the unit the forecasting side of this app already works in.
 * There is deliberately no second register here: the nameplate comes from
 * `pipeline/feeders.ts`, which the forecast, the map and the toolbar all read, so
 * a feeder can never be 13 MVA on one page and something else on another.
 *
 * What this file adds is the detail the balance model needs and the asset
 * register does not carry: the shape of the daily curve, the network geometry
 * behind the voltage calculation, the export limit, and the DER on the feeder.
 * Everything that *can* be derived from the register — peak, installed PV, EV
 * demand — is derived, so changing `solarPenetration` in one place moves every
 * number that depends on it.
 *
 * Two conventions hold throughout the pipeline:
 *
 *   - **Power is MW and energy is MWh**, as everywhere else in the app.
 *   - Nameplates are stated in the units an engineer reads them in (MVA, MW,
 *     MWh, kW per charger) and converted once, here.
 *
 * Figures are indicative of LECO 11 kV feeders in the western province. When a
 * real SCADA/AMI feed lands this file becomes a lookup against the LECO asset
 * register — nothing downstream needs to change.
 */

import { FEEDERS, FEEDER_LIST, capacityMW, type Feeder, type FeederId } from "../feeders";
import type { Bus, EvFleet, FeederModel, LoadHump, Unit } from "./types";

/**
 * National-grid quantities every feeder observes but none influences.
 *
 * A 12 MW feeder moves neither frequency nor inertia. They appear on the
 * dashboard because a DSO operator watches them, and they are modelled as
 * exogenous CEB system quantities — never derived from a feeder's balance.
 */
export const NATIONAL_GRID = {
  /** Typical synchronous inertia on the CEB system at night, GW·s. */
  inertiaNightGWs: 3.35,
  /** How much of it is displaced at the midday solar peak, GW·s. */
  inertiaSolarDisplacementGWs: 0.85,
} as const;

/**
 * How fast a feeder's net flow can be made to change, MW/min.
 *
 * Storage and smart charging are inverter-coupled, so this is generous and is
 * never the binding constraint on a distribution feeder — unlike on a thermal
 * fleet, where it is.
 */
export const FEEDER_RAMP_MW_PER_MIN = 6;

/* ------------------------------------------------------------------ */
/* the balance supplement                                             */

/**
 * What the balance model needs that the asset register does not carry.
 *
 * Split out rather than added to `Feeder` because ten feeders and the map read
 * that interface and none of them need a tail-end voltage coefficient. A feeder
 * without an entry here falls back to `DEFAULT_SUPPLEMENT`, so adding a feeder to
 * the register never breaks the dashboard — it gets a generic network behind it
 * until someone surveys the real one.
 */
interface BalanceSupplement {
  /** Peak demand as a fraction of firm capacity. LECO plans 11 kV feeders to
   *  around half their rating so a neighbour can pick up the load under a fault,
   *  which is why this is well below 1. */
  peakLoading: number;
  /** Overnight baseline as a fraction of the non-EV base peak. */
  baseShare: number;
  morningHump: LoadHump;
  middayHump: LoadHump;
  eveningHump: LoadHump;
  /** Demand multiplier on [Sunday, Saturday]. */
  weekend: [number, number];
  /** Sensitivity of demand to temperature above 26 °C, per °C. */
  coolingCoeff: number;
  /** Demand jitter amplitude. An 11 kV feeder aggregates thousands of consumers,
   *  so this is an order of magnitude below LV. */
  jitterAmp: number;

  /** Nominal voltage, kV. */
  nominalKV: number;
  conductor: string;
  /** Route length of the feeder main, km. */
  routeLengthKm: number;
  /** Voltage swing at the far end at full loading, pu. */
  tailVoltageSwingPu: number;
  /** Tap setting expressed as the no-load busbar voltage, pu. */
  busbarNoLoadPu: number;

  /** Net export up to the primary the DERMS will allow, MW. */
  exportLimitMW: number;
  /** Back-feed at which the far node would reach the statutory +5 %, MW. */
  voltageRiseLimitMW: number;

  /** Consumers with a rooftop PV installation. */
  pvConsumers: number;
  /** Share of installed PV on smart inverters, and therefore curtailable. */
  dermsEnrolledShare: number;
  /** Feeder-level storage. Zero MW means none installed. */
  bessMW: number;
  bessMWh: number;

  ev: Omit<EvFleet, "diversifiedPeakMW">;
  /** Nodes along the feeder: `[name, distance km, share of installed PV]`. */
  nodes: [name: string, distanceKm: number, pvShare: number][];
}

const DEFAULT_SUPPLEMENT: BalanceSupplement = {
  peakLoading: 0.52,
  baseShare: 0.42,
  morningHump: [0.16, 7.0, 1.3],
  middayHump: [0.1, 13.0, 3.0],
  eveningHump: [0.52, 19.5, 1.9],
  weekend: [1.03, 1.01],
  coolingCoeff: 0.02,
  jitterAmp: 0.008,
  nominalKV: 11,
  conductor: "150 mm² ACSR overhead",
  routeLengthKm: 5,
  tailVoltageSwingPu: 0.045,
  busbarNoLoadPu: 1.02,
  exportLimitMW: 1.5,
  voltageRiseLimitMW: 4,
  pvConsumers: 300,
  dermsEnrolledShare: 0.65,
  bessMW: 0,
  bessMWh: 0,
  ev: {
    domesticChargers: 150,
    domesticRatingKW: 7.4,
    publicChargers: 10,
    publicRatingKW: 22,
    profile: "residential",
  },
  nodes: [
    ["Feeder head", 0, 0.05],
    ["Mid-section RMU", 2, 0.35],
    ["Tail-end recloser", 5, 0.6],
  ],
};

const SUPPLEMENTS: Partial<Record<FeederId, BalanceSupplement>> = {
  /* --- Velona / Angulana — 13 MVA, residential, 9 % PV ---------------- */
  angulana: {
    ...DEFAULT_SUPPLEMENT,
    peakLoading: 0.52,
    // A residential 11 kV feeder aggregates a few thousand consumers, so the
    // curve is far smoother than one LV street's: the evening peak still
    // dominates, but it arrives as a broad hump rather than a spike, and the
    // daytime shoulder never empties out the way a single lane does.
    baseShare: 0.34,
    morningHump: [0.17, 7.0, 1.3],
    middayHump: [0.1, 13.0, 3.0],
    eveningHump: [0.6, 19.5, 1.9],
    weekend: [1.03, 1.01],
    coolingCoeff: 0.02,
    jitterAmp: 0.008,

    conductor: "150 mm² ACSR overhead, 3-section",
    routeLengthKm: 4.2,
    tailVoltageSwingPu: 0.042,
    busbarNoLoadPu: 1.02,

    // The primary substation's reverse-power setting. Far above anything this
    // feeder can reach at 9 % PV penetration — which is the useful fact rather
    // than a problem: the gap is hosting capacity nobody has taken up yet.
    exportLimitMW: 1.2,
    voltageRiseLimitMW: 3.5,

    pvConsumers: 214,
    dermsEnrolledShare: 0.66,
    // No feeder-level storage. At 9 % penetration there is no midday surplus to
    // store, and a battery here would be solving a problem the feeder has not
    // got.
    bessMW: 0,
    bessMWh: 0,

    ev: {
      domesticChargers: 240,
      domesticRatingKW: 7.4,
      publicChargers: 14,
      publicRatingKW: 22,
      profile: "residential",
    },

    nodes: [
      ["Angulana 11 kV busbar", 0, 0.06],
      ["Velona sectionaliser", 1.4, 0.24],
      ["Katubedda RMU", 2.9, 0.34],
      ["Tail-end recloser — Angulana south", 4.2, 0.36],
    ],
  },

  /* --- Seeduwa / Katunayake — 22 MVA, industrial, 34 % PV ------------- */
  katunayake: {
    ...DEFAULT_SUPPLEMENT,
    peakLoading: 0.55,
    // Industrial and commercial: a broad daytime plateau peaking at one o'clock,
    // on a floor held up by shift work and refrigeration. The peak lands *on* the
    // PV peak rather than after it, which is why 34 % penetration gives this
    // feeder no trouble at all — the load is there to absorb it.
    baseShare: 0.45,
    morningHump: [0.14, 8.0, 1.4],
    middayHump: [0.49, 13.0, 3.4],
    eveningHump: [0.16, 19.0, 2.2],
    weekend: [0.66, 0.88],
    coolingCoeff: 0.026,
    jitterAmp: 0.006,

    conductor: "185 mm² XLPE / 240 mm² ACSR trunk",
    routeLengthKm: 6.8,
    tailVoltageSwingPu: 0.051,
    busbarNoLoadPu: 1.022,

    exportLimitMW: 2.5,
    voltageRiseLimitMW: 6,

    pvConsumers: 61,
    // Commercial and industrial roofs are recent and almost all on smart
    // inverters, so nearly the whole fleet answers a curtailment instruction —
    // the opposite of a legacy domestic feeder.
    dermsEnrolledShare: 0.82,
    bessMW: 4,
    bessMWh: 8,

    ev: {
      domesticChargers: 340,
      domesticRatingKW: 7.4,
      // The airport road: DC rapid units at the fuel stations and the freight yard.
      publicChargers: 52,
      publicRatingKW: 51,
      profile: "evse",
    },

    nodes: [
      ["Katunayake 11 kV busbar", 0, 0.08],
      ["Seeduwa sectionaliser", 2.1, 0.22],
      ["Investment-zone RMU", 4.4, 0.42],
      ["Tail-end recloser — Liyanagemulla", 6.8, 0.28],
    ],
  },
};

/* ------------------------------------------------------------------ */
/* building a feeder model from register + supplement                  */

function buildUnits(f: Feeder, s: BalanceSupplement, pvMW: number): Unit[] {
  const units: Unit[] = [];
  const enrolledMW = pvMW * s.dermsEnrolledShare;
  const legacyMW = pvMW - enrolledMW;

  if (enrolledMW > 0) {
    units.push({
      id: `${f.id}_pv_derms`,
      name: "Rooftop PV — DERMS enrolled",
      station: `${f.shortName} (${Math.round(s.pvConsumers * s.dermsEnrolledShare)} consumers)`,
      kind: "solar",
      capacityMW: enrolledMW,
      rampMWPerMin: Infinity,
      responseClass: "primary",
      status: "running",
      busId: `${f.id}_node_2`,
    });
  }
  if (legacyMW > 0) {
    units.push({
      id: `${f.id}_pv_legacy`,
      name: "Rooftop PV — legacy net metering",
      station: `${f.shortName} (${Math.round(
        s.pvConsumers * (1 - s.dermsEnrolledShare)
      )} consumers)`,
      kind: "solar",
      capacityMW: legacyMW,
      rampMWPerMin: Infinity,
      responseClass: "primary",
      // Behind the meter and not under control: it cannot be curtailed on
      // instruction, which is the harder half of the penetration problem.
      distributed: true,
      status: "running",
      busId: `${f.id}_node_3`,
    });
  }
  if (s.bessMW > 0) {
    units.push({
      id: `${f.id}_bess`,
      name: `${f.shortName} feeder BESS`,
      station: `${f.substation} compound`,
      kind: "battery",
      capacityMW: s.bessMW,
      rampMWPerMin: Infinity,
      responseClass: "primary",
      energyMWh: s.bessMWh,
      status: "running",
      busId: `${f.id}_node_0`,
    });
  }
  return units;
}

const buildBuses = (f: Feeder, s: BalanceSupplement, pvMW: number): Bus[] =>
  s.nodes.map(([name, distanceKm, pvShare], i) => ({
    id: `${f.id}_node_${i}`,
    name,
    nominalKV: s.nominalKV,
    solarMW: pvMW * pvShare,
    distanceKm,
  }));

/**
 * Assemble the balance model for a feeder.
 *
 * Peak demand, installed PV and EV demand are all *derived* from the asset
 * register's `capacityMVA`, `solarPenetration` and `evPenetration`. That is the
 * point of deriving rather than restating: the dashboard cannot drift away from
 * the figures the forecast is built on.
 */
function buildModel(f: Feeder): FeederModel {
  const s = SUPPLEMENTS[f.id] ?? DEFAULT_SUPPLEMENT;

  const firmMW = capacityMW(f);
  const peakMW = firmMW * s.peakLoading;
  const pvMW = peakMW * (f.solarPenetration ?? 0);
  const evDiversifiedMW = peakMW * (f.evPenetration ?? 0);

  // Smart charging holds part of the enrolled EV load out of the evening peak,
  // so the non-EV base peak is the recorded peak less what EV *actually*
  // contributes there — not less the whole EV term, which would double-discount.
  const basePeakMW = peakMW - evDiversifiedMW * 0.72;

  return {
    id: f.id,
    name: f.name,
    shortName: f.shortName,
    substation: f.substation,
    operator: f.branchName ? `LECO — ${f.branchName}` : "LECO",
    mix: f.mix,
    profile: f.profile,

    capacityMVA: f.capacityMVA,
    powerFactor: f.powerFactor,
    firmMW,

    nominalKV: s.nominalKV,
    conductor: s.conductor,
    routeLengthKm: s.routeLengthKm,
    tailVoltageSwingPu: s.tailVoltageSwingPu,
    busbarNoLoadPu: s.busbarNoLoadPu,

    pvConsumers: s.pvConsumers,
    peakMW,
    loadFactor: f.loadFactor,
    basePeakMW,
    baseShare: s.baseShare,
    morningHump: s.morningHump,
    middayHump: s.middayHump,
    eveningHump: s.eveningHump,
    jitterAmp: s.jitterAmp,
    weekend: s.weekend,
    coolingCoeff: s.coolingCoeff,
    seed: f.seed % 100000,

    exportLimitMW: s.exportLimitMW,
    voltageRiseLimitMW: s.voltageRiseLimitMW,

    solarPenetration: f.solarPenetration ?? 0,
    installedPvMW: pvMW,

    units: buildUnits(f, s, pvMW),
    buses: buildBuses(f, s, pvMW),
    ev: { ...s.ev, diversifiedPeakMW: evDiversifiedMW },
  };
}

/* ------------------------------------------------------------------ */
/* the register, as the dashboard sees it                              */

/** Feeders the dashboard offers, in the order the selector shows them. */
export const FEEDER_MODEL_LIST: FeederModel[] = FEEDER_LIST.map(buildModel);

export const FEEDER_MODELS: Record<string, FeederModel> = Object.fromEntries(
  FEEDER_MODEL_LIST.map((m) => [m.id, m])
);

export const DEFAULT_FEEDER_ID: FeederId = FEEDER_LIST[0].id;

/**
 * Resolve an id to a model.
 *
 * Falls back rather than throwing. The dashboard shares its selection with
 * Forecasting, whose register has ten entries to this one's two, so a feeder the
 * balance model has no supplement for is a normal state — it gets a generic
 * network, not an error page.
 */
export const feederModel = (id: string): FeederModel =>
  FEEDER_MODELS[id] ?? (FEEDERS[id] ? buildModel(FEEDERS[id]) : FEEDER_MODEL_LIST[0]);

/* ------------------------------------------------------------------ */
/* derived nameplate figures                                           */

/** Phase-to-neutral nominal voltage, kV. */
export const phaseVoltageKV = (f: FeederModel) => f.nominalKV / Math.sqrt(3);

/** Installed rooftop PV, MW — the denominator for capacity-factor figures. */
export const installedSolarMW = (f: FeederModel): number =>
  f.units.filter((u) => u.kind === "solar").reduce((a, u) => a + u.capacityMW, 0);

/** PV that can be curtailed on instruction — legacy net metering cannot. */
export const dispatchableSolarMW = (f: FeederModel): number =>
  f.units
    .filter((u) => u.kind === "solar" && !u.distributed && u.status === "running")
    .reduce((a, u) => a + u.capacityMW, 0);

export const installedStorageMW = (f: FeederModel): number =>
  f.units.filter((u) => u.kind === "battery").reduce((a, u) => a + u.capacityMW, 0);

export const installedStorageMWh = (f: FeederModel): number =>
  f.units.filter((u) => u.kind === "battery").reduce((a, u) => a + (u.energyMWh ?? 0), 0);

/** True when the feeder has storage at all. */
export const hasStorage = (f: FeederModel): boolean => installedStorageMW(f) > 0;

/**
 * Rooftop PV as a share of the feeder's peak demand, %.
 *
 * The single number that says whether a feeder is near its hosting limit. Below
 * ~40 % a distribution feeder absorbs its own PV through the day; above ~70 % the
 * midday surplus starts meeting the daytime minimum and reverse flow follows.
 */
export const solarPenetrationPct = (f: FeederModel): number => 100 * f.solarPenetration;

/* ------------------------------------------------------------------ */
/* EV fleet figures                                                    */

/** Total connected charger capacity, MW. */
export const evConnectedMW = (ev: EvFleet) =>
  (ev.domesticChargers * ev.domesticRatingKW + ev.publicChargers * ev.publicRatingKW) / 1000;

/** Chargers on the feeder. */
export const evChargerCount = (ev: EvFleet) => ev.domesticChargers + ev.publicChargers;

/**
 * Share of connected charger capacity under DERMS control — the flexible part.
 *
 * Only the domestic units are enrolled. It bounds how much load smart charging
 * can shift, so the flexibility can never exceed the hardware providing it.
 */
export const evEnrolledShare = (ev: EvFleet) => {
  const total = evConnectedMW(ev);
  return total > 0 ? (ev.domesticChargers * ev.domesticRatingKW) / 1000 / total : 0;
};

/* ------------------------------------------------------------------ */
/* per-feeder lookups                                                  */

export const unitById = (f: FeederModel, id: string): Unit | undefined =>
  f.units.find((u) => u.id === id);

export const busById = (f: FeederModel, id: string): Bus | undefined =>
  f.buses.find((b) => b.id === id);
