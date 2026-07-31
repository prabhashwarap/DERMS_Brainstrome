import { useMemo } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { Card } from "@/components/ui/card";
import type { CurtailmentTimeSeriesPoint } from "@/pipeline/curtailment";

interface Props {
  series: CurtailmentTimeSeriesPoint[];
  curtailedPct: number;
  commandsCount: number;
  successfulCount: number;
  failedCount: number;
}

export function CurtailmentChart({
  series,
  curtailedPct,
  commandsCount,
  successfulCount,
  failedCount,
}: Props) {
  const chartData = useMemo(
    () =>
      series.map((p) => ({
        time: p.timeLabel,
        baseline: p.baselineSolarKW,
        actual: p.actualInjectionKW,
        cap: p.curtailmentCapKW,
        curtailed: p.curtailedKW,
        marker: p.eventMarker,
      })),
    [series]
  );

  return (
    <Card className="flex flex-col gap-4 border-border/70 bg-card p-5">
      {/* Header bar showing Curtailments status overview (mirroring consumer stats for comparison) */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/60 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-500/10 text-rose-500 ring-1 ring-rose-500/20">
            <span className="text-lg font-bold">⚡</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-foreground">Feeder Curtailment & Power Flow</h2>
              <span className="rounded-full bg-rose-500/15 px-2.5 py-0.5 text-xs font-semibold text-rose-500 border border-rose-500/20">
                Curtailed {curtailedPct}%
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Baseline Potential Solar PV Generation vs Utility Dispatch Setpoint Cap
            </p>
          </div>
        </div>

        <div className="flex items-center gap-6 text-xs">
          <div className="flex flex-col items-end">
            <span className="tnum font-bold text-foreground text-sm">{commandsCount}</span>
            <span className="text-[11px] text-muted-foreground">Commands Received</span>
          </div>
          <div className="flex flex-col items-end">
            <span className="tnum font-bold text-emerald-500 text-sm">{successfulCount}</span>
            <span className="text-[11px] text-muted-foreground">Successful</span>
          </div>
          <div className="flex flex-col items-end">
            <span className="tnum font-bold text-rose-500 text-sm">{failedCount}</span>
            <span className="text-[11px] text-muted-foreground">Failed</span>
          </div>
        </div>
      </div>

      {/* Chart Canvas */}
      <div className="h-[280px] w-full pt-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="colorBaseline" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
              </linearGradient>
              <linearGradient id="colorActual" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.0} />
              </linearGradient>
            </defs>

            <XAxis dataKey="time" stroke="#888888" fontSize={11} tickLine={false} axisLine={false} interval={11} />
            <YAxis stroke="#888888" fontSize={11} tickLine={false} axisLine={false} unit=" kW" />

            <Tooltip
              contentStyle={{
                backgroundColor: "rgba(15, 23, 42, 0.92)",
                borderColor: "rgba(255, 255, 255, 0.1)",
                borderRadius: "8px",
                color: "#f8fafc",
                fontSize: "12px",
              }}
              formatter={(value: any, name: any) => [
                `${value ?? 0} kW`,
                name === "baseline" ? "Baseline Solar Export" : name === "cap" ? "Utility Curtailment Cap" : "Actual Injection",
              ]}
            />

            {/* Baseline Solar Potential */}
            <Area
              type="monotone"
              dataKey="baseline"
              stroke="#10b981"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#colorBaseline)"
            />

            {/* Actual Injection */}
            <Area
              type="monotone"
              dataKey="actual"
              stroke="#f59e0b"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#colorActual)"
            />

            {/* Curtailment Cap Reference Line markers */}
            {chartData.map((d, index) => {
              if (d.marker === "CS") {
                return (
                  <ReferenceLine
                    key={`cs-${index}`}
                    x={d.time}
                    stroke="#ef4444"
                    strokeDasharray="3 3"
                    label={{ value: "CS", fill: "#ef4444", fontSize: 10, position: "top" }}
                  />
                );
              }
              if (d.marker === "CE") {
                return (
                  <ReferenceLine
                    key={`ce-${index}`}
                    x={d.time}
                    stroke="#10b981"
                    strokeDasharray="3 3"
                    label={{ value: "CE", fill: "#10b981", fontSize: 10, position: "top" }}
                  />
                );
              }
              return null;
            })}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t border-border/40">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
            Baseline Potential
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
            Dispatched Net Flow
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block px-1 rounded bg-rose-500/20 text-rose-500 text-[10px] font-bold">CS</span>
            Curtailment Start
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block px-1 rounded bg-emerald-500/20 text-emerald-500 text-[10px] font-bold">CE</span>
            Curtailment End
          </span>
        </div>

        <span>Auto-updated via 15-min AMI Telemetry</span>
      </div>
    </Card>
  );
}
