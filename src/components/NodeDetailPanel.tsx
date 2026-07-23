import { useState, useEffect } from "react";
import {
  Zap,
  Building2,
  Building,
  Waypoints,
  Cable,
  Grid,
  Sun,
  BatteryCharging,
  Battery,
  Radio,
  X,
  Filter,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { KpiRow } from "@/components/KpiRow";
import { ForecastChart, type RangeKey } from "@/components/ForecastChart";
import { GenerationEvCharts } from "@/components/GenerationEvCharts";
import { ForecastTable } from "@/components/ForecastTable";
import { ContextPanel } from "@/components/ContextPanel";
import { FEEDERS, type Feeder } from "@/pipeline/feeders";
import { runForecast, type Bundle } from "@/pipeline/forecast";

export interface MapNodeDetails {
  id: string;
  name: string;
  type:
    | "branch"
    | "csc"
    | "feeder"
    | "substation"
    | "transformer"
    | "meterEndpoint"
    | "distributedSolar"
    | "evse"
    | "distributedBattery"
    | "utilitySolar"
    | "utilityBattery"
    | "recloser";
  typeName: string;
  branchId?: string;
  branchName?: string;
  cscId?: string;
  cscName?: string;
  feederId?: string;
  feederName?: string;
  center?: [number, number];
  status?: "Normal" | "Optimal" | "Peak Load" | "Active";
}

interface NodeDetailPanelProps {
  node: MapNodeDetails;
  onClose: () => void;
  onFilterToNode?: (node: MapNodeDetails) => void;
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 131 + s.charCodeAt(i)) & 0x7fffffff;
  return h;
}

const TYPE_CONFIG: Record<
  MapNodeDetails["type"],
  { icon: typeof Zap; colorClass: string; bgClass: string; borderClass: string }
> = {
  branch: { icon: Building2, colorClass: "text-indigo-600 dark:text-indigo-400", bgClass: "bg-indigo-50 dark:bg-indigo-950/40", borderClass: "border-indigo-200 dark:border-indigo-800" },
  csc: { icon: Building, colorClass: "text-cyan-600 dark:text-cyan-400", bgClass: "bg-cyan-50 dark:bg-cyan-950/40", borderClass: "border-cyan-200 dark:border-cyan-800" },
  feeder: { icon: Waypoints, colorClass: "text-rose-600 dark:text-rose-400", bgClass: "bg-rose-50 dark:bg-rose-950/40", borderClass: "border-rose-200 dark:border-rose-800" },
  substation: { icon: Cable, colorClass: "text-blue-600 dark:text-blue-400", bgClass: "bg-blue-50 dark:bg-blue-950/40", borderClass: "border-blue-200 dark:border-blue-800" },
  transformer: { icon: Zap, colorClass: "text-blue-500 dark:text-blue-400", bgClass: "bg-sky-50 dark:bg-sky-950/40", borderClass: "border-sky-200 dark:border-sky-800" },
  meterEndpoint: { icon: Grid, colorClass: "text-slate-700 dark:text-slate-300", bgClass: "bg-slate-100 dark:bg-slate-800/50", borderClass: "border-slate-300 dark:border-slate-700" },
  distributedSolar: { icon: Sun, colorClass: "text-amber-500 dark:text-amber-400", bgClass: "bg-amber-50 dark:bg-amber-950/40", borderClass: "border-amber-200 dark:border-amber-800" },
  utilitySolar: { icon: Sun, colorClass: "text-orange-500 dark:text-orange-400", bgClass: "bg-orange-50 dark:bg-orange-950/40", borderClass: "border-orange-200 dark:border-orange-800" },
  evse: { icon: BatteryCharging, colorClass: "text-emerald-600 dark:text-emerald-400", bgClass: "bg-emerald-50 dark:bg-emerald-950/40", borderClass: "border-emerald-200 dark:border-emerald-800" },
  distributedBattery: { icon: Battery, colorClass: "text-purple-600 dark:text-purple-400", bgClass: "bg-purple-50 dark:bg-purple-950/40", borderClass: "border-purple-200 dark:border-purple-800" },
  utilityBattery: { icon: Battery, colorClass: "text-indigo-600 dark:text-indigo-400", bgClass: "bg-indigo-50 dark:bg-indigo-950/40", borderClass: "border-indigo-200 dark:border-indigo-800" },
  recloser: { icon: Radio, colorClass: "text-rose-500 dark:text-rose-400", bgClass: "bg-rose-50 dark:bg-rose-950/40", borderClass: "border-rose-200 dark:border-rose-800" }
};

/**
 * Dynamically generates a complete Bundle object for any selected map node.
 * Runs the identical forecast pipeline (runForecast) as the main Forecast page,
 * ensuring Net load actual and day-ahead forecast curves, baseline, confidence
 * bands, and KPIs match the forecast page flow exactly.
 */
function createNodeBundle(node: MapNodeDetails, now: number): Bundle {
  const feederKey = (node.feederId || node.id || "").toLowerCase();
  const nameLower = (node.name || "").toLowerCase();

  // Check if this node directly maps to one of the canonical feeders
  if (feederKey === "angulana" || feederKey === "moratuwa_north_f2" || nameLower.includes("angulana")) {
    return runForecast(FEEDERS.angulana, now);
  }
  if (feederKey === "katunayake" || feederKey === "seeduwa_f2" || nameLower.includes("katunayake")) {
    return runForecast(FEEDERS.katunayake, now);
  }

  const h = hashStr(node.id);
  
  let firmCap: number;
  switch (node.type) {
    case "branch":
      firmCap = 85;
      break;
    case "csc":
      firmCap = 28;
      break;
    case "feeder":
      firmCap = 12.0;
      break;
    case "substation":
      firmCap = 24.0;
      break;
    case "transformer":
      firmCap = 0.50;
      break;
    case "meterEndpoint":
      firmCap = 0.015;
      break;
    case "distributedSolar":
      firmCap = 0.025;
      break;
    case "utilitySolar":
      firmCap = 5.0;
      break;
    case "evse":
      firmCap = 0.120;
      break;
    case "distributedBattery":
      firmCap = 0.025;
      break;
    case "utilityBattery":
      firmCap = 3.0;
      break;
    default:
      firmCap = 8.0;
  }

  const isSolar = node.type === "distributedSolar" || node.type === "utilitySolar";
  const isEv = node.type === "evse";
  const isGridAggregate = node.type === "feeder" || node.type === "substation" || node.type === "branch" || node.type === "csc";
  const isTransformer = node.type === "transformer";

  const hasSolar = isSolar || (isGridAggregate && h % 3 !== 0) || (isTransformer && h % 2 === 0);
  const hasEvCharging = isEv || (isGridAggregate && h % 2 === 0) || (isTransformer && h % 3 === 0);

  const solarPenetration = hasSolar
    ? isSolar
      ? 0.85
      : isGridAggregate
      ? 0.22
      : 0.12
    : 0;

  const evPenetration = hasEvCharging
    ? isEv
      ? 0.75
      : isGridAggregate
      ? 0.16
      : 0.10
    : 0;

  const profile: "residential" | "industrial" = isSolar
    ? "industrial"
    : (h % 2 === 0 ? "residential" : "industrial");

  const feeder: Feeder = {
    id: node.id,
    name: node.name,
    shortName: node.name,
    substation: node.cscName ? `${node.cscName} CSC` : node.branchName ? `${node.branchName} Branch` : "LECO Network",
    capacityMVA: Number((firmCap / 0.95).toFixed(2)),
    powerFactor: 0.95,
    solarPenetration,
    evPenetration,
    hasSolar,
    hasEvCharging,
    loadFactor: 0.58,
    profile,
    mix: node.typeName,
    seed: Math.abs(h) || 20260101,
  };

  return runForecast(feeder, now);
}

export function NodeDetailPanel({ node, onClose, onFilterToNode }: NodeDetailPanelProps) {
  const [range, setRange] = useState<RangeKey>("24h");
  const [showBaseline, setShowBaseline] = useState(false);
  const [hoverTs, setHoverTs] = useState<number | null>(null);

  // The forecast pipeline (a ridge fit over ~a year of 15-minute readings) costs
  // tens of ms. Running it inline on the click that opens the panel blocks the
  // main thread before the panel can render. Defer it one macrotask so the panel
  // paints immediately with a skeleton, then swaps in the charts a frame later.
  const [bundle, setBundle] = useState<Bundle | null>(null);
  useEffect(() => {
    setBundle(null);
    const id = setTimeout(() => setBundle(createNodeBundle(node, Date.now())), 0);
    return () => clearTimeout(id);
  }, [node]);

  const typeMeta = TYPE_CONFIG[node.type] || TYPE_CONFIG.feeder;
  const TypeIcon = typeMeta.icon;

  return (
    <aside className="flex flex-col w-full h-full bg-background overflow-hidden">
      
      {/* Header Bar */}
      <div className="p-4 bg-card border-b border-border flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`p-2.5 rounded-lg border ${typeMeta.bgClass} ${typeMeta.borderClass} shrink-0`}>
            <TypeIcon className={`w-5 h-5 ${typeMeta.colorClass}`} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {node.typeName}
              </span>
              <Badge variant="outline" className="text-[10px] uppercase font-mono">
                {node.id}
              </Badge>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                {node.status || "Day-ahead forecast"}
              </span>
            </div>
            <h2 className="text-xl font-bold text-foreground truncate mt-0.5">
              {node.name}
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 ml-auto">
          {onFilterToNode && (
            <button
              type="button"
              onClick={() => onFilterToNode(node)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground text-xs font-semibold rounded-md hover:bg-primary/90 transition-colors shadow-xs"
            >
              <Filter className="w-3.5 h-3.5" /> Filter Map to Node
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            aria-label="Close panel"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Content Area - Renders standard Forecasting Tab components directly */}
      <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-4">
        {bundle === null ? (
          <NodeForecastSkeleton />
        ) : (
          <>
            {/* KPI Executive Summary Row */}
            <KpiRow bundle={bundle} solar />

            {/* Two-Column Grid Layout matching Forecasting Tab */}
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
              {/* Main Left Column: ForecastChart, GenerationEvCharts & ForecastTable */}
              <div className="flex min-w-0 flex-col gap-4 self-start">
                <ForecastChart
                  bundle={bundle}
                  range={range}
                  onRangeChange={setRange}
                  showBaseline={showBaseline}
                  onShowBaselineChange={setShowBaseline}
                  onHover={setHoverTs}
                  heightClassName="h-[240px] sm:h-[280px]"
                />
                <GenerationEvCharts bundle={bundle} />
                <ForecastTable bundle={bundle} />
              </div>

              {/* Context Right Column: ContextPanel */}
              <ContextPanel bundle={bundle} hoverTs={hoverTs} />
            </div>
          </>
        )}
      </div>
    </aside>
  );
}

/** Lightweight placeholder shown while the deferred forecast pipeline runs. */
function NodeForecastSkeleton() {
  return (
    <div className="animate-pulse space-y-4" aria-hidden>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-lg bg-muted" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <div className="h-[300px] rounded-lg bg-muted" />
          <div className="h-40 rounded-lg bg-muted" />
        </div>
        <div className="h-[300px] rounded-lg bg-muted" />
      </div>
    </div>
  );
}
