/**
 * Frequency — the constraint that keeps the solar number honest.
 *
 * Every system operator's dashboard gives frequency its own panel with a live
 * trace and the statutory band drawn on it, and for the same reason: a frequency
 * figure without its band is unreadable — 49.94 Hz is either fine or an
 * incident depending on a limit the reader is not carrying in their head.
 *
 * Below the trace sit the three quantities that explain it: RoCoF, the inertia
 * holding it, and the net imbalance driving it. They are secondary type. They
 * qualify the hero; they do not compete with it.
 *
 * Scope note: on a distribution system these are *observed* quantities. The
 * panel reports them; nothing on this page acts on them.
 */

import { useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as RTooltip,
  YAxis,
} from "recharts";
import { Card } from "@/components/ui/card";
import { PanelHeader, Term } from "./tiles";
import { localParts } from "@/pipeline/calendar";
import {
  LEVEL_CLASS,
  NOMINAL_HZ,
  THRESHOLDS,
  classifyDeviation,
  classifyFloor,
} from "@/pipeline/system/thresholds";
import type { SystemTick } from "@/pipeline/system/types";
import { cn, formatSignedMW } from "@/lib/utils";

const WARN = THRESHOLDS.frequencyHz.warning;

const pad = (n: number) => String(n).padStart(2, "0");

/** Local time to the second. */
function withSeconds(ts: number): string {
  const p = localParts(ts);
  return `${pad(p.hour)}:${pad(p.minute)}:${pad(new Date(ts).getUTCSeconds())}`;
}

export function FrequencyPanel({
  tick,
  trace,
}: {
  tick: SystemTick;
  trace: { ts: number; frequencyHz: number }[];
}) {
  const level = classifyDeviation(tick.frequencyHz - NOMINAL_HZ, THRESHOLDS.frequencyHz);
  const rocofLevel = classifyDeviation(tick.rocofHzPerS, THRESHOLDS.rocofHzPerS);
  const inertiaLevel = classifyFloor(tick.inertiaGWs, THRESHOLDS.inertiaGWs);
  const deviation = tick.frequencyHz - NOMINAL_HZ;

  // The domain never closes tighter than the warning band, so a quiet trace
  // reads as quiet instead of being magnified into apparent turbulence — and it
  // opens up if the trace leaves the band, so an excursion is never clipped.
  const domain = useMemo<[number, number]>(() => {
    let lo = NOMINAL_HZ - WARN - 0.01;
    let hi = NOMINAL_HZ + WARN + 0.01;
    for (const p of trace) {
      lo = Math.min(lo, p.frequencyHz - 0.01);
      hi = Math.max(hi, p.frequencyHz + 0.01);
    }
    return [lo, hi];
  }, [trace]);

  return (
    <Card className="flex flex-col gap-4 p-5">
      <PanelHeader title="System frequency" note="1 s telemetry · last 5 min · observed from CEB SCADA" />

      <div className="flex items-end justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <span
            className={cn(
              "tnum text-[44px] font-semibold leading-none tracking-tight",
              LEVEL_CLASS[level].text
            )}
          >
            {tick.frequencyHz.toFixed(3)}
          </span>
          <span className="text-base font-medium text-muted-foreground">Hz</span>
        </div>
        <span
          className={cn(
            "tnum flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-medium",
            LEVEL_CLASS[level].bg,
            LEVEL_CLASS[level].text
          )}
        >
          <span className={cn("h-2 w-2 rounded-full", LEVEL_CLASS[level].dot)} aria-hidden />
          {deviation >= 0 ? "+" : "−"}
          {Math.abs(deviation).toFixed(3)} Hz from nominal
        </span>
      </div>

      <div className="h-[132px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={trace} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="var(--viz-grid)" vertical={false} />
            {/* The band is the chart's whole point: it is what makes the trace
                legible without a threshold table beside it. */}
            <ReferenceArea
              y1={NOMINAL_HZ - WARN}
              y2={NOMINAL_HZ + WARN}
              fill="var(--status-normal)"
              fillOpacity={0.1}
              ifOverflow="visible"
            />
            <ReferenceLine y={NOMINAL_HZ} stroke="var(--viz-divider)" strokeDasharray="4 4" />
            <YAxis
              domain={domain}
              tick={{ fill: "var(--viz-axis)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={44}
              tickFormatter={(v: number) => v.toFixed(2)}
            />
            <Line
              type="linear"
              dataKey="frequencyHz"
              stroke={level === "normal" ? "var(--viz-input)" : `var(--status-${level})`}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
            <RTooltip
              cursor={{ stroke: "var(--viz-divider)" }}
              content={<TraceTooltip />}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <dl className="grid grid-cols-3 gap-3 border-t border-border pt-3">
        <Detail
          label="RoCoF"
          help="Rate of change of frequency. It rises as solar displaces spinning plant and inertia falls — the hidden cost of carrying more solar."
          value={`${tick.rocofHzPerS >= 0 ? "+" : "−"}${Math.abs(tick.rocofHzPerS).toFixed(3)}`}
          unit="Hz/s"
          level={rocofLevel}
        />
        <Detail
          label="Inertia"
          help="Synchronous inertia on the system. It is what slows a frequency deviation, and it falls as solar displaces spinning plant."
          value={tick.inertiaGWs.toFixed(2)}
          unit="GW·s"
          level={inertiaLevel}
        />
        <Detail
          label="Imbalance"
          help="Generation plus interchange minus demand. The quantity frequency is responding to."
          value={formatSignedMW(tick.imbalanceMW)}
          unit="MW"
          level="normal"
        />
      </dl>
    </Card>
  );
}

function Detail({
  label,
  value,
  unit,
  level,
  help,
}: {
  label: string;
  value: string;
  unit: string;
  level: "normal" | "warning" | "critical";
  help: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <dt>
        <Term help={help}>{label}</Term>
      </dt>
      <dd className="flex items-baseline gap-1">
        <span className={cn("tnum text-lg font-semibold leading-none", LEVEL_CLASS[level].text)}>
          {value}
        </span>
        <span className="text-[11px] font-medium text-muted-foreground">{unit}</span>
      </dd>
    </div>
  );
}

function TraceTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: { ts: number; frequencyHz: number } }[];
}) {
  if (!active || !payload?.length) return null;
  const { ts, frequencyHz } = payload[0].payload;
  return (
    <div className="tnum rounded-lg border border-border bg-popover px-2.5 py-1.5 text-xs shadow-lg">
      <span className="font-medium">{frequencyHz.toFixed(3)} Hz</span>
      {/* Seconds matter here and nowhere else on the page: at 1 Hz, a trace
          point labelled to the minute cannot be told from its neighbours. */}
      <span className="ml-2 text-muted-foreground">{withSeconds(ts)}</span>
    </div>
  );
}
