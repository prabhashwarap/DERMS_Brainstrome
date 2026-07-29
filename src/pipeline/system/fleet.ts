/**
 * Solar and storage registry, plus the conventional constraint.
 *
 * Only the assets this product manages appear as units: solar farms, the
 * aggregated rooftop fleet, and the batteries that buy solar more room. There
 * is no thermal or hydro register here — conventional plant enters the model
 * only as the two numbers below, because only those two numbers affect how much
 * solar the grid can carry.
 *
 * When a real EMS feed lands this file becomes a lookup against the asset
 * register — the same relationship `feeders.ts` has to the LECO register.
 */

import type { Bus, Unit } from "./types";

/**
 * The conventional fleet, reduced to its effect on solar.
 *
 * `FLOOR` is minimum stable generation across must-run synchronous plant: the
 * system cannot go below it, so every megawatt of it is a megawatt solar is not
 * allowed to serve. Lowering this floor is the single biggest lever on solar
 * penetration, which is why it is a named constant and not buried in a model.
 */
export const CONVENTIONAL = {
  /** Minimum stable generation of must-run plant, MW (Coal + Hydro must-run). */
  floorMW: 420,
  /** Maximum available conventional output, MW. Must cover peak with the tie. */
  capMW: 2550,
  /** Aggregate inertia contribution when at floor, GW·s. */
  inertiaAtFloorGWs: 2.1,
  /** Additional inertia per MW above floor, GW·s/MW. */
  inertiaPerMWGWs: 0.0042,
  /** Sustained ramp capability of the conventional fleet, MW/min. */
  rampMWPerMin: 46,
} as const;

export const BUSES: Bus[] = [
  { id: "hambantota", name: "Hambantota", nominalKV: 132, solarMW: 120 },
  { id: "monaragala", name: "Monaragala", nominalKV: 132, solarMW: 170 },
  { id: "vavuniya", name: "Vavuniya", nominalKV: 132, solarMW: 80 },
  { id: "mannar", name: "Mannar", nominalKV: 132, solarMW: 110 },
  { id: "kolonnawa", name: "Kolonnawa", nominalKV: 132, solarMW: 96 },
  { id: "pannipitiya", name: "Pannipitiya", nominalKV: 220, solarMW: 84 },
  { id: "biyagama", name: "Biyagama", nominalKV: 220, solarMW: 160 },
  { id: "matugama", name: "Matugama", nominalKV: 132, solarMW: 90 },
];

export const UNITS: Unit[] = [
  /* ---- utility solar -------------------------------------------------- */
  {
    id: "hambantota_solar",
    name: "Hambantota Solar",
    station: "Hambantota",
    kind: "solar",
    capacityMW: 120,
    rampMWPerMin: Infinity,
    responseClass: "primary",
    status: "running",
    busId: "hambantota",
  },
  {
    id: "siyambalanduwa_solar",
    name: "Siyambalanduwa Solar",
    station: "Siyambalanduwa",
    kind: "solar",
    capacityMW: 100,
    rampMWPerMin: Infinity,
    responseClass: "primary",
    status: "running",
    busId: "monaragala",
  },
  {
    id: "vavuniya_solar",
    name: "Vavuniya Solar",
    station: "Vavuniya",
    kind: "solar",
    capacityMW: 80,
    rampMWPerMin: Infinity,
    responseClass: "primary",
    status: "running",
    busId: "vavuniya",
  },
  {
    id: "mannar_solar",
    name: "Mannar Solar",
    station: "Mannar",
    kind: "solar",
    capacityMW: 110,
    rampMWPerMin: Infinity,
    responseClass: "primary",
    status: "running",
    busId: "mannar",
  },
  {
    id: "welikanda_solar",
    name: "Welikanda Solar",
    station: "Welikanda",
    kind: "solar",
    capacityMW: 90,
    rampMWPerMin: Infinity,
    responseClass: "primary",
    status: "forced-outage",
    busId: "biyagama",
  },
  {
    id: "monaragala_solar",
    name: "Monaragala Solar",
    station: "Monaragala",
    kind: "solar",
    capacityMW: 70,
    rampMWPerMin: Infinity,
    responseClass: "primary",
    status: "running",
    busId: "monaragala",
  },

  /* ---- distributed rooftop -------------------------------------------- */
  {
    id: "rooftop_pv",
    name: "Rooftop PV (aggregate)",
    station: "Distribution network",
    kind: "solar",
    capacityMW: 340,
    rampMWPerMin: Infinity,
    responseClass: "primary",
    // Behind the meter and not under dispatch control: it cannot be curtailed
    // on instruction, which is exactly what makes it the harder half of the
    // penetration problem.
    distributed: true,
    status: "running",
    busId: "kolonnawa",
  },

  /* ---- storage --------------------------------------------------------- */
  {
    id: "colombo_bess",
    name: "Colombo BESS",
    station: "Kolonnawa",
    kind: "battery",
    capacityMW: 60,
    rampMWPerMin: Infinity,
    responseClass: "primary",
    energyMWh: 120,
    status: "running",
    busId: "kolonnawa",
  },
  {
    id: "kotte_bess",
    name: "Kotte BESS",
    station: "Pannipitiya",
    kind: "battery",
    capacityMW: 30,
    rampMWPerMin: Infinity,
    responseClass: "primary",
    energyMWh: 45,
    status: "running",
    busId: "pannipitiya",
  },
];

export const UNIT_BY_ID: Record<string, Unit> = Object.fromEntries(
  UNITS.map((u) => [u.id, u])
);

export const BUS_BY_ID: Record<string, Bus> = Object.fromEntries(
  BUSES.map((b) => [b.id, b])
);

/** Installed solar, MW — the denominator for capacity-factor style figures. */
export const installedSolarMW = (): number =>
  UNITS.filter((u) => u.kind === "solar").reduce((a, u) => a + u.capacityMW, 0);

/** Solar that can be curtailed on instruction — rooftop cannot. */
export const dispatchableSolarMW = (): number =>
  UNITS.filter((u) => u.kind === "solar" && !u.distributed && u.status === "running").reduce(
    (a, u) => a + u.capacityMW,
    0
  );

export const installedStorageMW = (): number =>
  UNITS.filter((u) => u.kind === "battery").reduce((a, u) => a + u.capacityMW, 0);

export const installedStorageMWh = (): number =>
  UNITS.filter((u) => u.kind === "battery").reduce((a, u) => a + (u.energyMWh ?? 0), 0);

/**
 * The largest single infeed primary reserve is sized against. With conventional
 * plant lumped, this is the largest solar farm or the biggest credible block of
 * conventional loss, whichever is greater.
 */
export const largestInfeedMW = (): number =>
  Math.max(
    300,
    ...UNITS.filter((u) => u.status === "running").map((u) => u.capacityMW)
  );
