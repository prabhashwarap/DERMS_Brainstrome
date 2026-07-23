import { memo } from "react";
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
import { cn } from "@/lib/utils";

/**
 * The grid path as an indented tree: Branch → CSC → Substation → Feeder →
 * Transformer → Consumer, one level per row. Reads far better in the narrow
 * context panel than a wrapping "A → B → C" breadcrumb, and the depth of each
 * node is legible at a glance. The last node (the one in focus) is emphasised.
 */
function HierarchyTrail({ nodes }: { nodes: Array<{ type: string; name: string }> }) {
  return (
    <div className="flex flex-col gap-1">
      {nodes.map((n, i) => {
        const isLast = i === nodes.length - 1;
        return (
          <div
            key={`${n.type}-${i}`}
            className="flex min-w-0 items-center gap-1.5"
            style={{ paddingLeft: i > 0 ? (i - 1) * 14 + 2 : 0 }}
          >
            {i > 0 && (
              <span className="select-none text-[11px] leading-none text-muted-foreground/50">
                └
              </span>
            )}
            <span
              className={cn(
                "h-1.5 w-1.5 shrink-0 rounded-full",
                isLast ? "bg-primary" : "bg-muted-foreground/40"
              )}
            />
            <span className="shrink-0 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
              {n.type}
            </span>
            <span
              className={cn(
                "truncate text-[11px] leading-tight",
                isLast ? "font-semibold text-foreground" : "text-foreground/75"
              )}
            >
              {n.name}
            </span>
          </div>
        );
      })}
    </div>
  );
}

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

  const blocks = points.filter((_, i) => i % 16 === 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Thermometer className="h-4 w-4 text-muted-foreground" />
            Weather Horizon
          </CardTitle>
          <Badge variant="muted" className="text-[10px]">Model Input</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-baseline gap-3">
          <span className="tnum text-2xl font-semibold">
            {(hovered ?? points[0]).tempC.toFixed(1)}
            <span className="ml-1 text-sm font-normal text-muted-foreground">°C</span>
          </span>
          <span className="text-xs text-muted-foreground">
            {hovered ? formatLKT(hovered.ts) : "start"} · range{" "}
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

        <p className="text-xs leading-normal text-muted-foreground">
          Driver: {highSolar ? "Cloud cover & PV ramp" : "Cooling load & temp"}. Max:{" "}
          <span className="tnum font-medium text-foreground">{peakTemp.tempC.toFixed(1)} °C</span> ({formatLKT(peakTemp.ts)}).
        </p>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */

// Neither of these cards reads `hoverTs`, but ContextPanel re-renders on every
// chart mouse move to reposition the WeatherCard crosshair. memo keeps these two
// (a 7-row grid and a bar) from re-rendering on every pointer move.
const FeederCard = memo(function FeederCard({ bundle }: { bundle: Bundle }) {
  const f = bundle.feeder;
  const firmMW = capacityMW(f);
  const capStr = f.capacityMVA >= 1
    ? `${f.capacityMVA.toFixed(1)} MVA`
    : `${(f.capacityMVA * 1000).toFixed(0)} kVA`;
  
  const formattedCap = firmMW >= 1 ? `${firmMW.toFixed(1)} MW` : `${(firmMW * 1000).toFixed(0)} kW`;
  const solarVal = firmMW >= 1 ? (firmMW * f.solarPenetration).toFixed(2) + " MW" : ((firmMW * f.solarPenetration) * 1000).toFixed(1) + " kW";
  const evVal = f.evPenetration ? (firmMW >= 1 ? (firmMW * f.evPenetration).toFixed(2) + " MW" : ((firmMW * f.evPenetration) * 1000).toFixed(1) + " kW") : null;

  // Build the grid path: Branch -> CSC -> Substation -> Feeder -> Transformer
  // -> Consumer. The type is shown as its own label, so strip a redundant
  // trailing type word from the name ("Angulana Substation" -> "Angulana").
  const stripType = (name: string, type: string) =>
    name.replace(new RegExp(`\\s*${type}$`, "i"), "").trim() || name;
  const hierarchyNodes: Array<{ type: string; name: string }> = [];
  if (f.branchName) hierarchyNodes.push({ type: "Branch", name: stripType(f.branchName, "Branch") });
  if (f.cscName) hierarchyNodes.push({ type: "CSC", name: stripType(f.cscName, "CSC") });
  if (f.substationName) hierarchyNodes.push({ type: "Substation", name: stripType(f.substationName, "Substation") });
  if (f.feederName && f.nodeType !== "substation" && f.nodeType !== "csc" && f.nodeType !== "branch") {
    hierarchyNodes.push({ type: "Feeder", name: stripType(f.feederName, "Feeder") });
  }
  if (f.transformerName && (f.nodeType === "transformer" || f.nodeType === "meterEndpoint" || f.nodeType === "distributedSolar" || f.nodeType === "evse" || f.nodeType === "distributedBattery")) {
    hierarchyNodes.push({ type: "Transformer", name: f.transformerName });
  }
  if (f.consumerName && (f.nodeType === "meterEndpoint" || f.nodeType === "distributedSolar" || f.nodeType === "evse" || f.nodeType === "distributedBattery")) {
    hierarchyNodes.push({ type: "Consumer", name: f.consumerName });
  }

  // Dynamic Card Title based on Node Type
  const nodeTypeTitles: Record<string, string> = {
    branch: "Branch Details",
    csc: "CSC Details",
    substation: "Substation Details",
    feeder: "Feeder Details",
    transformer: "Transformer Details",
    meterEndpoint: "Consumer Details",
    consumer: "Consumer Details",
    distributedSolar: "Solar PV Details",
    utilitySolar: "Utility Solar Details",
    evse: "EV Charger Details",
    distributedBattery: "Battery Details",
    utilityBattery: "Battery Details",
    recloser: "Recloser Details",
  };

  const cardTitle = f.nodeType
    ? (nodeTypeTitles[f.nodeType] || `${f.typeName || "Node"} Details`)
    : "Feeder Details";

  const rows: Array<[string, React.ReactNode]> = [];

  if (hierarchyNodes.length === 0) {
    rows.push(["Substation", `${f.substation}`]);
  }

  rows.push(["Firm Capacity", `${capStr} (${formattedCap})`]);

  rows.push([
    "Accuracy (28d)",
    <span key="mape" className="tnum text-emerald-600 dark:text-emerald-400 font-semibold">
      {bundle.accuracy.mape.toFixed(1)}% MAPE{" "}
      <span className="text-muted-foreground font-normal text-[11px]">
        (MAE {mw(bundle.accuracy.maeMW)} MW)
      </span>
    </span>,
  ]);

  rows.push([
    "Horizon Peak",
    <span key="peak" className="tnum font-medium">
      {mw(bundle.kpis.peakMW)} MW at {formatLKT(bundle.kpis.peakAt)}
    </span>,
  ]);

  rows.push([
    "Horizon Min",
    <span key="min" className="tnum font-medium">
      {mw(bundle.kpis.minMW)} MW at {formatLKT(bundle.kpis.minAt)}
    </span>,
  ]);

  rows.push([
    "24h Energy",
    <span key="energy" className="tnum font-medium">
      {bundle.kpis.energyMWh.toFixed(1)} MWh
    </span>,
  ]);

  if (f.derCombo) {
    rows.push([
      "DER Status",
      <span key="derCombo" className="tnum font-semibold text-primary">
        {f.derCombo}
      </span>,
    ]);
  }

  rows.push([
    "Rooftop Solar",
    f.hasSolar ? (
      <span key="solar" className="tnum font-medium text-amber-600 dark:text-amber-400">
        Active (~{Math.round(f.solarPenetration * 100)}% / ~{solarVal})
      </span>
    ) : (
      <span key="solar" className="text-muted-foreground italic">
        None Detected
      </span>
    ),
  ]);

  rows.push([
    "EV Charging",
    f.hasEvCharging ? (
      <span key="ev" className="tnum font-medium text-emerald-600 dark:text-emerald-400">
        Active (~{Math.round((f.evPenetration || 0) * 100)}% / ~{evVal})
      </span>
    ) : (
      <span key="ev" className="text-muted-foreground italic">
        None Detected
      </span>
    ),
  ]);

  rows.push([
    "Load Profile",
    `${f.mix} (${f.profile === "residential" ? "Bimodal" : "Duck curve"})`,
  ]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm">{cardTitle}</CardTitle>
          <Badge variant="outline" className="text-[10px] font-mono">
            15-min
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {hierarchyNodes.length > 0 && (
          <div className="rounded-md border border-border/60 bg-muted/30 p-2.5">
            <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Grid path
            </div>
            <HierarchyTrail nodes={hierarchyNodes} />
          </div>
        )}
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
});

/* ------------------------------------------------------------------ */

const CapacityCard = memo(function CapacityCard({ bundle }: { bundle: Bundle }) {
  const firm = capacityMW(bundle.feeder);
  const expected = firm > 0 ? (bundle.kpis.peakMW / firm) * 100 : 0;
  const upper = firm > 0 ? (bundle.kpis.peakUpperMW / firm) * 100 : 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Firm Headroom</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2.5">
        <div className="tnum text-xs text-muted-foreground">
          {mw(bundle.kpis.peakMW)} MW peak · {mw(bundle.kpis.peakUpperMW)} MW P95 · {mw(firm)} MW firm
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
          <span>0%</span>
          <span>{expected.toFixed(0)}% peak load</span>
          <span>{mw(firm)} MW</span>
        </div>
      </CardContent>
    </Card>
  );
});
