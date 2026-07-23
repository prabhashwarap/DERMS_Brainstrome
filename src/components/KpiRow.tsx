import { memo } from "react";
import { ArrowDownRight, ArrowUpRight, Clock, Gauge, Minus, Sun, Zap } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatLKT } from "@/pipeline/calendar";
import type { Bundle } from "@/pipeline/forecast";

import { formatPower, formatEnergy } from "@/lib/utils";

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
// Depends only on `bundle`; memo keeps chart-hover re-renders of App from
// cascading into the KPI tiles.
export const KpiRow = memo(function KpiRow({
  bundle,
  solar = false,
}: {
  bundle: Bundle;
  /** Show the rooftop-PV generation tile (Forecast+ node panels only). */
  solar?: boolean;
}) {
  const k = bundle.kpis;
  const peakDelta = k.prevPeakMW > 0 ? ((k.peakMW - k.prevPeakMW) / k.prevPeakMW) * 100 : 0;
  const energyDelta = k.prevEnergyMWh > 0 ? ((k.energyMWh - k.prevEnergyMWh) / k.prevEnergyMWh) * 100 : 0;
  const DeltaIcon = peakDelta > 0.5 ? ArrowUpRight : peakDelta < -0.5 ? ArrowDownRight : Minus;
  const showSolar = solar && k.solarEnergyMWh > 0.0005;

  const peakP = formatPower(k.peakMW);
  const peakLowerP = formatPower(k.peakLowerMW);
  const peakUpperP = formatPower(k.peakUpperMW);
  const minP = formatPower(k.minMW);
  const prevPeakP = formatPower(k.prevPeakMW);

  const energyE = formatEnergy(k.energyMWh);
  const energyLowerE = formatEnergy(k.energyLowerMWh);
  const energyUpperE = formatEnergy(k.energyUpperMWh);

  const solarEnergyE = formatEnergy(k.solarEnergyMWh);
  const solarPeakP = formatPower(k.solarPeakMW);

  return (
    <div
      className={`grid grid-cols-1 gap-3 sm:grid-cols-2 ${
        showSolar ? "xl:grid-cols-5" : "xl:grid-cols-4"
      }`}
    >
      <Tile
        label="Peak Load"
        value={peakP.value}
        unit={peakP.unit}
        icon={<Zap className="h-4 w-4" />}
        help="Highest expected 15-min net load over 24h horizon."
        footnote={
          <span className="tnum">
            P95: {peakLowerP.full}–{peakUpperP.full}
          </span>
        }
      />
      <Tile
        label="Total Energy"
        value={energyE.value}
        unit={energyE.unit}
        icon={<Gauge className="h-4 w-4" />}
        help="Total daily forecasted energy volume."
        footnote={
          <span className="tnum">
            P95: {energyLowerE.full}–{energyUpperE.full}
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
            Min: {minP.full} ({formatLKT(k.minAt)})
          </span>
        }
      />
      {showSolar && (
        <Tile
          label="Solar Generation"
          value={solarEnergyE.value}
          unit={solarEnergyE.unit}
          icon={<Sun className="h-4 w-4" />}
          help="Rooftop PV energy generated behind the meter over the 24h horizon."
          footnote={
            <span className="tnum">
              Peak {solarPeakP.full}
            </span>
          }
        />
      )}
      <Tile
        label="vs. Yesterday"
        value={pct(peakDelta)}
        icon={<DeltaIcon className="h-4 w-4" />}
        help="Peak change compared to yesterday's actual peak."
        footnote={
          <span className="tnum">
            Prev peak {prevPeakP.full} · energy {pct(energyDelta)}
          </span>
        }
      />
    </div>
  );
});
