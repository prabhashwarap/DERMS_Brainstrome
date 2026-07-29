/**
 * Net-demand ramp ahead — the duck-curve panel.
 *
 * Net demand is demand minus solar, and its slope is what conventional plant and
 * storage actually have to follow. CAISO gives it a chart of its own beside
 * supply for exactly one reason: every megawatt of added solar makes the evening
 * ramp steeper, so the quantity that limits solar growth is not the midday
 * surplus but the slope after it.
 *
 * Reported as *required against capability*, never as a bare MW/min. A ramp rate
 * on its own cannot be judged; the same 9 MW/min is routine for one fleet and an
 * incident for another.
 */

import { memo, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Meter, PanelHeader, StatTile } from "./tiles";
import { formatLKT } from "@/pipeline/calendar";
import { buildRampRisk } from "@/pipeline/system/derive";
import { LEVEL_CLASS } from "@/pipeline/system/thresholds";
import type { BessTick, UnitTick } from "@/pipeline/system/types";
import { cn } from "@/lib/utils";

/** Memoised: the look-ahead sweep costs ~30 model evaluations, and the fleet
 *  telemetry behind it moves every 15 s — not every second. */
export const RampPanel = memo(function RampPanel({
  now,
  units,
}: {
  now: number;
  units: (UnitTick | BessTick)[];
}) {
  const risk = useMemo(() => buildRampRisk(now, units), [now, units]);
  const required = Math.abs(risk.requiredMWPerMin);
  const usedPct = risk.capabilityMWPerMin > 0 ? (100 * required) / risk.capabilityMWPerMin : 0;
  const falling = risk.requiredMWPerMin < 0;

  return (
    <Card className="flex flex-col gap-4 p-5">
      <PanelHeader title="Ramp ahead" note="Steepest net-demand slope in the next 4 h" />

      <div className="grid grid-cols-2 gap-4">
        <StatTile
          label="Required"
          help="Steepest net-demand ramp forecast over the next four hours. Net demand is demand minus solar — the part the dispatchable fleet has to follow."
          value={`${falling ? "−" : "+"}${required.toFixed(1)}`}
          unit="MW/min"
          level={risk.status}
          footnote={`${falling ? "Falling" : "Rising"} at ${formatLKT(risk.at, { time: true })}`}
        />
        <StatTile
          label="Can follow"
          help="Sustained ramp the conventional fleet and storage can deliver together. Storage answers instantly, so its full available power counts."
          value={risk.capabilityMWPerMin.toFixed(1)}
          unit="MW/min"
          footnote="Conventional + storage"
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
          The sun setting into the evening peak is the binding case, and more solar
          makes it steeper.
        </p>
      </div>
    </Card>
  );
});
