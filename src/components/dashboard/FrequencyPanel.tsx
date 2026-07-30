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
 * Scope note: on a distribution feeder these are *observed national* quantities.
 * A 12 MW feeder does not move the frequency of a 2,500 MW island system, and the
 * model behind this panel does not pretend otherwise — frequency and inertia come
 * from a CEB system model, not from this feeder's balance. The panel reports them;
 * nothing on this page acts on them.
 *
 * The third readout is the exception, and it is deliberate: it is the one
 * quantity in this group the feeder *does* own. A balance residual would be
 * identically zero here, so the slot carries the infeed flow instead.
 */


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
import { PanelHeader } from "./tiles";
import { localParts } from "@/pipeline/calendar";
import {
  LEVEL_CLASS,
  NOMINAL_HZ,
  THRESHOLDS,
  classifyDeviation,
} from "@/pipeline/system/thresholds";
import type { SystemTick } from "@/pipeline/system/types";
import { cn } from "@/lib/utils";

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
  const deviation = tick.frequencyHz - NOMINAL_HZ;



  return (
    <Card className="flex flex-col gap-4 p-5 h-full">
      <PanelHeader
        title="CEB system frequency"
        note="1 s telemetry · last 5 min · observed at the primary, not controlled here"
      />

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

      <div className="flex-1 min-h-[240px] w-full">
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
              domain={["auto", "auto"]}
              tick={{ fill: "var(--viz-axis)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={44}
              tickFormatter={(v: number) => v.toFixed(3)}
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
    </Card>
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
