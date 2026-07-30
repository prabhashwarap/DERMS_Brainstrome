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
  installedStorageMW,
  installedStorageMWh,
  solarPenetrationPct,
} from "@/pipeline/system/fleet";
import type { StackRow } from "@/lib/useBalance";
import { cn, formatMW, formatMWh, formatSignedMW } from "@/lib/utils";
import type { FeederModel, SystemTick } from "@/pipeline/system/types";

const SOC_COLOR = "var(--status-normal)";

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

  // SoC and power both come off the tick series. Recomputing the schedule here
  // would let this chart and the supply stack disagree about the same battery.
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
  const livePowerMW = tick.batteryMW ?? 0;
  const ratedMW = installedStorageMW(feeder);
  const ratedMWh = installedStorageMWh(feeder);
  // Energy still available to discharge, at the current state of charge.
  const availableMWh = (liveSocPct / 100) * ratedMWh;
  // 2 % of rating: the unit's own auxiliaries, not a dispatch. Scaled to the
  // unit, so the dead band means the same thing on any size of battery.
  const deadbandMW = 0.02 * Math.max(ratedMW, 0.001);
  const charging = livePowerMW < -deadbandMW;
  const discharging = livePowerMW > deadbandMW;

  // Most distribution feeders have no storage, and this is one of them.
  // Drawing a flat 0 % state-of-charge trace would assert a cabinet exists and
  // is dead flat; saying the slot is empty is both true and more useful, so the
  // panel states what storage would buy this particular feeder instead.
  if (!hasStorage(feeder)) {
    return (
      <Card className="flex flex-col gap-3 p-5">
        <PanelHeader title="Community BESS" note="No storage on this feeder" />
        <div className="flex flex-1 flex-col justify-center gap-2 py-6">
          <p className="text-sm text-muted-foreground">
            {feeder.shortName} has no battery installed.
          </p>
          {/* What storage would actually buy *this* feeder. On a high-PV way it
              is curtailed energy; on a heavily loaded low-PV way it is
              feeder headroom. Saying "PV has nowhere to go" on a feeder
              that never curtails would be a confident falsehood. */}
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
        title="Community BESS"
        note={`${ratedMW.toFixed(1)} MW / ${ratedMWh.toFixed(1)} MWh LFP at ${
          feeder.substation
        } · state of charge`}
      />

      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <div>
          <span className="tnum text-xl font-semibold leading-none text-[var(--status-normal)]">
            {liveSocPct.toFixed(1)}%
          </span>
          <span className="ml-1 text-xs text-muted-foreground">
            SoC · {formatMWh(availableMWh)} MWh
          </span>
        </div>
        {(charging || discharging) && (
          <>
            <div className="h-4 w-px bg-border" aria-hidden />
            <div>
              <span className="tnum text-sm font-semibold leading-none text-foreground">
                {formatMW(Math.abs(livePowerMW))} MW
              </span>
              <span className="ml-1 text-xs text-muted-foreground">
                {charging ? "charging" : "discharging"}
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
              fill={SOC_COLOR}
              fillOpacity={0.25}
              stroke={SOC_COLOR}
              strokeWidth={2}
              isAnimationActive={false}
              connectNulls={false}
            />
            {/* Forecast SoC */}
            <Area
              type="monotone"
              dataKey="socForecast"
              fill={SOC_COLOR}
              fillOpacity={0.1}
              stroke={SOC_COLOR}
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
            <td className="text-right font-medium text-[var(--status-normal)]">
              {soc.toFixed(1)} %
            </td>
          </tr>
          <tr>
            <td className="pr-3 text-[11px] text-muted-foreground">Stored</td>
            <td className="text-right text-[11px] font-medium">{formatMWh(storedMWh)} MWh</td>
          </tr>
          <tr className="border-t border-border">
            <td className="pr-3 pt-1 text-[11px] font-medium">
              {power < 0 ? "Charging" : "Discharging"}
            </td>
            <td className="pt-1 text-right text-[11px] font-medium">
              {formatSignedMW(power)} MW
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
