import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Dynamic Power Formatter:
 * Automatically scales between kW and MW depending on magnitude.
 * If abs(valMW) >= 1.0, returns value in MW (e.g., "12.5", unit: "MW").
 * If abs(valMW) < 1.0, returns value in kW (e.g., "500", unit: "kW").
 */
export function formatPower(valMW: number): { value: string; unit: string; full: string } {
  const abs = Math.abs(valMW);
  if (abs >= 1.0) {
    const formatted = abs >= 10 ? valMW.toFixed(1) : valMW.toFixed(2);
    return { value: formatted, unit: "MW", full: `${formatted} MW` };
  }
  const valKW = valMW * 1000;
  const formatted = Math.abs(valKW) >= 100 ? valKW.toFixed(0) : valKW.toFixed(1);
  return { value: formatted, unit: "kW", full: `${formatted} kW` };
}

/**
 * Feeder power, MW.
 *
 * `formatPower` switches unit at 1 MW, which is right when a value could be
 * either but wrong on a page where every axis is megawatts: labels that flip
 * between kW and MW down one axis are unreadable. This one stays in MW and sheds
 * decimals as the number grows, so a column of figures aligns.
 */
export function formatMW(valMW: number): string {
  const abs = Math.abs(valMW);
  if (abs >= 100) return valMW.toFixed(0);
  if (abs >= 10) return valMW.toFixed(1);
  return valMW.toFixed(2);
}

/** Signed variant, for flows and deltas where the direction is the message. */
export const formatSignedMW = (valMW: number): string =>
  `${valMW > 0 ? "+" : valMW < 0 ? "−" : ""}${formatMW(Math.abs(valMW))}`;

/**
 * Feeder energy, MWh.
 *
 * Fixed unit for the same reason as `formatMW`: a feeder day is 60–170 MWh and a
 * column that silently drops to kWh for one row cannot be scanned.
 */
export function formatMWh(valMWh: number): string {
  const abs = Math.abs(valMWh);
  if (abs >= 100) return valMWh.toFixed(0);
  if (abs >= 10) return valMWh.toFixed(1);
  return valMWh.toFixed(2);
}

/**
 * Dynamic Energy Formatter:
 * Automatically scales between kWh and MWh depending on magnitude.
 * If abs(valMWh) >= 1.0, returns value in MWh (e.g., "1.85", unit: "MWh").
 * If abs(valMWh) < 1.0, returns value in kWh (e.g., "450", unit: "kWh").
 */
export function formatEnergy(valMWh: number): { value: string; unit: string; full: string } {
  const abs = Math.abs(valMWh);
  if (abs >= 1.0) {
    const formatted = abs >= 10 ? valMWh.toFixed(1) : valMWh.toFixed(2);
    return { value: formatted, unit: "MWh", full: `${formatted} MWh` };
  }
  const valKWh = valMWh * 1000;
  const formatted = Math.abs(valKWh) >= 100 ? valKWh.toFixed(0) : valKWh.toFixed(1);
  return { value: formatted, unit: "kWh", full: `${formatted} kWh` };
}
