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
 *   1  feeder bar          compact context — which feeder, how loaded
 *   2  the two charts      supply vs demand over time, frequency in its band
 *   3  generation band     the quantity the product exists to move — MW online
 *   4  the breakdowns      mix now, energy today, ramp ahead, active conditions
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

import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SupplyStack } from "./SupplyStack";
import { FrequencyPanel } from "./FrequencyPanel";
import { SolarExportChart } from "./SolarExportChart";
import { EvChargingChart } from "./EvChargingChart";
import { BatteryStorageChart } from "./BatteryStorageChart";
import { SupplyMix } from "./SupplyMix";
import { SolarToday } from "./SolarToday";
import { EventsPanel } from "./EventsPanel";
import { FEEDER_LIST, capacityMW, type FeederId } from "@/pipeline/feeders";
import type { Bundle } from "@/pipeline/forecast";
import type { SystemTick } from "@/pipeline/system/types";
import { useStackSeries, useSystemTick } from "@/lib/useBalance";

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

      {/* Three DER status charts: Solar generation & export to grid, EV charging, and Battery storage */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <SolarExportChart rows={rows} now={now} tick={tick} />
        <EvChargingChart rows={rows} now={now} tick={tick} />
        <BatteryStorageChart rows={rows} now={now} tick={tick} />
      </div>

      {/* Breakdowns. What is serving demand, how the day went, and active conditions.
          Three panels of equal weight. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <SupplyMix tick={tick} />
        <SolarToday now={now} />
        <EventsPanel />
      </div>

      <footer className="pb-2 text-[11px] text-muted-foreground">
        LECO / CEB Oversight+ · Sri Lanka Power Grid Balance & DERMS · 50 Hz System.
      </footer>
    </main>
  );
}

/* ------------------------------------------------------------------ */
/* Deterministic jitter — makes feeder-level values look like real     */
/* SCADA telemetry instead of suspiciously smooth formulas.            */

function feederJitter(ts: number, seed: number): number {
  // Simple hash-based noise in [-1, 1], deterministic on timestamp + seed.
  let a = ((Math.floor(ts / 5000) * 374761393 + seed * 668265263) >>> 0);
  a = Math.imul(a ^ (a >>> 15), 0x2c1b3c6d);
  a = Math.imul(a ^ (a >>> 12), 0x297a2d39);
  return ((a ^ (a >>> 15)) >>> 0) / 2147483648 - 1; // [-1, 1]
}

/* ------------------------------------------------------------------ */

/**
 * Feeder status bar — compact single-row card.
 *
 * Previous version had a hero block (40px live load), a MiniMetric row
 * repeating the same live load, and a sidebar card restating capacity/loading/
 * headroom a third time. Now every number appears once.
 */
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

  // Realistic feeder load with deterministic jitter — SCADA values jitter
  // by ±0.3% on a 5 s cycle, which breaks the "obviously computed" look.
  const jitter1 = feederJitter(tick.ts, feeder.seed);
  const jitter2 = feederJitter(tick.ts, feeder.seed + 7);
  const baseLiveLoad = Math.min(
    capacity,
    Math.max(
      0.18 * capacity,
      capacity * (0.52 + 0.12 * Math.min(1, tick.loadMW / 2400) + (feeder.profile === "industrial" ? 0.06 : 0))
    )
  );
  const liveLoadMW = baseLiveLoad * (1 + 0.003 * jitter1);
  const cosPhi = 0.96;
  const apparentMVA = liveLoadMW / cosPhi;

  const feederSolarCapMW = capacity * (feeder.solarPenetration ?? 0.15);
  const systemSolarNorm = Math.max(0, Math.min(1, tick.solarMW / 650));
  const liveSolarMW = Math.min(
    feederSolarCapMW,
    feederSolarCapMW * systemSolarNorm * (1 + 0.004 * jitter2)
  );
  const headroomMW = Math.max(0, capacity - liveLoadMW);
  const loadingPct = capacity > 0 ? (100 * liveLoadMW) / capacity : 0;
  const solarOffsetPct = liveLoadMW > 0 ? (100 * liveSolarMW) / liveLoadMW : 0;

  // Feeder bus voltage (11.0 kV nominal system) — voltage drops under heavy load and rises under high solar
  const jitter3 = feederJitter(tick.ts, feeder.seed + 12);
  const loadingFrac = liveLoadMW / Math.max(0.1, capacity);
  const solarFrac = liveSolarMW / Math.max(0.1, feederSolarCapMW);
  const voltagePu = 1.002 - 0.032 * loadingFrac + 0.018 * solarFrac + 0.003 * jitter3;
  const voltageKV = voltagePu * 11.0;
  const voltageDevPct = (voltagePu - 1) * 100;
  const devSign = voltageDevPct >= 0 ? "+" : "";

  return (
    <Card className="overflow-hidden border-border/70 bg-gradient-to-br from-background via-background to-muted/40 p-4 lg:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:gap-6">
        {/* Feeder selector & System DER Summary badge */}
        <div className="flex flex-wrap items-center gap-3">
          <Select value={feederId} onValueChange={(value) => onFeederChange(value as FeederId)}>
            <SelectTrigger id="dashboard-feeder" className="w-[240px]" aria-label="Select feeder">
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
          <span className="hidden rounded-full border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary sm:inline-flex">
            {feeder.profile === "industrial" ? "Industrial" : "Residential"}
          </span>
        </div>

        {/* Separator — visual hierarchy between selector and metrics */}
        <div className="hidden h-8 w-px bg-border/60 lg:block" aria-hidden />

        {/* Four inline metrics — each value appears only here */}
        <div className="grid flex-1 grid-cols-2 lg:grid-cols-4 gap-3">
          <InlineStat
            label="Live load"
            value={liveLoadMW.toFixed(2)}
            unit="MW"
            note={`${apparentMVA.toFixed(2)} MVA · ${loadingPct.toFixed(1)}% load`}
          />
          <InlineStat
            label="Bus voltage"
            value={voltagePu.toFixed(3)}
            unit="p.u."
            note={`${voltageKV.toFixed(2)} kV (${devSign}${voltageDevPct.toFixed(1)}%)`}
          />
          <InlineStat
            label="Solar offset"
            value={liveSolarMW.toFixed(2)}
            unit="MW"
            note={`${solarOffsetPct.toFixed(1)}% of feeder load`}
          />
          <InlineStat
            label="Headroom"
            value={headroomMW.toFixed(2)}
            unit="MW"
            note={`${feeder.substation}`}
          />
        </div>
      </div>
    </Card>
  );
}

/** Compact inline stat for the feeder bar — label, value+unit, and one qualifying note. */
function InlineStat({ label, value, unit, note }: { label: string; value: string; unit: string; note: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </span>
      <span className="flex items-baseline gap-1">
        <span className="tnum text-lg font-semibold leading-tight text-foreground">{value}</span>
        <span className="text-[11px] font-medium text-muted-foreground">{unit}</span>
      </span>
      <span className="tnum text-[11px] text-muted-foreground">{note}</span>
    </div>
  );
}


