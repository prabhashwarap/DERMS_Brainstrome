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
  /** Annual load factor (mean load / peak load). */
  loadFactor: number;
  profile: "residential" | "industrial";
  mix: string;
  seed: number;
}

export const FEEDERS: Record<FeederId, Feeder> = {
  angulana: {
    id: "angulana",
    name: "Velona / Angulana",
    shortName: "Angulana",
    substation: "Angulana GSS",
    capacityMVA: 13,
    powerFactor: 0.95,
    solarPenetration: 0.09,
    loadFactor: 0.52,
    profile: "residential",
    mix: "Residential dominated",
    seed: 20260101,
  },
  katunayake: {
    id: "katunayake",
    name: "Seeduwa / Katunayake",
    shortName: "Katunayake",
    substation: "Katunayake GSS",
    capacityMVA: 22,
    powerFactor: 0.95,
    solarPenetration: 0.34,
    loadFactor: 0.58,
    profile: "industrial",
    mix: "Industrial + commercial",
    seed: 20260202,
  },
};

export const FEEDER_LIST = Object.values(FEEDERS);

/** Firm capacity in MW. */
export const capacityMW = (f: Feeder) => f.capacityMVA * f.powerFactor;
