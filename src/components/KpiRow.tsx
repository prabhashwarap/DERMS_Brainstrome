import { ArrowDownRight, ArrowUpRight, Clock, Gauge, Minus, Zap } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatLKT } from "@/pipeline/calendar";
import type { Bundle } from "@/pipeline/forecast";

/** Format power with adaptive precision according to magnitude. */
const mw = (v: number) => {
  const abs = Math.abs(v);
  if (abs >= 10) return v.toFixed(1);
  if (abs >= 1) return v.toFixed(2);
  if (abs >= 0.01) return v.toFixed(3);
  return v.toFixed(4);
};

/** Format energy with adaptive precision according to magnitude. */
const mwh = (v: number) => {
  const abs = Math.abs(v);
  if (abs >= 10) return v.toFixed(1);
  if (abs >= 1) return v.toFixed(2);
  if (abs >= 0.01) return v.toFixed(3);
  return v.toFixed(4);
};

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
  const peakDelta = k.prevPeakMW > 0 ? ((k.peakMW - k.prevPeakMW) / k.prevPeakMW) * 100 : 0;
  const energyDelta = k.prevEnergyMWh > 0 ? ((k.energyMWh - k.prevEnergyMWh) / k.prevEnergyMWh) * 100 : 0;
  const DeltaIcon = peakDelta > 0.5 ? ArrowUpRight : peakDelta < -0.5 ? ArrowDownRight : Minus;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Tile
        label="Peak Load"
        value={mw(k.peakMW)}
        unit="MW"
        icon={<Zap className="h-4 w-4" />}
        help="Highest expected 15-min net load over 24h horizon."
        footnote={
          <span className="tnum">
            P95: {mw(k.peakLowerMW)}–{mw(k.peakUpperMW)} MW
          </span>
        }
      />
      <Tile
        label="Total Energy"
        value={mwh(k.energyMWh)}
        unit="MWh"
        icon={<Gauge className="h-4 w-4" />}
        help="Total daily forecasted energy volume."
        footnote={
          <span className="tnum">
            P95: {mwh(k.energyLowerMWh)}–{mwh(k.energyUpperMWh)} MWh
          </span>
        }
      />
      <Tile
        label="Peak Time"
        value={formatLKT(k.peakAt)}
        unit="LKT"
        icon={<Clock className="h-4 w-4" />}
        help="Expected time of maximum daily load."
        footnote={
          <span className="tnum">
            Min: {mw(k.minMW)} MW ({formatLKT(k.minAt)})
          </span>
        }
      />
      <Tile
        label="vs. Yesterday"
        value={pct(peakDelta)}
        icon={<DeltaIcon className="h-4 w-4" />}
        help="Peak change compared to yesterday's actual peak."
        footnote={
          <span className="tnum">
            Prev peak {mw(k.prevPeakMW)} MW · energy {pct(energyDelta)}
          </span>
        }
      />
    </div>
  );
}
