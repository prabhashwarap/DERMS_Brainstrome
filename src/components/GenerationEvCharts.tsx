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

// EV charging shape: an overnight off-peak trough-fill hump plus a larger
// early-evening arrival hump — the two moments EVs actually draw.
function evShape(decimalHour: number): number {
  const overnight = 0.55 * Math.exp(-((decimalHour - 2) ** 2) / 6);
  const evening = 1.0 * Math.exp(-((decimalHour - 19) ** 2) / 5);
  return 0.06 + overnight + evening;
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
}: {
  bundle: Bundle;
  title: string;
  subtitle: string;
  capacityLabel: string;
  defaultCollapsed?: boolean;
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
    />
  );
}

export function GenerationEvCharts({ bundle }: Props) {
  const firm = capacityMW(bundle.feeder);
  const solarMax = Math.max(0.02, bundle.feeder.solarPenetration * firm);
  const evMax = Math.max(0.02, 0.14 * firm);

  const genBundle = useMemo(
    () =>
      deriveBundle(bundle, {
        name: bundle.feeder.name,
        firmMW: solarMax,
        bandFrac: 0.1,
        value: (ts, cloud) => {
          const p = localParts(ts);
          return solarMax * solarShape(p.decimalHour) * (1 - 0.72 * (cloud ?? 0));
        },
      }),
    [bundle, solarMax]
  );

  const evBundle = useMemo(
    () =>
      deriveBundle(bundle, {
        name: bundle.feeder.name,
        firmMW: evMax,
        bandFrac: 0.12,
        value: (ts) => {
          const p = localParts(ts);
          return evMax * evShape(p.decimalHour);
        },
      }),
    [bundle, evMax]
  );

  return (
    <>
      <StandaloneChart
        bundle={genBundle}
        title="Energy generation - actual and forecast"
        subtitle={`Rooftop solar · ${bundle.feeder.name} · 15-minute resolution · MW · Asia/Colombo`}
        capacityLabel="Installed solar"
      />
      <StandaloneChart
        bundle={evBundle}
        title="EV charging - actual and forecast"
        subtitle={`Aggregate EVSE demand · ${bundle.feeder.name} · 15-minute resolution · MW · Asia/Colombo`}
        capacityLabel="Charger capacity"
      />
    </>
  );
}
