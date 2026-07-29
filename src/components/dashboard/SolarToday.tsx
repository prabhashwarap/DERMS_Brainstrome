/**
 * Today's solar scorecard.
 *
 * Instantaneous MW says what is happening; energy says whether the day went
 * well. Operator dashboards keep both because they answer different questions,
 * and the one that survives into a report is the energy figure.
 *
 * Spill is stated in the same units as delivery and immediately beside it. A
 * spill figure on its own is unreadable — 40 MWh is either rounding or a bad day
 * depending on what was delivered next to it.
 */

import { memo, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Meter, PanelHeader, StatTile, Term } from "./tiles";
import { startOfLocalDay } from "@/pipeline/calendar";
import { solarDayTotals } from "@/pipeline/system/derive";
import { THRESHOLDS, classifyCeiling } from "@/pipeline/system/thresholds";
import { installedSolarMW } from "@/pipeline/system/fleet";
import { formatEnergy, formatMW } from "@/lib/utils";

/** Memoised: the day integral costs ~96 model evaluations and moves once a
 *  minute, so it must not sit on the 1 Hz render path. */
export const SolarToday = memo(function SolarToday({ now }: { now: number }) {
  // Sampled at 15-minute resolution from local midnight. The source is a pure
  // function of the timestamp, so this is a real integral of the day so far
  // rather than an accumulator that would reset on reload.
  const totals = useMemo(() => solarDayTotals(startOfLocalDay(now), now), [now]);

  const available = totals.deliveredMWh + totals.spilledMWh;
  const spillPct = available > 0 ? (100 * totals.spilledMWh) / available : 0;
  const spillLevel = classifyCeiling(spillPct, THRESHOLDS.curtailmentPct);
  const delivered = formatEnergy(totals.deliveredMWh);
  const spilled = formatEnergy(totals.spilledMWh);
  const installed = installedSolarMW();

  return (
    <Card className="flex flex-col gap-4 p-5">
      <PanelHeader title="Solar today" note="Since local midnight · energy, not power" />

      <div className="grid grid-cols-2 gap-4">
        <StatTile
          label="Delivered"
          help="Solar energy the grid took today. The quantity a monthly report is written from."
          value={delivered.value}
          unit={delivered.unit}
        />
        <StatTile
          label="Spilled"
          help="Solar energy that was available and refused. Stated beside delivery, because a spill figure alone cannot be judged."
          value={spilled.value}
          unit={spilled.unit}
          level={totals.spilledMWh > 1 ? spillLevel : "normal"}
          footnote={`${spillPct.toFixed(1)} % of available`}
        />
      </div>

      <div className="flex flex-col gap-2 border-t border-border pt-3">
        <div className="flex items-baseline justify-between gap-2">
          <Term help="The highest instantaneous solar output reached today, against installed capacity. Capacity factor at the peak, not for the day.">
            Peak output
          </Term>
          <span className="tnum text-xs text-muted-foreground">
            {formatMW(totals.peakMW)} of {formatMW(installed)} MW installed
          </span>
        </div>
        <Meter
          value={totals.peakMW}
          max={installed}
          label={`Peak solar output today, ${formatMW(totals.peakMW)} of ${formatMW(
            installed
          )} megawatts installed`}
        />
      </div>
    </Card>
  );
});
