/**
 * Supply and demand — the spine of the dashboard.
 *
 * The convention every system operator's public dashboard converges on: supply
 * stacked by source, demand as a single line over it, the forecast continuing
 * that same line past `now` in the same colour and dash. The gap between stack
 * and line *is* the imbalance, and it should be visible without reading a
 * number.
 *
 * The one departure is spilled solar, drawn as a translucent band above the
 * stack — deliberately above the demand line, because that is exactly what it
 * is: solar that existed, that the grid would not take. Kept translucent and
 * dashed so it can never read as supply.
 */

import { memo, useMemo } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
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
const SUPPLY_COLOR = "var(--src-conventional)";

export const SOURCE_COLOR: Record<SourceId, string> = {
  conventional: "var(--src-conventional)",
  solar: "var(--src-solar)",
  battery: "var(--src-battery)",
  import: "var(--src-import)",
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
  // Ticks on local hour boundaries. The past is sampled every 5 minutes and the
  // forecast every 15, so letting recharts choose would space them unevenly.
  const ticks = useMemo(() => {
    if (!rows.length) return [];
    const offset = LKT_OFFSET_MIN * 60_000;
    const from = rows[0].ts;
    const to = rows[rows.length - 1].ts;
    const out: number[] = [];
    for (let t = Math.ceil((from + offset) / 3600_000) * 3600_000 - offset; t <= to; t += 3600_000) {
      out.push(t);
    }
    return out;
  }, [rows]);

  const chartRows = useMemo(() => {
    return rows.map((r) => ({
      ts: r.ts,
      demand: r.load ?? 0,
      conventional: r.conventional ?? 0,
      solar: r.solar ?? 0,
      battery: r.battery ?? 0,
      import: r.import ?? 0,
      spilled: Math.max(0, (r.solarPotential ?? 0) - (r.solar ?? 0)),
    }));
  }, [rows]);

  const netBalanceMW = tick.generationMW - tick.loadMW;
  const balanceLevel = Math.abs(netBalanceMW) > 80 ? "critical" : Math.abs(netBalanceMW) > 35 ? "warning" : "normal";

  return (
    <Card className="flex flex-col gap-3 p-5">
      <PanelHeader title="Supply and demand" note="Live balance · last 6 h metered · MW">
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: DEMAND_COLOR }} />
          <span>Demand</span>
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: SUPPLY_COLOR }} />
          <span>Supply</span>
        </div>
      </PanelHeader>

      <div className="flex items-end justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <span className={cn("tnum text-[34px] font-semibold leading-none tracking-tight", balanceLevel === "normal" ? "text-foreground" : balanceLevel === "warning" ? "text-[var(--status-warning)]" : "text-[var(--status-critical)]")}>
            {formatSignedMW(netBalanceMW)}
          </span>
          <span className="text-sm font-medium text-muted-foreground">net balance</span>
        </div>
        <span className="tnum rounded-full border border-border/70 bg-muted/50 px-2.5 py-1 text-xs text-muted-foreground">
          {formatMW(tick.generationMW)} MW gen / {formatMW(tick.loadMW)} MW load
        </span>
      </div>

      <div className="h-[280px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartRows} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
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
            <Area
              type="monotone"
              dataKey="conventional"
              stackId="supply"
              fill="var(--src-conventional)"
              fillOpacity={0.72}
              stroke="var(--viz-surface)"
              strokeWidth={1.5}
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="solar"
              stackId="supply"
              fill="var(--src-solar)"
              fillOpacity={0.8}
              stroke="var(--viz-surface)"
              strokeWidth={1.5}
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="battery"
              stackId="supply"
              fill="var(--src-battery)"
              fillOpacity={0.8}
              stroke="var(--viz-surface)"
              strokeWidth={1.5}
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="import"
              stackId="supply"
              fill="var(--src-import)"
              fillOpacity={0.8}
              stroke="var(--viz-surface)"
              strokeWidth={1.5}
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="spilled"
              stackId="supply"
              fill="var(--src-solar)"
              fillOpacity={0.18}
              stroke="var(--src-solar)"
              strokeWidth={1}
              strokeDasharray="3 3"
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="demand"
              stroke={DEMAND_COLOR}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
            <ReferenceLine
              x={now}
              stroke="var(--viz-divider)"
              strokeDasharray="3 3"
              label={{ value: "now", position: "top", fill: "var(--viz-axis)", fontSize: 11 }}
            />
            <RTooltip content={<StackTooltip />} cursor={{ stroke: "var(--viz-divider)" }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
});

interface TooltipPayload {
  dataKey: string;
  value: number;
}

function StackTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: number;
}) {
  if (!active || !payload?.length || label == null) return null;

  const byKey = new Map(payload.map((p) => [p.dataKey, p.value]));
  const demand = byKey.get("demand") ?? 0;
  const conventional = byKey.get("conventional") ?? 0;
  const solar = byKey.get("solar") ?? 0;
  const battery = byKey.get("battery") ?? 0;
  const importValue = byKey.get("import") ?? 0;
  const supply = conventional + solar + battery + importValue;
  const balance = supply - demand;

  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-lg">
      <div className="mb-1.5 font-medium">{formatLKT(label, { date: true, time: true })}</div>
      <table className="tnum">
        <tbody>
          <tr>
            <td className="pr-2">Demand</td>
            <td className="text-right font-medium">{formatMW(demand)}</td>
          </tr>
          <tr>
            <td className="pr-2">Conventional</td>
            <td className="text-right font-medium">{formatMW(conventional)}</td>
          </tr>
          <tr>
            <td className="pr-2">Solar</td>
            <td className="text-right font-medium">{formatMW(solar)}</td>
          </tr>
          <tr>
            <td className="pr-2">Battery</td>
            <td className="text-right font-medium">{formatMW(battery)}</td>
          </tr>
          <tr>
            <td className="pr-2">Import</td>
            <td className="text-right font-medium">{formatMW(importValue)}</td>
          </tr>
          <tr className="border-t border-border">
            <td className="pr-2 pt-1">Net balance</td>
            <td className="pt-1 text-right font-medium">{formatSignedMW(balance)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
