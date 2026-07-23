import { useMemo } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card } from "@/components/ui/card";
import { Sun, BatteryCharging } from "lucide-react";
import { formatLKT, localParts, startOfLocalDay } from "@/pipeline/calendar";
import { capacityMW } from "@/pipeline/feeders";
import type { Bundle } from "@/pipeline/forecast";
import { buildChartRows, type RangeKey } from "@/components/ForecastChart";

interface Props {
  bundle: Bundle;
  range: RangeKey;
}

interface DerivedRow {
  ts: number;
  genActual?: number;
  genForecast?: number;
  evActual?: number;
  evForecast?: number;
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

const fmtMW = (v: number) => {
  const abs = Math.abs(v);
  if (abs >= 10) return v.toFixed(1);
  if (abs >= 1) return v.toFixed(2);
  if (abs >= 0.01) return v.toFixed(3);
  return v.toFixed(4);
};

function makeTicks(from: number, to: number, stepHours: number): number[] {
  const ticks: number[] = [];
  let t = startOfLocalDay(from);
  const step = stepHours * 3600_000;
  while (t < from) t += step;
  for (; t <= to; t += step) ticks.push(t);
  return ticks;
}

/**
 * Derives two companion forecasts from the same bundle the net-load chart uses,
 * so their timelines and history/forecast split line up exactly:
 *   - Solar generation: driven by time of day and the forecast cloud cover,
 *     scaled to the feeder's rooftop solar penetration.
 *   - EV charging load: an overnight + early-evening charging profile scaled to
 *     a share of feeder capacity.
 * The split at the forecast horizon mirrors the net-load chart (solid actual,
 * dashed forecast).
 */
export function GenerationEvCharts({ bundle, range }: Props) {
  const base = useMemo(() => buildChartRows(bundle, range), [bundle, range]);

  const firm = capacityMW(bundle.feeder);
  const solarMax = Math.max(0.02, bundle.feeder.solarPenetration * firm);
  const evMax = Math.max(0.02, 0.14 * firm);

  const rows = useMemo<DerivedRow[]>(() => {
    return base.map((r) => {
      const p = localParts(r.ts);
      const clear = solarShape(p.decimalHour);
      const cloud = r.cloud ?? 0;
      // Cloud cover suppresses output; a clear midday still leaves some diffuse.
      const gen = solarMax * clear * (1 - 0.72 * cloud);
      const ev = evMax * evShape(p.decimalHour);

      const isHistory = r.actual != null;
      const out: DerivedRow = { ts: r.ts };
      if (isHistory) {
        out.genActual = Math.max(0, gen * (0.9 + 0.2 * jitter(r.ts, 1)));
        out.evActual = Math.max(0, ev * (0.85 + 0.3 * jitter(r.ts, 2)));
      }
      // Forecast side (expected present) — smooth model curves.
      if (r.expected != null) {
        out.genForecast = Math.max(0, gen);
        out.evForecast = Math.max(0, ev);
      }
      return out;
    });
  }, [base, solarMax, evMax]);

  // Bridge the join so the solid history and dashed forecast meet at the horizon.
  const bridged = useMemo<DerivedRow[]>(() => {
    const copy = rows.map((r) => ({ ...r }));
    const lastHist = [...copy].reverse().find((r) => r.genActual != null);
    if (lastHist) {
      lastHist.genForecast = lastHist.genActual;
      lastHist.evForecast = lastHist.evActual;
    }
    return copy;
  }, [rows]);

  const domain: [number, number] = [bridged[0].ts, bridged[bridged.length - 1].ts];
  const stepHours = range === "24h" ? 6 : range === "7d" ? 24 : 72;
  const ticks = useMemo(() => makeTicks(domain[0], domain[1], stepHours), [domain, stepHours]);

  const tickFormat = (ts: number) => {
    const pp = localParts(ts);
    if (pp.hour === 0) return formatLKT(ts, { date: true, time: false });
    return `${String(pp.hour).padStart(2, "0")}:00`;
  };

  const genMax = bridged.reduce((m, r) => Math.max(m, r.genActual ?? 0, r.genForecast ?? 0), 0);
  const evYMax = bridged.reduce((m, r) => Math.max(m, r.evActual ?? 0, r.evForecast ?? 0), 0);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <MiniChart
        title="Energy generation - actual and forecast"
        subtitle="Rooftop solar · MW · Asia/Colombo"
        icon={<Sun className="h-4 w-4 text-amber-500" />}
        data={bridged}
        actualKey="genActual"
        forecastKey="genForecast"
        color="#f59e0b"
        yMax={genMax > 0 ? genMax * 1.15 : 1}
        area
        domain={domain}
        ticks={ticks}
        tickFormat={tickFormat}
        horizonStart={bundle.horizonStart}
        unit="MW"
      />
      <MiniChart
        title="EV charging - actual and forecast"
        subtitle="Aggregate EVSE demand · MW · Asia/Colombo"
        icon={<BatteryCharging className="h-4 w-4 text-emerald-500" />}
        data={bridged}
        actualKey="evActual"
        forecastKey="evForecast"
        color="#8b5cf6"
        yMax={evYMax > 0 ? evYMax * 1.15 : 1}
        domain={domain}
        ticks={ticks}
        tickFormat={tickFormat}
        horizonStart={bundle.horizonStart}
        unit="MW"
      />
    </div>
  );
}

interface MiniChartProps {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  data: DerivedRow[];
  actualKey: "genActual" | "evActual";
  forecastKey: "genForecast" | "evForecast";
  color: string;
  yMax: number;
  area?: boolean;
  domain: [number, number];
  ticks: number[];
  tickFormat: (ts: number) => string;
  horizonStart: number;
  unit: string;
}

function MiniChart({
  title,
  subtitle,
  icon,
  data,
  actualKey,
  forecastKey,
  color,
  yMax,
  area,
  domain,
  ticks,
  tickFormat,
  horizonStart,
  unit,
}: MiniChartProps) {
  return (
    <Card className="flex flex-col">
      <div className="flex items-start gap-2 p-4 pb-1">
        <span className="mt-0.5 shrink-0">{icon}</span>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 pb-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <svg width="18" height="8" aria-hidden className="shrink-0">
            <line x1="0" y1="4" x2="18" y2="4" stroke={color} strokeWidth="2.5" />
          </svg>
          Actual
        </span>
        <span className="flex items-center gap-1.5">
          <svg width="18" height="8" aria-hidden className="shrink-0">
            <line x1="0" y1="4" x2="18" y2="4" stroke={color} strokeWidth="2.5" strokeDasharray="5 3" />
          </svg>
          Forecast
        </span>
      </div>

      <div className="h-[200px] w-full px-1 pb-3 pr-4">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 12, right: 12, bottom: 4, left: 0 }}>
            <ReferenceArea
              x1={horizonStart}
              x2={domain[1]}
              fill={color}
              fillOpacity={0.05}
              stroke="none"
            />
            <CartesianGrid stroke="var(--viz-grid)" vertical={false} />
            <XAxis
              dataKey="ts"
              type="number"
              scale="time"
              domain={domain}
              ticks={ticks}
              tickFormatter={tickFormat}
              tick={{ fill: "var(--viz-axis)", fontSize: 10 }}
              tickLine={false}
              axisLine={{ stroke: "var(--viz-grid)" }}
              minTickGap={20}
            />
            <YAxis
              domain={[0, yMax]}
              width={44}
              tick={{ fill: "var(--viz-axis)", fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => fmtMW(v)}
            />

            {area && (
              <Area
                dataKey={actualKey}
                type="monotone"
                stroke="none"
                fill={color}
                fillOpacity={0.14}
                isAnimationActive={false}
                activeDot={false}
              />
            )}

            <Line
              dataKey={actualKey}
              type="monotone"
              stroke={color}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
              activeDot={{ r: 3.5, strokeWidth: 2, stroke: "var(--viz-surface)" }}
            />
            <Line
              dataKey={forecastKey}
              type="monotone"
              stroke={color}
              strokeWidth={2}
              strokeDasharray="6 4"
              dot={false}
              isAnimationActive={false}
              connectNulls
              activeDot={{ r: 3.5, strokeWidth: 2, stroke: "var(--viz-surface)" }}
            />

            <ReferenceLine
              x={horizonStart}
              stroke="var(--viz-divider)"
              strokeDasharray="4 4"
            />

            <RTooltip
              content={
                <MiniTooltip
                  actualKey={actualKey}
                  forecastKey={forecastKey}
                  color={color}
                  unit={unit}
                />
              }
              cursor={{ stroke: "var(--viz-divider)", strokeWidth: 1, strokeDasharray: "3 3" }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function MiniTooltip({
  active,
  payload,
  actualKey,
  forecastKey,
  color,
  unit,
}: {
  active?: boolean;
  payload?: Array<{ payload: DerivedRow }>;
  actualKey: "genActual" | "evActual";
  forecastKey: "genForecast" | "evForecast";
  color: string;
  unit: string;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  const actual = row[actualKey];
  const forecast = row[forecastKey];

  return (
    <div className="min-w-[180px] rounded-md border border-border bg-popover/97 p-3 shadow-xl backdrop-blur">
      <div className="mb-2 text-xs font-semibold">
        {formatLKT(row.ts, { date: true, time: true })}{" "}
        <span className="text-muted-foreground">LKT</span>
      </div>
      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-xs">
        {actual != null && (
          <>
            <dt className="flex items-center gap-2">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} aria-hidden />
              Actual
            </dt>
            <dd className="tnum text-right font-medium">{`${fmtMW(actual)} ${unit}`}</dd>
          </>
        )}
        {forecast != null && actual == null && (
          <>
            <dt className="flex items-center gap-2 text-muted-foreground">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} aria-hidden />
              Forecast
            </dt>
            <dd className="tnum text-right font-medium">{`${fmtMW(forecast)} ${unit}`}</dd>
          </>
        )}
      </dl>
    </div>
  );
}
