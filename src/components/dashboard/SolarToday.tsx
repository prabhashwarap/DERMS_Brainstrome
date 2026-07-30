/**
 * Today's solar scorecard.
 *
 * Instantaneous MW says what is happening; energy says whether the day went
 * well. Operator dashboards keep both because they answer different questions,
 * and the one that survives into a report is the energy figure.
 *
 * Curtailment is stated in the same units as delivery and immediately beside it.
 * A curtailment figure on its own is unreadable — 4 MWh is either rounding or a
 * bad day depending on what was delivered next to it.
 */

import { memo, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Meter, PanelHeader, StatTile, Term } from "./tiles";
import { startOfLocalDay } from "@/pipeline/calendar";
import { solarDayTotals } from "@/pipeline/system/derive";
import { THRESHOLDS, classifyCeiling } from "@/pipeline/system/thresholds";
import { installedSolarMW, solarPenetrationPct } from "@/pipeline/system/fleet";
import type { FeederModel } from "@/pipeline/system/types";
import { formatMW, formatMWh } from "@/lib/utils";

/** Memoised: the day integral costs ~96 model evaluations and moves once a
 *  minute, so it must not sit on the 1 Hz render path. */
export const SolarToday = memo(function SolarToday({
  now,
  feeder,
}: {
  now: number;
  feeder: FeederModel;
}) {
  // Sampled at 15-minute resolution from local midnight. The source is a pure
  // function of the timestamp, so this is a real integral of the day so far
  // rather than an accumulator that would reset on reload.
  const totals = useMemo(
    () => solarDayTotals(startOfLocalDay(now), now, feeder.id),
    [now, feeder.id]
  );

  const available = totals.deliveredMWh + totals.spilledMWh;
  const spillPct = available > 0 ? (100 * totals.spilledMWh) / available : 0;
  const spillLevel = classifyCeiling(spillPct, THRESHOLDS.curtailmentPct);
  const installed = installedSolarMW(feeder);
  const penetration = solarPenetrationPct(feeder);

  return (
    <Card className="flex flex-col gap-4 p-5">
      <PanelHeader
        title="Rooftop PV today"
        note={`Since local midnight · ${formatMW(installed)} MW across ${
          feeder.pvConsumers
        } consumers`}
      />

      <div className="grid grid-cols-2 gap-4">
        <StatTile
          label="Delivered"
          help="Rooftop PV energy the feeder took today, whether it served local load or was exported to the primary. The quantity a net-accounting statement is written from."
          value={formatMWh(totals.deliveredMWh)}
          unit="MWh"
        />
        <StatTile
          label="Curtailed"
          help="PV energy that was available and refused by volt-watt response. Stated beside delivery, because a curtailment figure alone cannot be judged."
          value={formatMWh(totals.spilledMWh)}
          unit="MWh"
          level={totals.spilledMWh > 0.05 ? spillLevel : "normal"}
          footnote={`${spillPct.toFixed(1)} % of available`}
        />
      </div>

      <div className="flex flex-col gap-2 border-t border-border pt-3">
        <div className="flex items-baseline justify-between gap-2">
          <Term help="The highest instantaneous PV output reached today, against installed capacity. A clear Colombo noon lands around 80 % of nameplate once inverter, soiling and module-temperature losses are taken.">
            Peak output
          </Term>
          <span className="tnum text-xs text-muted-foreground">
            {formatMW(totals.peakMW)} of {formatMW(installed)} MW
          </span>
        </div>
        <Meter
          value={totals.peakMW}
          max={installed}
          label={`Peak rooftop PV output today, ${formatMW(totals.peakMW)} of ${formatMW(
            installed
          )} megawatts installed`}
        />
        {/* The interpretation, not just the ratio. Whether a penetration figure
            is a problem depends entirely on the feeder it sits on, and a bare
            percentage leaves the operator to guess. The headroom figure is what
            makes this panel useful on a feeder that never curtails: the question
            is not how much was spilled but how much more could be connected. */}
        <p className="text-[11px] text-muted-foreground">
          {penetration.toFixed(0)} % of the feeder&apos;s {feeder.peakMW.toFixed(1)} MW peak
          demand —{" "}
          {penetration < 40
            ? "low enough that feeder load absorbs it all day."
            : penetration < 70
              ? "enough that clear middays start pushing power back toward the primary."
              : "high enough that the midday surplus, not the evening peak, is the binding constraint."}{" "}
          Tightest moment today left{" "}
          <span className="tnum font-medium text-foreground">
            {formatMW(totals.minHeadroomMW)} MW
          </span>{" "}
          of hosting headroom.
        </p>
      </div>
    </Card>
  );
});
