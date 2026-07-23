import { ArrowDownRight, ArrowUpRight, Clock, Gauge, Minus, Zap } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatLKT } from "@/pipeline/calendar";
import type { Bundle } from "@/pipeline/forecast";

/** One decimal place. More digits would imply accuracy the sensors do not have. */
const mw = (v: number) => v.toFixed(1);
const pct = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1)}%`;

interface TileProps {
  label: string;
  value: string;
  unit?: string;
  icon: React.ReactNode;
  footnote: React.ReactNode;
  help: string;
}

function Tile({ label, value, unit, icon, footnote, help }: TileProps) {
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">{icon}</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="cursor-help text-[11px] font-medium uppercase tracking-wider text-muted-foreground underline decoration-dotted underline-offset-4">
              {label}
            </span>
          </TooltipTrigger>
          <TooltipContent>{help}</TooltipContent>
        </Tooltip>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="tnum text-[32px] font-semibold leading-none tracking-tight">{value}</span>
        {unit && <span className="text-sm font-medium text-muted-foreground">{unit}</span>}
      </div>
      <div className="text-xs text-muted-foreground">{footnote}</div>
    </Card>
  );
}

/**
 * Executive summary.
 *
 * Four numbers, in the order a purchasing decision needs them: how high, how
 * much, when, and how that compares to the day just gone. Everything is set in
 * tabular figures so the row does not reflow as values update.
 */
export function KpiRow({ bundle }: { bundle: Bundle }) {
  const k = bundle.kpis;
  const peakDelta = ((k.peakMW - k.prevPeakMW) / k.prevPeakMW) * 100;
  const energyDelta = ((k.energyMWh - k.prevEnergyMWh) / k.prevEnergyMWh) * 100;
  const DeltaIcon = peakDelta > 0.5 ? ArrowUpRight : peakDelta < -0.5 ? ArrowDownRight : Minus;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Tile
        label="Forecast peak"
        value={mw(k.peakMW)}
        unit="MW"
        icon={<Zap className="h-4 w-4" />}
        help="Highest expected 15-minute net demand over the 24-hour horizon. Sets the capacity that has to be secured."
        footnote={
          <span className="tnum">
            95% range {mw(k.peakLowerMW)} – {mw(k.peakUpperMW)} MW
          </span>
        }
      />
      <Tile
        label="Forecast energy"
        value={k.energyMWh.toFixed(1)}
        unit="MWh"
        icon={<Gauge className="h-4 w-4" />}
        help="Area under the forecast curve - the volume to contract for the day. The range is the volume implied by the confidence band."
        footnote={
          <span className="tnum">
            95% range {k.energyLowerMWh.toFixed(1)} – {k.energyUpperMWh.toFixed(1)} MWh
          </span>
        }
      />
      <Tile
        label="Time of peak"
        value={formatLKT(k.peakAt)}
        unit="LKT"
        icon={<Clock className="h-4 w-4" />}
        help="When the maximum is expected, so purchase blocks can be aligned to it."
        footnote={
          <span className="tnum">
            Trough {mw(k.minMW)} MW at {formatLKT(k.minAt)}
          </span>
        }
      />
      <Tile
        label="vs. yesterday"
        value={pct(peakDelta)}
        icon={<DeltaIcon className="h-4 w-4" />}
        help="Forecast peak against yesterday's actual peak. Context for whether the grid is trending hotter or cooler."
        footnote={
          <span className="tnum">
            Peak {mw(k.prevPeakMW)} MW · energy {pct(energyDelta)}
          </span>
        }
      />
    </div>
  );
}
