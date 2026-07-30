import { Calendar } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FEEDER_LIST, type FeederId } from "@/pipeline/feeders";
import { formatLKT } from "@/pipeline/calendar";
import type { Bundle } from "@/pipeline/forecast";

interface Props {
  feederId: FeederId;
  onFeederChange: (id: FeederId) => void;
  bundle: Bundle;
}

/**
 * Scope and provenance for the forecasting section.
 *
 * Sits directly under the platform top bar: which feeder, when the job last
 * ran, the forecast horizon day type, and the demonstration-data disclosure.
 */
export function ForecastToolbar({ feederId, onFeederChange, bundle }: Props) {
  const { generatedAt, horizonStart, dayType } = bundle;
  const horizonDateStr = formatLKT(horizonStart, { date: true, time: false });

  const badgeClass = dayType.isHoliday
    ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30"
    : dayType.type === "Saturday" || dayType.type === "Sunday"
    ? "bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30"
    : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label
              htmlFor="feeder"
              className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground"
            >
              Feeder
            </label>
            <Select value={feederId} onValueChange={(v) => onFeederChange(v as FeederId)}>
              <SelectTrigger id="feeder" className="w-[250px]" aria-label="Select feeder">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FEEDER_LIST.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    <span className="flex flex-col items-start">
                      <span>{f.name}</span>
                      <span className="text-[11px] text-muted-foreground">
                        {f.capacityMVA} MVA · {f.mix} · Balanced 3-Phase
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Horizon:</span>
            <span className="text-xs font-semibold text-foreground tnum">{horizonDateStr}</span>
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${badgeClass}`}>
              <Calendar className="w-3.5 h-3.5 shrink-0" />
              <span>Day Type: <strong className="font-semibold">{dayType.badgeText}</strong></span>
            </span>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
              Balanced 3-Phase Feeder
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
          </span>
          <span className="tnum">
            Generated {formatLKT(generatedAt, { date: true, time: true })} · Next run 06:00 LKT
          </span>
        </div>
      </div>
    </div>
  );
}
