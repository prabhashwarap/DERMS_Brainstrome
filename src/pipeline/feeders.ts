/**
 * Feeder registry.
 *
 * Capacities and solar penetration figures come from the LECO pilot brief.
 * When the live feed arrives this file becomes a lookup against the real
 * asset register — nothing downstream needs to change.
 */

export type FeederId = string;

export interface Feeder {
  id: FeederId;
  name: string;
  shortName: string;
  substation: string;
  /** Total transformer capacity, MVA. */
  capacityMVA: number;
  /** Assumed power factor, used to express capacity in MW. */
  powerFactor: number;
  /** Rooftop solar penetration as a fraction of peak load. */
  solarPenetration: number;
  /** EV charging penetration as a fraction of peak load. */
  evPenetration?: number;
  /** Explicit flag if this feeder/endpoint has solar generation data available. */
  hasSolar?: boolean;
  /** Explicit flag if this feeder/endpoint has EV charging data available. */
  hasEvCharging?: boolean;
  /** Annual load factor (mean load / peak load). */
  loadFactor: number;
  profile: "residential" | "industrial";
  mix: string;
  seed: number;

  /** Grid hierarchy node type. */
  nodeType?:
    | "branch"
    | "csc"
    | "substation"
    | "feeder"
    | "transformer"
    | "meterEndpoint"
    | "distributedSolar"
    | "evse"
    | "distributedBattery"
    | "utilitySolar"
    | "utilityBattery"
    | "recloser";
  typeName?: string;
  branchName?: string;
  cscName?: string;
  substationName?: string;
  feederName?: string;
  transformerName?: string;
  consumerName?: string;
  derCombo?: string;
}

export const FEEDERS: Record<FeederId, Feeder> = {
  angulana: {
    id: "angulana",
    name: "Velona / Angulana",
    shortName: "Angulana",
    substation: "Angulana Substation",
    capacityMVA: 13,
    powerFactor: 0.95,
    solarPenetration: 0.09,
    evPenetration: 0.12,
    hasSolar: true,
    hasEvCharging: true,
    loadFactor: 0.52,
    profile: "residential",
    mix: "Residential dominated",
    seed: 20260101,
    nodeType: "feeder",
    typeName: "Feeder Line",
    branchName: "Moratuwa Branch",
    cscName: "Moratuwa North CSC",
    substationName: "Angulana Substation",
    feederName: "Velona / Angulana Feeder",
    derCombo: "Both Solar PV & EV Charging Active",
  },
  katunayake: {
    id: "katunayake",
    name: "Seeduwa / Katunayake",
    shortName: "Katunayake",
    substation: "Katunayake Substation",
    capacityMVA: 22,
    powerFactor: 0.95,
    solarPenetration: 0.34,
    evPenetration: 0.18,
    hasSolar: true,
    hasEvCharging: true,
    loadFactor: 0.58,
    profile: "industrial",
    mix: "Industrial + commercial",
    seed: 20260202,
    nodeType: "feeder",
    typeName: "Feeder Line",
    branchName: "Negombo Branch",
    cscName: "Seeduwa CSC",
    substationName: "Katunayake Substation",
    feederName: "Seeduwa / Katunayake Feeder",
    derCombo: "Both Solar PV & EV Charging Active",
  },
};

export const FEEDER_LIST = Object.values(FEEDERS);

/** Firm capacity in MW. */
export const capacityMW = (f: Feeder) => f.capacityMVA * f.powerFactor;
