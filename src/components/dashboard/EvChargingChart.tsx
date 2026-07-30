import { memo, useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card } from "@/components/ui/card";
import { PanelHeader } from "./tiles";
import { LKT_OFFSET_MIN, formatLKT } from "@/pipeline/calendar";
import { evChargerCount, evConnectedMW } from "@/pipeline/system/fleet";
import type { StackRow } from "@/lib/useBalance";
import { cn, formatMW, formatSignedMW } from "@/lib/utils";
import type { FeederModel, SystemTick } from "@/pipeline/system/types";

const EV_MANAGED_COLOR = "var(--viz-ev-actual)"; // DERMS smart EV charging

export const EvChargingChart = memo(function EvChargingChart({
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

  // EV load comes off the tick rather than being recomputed here. It is part of
  // the feeder's demand in the model, so a second copy of the shape would let
  // this chart and the supply stack disagree about the same instant.
  const chartData = useMemo(() => {
    return rows.map((r) => {
      const isPastOrNow = r.load !== undefined;
      const isFutureOrNow = r.loadForecast !== undefined;

      return {
        ts: r.ts,
        ev: isPastOrNow ? r.ev : undefined,
        evForecast: isFutureOrNow ? r.ev : undefined,
        managedVal: r.ev,
        unmanagedVal: r.evUnmanaged,
      };
    });
  }, [rows]);

  const liveEvMW = tick.evMW;
  const flexShiftMW = tick.evMW - tick.evUnmanagedMW;

  return (
    <Card className="flex flex-col gap-3 p-5">
      <PanelHeader
        title="EV charging"
        note={`${evChargerCount(feeder.ev)} chargers, ${evConnectedMW(feeder.ev).toFixed(
          1
        )} MW connected · ${feeder.ev.domesticChargers} enrolled for V1G`}
      >
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: EV_MANAGED_COLOR }} />
            <span>EV</span>
          </span>
        </div>
      </PanelHeader>

      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <div>
          <span className="tnum text-xl font-semibold leading-none text-[var(--viz-ev-actual)]">
            {formatMW(liveEvMW)}
          </span>
          <span className="ml-1 text-xs text-muted-foreground">MW charging</span>
        </div>
        {/* 20 kW: smaller than three chargers, so not a shift worth reporting. */}
        {Math.abs(flexShiftMW) > 0.02 && (
          <>
            <div className="h-4 w-px bg-border" aria-hidden />
            <div>
              <span className="tnum text-xl font-semibold leading-none text-[var(--status-normal)]">
                {flexShiftMW > 0
                  ? `+${formatMW(flexShiftMW)} MW soaking PV`
                  : `${formatMW(flexShiftMW)} MW off the peak`}
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
            <td className="pr-3 text-muted-foreground">Smart V1G load</td>
            <td className="text-right font-medium text-[var(--viz-ev-actual)]">
              {formatMW(managed)} MW
            </td>
          </tr>
          <tr>
            <td className="pr-3 text-[11px] text-muted-foreground">If uncontrolled</td>
            <td className="text-right text-[11px] font-medium">{formatMW(unmanaged)} MW</td>
          </tr>
          <tr className="border-t border-border">
            <td className="pr-3 pt-1 text-[11px] font-medium">Flex shift</td>
            <td className="pt-1 text-right text-[11px] font-medium text-[var(--status-normal)]">
              {formatSignedMW(delta)} MW
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
