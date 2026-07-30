/**
 * Net-demand ramp ahead — the duck-curve panel, at feeder scale.
 *
 * Net demand is feeder demand minus rooftop PV, and its slope is what the
 * battery and the primary infeed actually have to follow. CAISO gives it a chart of
 * its own beside supply for exactly one reason: every kilowatt of added PV makes
 * the evening ramp steeper, so the quantity that limits PV growth is not the
 * midday surplus but the slope after it. On this feeder sunset and the domestic
 * evening peak are two hours apart, which makes the ramp unusually hard.
 *
 * Reported as *required against capability*, never as a bare MW/min. A ramp rate
 * on its own cannot be judged; the same 0.4 MW/min is routine for one feeder and
 * an incident for another.
 */

import { memo, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Meter, PanelHeader, StatTile } from "./tiles";
import { formatLKT } from "@/pipeline/calendar";
import { buildRampRisk } from "@/pipeline/system/derive";
import { LEVEL_CLASS } from "@/pipeline/system/thresholds";
import type { BessTick, UnitTick } from "@/pipeline/system/types";
import { cn, formatMW } from "@/lib/utils";

/** Memoised: the look-ahead sweep costs ~30 model evaluations, and the fleet
 *  telemetry behind it moves every 15 s — not every second. */
export const RampPanel = memo(function RampPanel({
  now,
  units,
  feederId,
}: {
  now: number;
  units: (UnitTick | BessTick)[];
  feederId: string;
}) {
  const risk = useMemo(() => buildRampRisk(now, units, feederId), [now, units, feederId]);
  const required = Math.abs(risk.requiredMWPerMin);
  const usedPct = risk.capabilityMWPerMin > 0 ? (100 * required) / risk.capabilityMWPerMin : 0;
  const falling = risk.requiredMWPerMin < 0;

  return (
    <Card className="flex flex-col gap-4 p-5">
      <PanelHeader title="Ramp ahead" note="Steepest net-demand slope in the next 4 h" />

      <div className="grid grid-cols-2 gap-4">
        <StatTile
          label="Required"
          help="Steepest net-demand ramp forecast over the next four hours. Net demand is feeder demand minus rooftop PV — the part the battery and the primary infeed have to follow."
          value={`${falling ? "−" : "+"}${formatMW(required)}`}
          unit="MW/min"
          level={risk.status}
          footnote={`${falling ? "Falling" : "Rising"} at ${formatLKT(risk.at, { time: true })}`}
        />
        <StatTile
          label="Can follow"
          help="Sustained ramp the feeder's DER and the primary infeed can deliver together. Storage is inverter-coupled and answers instantly, so its full available power counts."
          value={formatMW(risk.capabilityMWPerMin)}
          unit="MW/min"
          footnote="Infeed + storage"
        />
      </div>

      <div className="flex flex-col gap-2 border-t border-border pt-3">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Ramp capability used
          </span>
          <span className={cn("tnum text-xs font-medium", LEVEL_CLASS[risk.status].text)}>
            {usedPct.toFixed(0)} %
          </span>
        </div>
        <Meter
          value={usedPct}
          // Muted ink while it is fine, status colour when it is not — the same
          // rule the tiles follow. The source palette is not used here: this is
          // a ratio, not one of the series in the stack.
          color={risk.status === "normal" ? "var(--viz-input)" : `var(--status-${risk.status})`}
          marker={70}
          markerLabel="Warning at 70 % of capability"
          label={`Ramp capability used, ${usedPct.toFixed(0)} percent`}
        />
        <p className="text-[11px] text-muted-foreground">
          The sun setting into the domestic evening peak is the binding case, and
          more rooftop PV makes it steeper.
        </p>
      </div>
    </Card>
  );
});
