/**
 * Grid Risk Index (GRI) Dashboard Card & Side Panel
 *
 * Provides a compact, interactive Grid Risk Card on the dashboard showing the Grid Risk Score,
 * 15m trend, and primary risk drivers. Clicking the card opens a detailed slide-over
 * side panel with comprehensive analytics, 5 sub-indices, 24h trend sparkline,
 * preventive operational warning triggers, and a grid stress scenario simulator.
 */

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DEFAULT_RISK_WEIGHTS,
  type GridRiskIndex,
  type GridRiskSubIndex,
  type RiskWeights,
} from "@/pipeline/system/gridRisk";
import { useGridRisk } from "@/lib/useBalance";
import { feederModel } from "@/pipeline/system/fleet";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  Info,
  Layers,
  Maximize2,
  Minus,
  ShieldAlert,
  Sliders,
  X,
  Zap,
} from "lucide-react";

interface CardProps {
  feederId: string;
  onClick: () => void;
}

interface SidePanelProps {
  feederId: string;
  open: boolean;
  onClose: () => void;
}

const TIER_COLORS = {
  low: {
    bg: "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400",
    gauge: "#10b981",
    bar: "bg-emerald-500",
    badge: "border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10",
  },
  moderate: {
    bg: "bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400",
    gauge: "#f59e0b",
    bar: "bg-amber-500",
    badge: "border-amber-500/30 text-amber-600 dark:text-amber-400 bg-amber-500/10",
  },
  high: {
    bg: "bg-orange-500/10 border-orange-500/30 text-orange-600 dark:text-orange-400",
    gauge: "#f97316",
    bar: "bg-orange-500",
    badge: "border-orange-500/30 text-orange-600 dark:text-orange-400 bg-orange-500/10",
  },
  critical: {
    bg: "bg-rose-500/15 border-rose-500/40 text-rose-600 dark:text-rose-400",
    gauge: "#ef4444",
    bar: "bg-rose-500",
    badge: "border-rose-500/40 text-rose-600 dark:text-rose-400 bg-rose-500/15 animate-pulse",
  },
};

/**
 * Compact Dashboard Card displaying Grid Risk Score & Primary Risk Drivers.
 * Clicking opens the full detail side panel.
 */
export function GridRiskCard({ feederId, onClick }: CardProps) {
  const { gri } = useGridRisk(feederId);
  const tierColor = TIER_COLORS[gri.tier];

  // Top 3 risk drivers sorted by score descending
  const topDrivers = useMemo(() => {
    return [...gri.subIndicesList].sort((a, b) => b.score - a.score).slice(0, 3);
  }, [gri.subIndicesList]);

  return (
    <Card
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onClick()}
      className="group relative cursor-pointer overflow-hidden border-border/70 bg-gradient-to-br from-card via-card to-muted/30 p-4 lg:p-5 transition-all duration-200 hover:border-primary/50 hover:shadow-md"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3 pb-3 border-b border-border/50">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
            <ShieldAlert className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold tracking-tight text-foreground group-hover:text-primary transition-colors flex items-center gap-1.5">
              Grid Risk Index (GRI)
              <Maximize2 className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </h3>
            <p className="text-[11px] text-muted-foreground">
              Real-time operational security & stability score
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="outline" className={`text-xs font-semibold ${tierColor.badge}`}>
            {gri.tier.toUpperCase()} RISK
          </Badge>
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted/60 text-muted-foreground group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
            <ChevronRight className="h-3.5 w-3.5" />
          </span>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 gap-4 pt-3 sm:grid-cols-12 items-center">
        {/* Score & Trend Dial Box (Col 4) */}
        <div className="sm:col-span-4 flex flex-col items-center justify-center rounded-xl border border-border/50 bg-muted/20 p-3 text-center">
          <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
            Risk Score
          </span>
          <div className="flex items-baseline gap-1 my-1">
            <span className="tnum text-3xl font-extrabold tracking-tight text-foreground">
              {gri.score}
            </span>
            <span className="text-xs font-medium text-muted-foreground">/ 100</span>
          </div>

          <div className="flex items-center gap-1 text-[11px] font-medium">
            {gri.trend === "rising" && (
              <span className="flex items-center text-rose-500 font-semibold">
                <ArrowUpRight className="h-3.5 w-3.5" /> +{Math.abs(gri.trendDelta)} (15m)
              </span>
            )}
            {gri.trend === "falling" && (
              <span className="flex items-center text-emerald-500 font-semibold">
                <ArrowDownRight className="h-3.5 w-3.5" /> -{Math.abs(gri.trendDelta)} (15m)
              </span>
            )}
            {gri.trend === "stable" && (
              <span className="flex items-center text-muted-foreground">
                <Minus className="h-3.5 w-3.5" /> stable
              </span>
            )}
          </div>
        </div>

        {/* Top Primary Risk Drivers (Col 8) */}
        <div className="sm:col-span-8 space-y-2">
          <div className="flex items-center justify-between text-[11px] font-medium text-muted-foreground">
            <span>Primary Risk Drivers</span>
            <span>Score / Metric</span>
          </div>

          <div className="space-y-1.5">
            {topDrivers.map((driver) => {
              const driverColor = TIER_COLORS[driver.tier];
              return (
                <div
                  key={driver.id}
                  className="space-y-1 rounded-lg border border-border/40 bg-background/60 p-2 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-foreground truncate pr-2">
                      {driver.shortName}
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="tnum font-bold text-foreground">{driver.score}</span>
                      <span className="text-[10px] text-muted-foreground">/ 100</span>
                    </div>
                  </div>

                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/60">
                    <div
                      className={`h-full ${driverColor.bar}`}
                      style={{ width: `${driver.score}%` }}
                    />
                  </div>

                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span className="truncate">{driver.metricLabel}: {driver.metricValue}</span>
                    <span className="capitalize">{driver.tier}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Footer Click CTA */}
      <div className="mt-3 flex items-center justify-between border-t border-border/40 pt-2 text-[11px] text-muted-foreground group-hover:text-primary transition-colors">
        <span className="flex items-center gap-1">
          <Info className="h-3 w-3" />
          {gri.preventiveWarnings.length > 0
            ? `${gri.preventiveWarnings.length} active preventive warning(s) — click to inspect`
            : "All security parameters nominal — click for full panel"}
        </span>
        <span className="font-semibold flex items-center gap-0.5">
          Open Panel <ExternalLink className="h-3 w-3 ml-0.5" />
        </span>
      </div>
    </Card>
  );
}

/**
 * Slide-over Side Panel displaying full Grid Risk Index analysis, 5 sub-indices,
 * history sparkline, preventive action triggers, and scenario simulator.
 */
export function GridRiskSidePanel({ feederId, open, onClose }: SidePanelProps) {
  const [weights, setWeights] = useState<RiskWeights>(DEFAULT_RISK_WEIGHTS);
  const [showSimulator, setShowSimulator] = useState(false);
  const [dispatchedActions, setDispatchedActions] = useState<Record<string, boolean>>({});
  const [simulatedScenario, setSimulatedScenario] = useState<string | null>(null);

  const feeder = useMemo(() => feederModel(feederId), [feederId]);
  const { gri, history } = useGridRisk(feederId, weights);

  // Apply scenario overrides if active
  const effectiveGri = useMemo(() => {
    if (!simulatedScenario) return gri;

    const modified = JSON.parse(JSON.stringify(gri)) as GridRiskIndex;
    if (simulatedScenario === "solar-surge") {
      modified.score = 78;
      modified.tier = "critical";
      modified.subIndices.nonSync.score = 92;
      modified.subIndices.thermal.score = 86;
      modified.primaryRiskDriver = modified.subIndices.nonSync;
      modified.preventiveWarnings.unshift({
        id: "sim-solar",
        subIndexId: "nonSync",
        severity: "critical",
        title: "[Simulated] Rapid Solar Cloud-Pass & Backfeed Surge",
        rootCause: "Reverse flow exceeded 1.4 MW under low dynamic inertia.",
        mitigation: "Engage BESS Fast Soak Charging and enforce 1.2 MW export ceiling.",
        actionableTarget: "Enforce Export Ceiling",
        timestamp: Date.now(),
      });
    } else if (simulatedScenario === "inertia-loss") {
      modified.score = 84;
      modified.tier = "critical";
      modified.subIndices.frequency.score = 95;
      modified.subIndices.nonSync.score = 88;
      modified.primaryRiskDriver = modified.subIndices.frequency;
      modified.preventiveWarnings.unshift({
        id: "sim-inertia",
        subIndexId: "frequency",
        severity: "critical",
        title: "[Simulated] Grid Generator Trip & Low Inertia RoCoF Spike",
        rootCause: "National grid inertia dropped to 11.2 GW·s with RoCoF at 0.62 Hz/s.",
        mitigation: "Trigger primary BESS frequency hold and decouple non-critical EV loads.",
        actionableTarget: "Trigger Primary Frequency Hold",
        timestamp: Date.now(),
      });
    } else if (simulatedScenario === "sunset-ramp") {
      modified.score = 68;
      modified.tier = "high";
      modified.subIndices.ramp.score = 85;
      modified.subIndices.voltage.score = 72;
      modified.primaryRiskDriver = modified.subIndices.ramp;
      modified.preventiveWarnings.unshift({
        id: "sim-ramp",
        subIndexId: "ramp",
        severity: "warning",
        title: "[Simulated] Sunset Net-Load Ramp & Battery Headroom Deficit",
        rootCause: "Net-load ramp rate 0.45 MW/min with BESS SoC at 22%.",
        mitigation: "Pre-arm peak shaving BESS reserve and request V1G EV charge deferral.",
        actionableTarget: "Arm BESS Peak Ramp Reserve",
        timestamp: Date.now(),
      });
    }
    return modified;
  }, [gri, simulatedScenario]);

  const toggleAction = (id: string) => {
    setDispatchedActions((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleWeightChange = (key: keyof RiskWeights, val: number) => {
    setWeights((prev) => ({ ...prev, [key]: val }));
  };

  const resetWeights = () => {
    setWeights(DEFAULT_RISK_WEIGHTS);
  };

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-xs transition-opacity"
        onClick={onClose}
        aria-hidden
      />

      {/* Slide-over Drawer */}
      <aside
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-2xl flex-col border-l border-border bg-card shadow-2xl animate-in slide-in-from-right duration-300"
        aria-label="Grid Security Risk Index Side Panel"
      >
        {/* Header */}
        <header className="flex items-center justify-between border-b border-border px-5 py-4 bg-muted/20">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-foreground">
                  Grid Security Analytics & Security Panel
                </h2>
                <Badge variant="outline" className={TIER_COLORS[effectiveGri.tier].badge}>
                  {effectiveGri.tier.toUpperCase()} RISK
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Feeder: {feeder.name} · Substation: {feeder.substation}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close panel">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </header>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Top Section: Score Dial & Quick Stats */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-12 rounded-xl border border-border/60 bg-muted/20 p-4">
            <div className="sm:col-span-5 flex flex-col items-center justify-center text-center">
              <RadialGauge
                score={effectiveGri.score}
                tier={effectiveGri.tier}
                trend={effectiveGri.trend}
                delta={effectiveGri.trendDelta}
              />
            </div>

            <div className="sm:col-span-7 flex flex-col justify-center space-y-2.5 border-t sm:border-t-0 sm:border-l border-border/50 pt-3 sm:pt-0 sm:pl-4">
              <div className="space-y-1">
                <span className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">
                  Primary Risk Driver
                </span>
                <p className="text-sm font-bold text-foreground">
                  {effectiveGri.primaryRiskDriver.name} ({effectiveGri.primaryRiskDriver.score}/100)
                </p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {effectiveGri.primaryRiskDriver.detail}
                </p>
              </div>

              {effectiveGri.escalationApplied && (
                <div className="flex items-center gap-1.5 text-xs text-amber-500 bg-amber-500/10 p-2 rounded-md border border-amber-500/20">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>Escalation multiplier active ({effectiveGri.escalationMultiplier.toFixed(2)}x)</span>
                </div>
              )}

              <div className="flex items-center justify-between border-t border-border/40 pt-2 text-xs">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={() => setShowSimulator(!showSimulator)}
                >
                  <Sliders className="h-3 w-3" />
                  {showSimulator ? "Hide Calibration" : "Calibrate Weights & Stress"}
                </Button>
                {simulatedScenario && (
                  <Badge
                    variant="outline"
                    className="border-amber-500/40 bg-amber-500/10 text-amber-500 text-[10px] cursor-pointer"
                    onClick={() => setSimulatedScenario(null)}
                  >
                    Reset Simulation
                  </Badge>
                )}
              </div>
            </div>
          </div>

          {/* Simulator & Weight Customizer Drawer */}
          {showSimulator && (
            <div className="rounded-xl border border-border/60 bg-muted/40 p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-border/40 pb-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                  <Layers className="h-3.5 w-3.5 text-primary" /> Sub-Index Weight Calibration
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                  onClick={resetWeights}
                >
                  Reset Weights
                </Button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {Object.entries(weights).map(([k, val]) => (
                  <div key={k} className="flex flex-col gap-1 rounded-lg border border-border/40 bg-background/60 p-2 text-xs">
                    <div className="flex justify-between text-[11px] font-medium text-muted-foreground">
                      <span className="capitalize">{k}</span>
                      <span className="tnum font-bold text-foreground">{(val * 100).toFixed(0)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0.05"
                      max="0.50"
                      step="0.05"
                      value={val}
                      onChange={(e) => handleWeightChange(e.target.name as keyof RiskWeights, parseFloat(e.target.value))}
                      name={k}
                      className="accent-primary h-1.5 w-full cursor-pointer rounded-lg bg-muted"
                    />
                  </div>
                ))}
              </div>

              <div className="border-t border-border/40 pt-3 space-y-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                  <Zap className="h-3.5 w-3.5 text-amber-500" /> Grid Stress Presets
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <Button
                    variant={simulatedScenario === "solar-surge" ? "secondary" : "outline"}
                    size="sm"
                    className="h-8 text-xs justify-start"
                    onClick={() => setSimulatedScenario("solar-surge")}
                  >
                    ☀️ Midday PV Cloud-Pass
                  </Button>
                  <Button
                    variant={simulatedScenario === "inertia-loss" ? "secondary" : "outline"}
                    size="sm"
                    className="h-8 text-xs justify-start"
                    onClick={() => setSimulatedScenario("inertia-loss")}
                  >
                    ⚡ Inertia Loss & RoCoF
                  </Button>
                  <Button
                    variant={simulatedScenario === "sunset-ramp" ? "secondary" : "outline"}
                    size="sm"
                    className="h-8 text-xs justify-start"
                    onClick={() => setSimulatedScenario("sunset-ramp")}
                  >
                    🌅 Sunset Net Ramp
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Sub-Index Matrix */}
          <div className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-border/40">
              <span className="text-xs font-semibold uppercase tracking-wider text-foreground">
                5-Vector Risk Sub-Indices Matrix
              </span>
              <span className="text-[11px] text-muted-foreground">Score / Weight</span>
            </div>

            <div className="space-y-2.5">
              {effectiveGri.subIndicesList.map((sub) => (
                <SubIndexRow key={sub.id} sub={sub} />
              ))}
            </div>
          </div>

          {/* 24-Hour Sparkline & Trend */}
          <div className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-foreground">
                24-Hour Historical Risk Trajectory
              </span>
              <span className="tnum text-xs font-semibold text-foreground">
                Peak: {Math.max(...history.map((h) => h.score), effectiveGri.score)} / 100
              </span>
            </div>
            <GridRiskSparkline points={history} currentScore={effectiveGri.score} />
          </div>

          {/* Preventive Operational Warnings & Action Center */}
          <div className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-border/40 pb-2">
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-primary" />
                <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground">
                  Preventive Operational Advisories ({effectiveGri.preventiveWarnings.length})
                </h3>
              </div>
              <span className="text-[11px] text-muted-foreground">Automated Dispatch Advisory</span>
            </div>

            {effectiveGri.preventiveWarnings.length === 0 ? (
              <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground rounded-lg border border-dashed border-border/60 bg-background/40">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                <span>No active preventive warnings. Feeder operating within nominal security parameters.</span>
              </div>
            ) : (
              <div className="space-y-2.5">
                {effectiveGri.preventiveWarnings.map((warn) => {
                  const isDispatched = !!dispatchedActions[warn.id];
                  return (
                    <div
                      key={warn.id}
                      className={`flex flex-col gap-2 rounded-lg border p-3 text-xs transition-all ${
                        warn.severity === "critical"
                          ? "border-rose-500/40 bg-rose-500/5 dark:bg-rose-500/10"
                          : "border-amber-500/40 bg-amber-500/5 dark:bg-amber-500/10"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 font-semibold text-foreground">
                          <AlertTriangle
                            className={`h-4 w-4 shrink-0 ${
                              warn.severity === "critical" ? "text-rose-500" : "text-amber-500"
                            }`}
                          />
                          <span>{warn.title}</span>
                        </div>
                        <Badge
                          variant="outline"
                          className={
                            warn.severity === "critical"
                              ? "border-rose-500/40 text-rose-600 dark:text-rose-400 bg-rose-500/10 text-[10px]"
                              : "border-amber-500/40 text-amber-600 dark:text-amber-400 bg-amber-500/10 text-[10px]"
                          }
                        >
                          {warn.severity.toUpperCase()}
                        </Badge>
                      </div>

                      <p className="text-[11px] text-muted-foreground">{warn.rootCause}</p>
                      <p className="text-[11px] font-medium text-foreground/90">
                        💡 <span className="underline underline-offset-2">Mitigation:</span> {warn.mitigation}
                      </p>

                      {warn.actionableTarget && (
                        <div className="flex items-center justify-between pt-2 border-t border-border/40">
                          <span className="text-[10px] text-muted-foreground">
                            Target: {warn.actionableTarget}
                          </span>
                          <Button
                            size="sm"
                            variant={isDispatched ? "secondary" : "default"}
                            className={`h-7 px-3 text-[11px] gap-1 ${
                              isDispatched
                                ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                                : ""
                            }`}
                            onClick={() => toggleAction(warn.id)}
                          >
                            {isDispatched ? (
                              <>
                                <CheckCircle2 className="h-3 w-3 text-emerald-500" /> Action Dispatched
                              </>
                            ) : (
                              <>
                                <Zap className="h-3 w-3" /> Execute Action
                              </>
                            )}
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <footer className="border-t border-border px-5 py-3 text-[11px] text-muted-foreground bg-muted/10">
          Grid Risk Index evaluates composite multi-vector stability based on real-time SCADA & DERMS telemetry.
        </footer>
      </aside>
    </>
  );
}

/**
 * Radial Gauge Meter Component
 */
function RadialGauge({
  score,
  tier,
  trend,
  delta,
}: {
  score: number;
  tier: keyof typeof TIER_COLORS;
  trend: "rising" | "stable" | "falling";
  delta: number;
}) {
  const radius = 52;
  const strokeWidth = 10;
  const circumference = 2 * Math.PI * radius;
  const arcLength = circumference * 0.75;
  const strokeDashoffset = arcLength - (score / 100) * arcLength;
  const color = TIER_COLORS[tier].gauge;

  return (
    <div className="relative flex flex-col items-center justify-center">
      <svg width="140" height="140" className="rotate-[135deg] overflow-visible">
        <circle
          cx="70"
          cy="70"
          r={radius}
          fill="none"
          stroke="var(--border)"
          strokeWidth={strokeWidth}
          strokeDasharray={`${arcLength} ${circumference}`}
          strokeLinecap="round"
          className="opacity-40"
        />
        <circle
          cx="70"
          cy="70"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={`${arcLength} ${circumference}`}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          className="transition-all duration-700 ease-out"
        />
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center text-center pt-2">
        <span className="tnum text-3xl font-extrabold tracking-tight text-foreground">
          {score}
        </span>
        <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
          Risk Index
        </span>
        <div className="flex items-center gap-1 text-[11px] font-medium pt-0.5">
          {trend === "rising" && (
            <span className="flex items-center text-rose-500 font-semibold">
              <ArrowUpRight className="h-3 w-3" /> +{Math.abs(delta)} 15m
            </span>
          )}
          {trend === "falling" && (
            <span className="flex items-center text-emerald-500 font-semibold">
              <ArrowDownRight className="h-3 w-3" /> -{Math.abs(delta)} 15m
            </span>
          )}
          {trend === "stable" && (
            <span className="flex items-center text-muted-foreground">
              <Minus className="h-3 w-3" /> stable
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Sub-Index Progress Row Component
 */
function SubIndexRow({ sub }: { sub: GridRiskSubIndex }) {
  const tierColor = TIER_COLORS[sub.tier];

  return (
    <div className="space-y-1 rounded-lg border border-border/40 bg-background/50 p-2.5 text-xs transition-colors hover:bg-background/80">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-foreground">{sub.name}</span>
          <span className="text-[10px] text-muted-foreground font-mono">
            ({(sub.weight * 100).toFixed(0)}% wt)
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="tnum text-xs font-bold text-foreground">{sub.score} / 100</span>
          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${tierColor.badge}`}>
            {sub.tier.toUpperCase()}
          </Badge>
        </div>
      </div>

      <div className="h-2 w-full overflow-hidden rounded-full bg-muted/60">
        <div
          className={`h-full ${tierColor.bar} transition-all duration-500`}
          style={{ width: `${sub.score}%` }}
        />
      </div>

      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span className="truncate">{sub.detail}</span>
        <span className="tnum font-medium text-foreground shrink-0 pl-2">
          {sub.metricLabel}: {sub.metricValue}
        </span>
      </div>
    </div>
  );
}

/**
 * 24h Risk Sparkline Chart Component
 */
function GridRiskSparkline({
  points,
  currentScore,
}: {
  points: { ts: number; score: number }[];
  currentScore: number;
}) {
  if (!points || points.length === 0) return null;

  const width = 240;
  const height = 60;
  const minScore = 0;
  const maxScore = 100;

  const pointsSvg = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * width;
      const y = height - ((p.score - minScore) / (maxScore - minScore)) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <div className="space-y-1">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full overflow-visible"
        style={{ height: "60px" }}
      >
        <line
          x1="0"
          y1={height - (50 / 100) * height}
          x2={width}
          y2={height - (50 / 100) * height}
          stroke="var(--border)"
          strokeDasharray="3 3"
          strokeWidth="1"
        />

        <defs>
          <linearGradient id="griGradientSide" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.25" />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity="0.0" />
          </linearGradient>
        </defs>

        <polygon
          points={`0,${height} ${pointsSvg} ${width},${height}`}
          fill="url(#griGradientSide)"
        />

        <polyline
          fill="none"
          stroke="var(--primary)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={pointsSvg}
        />

        {points.length > 0 && (
          <circle
            cx={width}
            cy={height - ((currentScore - minScore) / (maxScore - minScore)) * height}
            r="3.5"
            fill="var(--primary)"
            className="animate-pulse"
          />
        )}
      </svg>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>24h ago</span>
        <span>12h ago</span>
        <span className="font-semibold text-foreground">Now ({currentScore})</span>
      </div>
    </div>
  );
}
