/**
 * The pieces every dashboard panel is built from.
 *
 * Four primitives, deliberately few: a labelled term, a stat tile, a meter and a
 * panel header. A control-room dashboard is read by scanning, and scanning only
 * works if the same quantity always wears the same shape — so a number is either
 * a tile or a meter, and never a bespoke arrangement invented for one panel.
 */

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { LEVEL_CLASS, type Level } from "@/pipeline/system/thresholds";
import { cn } from "@/lib/utils";

/**
 * A term with its definition one hover away. Every number on this page is a
 * grid quantity with a precise meaning, and an operator who has to guess what
 * "RoCoF" bounds is being asked to act on a word rather than a fact.
 */
export function Term({ children, help }: { children: React.ReactNode; help: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="w-fit cursor-help text-[11px] font-medium uppercase tracking-wider text-muted-foreground underline decoration-dotted underline-offset-4">
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{help}</TooltipContent>
    </Tooltip>
  );
}

/** Panel title plus its one-line scope. Both, always — a chart without a stated
 *  window is a chart that can be misread. */
export function PanelHeader({
  title,
  note,
  children,
}: {
  title: string;
  note: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="text-xs text-muted-foreground">{note}</p>
      </div>
      {children}
    </div>
  );
}

/**
 * One number, its unit, and one line qualifying it.
 *
 * A second headline figure would mean this should have been two tiles. Colour
 * arrives only through `level`: a tile that is not deviating is monochrome, so
 * the eye is drawn to the one that is.
 */
export function StatTile({
  label,
  value,
  unit,
  level = "normal",
  footnote,
  help,
  size = "md",
}: {
  label: string;
  value: string;
  unit?: string;
  level?: Level;
  footnote?: React.ReactNode;
  help: string;
  size?: "md" | "lg";
}) {
  return (
    <div className="flex flex-col gap-2">
      <Term help={help}>{label}</Term>
      <div className="flex items-baseline gap-1.5">
        <span
          className={cn(
            "tnum font-semibold leading-none",
            size === "lg" ? "text-[34px]" : "text-[26px]",
            LEVEL_CLASS[level].text
          )}
        >
          {value}
        </span>
        {unit && <span className="text-sm font-medium text-muted-foreground">{unit}</span>}
      </div>
      {footnote != null && <div className="tnum text-xs text-muted-foreground">{footnote}</div>}
    </div>
  );
}

/**
 * A single ratio against a limit, on a track — never a two-slice pie.
 *
 * The track is the whole; the fill is the part. `marker` draws a hairline at a
 * reference point on the same scale (a record peak, a threshold), which is the
 * only way a share reads as "high" or "low" rather than merely as a number.
 */
export function Meter({
  value,
  max = 100,
  color = "var(--src-solar)",
  marker,
  markerLabel,
  label,
}: {
  value: number;
  max?: number;
  color?: string;
  marker?: number;
  markerLabel?: string;
  label: string;
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const markerPct = marker == null ? null : Math.max(0, Math.min(100, (marker / max) * 100));

  return (
    <div
      className="relative h-2 w-full overflow-hidden rounded-full bg-muted"
      role="img"
      aria-label={label}
    >
      <div
        className="h-full rounded-full transition-[width] duration-500"
        style={{ width: `${pct}%`, background: color }}
      />
      {markerPct != null && (
        <span
          className="absolute top-0 h-full w-0.5 bg-foreground/45"
          style={{ left: `${markerPct}%` }}
          title={markerLabel}
          aria-hidden
        />
      )}
    </div>
  );
}
