import { useMemo } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { QUARTER_MS, formatLKT, localParts, startOfLocalDay } from "@/pipeline/calendar";
import { capacityMW } from "@/pipeline/feeders";
import type { Bundle } from "@/pipeline/forecast";

export type RangeKey = "24h" | "7d" | "30d";

const RANGES: Record<RangeKey, { days: number; label: string; bucketMs: number }> = {
  "24h": { days: 1, label: "24 h", bucketMs: QUARTER_MS },
  "7d": { days: 7, label: "7 d", bucketMs: QUARTER_MS },
  // A month at 15-minute resolution is more marks than pixels; aggregate to the
  // hour so the shape stays honest instead of turning into a moiré pattern.
  "30d": { days: 30, label: "30 d", bucketMs: 4 * QUARTER_MS },
};

export interface ChartRow {
  ts: number;
  actual?: number;
  expected?: number;
  baseline?: number;
  band?: [number, number];
  tempC?: number;
  cloud?: number;
}

interface Props {
  bundle: Bundle;
  range: RangeKey;
  onRangeChange: (r: RangeKey) => void;
  showBaseline: boolean;
  onShowBaselineChange: (v: boolean) => void;
  onHover: (ts: number | null) => void;
}

export function buildChartRows(bundle: Bundle, range: RangeKey): ChartRow[] {
  const cfg = RANGES[range];
  const from = bundle.horizonStart - cfg.days * 86_400_000;

  const history = bundle.history.filter((h) => h.ts >= from);
  const rows: ChartRow[] = [];

  if (cfg.bucketMs === QUARTER_MS) {
    for (const h of history) {
      rows.push({ ts: h.ts, actual: h.actual, tempC: h.tempC, cloud: h.cloud });
    }
  } else {
    // Mean over each bucket: for load, the average is the physically meaningful
    // aggregate (it preserves energy), and the peak stays visible in the KPI row.
    const size = Math.round(cfg.bucketMs / QUARTER_MS);
    for (let i = 0; i + size <= history.length; i += size) {
      const slice = history.slice(i, i + size);
      rows.push({
        ts: slice[0].ts,
        actual: slice.reduce((a, b) => a + b.actual, 0) / size,
        tempC: slice.reduce((a, b) => a + b.tempC, 0) / size,
        cloud: slice.reduce((a, b) => a + b.cloud, 0) / size,
      });
    }
  }

  // Bridge the gap: the last actual also carries the forecast's first value so
  // the two lines join instead of showing a one-slot break at T-0.
  if (rows.length) {
    rows[rows.length - 1] = {
      ...rows[rows.length - 1],
      expected: rows[rows.length - 1].actual,
      baseline: rows[rows.length - 1].actual,
      band: [rows[rows.length - 1].actual!, rows[rows.length - 1].actual!],
    };
  }

  for (const f of bundle.forecast) {
    rows.push({
      ts: f.ts,
      expected: f.expected,
      baseline: f.baseline,
      band: [f.lower, f.upper],
      tempC: f.tempC,
      cloud: f.cloud,
    });
  }
  return rows;
}

/** Tick positions at local-midnight-aligned intervals. */
function makeTicks(from: number, to: number, stepHours: number): number[] {
  const ticks: number[] = [];
  let t = startOfLocalDay(from);
  const step = stepHours * 3600_000;
  while (t < from) t += step;
  for (; t <= to; t += step) ticks.push(t);
  return ticks;
}

export function ForecastChart({
  bundle,
  range,
  onRangeChange,
  showBaseline,
  onShowBaselineChange,
  onHover,
}: Props) {
  const rows = useMemo(() => buildChartRows(bundle, range), [bundle, range]);

  const domain: [number, number] = [rows[0].ts, rows[rows.length - 1].ts];
  const stepHours = range === "24h" ? 3 : range === "7d" ? 12 : 72;
  const ticks = useMemo(() => makeTicks(domain[0], domain[1], stepHours), [domain, stepHours]);

  const maxValue = rows.reduce(
    (m, r) => Math.max(m, r.actual ?? 0, r.band?.[1] ?? 0, r.baseline ?? 0),
    0
  );
  const peakNearRightEdge =
    (bundle.kpis.peakAt - domain[0]) / (domain[1] - domain[0]) > 0.86;
  const firm = capacityMW(bundle.feeder);
  const yMax = Math.ceil(maxValue * 1.08);
  const showCapacity = firm <= yMax * 1.02;

  const tickFormat = (ts: number) => {
    const p = localParts(ts);
    if (p.hour === 0) return formatLKT(ts, { date: true, time: false });
    return `${String(p.hour).padStart(2, "0")}:00`;
  };

  return (
    <Card className="flex flex-col">
      <div className="flex flex-wrap items-start justify-between gap-3 p-4 pb-2">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">
            Net load — actual and day-ahead forecast
          </h2>
          <p className="text-xs text-muted-foreground">
            {bundle.feeder.name} · 15-minute resolution · MW · Asia/Colombo
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
            <Switch checked={showBaseline} onCheckedChange={onShowBaselineChange} />
            Similar-day baseline
          </label>
          <Tabs value={range} onValueChange={(v) => onRangeChange(v as RangeKey)}>
            <TabsList>
              {(Object.keys(RANGES) as RangeKey[]).map((k) => (
                <TabsTrigger key={k} value={k}>
                  {RANGES[k].label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      </div>

      <Legend showBaseline={showBaseline} />

      {/* Explicit height: the canvas is sized for the data (a 15-minute series
          needs vertical room to resolve), not stretched to match a neighbour. */}
      <div className="h-[520px] px-1 pb-3 pr-4">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={rows}
            margin={{ top: 24, right: 16, bottom: 8, left: 0 }}
            onMouseMove={(s: { activeLabel?: string | number }) =>
              onHover(typeof s?.activeLabel === "number" ? s.activeLabel : null)
            }
            onMouseLeave={() => onHover(null)}
          >
            {/* A barely-there tint over the horizon. It costs no ink but makes
                "this part hasn't happened yet" true at a glance, not on
                inspection of the line style. */}
            <ReferenceArea
              x1={bundle.horizonStart}
              x2={domain[1]}
              fill="var(--viz-forecast)"
              fillOpacity={0.045}
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
              tick={{ fill: "var(--viz-axis)", fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: "var(--viz-grid)" }}
              minTickGap={16}
            />
            <YAxis
              domain={[0, yMax]}
              width={52}
              tick={{ fill: "var(--viz-axis)", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => `${v.toFixed(0)}`}
            />

            {/* 95 % prediction interval. Low alpha so gridlines and the expected
                line stay legible through it — an envelope, not a wall. */}
            <Area
              dataKey="band"
              type="monotone"
              stroke="none"
              fill="var(--viz-band)"
              isAnimationActive={false}
              connectNulls
              activeDot={false}
            />

            {showBaseline && (
              <Line
                dataKey="baseline"
                type="monotone"
                stroke="var(--viz-baseline)"
                strokeWidth={1.75}
                strokeDasharray="2 3"
                dot={false}
                isAnimationActive={false}
                connectNulls
                activeDot={false}
              />
            )}

            <Line
              dataKey="actual"
              type="monotone"
              stroke="var(--viz-actual)"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--viz-surface)" }}
            />
            <Line
              dataKey="expected"
              type="monotone"
              stroke="var(--viz-forecast)"
              strokeWidth={2}
              strokeDasharray="7 4"
              dot={false}
              isAnimationActive={false}
              connectNulls
              activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--viz-surface)" }}
            />

            {showCapacity && (
              <ReferenceLine
                y={firm}
                stroke="var(--viz-divider)"
                strokeDasharray="2 6"
                label={{
                  value: `Firm capacity ${firm.toFixed(1)} MW`,
                  position: "insideTopRight",
                  fill: "var(--viz-axis)",
                  fontSize: 10,
                }}
              />
            )}

            <ReferenceLine
              x={bundle.horizonStart}
              stroke="var(--viz-divider)"
              strokeDasharray="4 4"
              label={{
                // On the 30-day view the horizon is a sliver, so the label sits
                // on the history side of the divider instead of overflowing.
                value: range === "30d" ? "← history | forecast" : "Forecast horizon →",
                position: range === "30d" ? "insideTopRight" : "insideTopLeft",
                fill: "var(--viz-axis)",
                fontSize: 10,
                offset: 8,
              }}
            />

            {/* One direct label, on the number the whole screen exists to
                surface. Every other point is read via the crosshair. */}
            <ReferenceDot
              x={bundle.kpis.peakAt}
              y={bundle.kpis.peakMW}
              r={4}
              fill="var(--viz-forecast)"
              stroke="var(--viz-surface)"
              strokeWidth={2}
              label={{
                value: `Peak ${bundle.kpis.peakMW.toFixed(1)} MW · ${formatLKT(bundle.kpis.peakAt)}`,
                // Flip the label inwards near the right edge so it never clips.
                position: peakNearRightEdge ? "left" : "top",
                fill: "hsl(var(--foreground))",
                fontSize: 11,
                offset: 10,
              }}
            />

            <RTooltip
              content={<ChartTooltip showBaseline={showBaseline} />}
              cursor={{ stroke: "var(--viz-divider)", strokeWidth: 1, strokeDasharray: "3 3" }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function Swatch({ color, dashed }: { color: string; dashed?: boolean }) {
  return (
    <svg width="18" height="8" aria-hidden className="shrink-0">
      <line
        x1="0"
        y1="4"
        x2="18"
        y2="4"
        stroke={color}
        strokeWidth="2.5"
        strokeDasharray={dashed ? "5 3" : undefined}
      />
    </svg>
  );
}

function Legend({ showBaseline }: { showBaseline: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 pb-1 text-xs text-muted-foreground">
      <span className="flex items-center gap-2">
        <Swatch color="var(--viz-actual)" />
        Actual (recorded)
      </span>
      <span className="flex items-center gap-2">
        <Swatch color="var(--viz-forecast)" dashed />
        Forecast (predicted)
      </span>
      <span className="flex items-center gap-2">
        <span
          className="h-3 w-5 shrink-0 rounded-sm border"
          style={{ background: "var(--viz-band)", borderColor: "var(--viz-band)" }}
          aria-hidden
        />
        95% confidence
      </span>
      {showBaseline && (
        <span className="flex items-center gap-2">
          <Swatch color="var(--viz-baseline)" dashed />
          Similar-day baseline
        </span>
      )}
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="cursor-help underline decoration-dotted underline-offset-4">
            Why dashed?
          </span>
        </TooltipTrigger>
        <TooltipContent>
          Solid means recorded fact; dashed means prediction. The vertical divider marks the
          boundary, so the two are never confused at a glance.
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

interface TooltipPayloadItem {
  payload: ChartRow;
}

function ChartTooltip({
  active,
  payload,
  showBaseline,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  showBaseline: boolean;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;

  return (
    <div className="min-w-[210px] rounded-md border border-border bg-popover/97 p-3 shadow-xl backdrop-blur">
      <div className="mb-2 text-xs font-semibold">
        {formatLKT(row.ts, { date: true, time: true })} <span className="text-muted-foreground">LKT</span>
      </div>
      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-xs">
        {row.actual != null && (
          <Row color="var(--viz-actual)" label="Actual" value={`${row.actual.toFixed(2)} MW`} />
        )}
        {row.expected != null && (
          <Row
            color="var(--viz-forecast)"
            label="Expected"
            value={`${row.expected.toFixed(2)} MW`}
          />
        )}
        {row.band && row.band[0] !== row.band[1] && (
          <Row
            label="95% range"
            value={`${row.band[0].toFixed(2)} – ${row.band[1].toFixed(2)} MW`}
            muted
          />
        )}
        {showBaseline && row.baseline != null && (
          <Row
            color="var(--viz-baseline)"
            label="Baseline"
            value={`${row.baseline.toFixed(2)} MW`}
          />
        )}
        {row.tempC != null && (
          <Row label="Temperature" value={`${row.tempC.toFixed(1)} °C`} muted />
        )}
        {row.cloud != null && (
          <Row label="Cloud cover" value={`${Math.round(row.cloud * 100)}%`} muted />
        )}
      </dl>
    </div>
  );
}

function Row({
  color,
  label,
  value,
  muted,
}: {
  color?: string;
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <>
      <dt className={`flex items-center gap-2 ${muted ? "text-muted-foreground" : ""}`}>
        {color && (
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ background: color }}
            aria-hidden
          />
        )}
        {!color && <span className="w-2" aria-hidden />}
        {label}
      </dt>
      <dd className={`tnum text-right font-medium ${muted ? "text-muted-foreground" : ""}`}>
        {value}
      </dd>
    </>
  );
}
