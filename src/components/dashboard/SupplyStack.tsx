/**
 * Supply and demand — the spine of the dashboard.
 *
 * Stacks supply by source (Solar and Other), demand as a single line over it,
 * and the forecast continuing that line past `now`.
 */

import { memo, useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card } from "@/components/ui/card";
import { PanelHeader } from "./tiles";
import { LKT_OFFSET_MIN, formatLKT } from "@/pipeline/calendar";
import type { StackRow } from "@/lib/useBalance";
import { cn, formatMW, formatSignedMW } from "@/lib/utils";
import type { SystemTick, SourceId } from "@/pipeline/system/types";

const DEMAND_COLOR = "var(--viz-input)";

export const SOURCE_COLOR: Record<SourceId, string> = {
  other: "var(--src-conventional)",
  solar: "var(--src-solar)",
};

/**
 * Memoised on purpose. The page holds one 1 Hz clock for the frequency readouts;
 * this chart's data changes once a minute, and re-rendering a 100-point stacked
 * area every second to show the same shape is the kind of cost that makes a
 * control-room page feel slow.
 */
export const SupplyStack = memo(function SupplyStack({
  rows,
  now,
  tick,
}: {
  rows: StackRow[];
  now: number;
  tick: SystemTick;
}) {
  // Ticks on local hour boundaries.
  const ticks = useMemo(() => {
    if (!rows.length) return [];
    const offset = LKT_OFFSET_MIN * 60_000;
    const from = rows[0].ts;
    const to = rows[rows.length - 1].ts;
    const out: number[] = [];
    const stepMs = 4 * 3600_000;
    for (let t = Math.ceil((from + offset) / stepMs) * stepMs - offset; t <= to; t += stepMs) {
      out.push(t);
    }
    return out;
  }, [rows]);

  const chartRows = useMemo(() => {
    return rows.map((r) => {
      const other = Math.max(0, r.other ?? 0);
      const solar = Math.max(0, r.solar ?? 0);
      const totalSupply = other + solar;

      const isPastOrNow = r.load !== undefined;
      const isFutureOrNow = r.loadForecast !== undefined;
      const demandVal = r.load ?? r.loadForecast ?? 0;
      const spill = Math.max(0, r.solarPotential - solar);

      return {
        ts: r.ts,
        // Past stacked series
        other: isPastOrNow ? other : undefined,
        solar: isPastOrNow ? solar : undefined,
        // Future stacked series
        otherForecast: isFutureOrNow ? other : undefined,
        solarForecast: isFutureOrNow ? solar : undefined,

        // Demand lines
        load: isPastOrNow ? r.load : undefined,
        loadForecast: isFutureOrNow ? r.loadForecast : undefined,

        // Raw numbers for tooltips
        rawOther: other,
        rawSolar: solar,
        demandVal,
        supplyVal: totalSupply,
        spillVal: spill,
      };
    });
  }, [rows]);

  const netBalanceMW = tick.generationMW + tick.interchangeMW - tick.loadMW;
  const balanceLevel = Math.abs(netBalanceMW) > 80 ? "critical" : Math.abs(netBalanceMW) > 35 ? "warning" : "normal";

  return (
    <Card className="flex flex-col gap-3 p-5">
      <PanelHeader title="Supply and demand" note="Live grid balance · 24 h metered · 24 h forecast · MW">
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: SOURCE_COLOR.solar }} />
            <span>Solar</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: SOURCE_COLOR.other }} />
            <span>Other</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: DEMAND_COLOR }} />
            <span>Demand</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-3 border-t-2 border-dashed" style={{ borderColor: DEMAND_COLOR }} />
            <span>Forecast</span>
          </span>
        </div>
      </PanelHeader>

      <div className="flex items-baseline gap-2">
        <span className={cn("tnum text-[34px] font-semibold leading-none tracking-tight", balanceLevel === "normal" ? "text-foreground" : balanceLevel === "warning" ? "text-[var(--status-warning)]" : "text-[var(--status-critical)]")}>
          {formatSignedMW(netBalanceMW)}
        </span>
        <span className="text-sm font-medium text-muted-foreground">MW net balance</span>
      </div>

      <div className="h-[280px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartRows} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
            <CartesianGrid stroke="var(--viz-grid)" vertical={false} />
            <XAxis
              dataKey="ts"
              type="number"
              scale="time"
              domain={["dataMin", "dataMax"]}
              ticks={ticks}
              tickFormatter={(t) => formatLKT(t, { time: true })}
              tick={{ fill: "var(--viz-axis)", fontSize: 11 }}
              axisLine={{ stroke: "var(--viz-grid)" }}
              tickLine={false}
              minTickGap={24}
            />
            <YAxis
              tick={{ fill: "var(--viz-axis)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={44}
              tickFormatter={(v: number) => formatMW(v)}
            />

            {/* Past Stacked Supply Areas */}
            <Area
              stackId="supply"
              type="monotone"
              dataKey="other"
              fill={SOURCE_COLOR.other}
              fillOpacity={0.45}
              stroke={SOURCE_COLOR.other}
              strokeWidth={1}
              isAnimationActive={false}
              connectNulls={false}
            />
            <Area
              stackId="supply"
              type="monotone"
              dataKey="solar"
              fill={SOURCE_COLOR.solar}
              fillOpacity={0.55}
              stroke={SOURCE_COLOR.solar}
              strokeWidth={1}
              isAnimationActive={false}
              connectNulls={false}
            />

            {/* Forecasted Stacked Supply Areas */}
            <Area
              stackId="supplyFc"
              type="monotone"
              dataKey="otherForecast"
              fill={SOURCE_COLOR.other}
              fillOpacity={0.2}
              stroke={SOURCE_COLOR.other}
              strokeDasharray="4 4"
              strokeWidth={1}
              isAnimationActive={false}
              connectNulls={false}
            />
            <Area
              stackId="supplyFc"
              type="monotone"
              dataKey="solarForecast"
              fill={SOURCE_COLOR.solar}
              fillOpacity={0.25}
              stroke={SOURCE_COLOR.solar}
              strokeDasharray="4 4"
              strokeWidth={1}
              isAnimationActive={false}
              connectNulls={false}
            />

            {/* Demand Lines */}
            <Line
              type="monotone"
              dataKey="load"
              stroke={DEMAND_COLOR}
              strokeWidth={2.4}
              dot={false}
              isAnimationActive={false}
              connectNulls={false}
            />
            <Line
              type="monotone"
              dataKey="loadForecast"
              stroke={DEMAND_COLOR}
              strokeDasharray="4 4"
              strokeWidth={2.4}
              dot={false}
              isAnimationActive={false}
              connectNulls={false}
            />
            <ReferenceLine
              x={now}
              stroke="var(--viz-divider)"
              strokeDasharray="3 3"
              label={{ value: "now", position: "top", fill: "var(--viz-axis)", fontSize: 11 }}
            />
            <RTooltip content={<StackTooltip now={now} />} cursor={{ stroke: "var(--viz-divider)" }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
});

interface TooltipPayload {
  dataKey: string;
  value: number;
  payload: {
    ts: number;
    rawOther: number;
    rawSolar: number;
    demandVal: number;
    supplyVal: number;
    spillVal: number;
  };
}

function StackTooltip({
  active,
  payload,
  label,
  now,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: number;
  now?: number;
}) {
  if (!active || !payload?.length || label == null) return null;

  const rowData = payload[0]?.payload;
  const isForecast = label > (now ?? 0);
  const demand = rowData?.demandVal ?? 0;
  const other = rowData?.rawOther ?? 0;
  const solar = rowData?.rawSolar ?? 0;
  const supply = other + solar;
  const balance = supply - demand;

  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2.5 text-xs shadow-lg">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="font-medium">{formatLKT(label, { date: true, time: true })}</span>
        <span
          className={cn(
            "rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider",
            isForecast ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
          )}
        >
          {isForecast ? "Forecast" : "Metered"}
        </span>
      </div>
      <table className="tnum w-full">
        <tbody>
          <tr>
            <td className="pr-3 text-muted-foreground">Demand</td>
            <td className="text-right font-medium">{formatMW(demand)}</td>
          </tr>
          <tr className="border-t border-border/50">
            <td className="pr-3 text-[11px] text-muted-foreground">Solar</td>
            <td className="text-right text-[11px] font-medium text-[var(--src-solar)]">{formatMW(solar)}</td>
          </tr>
          <tr>
            <td className="pr-3 text-[11px] text-muted-foreground">Other</td>
            <td className="text-right text-[11px] font-medium">{formatMW(other)}</td>
          </tr>
          <tr className="border-t border-border">
            <td className="pr-3 pt-1 font-medium">Total Supply</td>
            <td className="pt-1 text-right font-medium">{formatMW(supply)}</td>
          </tr>
          <tr>
            <td className="pr-3 pt-0.5 font-medium">Net balance</td>
            <td
              className={cn(
                "pt-0.5 text-right font-semibold",
                Math.abs(balance) > 50 ? "text-[var(--status-warning)]" : "text-foreground"
              )}
            >
              {formatSignedMW(balance)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
