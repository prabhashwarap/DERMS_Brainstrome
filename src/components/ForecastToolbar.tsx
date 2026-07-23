import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FEEDER_LIST, type FeederId } from "@/pipeline/feeders";
import { formatLKT } from "@/pipeline/calendar";

interface Props {
  feederId: FeederId;
  onFeederChange: (id: FeederId) => void;
  generatedAt: number;
}

/**
 * Scope and provenance for the forecasting section.
 *
 * Sits directly under the platform top bar: which feeder, when the job last
 * ran, and the demonstration-data disclosure. The disclosure is not
 * dismissible — it has to survive scrolling, screenshots and anyone reading
 * the screen over the operator's shoulder.
 */
export function ForecastToolbar({ feederId, onFeederChange, generatedAt }: Props) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
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
                      {f.capacityMVA} MVA · {f.mix}
                    </span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
          </span>
          <span className="tnum">
            Forecast generated {formatLKT(generatedAt, { date: true, time: true })} LKT · next run
            06:00
          </span>
        </div>
      </div>
    </div>
  );
}
