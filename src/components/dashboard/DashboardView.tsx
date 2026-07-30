/**
 * Dashboard — the LV feeder overview, and the product's landing page.
 *
 * Scope is one low-voltage feeder way off one 11 kV/400 V distribution
 * substation, chosen from the register in the bar at the top. Every figure on the
 * page is that feeder, in kilowatts.
 *
 * The three ways in the register are different networks, not skins on one: a
 * 400 kVA urban way with storage where the midday PV surplus binds, a 630 kVA
 * commercial way where transformer loading binds, and a 160 kVA way on 540 m of
 * thin ABC where tail-end voltage binds at both ends of the day. Switching the
 * selector changes the load shape, the assets, the limits and which alarms are
 * live — because a selector whose options produce the same numbers is worse than
 * no selector.
 *
 * It replaces the three-tab Balance destination. The tabs were a mistake of a
 * particular kind: they made the operator navigate to assemble a picture the
 * screen could have held at once. Every public operator dashboard — CAISO's
 * Today's Outlook, Fingrid, EirGrid, National Grid ESO — is one scroll, and they
 * converge on the same band structure because it matches the order the questions
 * are asked:
 *
 *   1  feeder bar          compact context — what this feeder is, how loaded
 *   2  the two charts      supply vs demand over time, frequency in its band
 *   3  the DER band        the assets the product exists to move
 *   4  the breakdowns      mix now, PV today, active conditions
 *
 * Two clocks, one page — and the page is honest about which is which. The 1 Hz
 * tick drives the headline and the frequency panel; the 60 s series drives the
 * stack and the day totals, and those components are memoised so a frequency
 * update never re-renders a chart.
 *
 * The scope line in the header is not decoration. Oversight+ is a distribution
 * product; frequency, RoCoF and inertia are national quantities a DSO observes
 * but does not control. Saying so prevents the page from implying an authority
 * that does not exist.
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
import { SupplyStack } from "./SupplyStack";
import { FrequencyPanel } from "./FrequencyPanel";
import { SolarExportChart } from "./SolarExportChart";
import { EvChargingChart } from "./EvChargingChart";
import { BatteryStorageChart } from "./BatteryStorageChart";
import { SupplyMix } from "./SupplyMix";
import { SolarToday } from "./SolarToday";
import { EventsPanel } from "./EventsPanel";
import { startOfLocalDay } from "@/pipeline/calendar";
import { feederDayTotals } from "@/pipeline/system/derive";
import { FEEDER_MODEL_LIST, feederModel, solarPenetrationPct } from "@/pipeline/system/fleet";
import type { FeederModel, SystemTick } from "@/pipeline/system/types";
import { useStackSeries, useSystemTick } from "@/lib/useBalance";
import { formatMW, formatMWh } from "@/lib/utils";

export function DashboardView({
  feederId,
  onFeederChange,
}: {
  feederId: string;
  onFeederChange: (id: string) => void;
}) {
  const feeder = feederModel(feederId);
  const { tick, trace } = useSystemTick(feederId);
  const { rows, now } = useStackSeries(feederId);

  return (
    <main id="main" className="flex flex-col gap-4 p-4 lg:p-6">
      <h1 className="sr-only">Feeder balance dashboard</h1>

      <FeederOverview
        feeder={feeder}
        onFeederChange={onFeederChange}
        tick={tick}
        now={now}
      />

      {/* The two charts that carry the page: what supply did, and whether
          balance held while it did it. */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <SupplyStack rows={rows} now={now} tick={tick} feeder={feeder} />
        <FrequencyPanel tick={tick} trace={trace} />
      </div>

      {/* Three DER status charts: rooftop PV, EV charging, and the BESS. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <SolarExportChart rows={rows} now={now} tick={tick} feeder={feeder} />
        <EvChargingChart rows={rows} now={now} tick={tick} feeder={feeder} />
        <BatteryStorageChart rows={rows} now={now} tick={tick} feeder={feeder} />
      </div>

      {/* Breakdowns. What is serving demand, how the day went, and active conditions.
          Three panels of equal weight. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <SupplyMix tick={tick} />
        <SolarToday now={now} feeder={feeder} />
        <EventsPanel />
      </div>

      <footer className="pb-2 text-[11px] text-muted-foreground">
        {feeder.operator} · {feeder.substation} · {feeder.capacityMVA} MVA at{" "}
        {feeder.powerFactor} pf · {feeder.nominalKV} kV, 50 Hz · statutory band ±5 %.
      </footer>
    </main>
  );
}

/**
 * Feeder status bar — selector plus four metrics, one row.
 *
 * The selector carries the substation and transformer plate under each option,
 * because on an LV job confirming you are looking at the right feeder is the
 * first thing anyone does, and "LV Way 2" alone does not do it.
 *
 * Every number appears exactly once across the whole bar.
 */
function FeederOverview({
  feeder,
  onFeederChange,
  tick,
  now,
}: {
  feeder: FeederModel;
  onFeederChange: (id: string) => void;
  tick: SystemTick;
  now: number;
}) {
  // Day totals are a real integral of the model from local midnight, sampled at
  // 15 min — the same resolution an AMI headend would give. Memoised on the
  // 60 s clock, never the 1 Hz one: ~96 model evaluations must not sit on the
  // frequency render path.
  const day = useMemo(
    () => feederDayTotals(startOfLocalDay(now), now, feeder.id),
    [now, feeder.id]
  );

  const flowMW = tick.transformerFlowMW;
  const exporting = flowMW < 0;
  const loadingPct = tick.transformerLoadingPct;
  const apparentMVA = tick.loadMW / feeder.powerFactor;
  const headroomMW = Math.max(0, feeder.firmMW - tick.loadMW);

  return (
    <Card className="overflow-hidden border-border/70 bg-gradient-to-br from-background via-background to-muted/40 p-4 lg:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:gap-6">
        {/* Scope — which feeder, and what it physically is. */}
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={feeder.id} onValueChange={onFeederChange}>
              {/* h-auto because the option is two lines: the way's id, then the
                  plate and character. A fixed-height trigger clips the second
                  line, and `min-w-0` + `truncate` keep a long one from pushing
                  the chevron off the control. */}
              <SelectTrigger
                id="dashboard-feeder"
                className="h-auto w-[280px] py-1.5"
                aria-label="Select feeder"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FEEDER_MODEL_LIST.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    <span className="flex min-w-0 flex-col items-start">
                      <span className="truncate">{item.shortName}</span>
                      <span className="truncate text-[11px] text-muted-foreground">
                        {item.capacityMVA} MVA · {item.mix}
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="inline-flex rounded-full border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium capitalize text-primary">
              {feeder.profile}
            </span>
          </div>
          <span className="text-[11px] text-muted-foreground">
            {feeder.name} · {feeder.substation}
          </span>
          <span className="text-[11px] text-muted-foreground">
            {feeder.conductor}, {feeder.routeLengthKm} km · {feeder.pvConsumers} PV
            consumers · {solarPenetrationPct(feeder).toFixed(0)} % PV penetration
          </span>
        </div>

        {/* Separator — visual hierarchy between scope and metrics */}
        <div className="hidden h-8 w-px bg-border/60 lg:block" aria-hidden />

        {/* Four inline metrics — each value appears only here */}
        <div className="grid flex-1 grid-cols-2 lg:grid-cols-4 gap-3">
          <InlineStat
            label="Feeder demand"
            value={formatMW(tick.loadMW)}
            unit="MW"
            note={`${apparentMVA.toFixed(2)} MVA at ${feeder.powerFactor} pf`}
          />
          <InlineStat
            label={exporting ? "Exporting" : "Grid import"}
            value={formatMW(Math.abs(flowMW))}
            unit="MW"
            note={`${loadingPct.toFixed(0)} % of ${feeder.firmMW.toFixed(1)} MW firm`}
          />
          <InlineStat
            label="Rooftop PV now"
            value={formatMW(tick.solarMW)}
            unit="MW"
            note={`${formatMWh(day.deliveredPvMWh)} MWh delivered today`}
          />
          <InlineStat
            label="Energy today"
            value={formatMWh(day.consumedMWh)}
            unit="MWh"
            note={`${formatMWh(day.exportedMWh)} MWh exported · ${formatMW(headroomMW)} MW headroom`}
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


