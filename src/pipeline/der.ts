/**
 * DER shapes — one EV model, one behind-the-meter PV model, for the whole app.
 *
 * These were private to `GenerationEvCharts.tsx`. The network dashboard needs
 * the same two shapes to size feeder DER, and a second copy would let the
 * Dashboard and the Generation/EV charts disagree about the same feeder at the
 * same instant — the class of defect nobody finds until a customer does.
 *
 * Both are pure functions of the timestamp, so a feeder's DER at any instant can
 * be reconstructed without replaying a series.
 */

import { localParts } from "./calendar";

/**
 * Deterministic small jitter so "actual" reads as measured data rather than a
 * clean model line, while staying reproducible across renders.
 */
export function jitter(ts: number, salt: number): number {
  const h = Math.sin(ts * 0.0000013 + salt) * 43758.5453;
  return h - Math.floor(h); // 0..1
}

/** Clear-sky solar shape: zero overnight, a bell peaking at solar noon. */
export function pvClearSky(decimalHour: number): number {
  const x = (decimalHour - 6) / 12; // sunrise ~06:00, sunset ~18:00
  if (x <= 0 || x >= 1) return 0;
  return Math.sin(Math.PI * x);
}

/** Which charging population a site's profile implies. */
export type EvProfile = "residential" | "industrial" | "evse";

/**
 * Realistic multi-modal EV charging profile generator based on empirical EVSE
 * load research (EPRI / NREL / IEEE EV load modeling).
 *
 * Models:
 * 1. Morning workplace & fleet arrival peak (07:30 – 10:30)
 * 2. Midday commercial / fast-charge top-up (12:00 – 14:00)
 * 3. Evening home-return arrival plug-in peak (17:30 – 20:30)
 * 4. Overnight smart-charging off-peak tariff window (22:30 – 03:30)
 * 5. Pre-dawn completion drop (04:30 – 06:30)
 * 6. Profile specific weighting (Residential vs Industrial vs Fast Charger)
 * 7. Weekday vs Weekend load shifts
 */
export function evShape(ts: number, profileType: EvProfile = "residential"): number {
  const parts = localParts(ts);
  const h = parts.decimalHour;
  const isWeekend = parts.weekday === 0 || parts.weekday === 6;

  // 1. Morning Workplace / Fleet Arrival Peak (08:30 center, stddev ~1.5h)
  const morningWorkplace = Math.exp(-((h - 8.5) ** 2) / 3.5);

  // 2. Midday Commercial / Fast-Charge Top-up Peak (13:00 center, stddev ~1.8h)
  const middayTopup = Math.exp(-((h - 13.0) ** 2) / 4.5);

  // 3. Evening Domestic Return Plug-in Peak (19:00 center, stddev ~1.6h)
  const eveningPlugIn = Math.exp(-((h - 19.0) ** 2) / 4.0);

  // 4. Overnight Off-Peak Smart Charging (Controlled TOU tariff: 23:00 - 03:30)
  const overnightSmart =
    0.75 * Math.exp(-((h - 0.5) ** 2) / 4.0) + 0.6 * Math.exp(-((h - 2.5) ** 2) / 5.0);

  // Standby / idle background consumption (vampire drain & controller electronics ~3%)
  const background = 0.03;

  let base = 0;

  if (profileType === "evse") {
    // Dedicated Fast Charger Hub: High daytime & commute activity, low overnight
    if (isWeekend) {
      base =
        background +
        0.4 * morningWorkplace +
        0.85 * middayTopup +
        0.75 * eveningPlugIn +
        0.12 * overnightSmart;
    } else {
      base =
        background +
        0.75 * morningWorkplace +
        0.65 * middayTopup +
        0.95 * eveningPlugIn +
        0.15 * overnightSmart;
    }
  } else if (profileType === "industrial") {
    // Commercial / Industrial Feeder: High morning & midday fleet/employee charging
    if (isWeekend) {
      base =
        background +
        0.2 * morningWorkplace +
        0.45 * middayTopup +
        0.3 * eveningPlugIn +
        0.08 * overnightSmart;
    } else {
      base =
        background +
        0.9 * morningWorkplace +
        0.7 * middayTopup +
        0.4 * eveningPlugIn +
        0.12 * overnightSmart;
    }
  } else {
    // Residential Feeder: Heavy evening plug-in + overnight smart charging
    if (isWeekend) {
      base =
        background +
        0.35 * morningWorkplace +
        0.55 * middayTopup +
        0.8 * eveningPlugIn +
        0.55 * overnightSmart;
    } else {
      base =
        background +
        0.45 * morningWorkplace +
        0.4 * middayTopup +
        0.95 * eveningPlugIn +
        0.7 * overnightSmart;
    }
  }

  // Realistic session arrival micro-jitter
  const sessionJitter = (jitter(ts, 7) - 0.5) * 0.05 * Math.sqrt(base);

  return Math.max(background, Number((base + sessionJitter).toFixed(4)));
}
