import { memo, useMemo } from "react";
import {
  Area,
  ComposedChart,
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
import { LKT_OFFSET_MIN, formatLKT, localParts } from "@/pipeline/calendar";
import { socAt } from "@/pipeline/system/source";
import type { StackRow } from "@/lib/useBalance";
import { cn, formatMW, formatSignedMW } from "@/lib/utils";
import type { SystemTick } from "@/pipeline/system/types";

const BATT_POWER_COLOR = "var(--src-battery)";
const SOC_COLOR = "#10b981";

export const BatteryStorageChart = memo(function BatteryStorageChart({
  rows,
  now,
  tick,
}: {
  rows: StackRow[];
  now: number;
  tick: SystemTick;
}) {
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

  const chartData = useMemo(() => {
    return rows.map((r) => {
      const isPastOrNow = r.load !== undefined;
      const isFutureOrNow = r.loadForecast !== undefined;

      const p = localParts(r.ts);
      const soc = Math.round(socAt(p.decimalHour) * 10) / 10;
      const battMW = Math.round((r.battery ?? 0) * 10) / 10;

      return {
        ts: r.ts,
        power: isPastOrNow ? battMW : undefined,
        powerForecast: isFutureOrNow ? battMW : undefined,
        soc: isPastOrNow ? soc : undefined,
        socForecast: isFutureOrNow ? soc : undefined,
        powerVal: battMW,
        socVal: soc,
      };
    });
  }, [rows]);

  const liveSocPct = Math.round(socAt(localParts(tick.ts).decimalHour) * 10) / 10;
  const nominalCapacityMWh = 165;
  const usableCapacityMWh = 154.9; // Combined effective usable capacity after SOH degradation
  const liveStoredMWh = (liveSocPct / 100) * usableCapacityMWh;

  return (
    <Card className="flex flex-col gap-3 p-5">
      <PanelHeader
        title="Battery Storage (BESS)"
        note={`State of charge (%) & fleet capacity (${nominalCapacityMWh} MWh nom / ${usableCapacityMWh} MWh usable) · 24 h metered & 24 h forecast`}
      />

      <div className="flex flex-wrap items-baseline gap-4">
        <div>
          <span className="tnum text-xl font-semibold leading-none text-[#10b981]">
            {liveSocPct.toFixed(1)}%
          </span>
          <span className="ml-1 text-xs text-muted-foreground">SoC</span>
        </div>
        <div className="h-4 w-px bg-border hidden sm:block" aria-hidden />
        <div>
          <span className="tnum text-xl font-semibold leading-none text-foreground">
            {liveStoredMWh.toFixed(1)} MWh
          </span>
          <span className="ml-1 text-xs text-muted-foreground">stored / {usableCapacityMWh} MWh usable</span>
        </div>
        <div className="h-4 w-px bg-border hidden md:block" aria-hidden />
        <div className="text-xs text-muted-foreground">
          Fleet RTE: <span className="font-medium text-foreground">88.0%</span> AC-to-AC
        </div>
      </div>

      <div className="h-[160px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 6, right: 8, bottom: 2, left: 0 }}>
            <CartesianGrid stroke="var(--viz-grid)" vertical={false} />
            <XAxis
              dataKey="ts"
              type="number"
              scale="time"
              domain={["dataMin", "dataMax"]}
              ticks={ticks}
              tickFormatter={(t) => formatLKT(t, { time: true })}
              tick={{ fill: "var(--viz-axis)", fontSize: 10 }}
              axisLine={{ stroke: "var(--viz-grid)" }}
              tickLine={false}
              minTickGap={20}
            />
            <YAxis
              yAxisId="power"
              tick={{ fill: "var(--viz-axis)", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              width={38}
              tickFormatter={(v: number) => formatMW(v)}
            />
            <YAxis
              yAxisId="soc"
              orientation="right"
              domain={[0, 100]}
              tick={{ fill: "var(--viz-axis)", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              width={30}
              tickFormatter={(v: number) => `${v}%`}
            />
            {/* Metered Power */}
            <Area
              yAxisId="power"
              type="monotone"
              dataKey="power"
              fill={BATT_POWER_COLOR}
              fillOpacity={0.25}
              stroke={BATT_POWER_COLOR}
              strokeWidth={2}
              isAnimationActive={false}
              connectNulls={false}
            />
            {/* Forecast Power */}
            <Area
              yAxisId="power"
              type="monotone"
              dataKey="powerForecast"
              fill={BATT_POWER_COLOR}
              fillOpacity={0.1}
              stroke={BATT_POWER_COLOR}
              strokeDasharray="4 4"
              strokeWidth={1.8}
              isAnimationActive={false}
              connectNulls={false}
            />
            {/* Metered SoC */}
            <Line
              yAxisId="soc"
              type="monotone"
              dataKey="soc"
              stroke={SOC_COLOR}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
              connectNulls={false}
            />
            {/* Forecast SoC */}
            <Line
              yAxisId="soc"
              type="monotone"
              dataKey="socForecast"
              stroke={SOC_COLOR}
              strokeDasharray="4 4"
              strokeWidth={1.8}
              dot={false}
              isAnimationActive={false}
              connectNulls={false}
            />
            <ReferenceLine yAxisId="power" x={now} stroke="var(--viz-divider)" strokeDasharray="3 3" />
            <RTooltip content={<BatteryTooltip now={now} />} cursor={{ stroke: "var(--viz-divider)" }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
});

interface TooltipPayload {
  payload: {
    ts: number;
    powerVal: number;
    socVal: number;
  };
}

function BatteryTooltip({
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
  const power = rowData?.powerVal ?? 0;
  const soc = rowData?.socVal ?? 0;
  const storedMWh = ((soc / 100) * 154.9).toFixed(1);
  const cRate = (Math.abs(power) / 165).toFixed(2);
  const hour = localParts(label).decimalHour;

  let mode = "Standby";
  if (power < -2) {
    mode = hour >= 9 && hour <= 16.5 ? "Solar Soak Charging" : "Night Grid Top-Up";
  } else if (power > 2) {
    mode = "Evening Peak Discharge";
  }

  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-lg">
      <div className="mb-1.5 flex items-center justify-between gap-3">
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
            <td className="pr-3 text-muted-foreground">State of Charge</td>
            <td className="text-right font-medium text-[#10b981]">{soc.toFixed(1)} %</td>
          </tr>
          <tr>
            <td className="pr-3 text-muted-foreground">Stored Energy</td>
            <td className="text-right font-medium">{storedMWh} MWh</td>
          </tr>
          <tr>
            <td className="pr-3 text-muted-foreground">Dispatch Power</td>
            <td className="text-right font-medium">{formatSignedMW(power)}</td>
          </tr>
          <tr>
            <td className="pr-3 text-muted-foreground">C-Rate</td>
            <td className="text-right font-medium">{cRate} C</td>
          </tr>
          <tr className="border-t border-border">
            <td className="pr-3 pt-1 text-[11px] text-muted-foreground">Operational Mode</td>
            <td className="pt-1 text-right text-[11px] font-medium uppercase text-muted-foreground">
              {mode}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
