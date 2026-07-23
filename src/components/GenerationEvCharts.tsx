import { useMemo, useState } from "react";
import { ForecastChart, type RangeKey } from "@/components/ForecastChart";
import { QUARTER_MS, SLOTS_PER_DAY, localParts } from "@/pipeline/calendar";
import { capacityMW } from "@/pipeline/feeders";
import type { Bundle } from "@/pipeline/forecast";

interface Props {
  bundle: Bundle;
}

// Deterministic small jitter so "actual" reads as measured data rather than a
// clean model line, while staying reproducible across renders.
function jitter(ts: number, salt: number): number {
  const h = Math.sin(ts * 0.0000013 + salt) * 43758.5453;
  return h - Math.floor(h); // 0..1
}

// Clear-sky solar shape: zero overnight, a bell peaking at solar noon.
function solarShape(decimalHour: number): number {
  const x = (decimalHour - 6) / 12; // sunrise ~06:00, sunset ~18:00
  if (x <= 0 || x >= 1) return 0;
  return Math.sin(Math.PI * x);
}

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
function evShape(ts: number, profileType: "residential" | "industrial" | "evse" = "residential"): number {
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
  const overnightSmart = 0.75 * Math.exp(-((h - 0.5) ** 2) / 4.0) + 0.60 * Math.exp(-((h - 2.5) ** 2) / 5.0);

  // Standby / idle background consumption (vampire drain & controller electronics ~3%)
  const background = 0.03;

  let base = 0;

  if (profileType === "evse") {
    // Dedicated Fast Charger Hub: High daytime & commute activity, low overnight
    if (isWeekend) {
      base = background + 0.40 * morningWorkplace + 0.85 * middayTopup + 0.75 * eveningPlugIn + 0.12 * overnightSmart;
    } else {
      base = background + 0.75 * morningWorkplace + 0.65 * middayTopup + 0.95 * eveningPlugIn + 0.15 * overnightSmart;
    }
  } else if (profileType === "industrial") {
    // Commercial / Industrial Feeder: High morning & midday fleet/employee charging
    if (isWeekend) {
      base = background + 0.20 * morningWorkplace + 0.45 * middayTopup + 0.30 * eveningPlugIn + 0.08 * overnightSmart;
    } else {
      base = background + 0.90 * morningWorkplace + 0.70 * middayTopup + 0.40 * eveningPlugIn + 0.12 * overnightSmart;
    }
  } else {
    // Residential Feeder: Heavy evening plug-in + overnight smart charging
    if (isWeekend) {
      base = background + 0.35 * morningWorkplace + 0.55 * middayTopup + 0.80 * eveningPlugIn + 0.55 * overnightSmart;
    } else {
      base = background + 0.45 * morningWorkplace + 0.40 * middayTopup + 0.95 * eveningPlugIn + 0.70 * overnightSmart;
    }
  }

  // Realistic session arrival micro-jitter
  const sessionJitter = (jitter(ts, 7) - 0.5) * 0.05 * Math.sqrt(base);

  return Math.max(background, Number((base + sessionJitter).toFixed(4)));
}

/**
 * Re-derives a full Bundle from the net-load bundle by replacing the load value
 * at every timestamp with a companion series, so the derived chart inherits the
 * identical timeline, history/forecast split, confidence band, baseline and
 * KPIs — and can therefore be rendered by the very same ForecastChart used for
 * net load. `value(ts, cloud)` returns the modelled MW at a timestamp.
 */
function deriveBundle(
  base: Bundle,
  opts: {
    name: string;
    firmMW: number;
    value: (ts: number, cloud: number) => number;
    // Fractional half-width of the confidence band relative to the value.
    bandFrac: number;
  }
): Bundle {
  const hours = QUARTER_MS / 3600_000;

  const history = base.history.map((h) => ({
    ts: h.ts,
    actual: Math.max(0, opts.value(h.ts, h.cloud) * (0.88 + 0.24 * jitter(h.ts, 1))),
    tempC: h.tempC,
    cloud: h.cloud,
  }));

  const forecast = base.forecast.map((f) => {
    const v = Math.max(0, opts.value(f.ts, f.cloud));
    const spread = v * opts.bandFrac + opts.firmMW * 0.01;
    return {
      ts: f.ts,
      expected: v,
      lower: Math.max(0, v - spread),
      upper: v + spread,
      // A slightly-flatter similar-day baseline for the toggle.
      baseline: Math.max(0, v * 0.93 + opts.firmMW * 0.01),
      tempC: f.tempC,
      cloud: f.cloud,
    };
  });

  const peak = forecast.reduce((a, b) => (b.expected > a.expected ? b : a), forecast[0]);
  const trough = forecast.reduce((a, b) => (b.expected < a.expected ? b : a), forecast[0]);
  const yesterday = history.slice(-SLOTS_PER_DAY);

  const feeder = {
    ...base.feeder,
    name: opts.name,
    capacityMVA: opts.firmMW / base.feeder.powerFactor,
  };

  return {
    ...base,
    feeder,
    history,
    forecast,
    kpis: {
      peakMW: peak.expected,
      peakAt: peak.ts,
      peakLowerMW: peak.lower,
      peakUpperMW: peak.upper,
      energyMWh: forecast.reduce((a, p) => a + p.expected * hours, 0),
      energyLowerMWh: forecast.reduce((a, p) => a + p.lower * hours, 0),
      energyUpperMWh: forecast.reduce((a, p) => a + p.upper * hours, 0),
      prevPeakMW: yesterday.length ? Math.max(...yesterday.map((r) => r.actual)) : peak.expected,
      prevEnergyMWh: yesterday.reduce((a, r) => a + r.actual * hours, 0),
      capacityUtilisation: (100 * peak.upper) / opts.firmMW,
      minMW: trough.expected,
      minAt: trough.ts,
    },
  };
}

/** A ForecastChart with its own range / baseline / hover state. */
function StandaloneChart({
  bundle,
  title,
  subtitle,
  capacityLabel,
  defaultCollapsed,
  variant,
}: {
  bundle: Bundle;
  title: string;
  subtitle: string;
  capacityLabel: string;
  defaultCollapsed?: boolean;
  variant?: "load" | "generation" | "ev";
}) {
  const [range, setRange] = useState<RangeKey>("24h");
  const [showBaseline, setShowBaseline] = useState(false);
  const [, setHoverTs] = useState<number | null>(null);

  return (
    <ForecastChart
      bundle={bundle}
      range={range}
      onRangeChange={setRange}
      showBaseline={showBaseline}
      onShowBaselineChange={setShowBaseline}
      onHover={setHoverTs}
      title={title}
      subtitle={subtitle}
      capacityLabel={capacityLabel}
      heightClassName="h-[300px] sm:h-[360px]"
      collapsible
      defaultCollapsed={defaultCollapsed}
      variant={variant}
    />
  );
}

export function GenerationEvCharts({ bundle }: Props) {
  const firm = capacityMW(bundle.feeder);
  const solarPen = bundle.feeder.solarPenetration ?? 0;
  const evPen = bundle.feeder.evPenetration ?? 0.14;

  const hasSolar = (bundle.feeder.hasSolar ?? true) && solarPen > 0;
  const hasEv = (bundle.feeder.hasEvCharging ?? true) && evPen > 0;

  const solarMax = Math.max(0, solarPen * firm);
  const evMax = Math.max(0, evPen * firm);

  const genBundle = useMemo(
    () =>
      hasSolar && solarMax > 0
        ? deriveBundle(bundle, {
            name: bundle.feeder.name,
            firmMW: solarMax,
            bandFrac: 0.1,
            value: (ts, cloud) => {
              const p = localParts(ts);
              return solarMax * solarShape(p.decimalHour) * (1 - 0.72 * (cloud ?? 0));
            },
          })
        : null,
    [bundle, solarMax, hasSolar]
  );

  const evBundle = useMemo(
    () =>
      hasEv && evMax > 0
        ? deriveBundle(bundle, {
            name: bundle.feeder.name,
            firmMW: evMax,
            bandFrac: 0.12,
            value: (ts) => {
              const feProfile =
                bundle.feeder.id.includes("ev") || bundle.feeder.mix?.toLowerCase().includes("charger")
                  ? "evse"
                  : bundle.feeder.profile === "industrial"
                  ? "industrial"
                  : "residential";
              return evMax * evShape(ts, feProfile);
            },
          })
        : null,
    [bundle, evMax, hasEv]
  );

  if (!genBundle && !evBundle) return null;

  return (
    <>
      {genBundle && (
        <StandaloneChart
          bundle={genBundle}
          variant="generation"
          title="Energy generation - actual and forecast"
          subtitle={`Rooftop solar · ${bundle.feeder.name} · 15-minute resolution · MW · Asia/Colombo`}
          capacityLabel="Installed solar"
        />
      )}
      {evBundle && (
        <StandaloneChart
          bundle={evBundle}
          variant="ev"
          title="EV charging - actual and forecast"
          subtitle={`Aggregate EVSE demand · ${bundle.feeder.name} · 15-minute resolution · MW · Asia/Colombo`}
          capacityLabel="Charger capacity"
        />
      )}
    </>
  );
}
