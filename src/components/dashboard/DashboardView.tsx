/**
 * Dashboard — the grid-balance overview, and the product's landing page.
 *
 * It replaces the three-tab Balance destination. The tabs were a mistake of a
 * particular kind: they made the operator navigate to assemble a picture the
 * screen could have held at once. Every public system-operator dashboard —
 * CAISO's Today's Outlook, Fingrid, EirGrid, National Grid ESO — is one scroll,
 * and they converge on the same band structure because it matches the order the
 * questions are asked:
 *
 *   1  status ribbon      is the system live, and where does it stand
 *   2  headline           the quantity the product exists to move — solar carried
 *   3  the two charts     supply vs demand over time, frequency in its band
 *   4  the breakdowns     mix now, energy today, what is currently wrong
 *   5  inputs             what is driving the model
 *
 * Two clocks, one page — and the page is honest about which is which. The 1 Hz
 * tick drives the ribbon, the headline and the frequency panel; the 60 s series
 * drives the stack and the day totals, and those components are memoised so a
 * frequency update never re-renders a chart.
 *
 * The scope line in the header is not decoration. Oversight+ is a distribution
 * product; frequency, RoCoF and inertia are transmission quantities a DSO
 * observes but does not control. Saying so prevents the page from implying an
 * authority that does not exist.
 */

import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatTile } from "./tiles";
import { Sparkline } from "./Sparkline";
import { SupplyStack } from "./SupplyStack";
import { FrequencyPanel } from "./FrequencyPanel";
import { SupplyMix } from "./SupplyMix";
import { SolarToday } from "./SolarToday";
import { RampPanel } from "./RampPanel";
import { EventsPanel } from "./EventsPanel";
import { installedSolarMW } from "@/pipeline/system/fleet";
import { FEEDER_LIST, capacityMW, type FeederId } from "@/pipeline/feeders";
import type { Bundle } from "@/pipeline/forecast";
import { THRESHOLDS, classifyCeiling } from "@/pipeline/system/thresholds";
import type { SystemTick } from "@/pipeline/system/types";
import { useFleetTick, useStackSeries, useSystemTick, type StackRow } from "@/lib/useBalance";
import { formatMW, formatSignedMW } from "@/lib/utils";

export function DashboardView({
  bundle,
  feederId,
  onFeederChange,
}: {
  bundle: Bundle;
  feederId: FeederId;
  onFeederChange: (id: FeederId) => void;
}) {
  const { tick, trace } = useSystemTick();
  const { rows, now } = useStackSeries();
  const { units } = useFleetTick();

  return (
    <main id="main" className="flex flex-col gap-4 p-4 lg:p-6">
      <h1 className="sr-only">Grid balance dashboard</h1>

      <FeederOverview bundle={bundle} feederId={feederId} onFeederChange={onFeederChange} tick={tick} />

      {/* The two charts that carry the page: what supply did, and whether
          balance held while it did it. */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <SupplyStack rows={rows} now={now} tick={tick} />
        <FrequencyPanel tick={tick} trace={trace} />
      </div>

      <SolarHeadline tick={tick} rows={rows} />

      {/* Breakdowns. What is serving demand, how the day went, what the fleet
          has to follow next, and anything currently outside its band. Four
          panels of equal weight — none of them is the answer on its own. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-4">
        <SupplyMix tick={tick} />
        <SolarToday now={now} />
        <RampPanel now={now} units={units} />
        <EventsPanel />
      </div>

      <footer className="pb-2 text-[11px] text-muted-foreground">
        LECO Oversight+ · Grid balance · Pilot v1 · Synthetic system model figures.
      </footer>
    </main>
  );
}

/* ------------------------------------------------------------------ */

function FeederOverview({
  bundle,
  feederId,
  onFeederChange,
  tick,
}: {
  bundle: Bundle;
  feederId: FeederId;
  onFeederChange: (id: FeederId) => void;
  tick: SystemTick;
}) {
  const feeder = bundle.feeder;
  const capacity = capacityMW(feeder);
  const liveLoadMW = Math.min(
    capacity,
    Math.max(
      0.18 * capacity,
      capacity * (0.52 + 0.12 * Math.min(1, tick.loadMW / 2400) + (feeder.profile === "industrial" ? 0.06 : 0))
    )
  );
  const liveSolarMW = Math.min(
    liveLoadMW,
    Math.max(0.35, Math.min(bundle.kpis.solarPeakMW, liveLoadMW * 0.48 + (1 - tick.weather.cloud) * 0.9))
  );
  const headroomMW = Math.max(0, capacity - liveLoadMW);
  const headroomPct = capacity > 0 ? (100 * headroomMW) / capacity : 0;
  const loadingPct = capacity > 0 ? (100 * liveLoadMW) / capacity : 0;
  const solarOffsetPct = liveLoadMW > 0 ? (100 * liveSolarMW) / liveLoadMW : 0;

  return (
    <Card className="overflow-hidden border-border/70 bg-gradient-to-br from-background via-background to-muted/40 p-5">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex flex-1 flex-col gap-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                Feeder filter
              </span>
              <Select value={feederId} onValueChange={(value) => onFeederChange(value as FeederId)}>
                <SelectTrigger id="dashboard-feeder" className="w-[260px]" aria-label="Select feeder">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FEEDER_LIST.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      <span className="flex flex-col items-start">
                        <span>{item.name}</span>
                        <span className="text-[11px] text-muted-foreground">
                          {item.capacityMVA} MVA · {item.mix}
                        </span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <span className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              {feeder.profile === "industrial" ? "Industrial feeder" : "Residential feeder"}
            </span>
          </div>

          <div className="rounded-2xl border border-border/70 bg-card/80 p-4 shadow-sm">
            <div className="flex flex-wrap items-end gap-3">
              <span className="tnum text-4xl font-semibold tracking-tight">
                {formatMW(liveLoadMW)}
              </span>
              <span className="text-sm font-medium text-muted-foreground">MW live feeder load</span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <span>{feeder.mix}</span>
              <span className="h-1 w-1 rounded-full bg-border" />
              <span>{feeder.substation}</span>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <MiniMetric
              label="Live load"
              value={`${formatMW(liveLoadMW)} MW`}
              note={`${loadingPct.toFixed(0)}% of firm capacity`}
            />
            <MiniMetric
              label="Live solar"
              value={`${formatMW(liveSolarMW)} MW`}
              note={`${solarOffsetPct.toFixed(0)}% of feeder load`}
            />
            <MiniMetric
              label="Headroom"
              value={`${formatMW(headroomMW)} MW`}
              note={`${headroomPct.toFixed(0)}% spare`}
            />
          </div>
        </div>

        <div className="w-full max-w-sm rounded-2xl border border-border/70 bg-muted/40 p-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
              Feeder context
            </span>
            <span className="text-sm font-semibold text-foreground">{feeder.shortName}</span>
          </div>
          <div className="mt-4 space-y-3">
            <MetricRow label="Firm capacity" value={`${formatMW(capacity)} MW`} />
            <MetricRow label="Current loading" value={`${loadingPct.toFixed(1)}%`} />
            <MetricRow label="Available headroom" value={`${formatMW(headroomMW)} MW`} />
          </div>
        </div>
      </div>
    </Card>
  );
}

function MiniMetric({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-xl border border-border/70 bg-background/70 p-3">
      <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">{label}</div>
      <div className="mt-2 tnum text-lg font-semibold text-foreground">{value}</div>
      <div className="text-xs text-muted-foreground">{note}</div>
    </div>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border/60 pb-2 last:border-0 last:pb-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="tnum text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}

/**
 * The headline band: solar carried, and the three numbers that bound it.
 *
 * Solar delivered is the only large-type figure on the page apart from
 * frequency, because it is the quantity the product exists to raise. Penetration
 * is given as a meter rather than restated as a bare percentage — a share needs a
 * track to be read as high or low.
 */
function SolarHeadline({ tick, rows }: { tick: SystemTick; rows: StackRow[] }) {
  const solarSeries = useMemo(() => rows.map((r) => r.solar ?? 0), [rows]);

  const available = tick.solarMW + tick.curtailedMW;
  const curtailPct = available > 1 ? (100 * tick.curtailedMW) / available : 0;
  const curtailLevel = classifyCeiling(curtailPct, THRESHOLDS.curtailmentPct);
  const generationMW = tick.generationMW;
  const solarSharePct = generationMW > 0 ? (100 * tick.solarMW) / generationMW : 0;
  const conventionalSharePct = generationMW > 0 ? (100 * tick.conventionalMW) / generationMW : 0;
  const floorGapMW = Math.max(0, tick.conventionalMW - tick.conventionalFloorMW);

  return (
    <Card className="overflow-hidden border-border/70 bg-gradient-to-br from-background via-background to-muted/40 p-5">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)] lg:items-start">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-medium uppercase tracking-[0.24em] text-muted-foreground">
                Generation
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="tnum text-[48px] font-semibold leading-none tracking-tight text-foreground">
                  {formatMW(generationMW)}
                </span>
                <span className="text-sm font-medium text-muted-foreground">MW online</span>
              </div>
            </div>
            <div className="rounded-full border border-border/70 bg-background/70 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
              Live dispatch
            </div>
          </div>

          <div className="rounded-2xl border border-border/70 bg-card/80 p-3 shadow-sm">
            <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
              <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-2.5 py-1 text-primary">
                <span className="h-2 w-2 rounded-full bg-primary" />
                Solar {formatMW(tick.solarMW)} MW
              </span>
              <span className="inline-flex items-center gap-2 rounded-full bg-muted px-2.5 py-1">
                <span className="h-2 w-2 rounded-full bg-[var(--src-conventional)]" />
                Conventional {formatMW(tick.conventionalMW)} MW
              </span>
              <span className="inline-flex items-center gap-2 rounded-full bg-muted px-2.5 py-1">
                <span className="h-2 w-2 rounded-full bg-[var(--src-import)]" />
                Net import {formatSignedMW(tick.interchangeMW)} MW
              </span>
            </div>
            <div className="mt-3">
              <Sparkline
                values={solarSeries}
                width={280}
                height={40}
                stroke="var(--src-solar)"
                label={`Generation mix over the last 6 hours, ${formatMW(generationMW)} megawatts now`}
                className="w-full"
              />
            </div>
            <div className="mt-2 text-[11px] text-muted-foreground">
              Last 6 h · {formatMW(installedSolarMW())} MW installed · demand {formatMW(tick.loadMW)} MW
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          <StatTile
            label="Solar output"
            help="Solar actually delivered to the system at this instant."
            value={formatMW(tick.solarMW)}
            unit="MW"
            level={tick.curtailedMW > 0.5 ? curtailLevel : "normal"}
            footnote={
              tick.curtailedMW > 0.5
                ? `${curtailPct.toFixed(0)}% of available curtailed`
                : `${solarSharePct.toFixed(0)}% of generation`
            }
          />
          <StatTile
            label="Conventional output"
            help="Dispatchable generation currently online and feeding the system."
            value={formatMW(tick.conventionalMW)}
            unit="MW"
            footnote={
              tick.conventionalMW > tick.conventionalFloorMW
                ? `${floorGapMW.toFixed(0)} MW above floor`
                : `${conventionalSharePct.toFixed(0)}% of generation`
            }
          />
        </div>
      </div>
    </Card>
  );
}

