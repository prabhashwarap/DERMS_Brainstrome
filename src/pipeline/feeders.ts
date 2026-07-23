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
  moratuwa_north_f2: {
    id: "moratuwa_north_f2",
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
  moratuwa_north_f1: {
    id: "moratuwa_north_f1",
    name: "Rawatawatta",
    shortName: "Rawatawatta",
    substation: "Angulana Substation",
    capacityMVA: 14,
    powerFactor: 0.95,
    solarPenetration: 0.18,
    evPenetration: 0.14,
    hasSolar: true,
    hasEvCharging: true,
    loadFactor: 0.62,
    profile: "residential",
    mix: "Commercial & Residential",
    seed: 20260102,
    nodeType: "feeder",
    typeName: "Feeder Line",
    branchName: "Moratuwa Branch",
    cscName: "Moratuwa North CSC",
    substationName: "Angulana Substation",
    feederName: "Rawatawatta Feeder",
    derCombo: "Both Solar PV & EV Charging Active",
  },
  pitakotte_f1: {
    id: "pitakotte_f1",
    name: "Pita Kotte",
    shortName: "Pita Kotte",
    substation: "Pita Kotte Substation",
    capacityMVA: 15,
    powerFactor: 0.95,
    solarPenetration: 0.22,
    evPenetration: 0.16,
    hasSolar: true,
    hasEvCharging: true,
    loadFactor: 0.65,
    profile: "residential",
    mix: "Urban Residential & Offices",
    seed: 20260103,
    nodeType: "feeder",
    typeName: "Feeder Line",
    branchName: "Kotte Branch",
    cscName: "Pita Kotte CSC",
    substationName: "Pita Kotte Substation",
    feederName: "Pita Kotte Feeder",
    derCombo: "Both Solar PV & EV Charging Active",
  },
  pitakotte_f2: {
    id: "pitakotte_f2",
    name: "Nawala",
    shortName: "Nawala",
    substation: "Pita Kotte Substation",
    capacityMVA: 16,
    powerFactor: 0.95,
    solarPenetration: 0.28,
    evPenetration: 0.19,
    hasSolar: true,
    hasEvCharging: true,
    loadFactor: 0.68,
    profile: "industrial",
    mix: "Commercial & Tech Hub",
    seed: 20260104,
    nodeType: "feeder",
    typeName: "Feeder Line",
    branchName: "Kotte Branch",
    cscName: "Pita Kotte CSC",
    substationName: "Pita Kotte Substation",
    feederName: "Nawala Feeder",
    derCombo: "Both Solar PV & EV Charging Active",
  },
  nugegoda_f1: {
    id: "nugegoda_f1",
    name: "Nugegoda Town",
    shortName: "Nugegoda",
    substation: "Nugegoda Substation",
    capacityMVA: 18,
    powerFactor: 0.95,
    solarPenetration: 0.25,
    evPenetration: 0.15,
    hasSolar: true,
    hasEvCharging: true,
    loadFactor: 0.70,
    profile: "industrial",
    mix: "High-Density Commercial",
    seed: 20260105,
    nodeType: "feeder",
    typeName: "Feeder Line",
    branchName: "Nugegoda Branch",
    cscName: "Nugegoda CSC",
    substationName: "Nugegoda Substation",
    feederName: "Nugegoda Town Feeder",
    derCombo: "Both Solar PV & EV Charging Active",
  },
  maharagama_f1: {
    id: "maharagama_f1",
    name: "Maharagama",
    shortName: "Maharagama",
    substation: "Maharagama Substation",
    capacityMVA: 16,
    powerFactor: 0.95,
    solarPenetration: 0.20,
    evPenetration: 0.13,
    hasSolar: true,
    hasEvCharging: true,
    loadFactor: 0.64,
    profile: "residential",
    mix: "Commercial & Residential",
    seed: 20260106,
    nodeType: "feeder",
    typeName: "Feeder Line",
    branchName: "Nugegoda Branch",
    cscName: "Maharagama CSC",
    substationName: "Maharagama Substation",
    feederName: "Maharagama Feeder",
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
  seeduwa_f2: {
    id: "seeduwa_f2",
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
  galle_f1: {
    id: "galle_f1",
    name: "Galle Fort",
    shortName: "Galle Fort",
    substation: "Galle Substation",
    capacityMVA: 12,
    powerFactor: 0.95,
    solarPenetration: 0.30,
    evPenetration: 0.14,
    hasSolar: true,
    hasEvCharging: true,
    loadFactor: 0.60,
    profile: "residential",
    mix: "Heritage & Tourism Zone",
    seed: 20260301,
    nodeType: "feeder",
    typeName: "Feeder Line",
    branchName: "Galle Branch",
    cscName: "Galle CSC",
    substationName: "Galle Substation",
    feederName: "Galle Fort Feeder",
    derCombo: "Both Solar PV & EV Charging Active",
  },
};

export const FEEDER_LIST: Feeder[] = [FEEDERS.angulana, FEEDERS.katunayake];

/** Firm capacity in MW. */
export const capacityMW = (f: Feeder) => f.capacityMVA * f.powerFactor;
