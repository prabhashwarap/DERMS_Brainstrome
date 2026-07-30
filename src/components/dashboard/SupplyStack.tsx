/**
 * Supply and demand — the spine of the dashboard.
 *
 * Stacks supply by source — grid, storage, rooftop PV — with feeder demand as a
 * single line over it, and the forecast continuing that line past `now`.
 *
 * Grid and storage carry their sign, so a charging battery and a back-feeding
 * infeed appear as bands *below* the axis. That means the demand line cuts
 * through the positive stack rather than capping it, and the gap between them is
 * exactly the rooftop PV going to storage or back up to the primary instead of to
 * a consumer — which is the thing worth seeing.
 *
 * The hero figure is the *infeed flow*, not a balance residual. On a distribution
 * feeder the residual is always zero — the upstream network balances it by
 * definition — so reporting it would be reporting arithmetic. What an operator
 * needs is the direction and size of the flow at the primary, because that is the
 * number that heads toward zero at midday as PV grows.
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

import type { FeederModel, SystemTick, SourceId } from "@/pipeline/system/types";

const DEMAND_COLOR = "var(--viz-input)";

export const SOURCE_COLOR: Record<SourceId, string> = {
  solar: "var(--src-solar)",
  battery: "var(--src-battery)",
  grid: "var(--src-conventional)",
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
  feeder,
}: {
  rows: StackRow[];
  now: number;
  tick: SystemTick;
  feeder: FeederModel;
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
      const gridRaw = r.grid ?? 0;
      const batteryRaw = r.battery ?? 0;
      const solar = Math.max(0, r.solar ?? 0);

      // Stack physical supply sources positively (>= 0) starting from Y = 0
      const gridImport = Math.max(0, gridRaw);
      const batteryDischarge = Math.max(0, batteryRaw);
      const solarSupply = solar;
      const totalSupply = gridImport + batteryDischarge + solarSupply;

      const isPastOrNow = r.load !== undefined;
      const isFutureOrNow = r.loadForecast !== undefined;
      const demandVal = r.load ?? r.loadForecast ?? 0;
      const batteryCharge = Math.max(0, -batteryRaw);
      const grossDemandVal = demandVal + batteryCharge;
      const spill = Math.max(0, r.solarPotential - solar);
      const gridExport = Math.max(0, -gridRaw);

      return {
        ts: r.ts,
        // Past stacked series (positive supply)
        grid: isPastOrNow ? gridImport : undefined,
        battery: isPastOrNow ? batteryDischarge : undefined,
        solar: isPastOrNow ? solarSupply : undefined,
        // Future stacked series (positive supply)
        gridForecast: isFutureOrNow ? gridImport : undefined,
        batteryForecast: isFutureOrNow ? batteryDischarge : undefined,
        solarForecast: isFutureOrNow ? solarSupply : undefined,

        // Demand lines
        load: isPastOrNow ? r.load : undefined,
        loadForecast: isFutureOrNow ? r.loadForecast : undefined,
        grossLoad: isPastOrNow && batteryCharge > 0.01 ? grossDemandVal : undefined,
        grossLoadForecast: isFutureOrNow && batteryCharge > 0.01 ? grossDemandVal : undefined,

        // Raw numbers for tooltips
        rawGrid: gridRaw,
        rawBattery: batteryRaw,
        rawSolar: solar,
        gridImport,
        gridExport,
        batteryDischarge,
        batteryCharge,
        demandVal,
        grossDemandVal,
        supplyVal: totalSupply,
        spillVal: spill,
        transformerFlowVal: r.transformerFlow,
      };
    });
  }, [rows]);

  const flowMW = tick.transformerFlowMW;
  const exporting = flowMW < 0;
  // Judged against firm capacity, not against a balance: LECO plans 11 kV feeders
  // so a neighbour can pick up the load under a fault, and above ~75 % of firm
  // that back-up stops being available.
  const loadingPct = tick.transformerLoadingPct;
  const flowLevel = loadingPct > 90 ? "critical" : loadingPct > 75 ? "warning" : "normal";

  return (
    <Card className="flex flex-col gap-3 p-5">
      <PanelHeader
        title="Supply and demand"
        note={`${feeder.capacityMVA} MVA feeder · 24 h metered · 24 h forecast · MW`}
      >
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: SOURCE_COLOR.solar }} />
            <span>Rooftop PV</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: SOURCE_COLOR.battery }} />
            <span>Storage</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: SOURCE_COLOR.grid }} />
            <span>Grid</span>
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

      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span
          className={cn(
            "tnum text-[34px] font-semibold leading-none tracking-tight",
            flowLevel === "normal"
              ? "text-foreground"
              : flowLevel === "warning"
                ? "text-[var(--status-warning)]"
                : "text-[var(--status-critical)]"
          )}
        >
          {formatMW(Math.abs(flowMW))}
        </span>
        <span className="text-sm font-medium text-muted-foreground">
          MW {exporting ? "export to 11 kV" : "import from 11 kV"}
        </span>
        <span className="tnum text-xs text-muted-foreground">
          · {loadingPct.toFixed(0)} % of {feeder.firmMW.toFixed(1)} MW firm
        </span>
      </div>

      <div className="h-[280px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={chartRows}
            margin={{ top: 8, right: 8, bottom: 4, left: 0 }}
          >
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
              dataKey="grid"
              fill={SOURCE_COLOR.grid}
              fillOpacity={0.45}
              stroke={SOURCE_COLOR.grid}
              strokeWidth={1}
              isAnimationActive={false}
              connectNulls={false}
            />
            <Area
              stackId="supply"
              type="monotone"
              dataKey="battery"
              fill={SOURCE_COLOR.battery}
              fillOpacity={0.45}
              stroke={SOURCE_COLOR.battery}
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
              dataKey="gridForecast"
              fill={SOURCE_COLOR.grid}
              fillOpacity={0.2}
              stroke={SOURCE_COLOR.grid}
              strokeDasharray="4 4"
              strokeWidth={1}
              isAnimationActive={false}
              connectNulls={false}
            />
            <Area
              stackId="supplyFc"
              type="monotone"
              dataKey="batteryForecast"
              fill={SOURCE_COLOR.battery}
              fillOpacity={0.2}
              stroke={SOURCE_COLOR.battery}
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
    rawGrid: number;
    rawBattery: number;
    rawSolar: number;
    gridImport: number;
    gridExport: number;
    batteryDischarge: number;
    batteryCharge: number;
    demandVal: number;
    grossDemandVal: number;
    supplyVal: number;
    spillVal: number;
    transformerFlowVal: number;
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
  const grid = rowData?.rawGrid ?? 0;
  const battery = rowData?.rawBattery ?? 0;
  const solar = rowData?.rawSolar ?? 0;
  const batteryCharge = rowData?.batteryCharge ?? 0;
  const spill = rowData?.spillVal ?? 0;
  const transformerFlow = rowData?.transformerFlowVal ?? 0;

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
            <td className="pr-3 text-muted-foreground">Consumer demand</td>
            <td className="text-right font-medium">{formatMW(demand)} MW</td>
          </tr>
          {batteryCharge > 0.01 && (
            <tr>
              <td className="pr-3 text-[11px] text-muted-foreground">Storage charging load</td>
              <td className="text-right text-[11px] font-medium text-[var(--src-battery)]">
                +{formatMW(batteryCharge)} MW
              </td>
            </tr>
          )}
          <tr className="border-t border-border/50">
            <td className="pr-3 text-[11px] text-muted-foreground">Rooftop PV generation</td>
            <td className="text-right text-[11px] font-medium text-[var(--src-solar)]">
              {formatMW(solar)} MW
            </td>
          </tr>
          <tr>
            <td className="pr-3 text-[11px] text-muted-foreground">Storage output</td>
            <td className="text-right text-[11px] font-medium">{formatSignedMW(battery)} MW</td>
          </tr>
          <tr>
            <td className="pr-3 text-[11px] text-muted-foreground">Primary grid infeed</td>
            <td className="text-right text-[11px] font-medium">{formatSignedMW(grid)} MW</td>
          </tr>
          {spill > 0.03 && (
            <tr>
              <td className="pr-3 text-[11px] text-muted-foreground">PV curtailed</td>
              <td className="text-right text-[11px] font-medium text-[var(--status-warning)]">
                {formatMW(spill)} MW
              </td>
            </tr>
          )}
          <tr className="border-t border-border">
            <td className="pr-3 pt-1 font-medium">Infeed flow</td>
            <td
              className={cn(
                "pt-1 text-right font-semibold",
                transformerFlow < 0 ? "text-[var(--status-warning)]" : "text-foreground"
              )}
            >
              {formatSignedMW(transformerFlow)} MW
            </td>
          </tr>
          <tr>
            <td className="pr-3 pt-0.5 text-[11px] text-muted-foreground">
              {transformerFlow < 0 ? "Exporting to the primary grid" : "Importing from the primary grid"}
            </td>
            <td className="pt-0.5 text-right text-[11px] text-muted-foreground">
              {transformerFlow < 0
                ? `${formatMW(Math.abs(transformerFlow))} MW back-feed`
                : `${formatMW(transformerFlow)} MW imported`}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
