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
import { evShape } from "@/pipeline/der";
import type { StackRow } from "@/lib/useBalance";
import { cn, formatMW } from "@/lib/utils";
import type { SystemTick } from "@/pipeline/system/types";

const EV_UNMANAGED_COLOR = "#a78bfa";
const EV_MANAGED_COLOR = "#8b5cf6"; // Violet / Purple for DERMS Smart EV Charging

export const EvChargingChart = memo(function EvChargingChart({
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

      // Base EV load in MW across system
      const evRatio = evShape(r.ts, "residential");
      const unmanagedMW = Math.round(145 * evRatio * 10) / 10;

      // DERMS Smart V1G Charging shifts non-essential load to midday solar peak (11:00-14:00) and shaves evening peak (18:30-21:00)
      const hour = new Date(r.ts).getUTCHours(); // decimal hour approximation
      const solarShiftFactor = hour >= 10 && hour <= 14 ? 1.45 : hour >= 18 && hour <= 21 ? 0.72 : 1.0;
      const managedMW = Math.round(unmanagedMW * solarShiftFactor * 10) / 10;

      return {
        ts: r.ts,
        ev: isPastOrNow ? managedMW : undefined,
        evForecast: isFutureOrNow ? managedMW : undefined,
        unmanaged: isPastOrNow ? unmanagedMW : undefined,
        unmanagedForecast: isFutureOrNow ? unmanagedMW : undefined,
        managedVal: managedMW,
        unmanagedVal: unmanagedMW,
      };
    });
  }, [rows]);

  const liveEvMW = Math.round(145 * evShape(tick.ts, "residential") * 10) / 10;
  const hourNow = new Date(tick.ts).getUTCHours();
  const flexShiftMW = hourNow >= 10 && hourNow <= 14 ? 24.5 : hourNow >= 18 && hourNow <= 21 ? -18.2 : 0;

  return (
    <Card className="flex flex-col gap-3 p-5">
      <PanelHeader title="EV Fleet & Smart Charging" note="14,250 active EV chargers · 24 h metered & 24 h forecast" />

      <div className="flex items-baseline gap-4">
        <div>
          <span className="tnum text-xl font-semibold leading-none text-[#8b5cf6]">
            {formatMW(liveEvMW)}
          </span>
          <span className="ml-1 text-xs text-muted-foreground">EV Load MW</span>
        </div>
        {Math.abs(flexShiftMW) > 0.5 && (
          <>
            <div className="h-4 w-px bg-border" aria-hidden />
            <div>
              <span className="tnum text-sm font-semibold leading-none text-emerald-500">
                {flexShiftMW > 0 ? `+${flexShiftMW.toFixed(1)} MW solar soak` : `${flexShiftMW.toFixed(1)} MW peak shaved`}
              </span>
            </div>
          </>
        )}
      </div>

      <div className="h-[160px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 6, right: 8, bottom: 2, left: 0 }}>
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
              tick={{ fill: "var(--viz-axis)", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              width={38}
              tickFormatter={(v: number) => formatMW(v)}
            />
            <Area
              type="monotone"
              dataKey="ev"
              fill={EV_MANAGED_COLOR}
              fillOpacity={0.25}
              stroke={EV_MANAGED_COLOR}
              strokeWidth={2}
              isAnimationActive={false}
              connectNulls={false}
            />
            <Area
              type="monotone"
              dataKey="evForecast"
              fill={EV_MANAGED_COLOR}
              fillOpacity={0.1}
              stroke={EV_MANAGED_COLOR}
              strokeDasharray="4 4"
              strokeWidth={1.8}
              isAnimationActive={false}
              connectNulls={false}
            />
            <Line
              type="monotone"
              dataKey="unmanaged"
              stroke={EV_UNMANAGED_COLOR}
              strokeDasharray="3 3"
              strokeWidth={1.8}
              dot={false}
              isAnimationActive={false}
              connectNulls={false}
            />
            <Line
              type="monotone"
              dataKey="unmanagedForecast"
              stroke={EV_UNMANAGED_COLOR}
              strokeDasharray="2 4"
              strokeWidth={1.5}
              strokeOpacity={0.6}
              dot={false}
              isAnimationActive={false}
              connectNulls={false}
            />
            <ReferenceLine x={now} stroke="var(--viz-divider)" strokeDasharray="3 3" />
            <RTooltip content={<EvTooltip now={now} />} cursor={{ stroke: "var(--viz-divider)" }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
});

interface TooltipPayload {
  payload: {
    ts: number;
    managedVal: number;
    unmanagedVal: number;
  };
}

function EvTooltip({
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
  const managed = rowData?.managedVal ?? 0;
  const unmanaged = rowData?.unmanagedVal ?? 0;
  const delta = managed - unmanaged;

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
            <td className="pr-3 text-muted-foreground">Smart V1G Load</td>
            <td className="text-right font-medium text-[#8b5cf6]">{formatMW(managed)}</td>
          </tr>
          <tr>
            <td className="pr-3 text-muted-foreground">Unmanaged Baseline</td>
            <td className="text-right font-medium text-muted-foreground">{formatMW(unmanaged)}</td>
          </tr>
          <tr className="border-t border-border">
            <td className="pr-3 pt-1 text-[11px] font-medium">Flex Shift</td>
            <td className="pt-1 text-right text-[11px] font-medium text-emerald-500">
              {delta >= 0 ? `+${delta.toFixed(1)} MW` : `${delta.toFixed(1)} MW`}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
