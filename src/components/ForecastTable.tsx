import { useState } from "react";
import { ChevronDown, Table2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatLKT, localParts } from "@/pipeline/calendar";
import type { Bundle } from "@/pipeline/forecast";

/**
 * The table view.
 *
 * Every chart on this screen needs a non-visual equivalent — for screen
 * readers, for the colleague who wants to paste numbers into a purchase note,
 * and for anyone whose colour vision the palette can't fully serve. Aggregated
 * to the hour, which is the granularity purchase blocks are actually written in.
 */
export function ForecastTable({ bundle }: { bundle: Bundle }) {
  const hours: Array<{
    ts: number;
    expected: number;
    lower: number;
    upper: number;
    tempC: number;
    energy: number;
  }> = [];

  for (let i = 0; i + 4 <= bundle.forecast.length; i += 4) {
    const slice = bundle.forecast.slice(i, i + 4);
    hours.push({
      ts: slice[0].ts,
      expected: slice.reduce((a, b) => a + b.expected, 0) / 4,
      lower: Math.min(...slice.map((s) => s.lower)),
      upper: Math.max(...slice.map((s) => s.upper)),
      tempC: slice.reduce((a, b) => a + b.tempC, 0) / 4,
      energy: slice.reduce((a, b) => a + b.expected * 0.25, 0),
    });
  }

  const peakHour = hours.reduce((a, b) => (b.expected > a.expected ? b : a));
  const [open, setOpen] = useState(false);

  return (
    <Card>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 rounded-lg p-4 text-left transition-colors hover:bg-accent/50"
      >
        <Table2 className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0">
          <span className="block text-sm font-semibold tracking-tight">
            Hourly forecast table — {formatLKT(bundle.horizonStart, { date: true, time: false })}
          </span>
          <span className="block text-xs text-muted-foreground">
            Mean load per hour with the 95% interval. The numbers behind the chart, for anyone who
            needs to read or copy them.
          </span>
        </span>
        <ChevronDown
          className={`ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      <CardContent hidden={!open}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-xs">
            <caption className="sr-only">
              Hourly day-ahead load forecast for {bundle.feeder.name} with confidence bounds and
              forecast temperature.
            </caption>
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th scope="col" className="py-2 pr-3 font-medium">Hour (LKT)</th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">Expected MW</th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">Lower MW</th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">Upper MW</th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">Energy MWh</th>
                <th scope="col" className="py-2 text-right font-medium">Temp °C</th>
              </tr>
            </thead>
            <tbody className="tnum">
              {hours.map((h) => {
                const isPeak = h.ts === peakHour.ts;
                return (
                  <tr
                    key={h.ts}
                    className={`border-b border-border/50 last:border-0 ${
                      isPeak ? "bg-accent/60 font-medium" : ""
                    }`}
                  >
                    <th scope="row" className="py-1.5 pr-3 text-left font-normal">
                      {String(localParts(h.ts).hour).padStart(2, "0")}:00
                      {isPeak && (
                        <span className="ml-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                          peak
                        </span>
                      )}
                    </th>
                    <td className="py-1.5 pr-3 text-right">{h.expected.toFixed(2)}</td>
                    <td className="py-1.5 pr-3 text-right text-muted-foreground">
                      {h.lower.toFixed(2)}
                    </td>
                    <td className="py-1.5 pr-3 text-right text-muted-foreground">
                      {h.upper.toFixed(2)}
                    </td>
                    <td className="py-1.5 pr-3 text-right">{h.energy.toFixed(2)}</td>
                    <td className="py-1.5 text-right text-muted-foreground">
                      {h.tempC.toFixed(1)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-border font-medium">
                <th scope="row" className="py-2 pr-3 text-left">Total</th>
                <td className="py-2 pr-3 text-right">{bundle.kpis.peakMW.toFixed(2)} peak</td>
                <td className="py-2 pr-3" />
                <td className="py-2 pr-3" />
                <td className="tnum py-2 pr-3 text-right">{bundle.kpis.energyMWh.toFixed(2)}</td>
                <td className="py-2" />
              </tr>
            </tfoot>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
