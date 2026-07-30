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
import {
  hasStorage,
  installedStorageMWh,
  solarPenetrationPct,
} from "@/pipeline/system/fleet";
import type { StackRow } from "@/lib/useBalance";
import { cn, formatMW, formatMWh } from "@/lib/utils";
import type { FeederModel, SystemTick } from "@/pipeline/system/types";

const BESS_COLOR = "var(--src-battery)";

export const BatteryStorageChart = memo(function BatteryStorageChart({
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
      const isPastOrNow = r.load !== undefined;
      const isFutureOrNow = r.loadForecast !== undefined;
      const soc = Math.round(r.socPct * 10) / 10;

      return {
        ts: r.ts,
        soc: isPastOrNow ? soc : undefined,
        socForecast: isFutureOrNow ? soc : undefined,
        socVal: soc,
        powerVal: r.battery ?? 0,
      };
    });
  }, [rows]);

  const liveSocPct = tick.socPct;
  const ratedMWh = installedStorageMWh(feeder);
  const availableMWh = (liveSocPct / 100) * ratedMWh;

  if (!hasStorage(feeder)) {
    return (
      <Card className="flex flex-col gap-3 p-5">
        <PanelHeader title="Battery Storage" note="No storage on this feeder">
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: BESS_COLOR }} />
              <span>Battery Storage</span>
            </span>
          </div>
        </PanelHeader>
        <div className="flex flex-1 flex-col justify-center gap-2 py-6">
          <p className="text-sm text-muted-foreground">
            {feeder.shortName} has no battery installed.
          </p>
          <p className="text-[11px] text-muted-foreground">
            {tick.curtailedMW > 0.03
              ? `${formatMW(
                  tick.curtailedMW
                )} MW of rooftop PV is being curtailed right now — energy a battery at the primary would have absorbed and returned into the evening peak.`
              : solarPenetrationPct(feeder) > 60
                ? "Rooftop PV beyond the export limit here has nowhere to go but off, and the evening peak is met entirely from the 11 kV network."
                : `Local load absorbs the rooftop PV on this way, so storage would buy feeder headroom rather than PV headroom — the peak already reaches ${tick.transformerLoadingPct.toFixed(
                    0
                  )} % of firm capacity.`}
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-3 p-5">
      <PanelHeader
        title="Battery Storage"
        note="State of charge (%) & fleet capacity"
      >
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: BESS_COLOR }} />
            <span>Battery Storage</span>
          </span>
        </div>
      </PanelHeader>

      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <div>
          <span className="tnum text-xl font-semibold leading-none text-[var(--src-battery)]">
            {liveSocPct.toFixed(1)}%
          </span>
          <span className="ml-1 text-xs text-muted-foreground">SoC</span>
        </div>
        <div className="h-4 w-px bg-border" aria-hidden />
        <div>
          <span className="tnum text-xl font-semibold leading-none text-foreground">
            {formatMWh(availableMWh)} MWh
          </span>
          <span className="ml-1 text-xs text-muted-foreground">
            stored / {formatMWh(ratedMWh)} MWh usable
          </span>
        </div>
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
              domain={[0, 100]}
              tick={{ fill: "var(--viz-axis)", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              width={38}
              tickFormatter={(v: number) => `${v}%`}
            />
            {/* Metered SoC */}
            <Area
              type="monotone"
              dataKey="soc"
              fill={BESS_COLOR}
              fillOpacity={0.25}
              stroke={BESS_COLOR}
              strokeWidth={2}
              isAnimationActive={false}
              connectNulls={false}
            />
            {/* Forecast SoC */}
            <Area
              type="monotone"
              dataKey="socForecast"
              fill={BESS_COLOR}
              fillOpacity={0.1}
              stroke={BESS_COLOR}
              strokeDasharray="4 4"
              strokeWidth={1.8}
              isAnimationActive={false}
              connectNulls={false}
            />
            <ReferenceLine x={now} stroke="var(--viz-divider)" strokeDasharray="3 3" />
            <RTooltip
              content={<BatteryTooltip now={now} ratedMWh={ratedMWh} />}
              cursor={{ stroke: "var(--viz-divider)" }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
});

interface TooltipPayload {
  payload: {
    ts: number;
    socVal: number;
    powerVal: number;
  };
}

function BatteryTooltip({
  active,
  payload,
  label,
  now,
  ratedMWh = 0,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: number;
  now?: number;
  ratedMWh?: number;
}) {
  if (!active || !payload?.length || label == null) return null;
  const rowData = payload[0]?.payload;
  const isForecast = label > (now ?? 0);
  const soc = rowData?.socVal ?? 0;
  const power = rowData?.powerVal ?? 0;
  const storedMWh = (soc / 100) * ratedMWh;

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
            <td className="pr-3 text-muted-foreground">State of charge</td>
            <td className="text-right font-medium text-[var(--src-battery)]">
              {soc.toFixed(1)} %
            </td>
          </tr>
          <tr>
            <td className="pr-3 text-[11px] text-muted-foreground">Available energy</td>
            <td className="text-right text-[11px] font-medium">{formatMWh(storedMWh)} MWh</td>
          </tr>
          {Math.abs(power) > 0.01 && (
            <tr className="border-t border-border">
              <td className="pr-3 pt-1 text-[11px] font-medium">
                {power < 0 ? "Charging" : "Discharging"}
              </td>
              <td className="pt-1 text-right text-[11px] font-medium">
                {formatMW(Math.abs(power))} MW
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

