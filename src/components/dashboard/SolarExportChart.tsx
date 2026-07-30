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
import type { StackRow } from "@/lib/useBalance";
import { cn, formatMW } from "@/lib/utils";
import { dispatchableSolarMW, installedSolarMW } from "@/pipeline/system/fleet";
import type { FeederModel, SystemTick } from "@/pipeline/system/types";

const SOLAR_COLOR = "var(--src-solar)";

export const SolarExportChart = memo(function SolarExportChart({
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

  const chartData = useMemo(() => {
    return rows.map((r) => {
      const solar = Math.max(0, r.solar ?? 0);
      const solarPotential = Math.max(0, r.solarPotential ?? solar);
      const curtailed = Math.max(0, solarPotential - solar);
      const isPastOrNow = r.load !== undefined;
      const isFutureOrNow = r.loadForecast !== undefined;

      return {
        ts: r.ts,
        solar: isPastOrNow ? solar : undefined,
        solarForecast: isFutureOrNow ? solar : undefined,
        solarVal: solar,
        solarPotentialVal: solarPotential,
        curtailedVal: curtailed,
      };
    });
  }, [rows]);

  const liveSolarMW = tick.solarMW;
  const liveCurtailedMW = tick.curtailedMW;
  const installedMW = installedSolarMW(feeder);
  // How much of the fleet would actually answer a curtailment instruction. The
  // rest is legacy net metering, and saying so on the panel is the difference
  // between a controllable resource and a hopeful one.
  const controllableMW = dispatchableSolarMW(feeder);

  return (
    <Card className="flex flex-col gap-3 p-5">
      <PanelHeader
        title="Rooftop PV"
        note={`${installedMW.toFixed(2)} MW · ${controllableMW.toFixed(
          2
        )} MW controllable · 24 h metered & forecast`}
      >
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: SOLAR_COLOR }} />
            <span>PV</span>
          </span>
        </div>
      </PanelHeader>

      <div className="flex items-baseline gap-4">
        <div>
          <span className="tnum text-xl font-semibold leading-none text-foreground">
            {formatMW(liveSolarMW)}
          </span>
          <span className="ml-1 text-xs text-muted-foreground">MW generating</span>
        </div>
        {/* 30 kW: below that the volt-watt response is doing nothing worth a tile. */}
        {liveCurtailedMW > 0.03 && (
          <>
            <div className="h-4 w-px bg-border" aria-hidden />
            <div>
              <span className="tnum text-xl font-semibold leading-none text-[var(--status-warning)]">
                {formatMW(liveCurtailedMW)}
              </span>
              <span className="ml-1 text-xs text-muted-foreground">MW curtailed</span>
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
              dataKey="solar"
              fill={SOLAR_COLOR}
              fillOpacity={0.25}
              stroke={SOLAR_COLOR}
              strokeWidth={2}
              isAnimationActive={false}
              connectNulls={false}
            />
            <Area
              type="monotone"
              dataKey="solarForecast"
              fill={SOLAR_COLOR}
              fillOpacity={0.1}
              stroke={SOLAR_COLOR}
              strokeDasharray="4 4"
              strokeWidth={1.8}
              isAnimationActive={false}
              connectNulls={false}
            />
            <ReferenceLine x={now} stroke="var(--viz-divider)" strokeDasharray="3 3" />
            <RTooltip content={<SolarExportTooltip now={now} />} cursor={{ stroke: "var(--viz-divider)" }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
});

interface TooltipPayload {
  payload: {
    ts: number;
    solarVal: number;
    curtailedVal: number;
  };
}

function SolarExportTooltip({
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
            <td className="pr-3 text-muted-foreground">PV generation</td>
            <td className="text-right font-medium">{formatMW(rowData?.solarVal ?? 0)} MW</td>
          </tr>
          {rowData?.curtailedVal > 0.03 && (
            <tr>
              <td className="pr-3 text-muted-foreground">Volt-watt curtailed</td>
              <td className="text-right font-medium text-[var(--status-warning)]">
                {formatMW(rowData.curtailedVal)} MW
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
