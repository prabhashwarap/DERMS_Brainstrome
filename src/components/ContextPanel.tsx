import { Cloud, CloudSun, Sun, Thermometer } from "lucide-react";
import {
  Area,
  AreaChart,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatLKT, localParts } from "@/pipeline/calendar";
import { capacityMW } from "@/pipeline/feeders";
import type { Bundle } from "@/pipeline/forecast";

/** Adaptive power formatting by magnitude. */
const mw = (v: number) => {
  const abs = Math.abs(v);
  if (abs >= 10) return v.toFixed(1);
  if (abs >= 1) return v.toFixed(2);
  if (abs >= 0.01) return v.toFixed(3);
  return v.toFixed(4);
};

interface Props {
  bundle: Bundle;
  /** Timestamp currently under the cursor on the main chart, if any. */
  hoverTs: number | null;
}

/**
 * Context and validation.
 *
 * Two jobs, kept apart from the primary canvas: show the operator what drives
 * the curve (weather), and show them how much to trust it (error metrics).
 * Both are read *after* the chart, so they live to its right.
 */
export function ContextPanel({ bundle, hoverTs }: Props) {
  const nearest = hoverTs
    ? bundle.forecast.reduce((a, b) =>
        Math.abs(b.ts - hoverTs) < Math.abs(a.ts - hoverTs) ? b : a
      )
    : null;
  const inHorizon =
    nearest && Math.abs(nearest.ts - (hoverTs ?? 0)) < 30 * 60_000 ? nearest : null;

  return (
    <div className="flex flex-col gap-3">
      <WeatherCard bundle={bundle} hovered={inHorizon} hoverTs={hoverTs} />
      <FeederCard bundle={bundle} />
      <CapacityCard bundle={bundle} />
    </div>
  );
}

/* ------------------------------------------------------------------ */

function conditionOf(cloud: number) {
  if (cloud < 0.35) return { icon: Sun, label: "Sunny" };
  if (cloud < 0.68) return { icon: CloudSun, label: "Partly cloudy" };
  return { icon: Cloud, label: "Overcast" };
}

function WeatherCard({
  bundle,
  hovered,
  hoverTs,
}: {
  bundle: Bundle;
  hovered: Bundle["forecast"][number] | null;
  hoverTs: number | null;
}) {
  const points = bundle.forecast;
  const highSolar = bundle.feeder.solarPenetration > 0.2;
  const temps = points.map((p) => p.tempC);
  const tMin = Math.min(...temps);
  const tMax = Math.max(...temps);
  const peakTemp = points.reduce((a, b) => (b.tempC > a.tempC ? b : a));

  // Six three-hourly blocks — enough to read the day's shape, few enough to
  // scan without counting.
  const blocks = points.filter((_, i) => i % 16 === 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <Thermometer className="h-4 w-4 text-muted-foreground" />
            Weather over the horizon
          </CardTitle>
          <Badge variant="muted">Input to model</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-baseline gap-3">
          <span className="tnum text-2xl font-semibold">
            {(hovered ?? points[0]).tempC.toFixed(1)}
            <span className="ml-1 text-sm font-normal text-muted-foreground">°C</span>
          </span>
          <span className="text-xs text-muted-foreground">
            {hovered ? `at ${formatLKT(hovered.ts)}` : "at horizon start"} · range{" "}
            <span className="tnum">
              {tMin.toFixed(1)}–{tMax.toFixed(1)} °C
            </span>
          </span>
        </div>

        <div className="h-[76px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="tempFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--viz-input)" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="var(--viz-input)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <XAxis dataKey="ts" type="number" domain={["dataMin", "dataMax"]} hide />
              <YAxis domain={[tMin - 1, tMax + 1]} hide />
              <Area
                dataKey="tempC"
                type="monotone"
                stroke="var(--viz-input)"
                strokeWidth={2}
                fill="url(#tempFill)"
                isAnimationActive={false}
              />
              {hoverTs != null && (
                <ReferenceLine x={hoverTs} stroke="var(--viz-divider)" strokeDasharray="3 3" />
              )}
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="grid grid-cols-6 gap-1">
          {blocks.map((b) => {
            const { icon: Icon, label } = conditionOf(b.cloud);
            const active = hovered && Math.abs(hovered.ts - b.ts) <= 2 * 3600_000;
            return (
              <Tooltip key={b.ts}>
                <TooltipTrigger asChild>
                  <div
                    className={`flex cursor-help flex-col items-center gap-1 rounded-md py-1.5 transition-colors ${
                      active ? "bg-accent" : ""
                    }`}
                  >
                    <span className="tnum text-[10px] text-muted-foreground">
                      {String(localParts(b.ts).hour).padStart(2, "0")}
                    </span>
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <span className="tnum text-[10px] font-medium">{b.tempC.toFixed(0)}°</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  {formatLKT(b.ts)} - {label}, {Math.round(b.cloud * 100)}% cloud,{" "}
                  {b.tempC.toFixed(1)} °C
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>

        <Separator />

        <p className="text-xs leading-relaxed text-muted-foreground">
          {highSolar ? (
            <>
              Cloud cover is the dominant driver here: at{" "}
              <span className="tnum">
                {Math.round(bundle.feeder.solarPenetration * 100)}%
              </span>{" "}
              rooftop solar, a clear midday suppresses metered load and the evening ramp steepens
              as generation falls away. The band widens accordingly.
            </>
          ) : (
            <>
              Temperature is the dominant driver here - cooling load tracks the afternoon and
              evening. At{" "}
              <span className="tnum">
                {Math.round(bundle.feeder.solarPenetration * 100)}%
              </span>{" "}
              rooftop solar the midday distortion is small.
            </>
          )}{" "}
          Warmest point: <span className="tnum">{peakTemp.tempC.toFixed(1)} °C</span> at{" "}
          <span className="tnum">{formatLKT(peakTemp.ts)}</span>.
        </p>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */

function FeederCard({ bundle }: { bundle: Bundle }) {
  const f = bundle.feeder;
  const firmMW = capacityMW(f);
  const capStr = f.capacityMVA >= 1
    ? `${f.capacityMVA.toFixed(1)} MVA`
    : `${(f.capacityMVA * 1000).toFixed(0)} kVA`;
  const solarMW = (firmMW * f.solarPenetration).toFixed(2);

  const rows: Array<[string, React.ReactNode]> = [
    ["Substation & Feeder", `${f.substation} · ${f.shortName}`],
    ["Rated / Firm Capacity", `${capStr} (${firmMW.toFixed(1)} MW @ ${f.powerFactor} PF)`],
    [
      "Model Accuracy (28d)",
      <span key="mape" className="tnum text-emerald-600 dark:text-emerald-400 font-semibold">
        {bundle.accuracy.mape.toFixed(1)}% MAPE{" "}
        <span className="text-muted-foreground font-normal text-[11px]">
          (MAE {mw(bundle.accuracy.maeMW)} MW)
        </span>
      </span>,
    ],
    [
      "Forecast Horizon Peak",
      <span key="peak" className="tnum font-medium">
        {mw(bundle.kpis.peakMW)} MW at {formatLKT(bundle.kpis.peakAt)}
      </span>,
    ],
    [
      "Forecast Min (Trough)",
      <span key="min" className="tnum font-medium">
        {mw(bundle.kpis.minMW)} MW at {formatLKT(bundle.kpis.minAt)}
      </span>,
    ],
    [
      "24h Energy Volume",
      <span key="energy" className="tnum font-medium">
        {bundle.kpis.energyMWh.toFixed(1)} MWh
      </span>,
    ],
    [
      "Rooftop Solar Impact",
      <span key="solar" className="tnum font-medium">
        ~{Math.round(f.solarPenetration * 100)}% (~{solarMW} MW est. PV)
      </span>,
    ],
    [
      "Load Mix & Profile",
      `${f.mix} (${f.profile === "residential" ? "Bimodal peaks" : "Duck curve"})`,
    ],
  ];

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle>Feeder & Model Characteristics</CardTitle>
          <Badge variant="outline" className="text-[10px] font-mono">
            15-min Resolution
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-xs">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted-foreground self-center">{k}</dt>
              <dd className="text-right font-medium self-center">{v}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */

/**
 * Headroom against firm capacity. A bar rather than a number because the
 * question it answers — "is the worst case close to the limit?" — is a
 * proportion, and proportions are read faster as length than as digits.
 */
function CapacityCard({ bundle }: { bundle: Bundle }) {
  const firm = capacityMW(bundle.feeder);
  const expected = firm > 0 ? (bundle.kpis.peakMW / firm) * 100 : 0;
  const upper = firm > 0 ? (bundle.kpis.peakUpperMW / firm) * 100 : 0;
  const capLabel = bundle.feeder.capacityMVA >= 1
    ? `${bundle.feeder.capacityMVA.toFixed(1)} MVA`
    : `${(bundle.feeder.capacityMVA * 1000).toFixed(0)} kVA`;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>Peak against firm capacity</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2.5">
        <div className="tnum text-xs text-muted-foreground">
          {mw(bundle.kpis.peakMW)} MW expected · {mw(bundle.kpis.peakUpperMW)} MW worst case ·{" "}
          {mw(firm)} MW firm ({capLabel} @ {bundle.feeder.powerFactor} pf)
        </div>
        <div className="relative h-3 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="absolute inset-y-0 left-0 rounded-full"
            style={{ width: `${Math.min(100, upper)}%`, background: "var(--viz-band)" }}
          />
          <div
            className="absolute inset-y-0 left-0 rounded-full"
            style={{ width: `${Math.min(100, expected)}%`, background: "var(--viz-actual)" }}
          />
        </div>
        <div className="tnum flex justify-between text-[11px] text-muted-foreground">
          <span>0</span>
          <span>{expected.toFixed(0)}% utilised at forecast peak</span>
          <span>{mw(firm)} MW</span>
        </div>
      </CardContent>
    </Card>
  );
}
