/**
 * Active conditions — the dashboard's read-only window onto the alarm layer.
 *
 * The drawer stays the place alarms are worked; this panel exists because a
 * dashboard that shows only healthy numbers cannot tell you that something is
 * wrong somewhere you are not looking. It lists the three most severe active
 * conditions and hands off to the drawer for the rest, so the same alarm is
 * never acknowledged in two places.
 *
 * Severity comes from the same threshold table the readouts use, so an amber
 * tile and an amber row always mean the same thing.
 */

import { AlertTriangle, Check, Info, OctagonAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PanelHeader } from "./tiles";
import { useAlarms } from "@/lib/alarms";
import { formatLKT } from "@/pipeline/calendar";
import type { Severity } from "@/pipeline/system/types";
import { cn } from "@/lib/utils";

const SEVERITY: Record<Severity, { icon: typeof AlertTriangle; className: string }> = {
  critical: { icon: OctagonAlert, className: "text-[var(--status-critical)]" },
  warning: { icon: AlertTriangle, className: "text-[var(--status-warning)]" },
  info: { icon: Info, className: "text-muted-foreground" },
};

/** How many rows before the panel defers to the drawer. */
const SHOWN = 3;

export function EventsPanel() {
  const { alarms, unacknowledged, setOpen } = useAlarms();
  const shown = alarms.slice(0, SHOWN);

  return (
    <Card className="flex flex-col gap-3 p-5">
      <PanelHeader
        title="Active conditions"
        note={
          alarms.length === 0
            ? "Re-evaluated every 5 s"
            : `${alarms.length} active · ${unacknowledged} unacknowledged`
        }
      >
        <Button variant="ghost" size="sm" onClick={() => setOpen(true)} className="text-xs">
          Open alarms
        </Button>
      </PanelHeader>

      {shown.length === 0 ? (
        <p className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
          <Check className="h-4 w-4 text-[var(--status-normal)]" aria-hidden />
          Nothing active. All signals inside their bands.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {shown.map((a) => {
            const s = SEVERITY[a.severity];
            const Icon = s.icon;
            return (
              <li
                key={a.id}
                className={cn(
                  "flex items-start gap-2.5 py-2 first:pt-0",
                  a.acknowledgedAt !== null && "opacity-55"
                )}
              >
                <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", s.className)} aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{a.source.label}</div>
                  <div className="text-xs text-muted-foreground">{a.message}</div>
                </div>
                <span className="tnum shrink-0 text-[11px] text-muted-foreground">
                  {formatLKT(a.ts, { time: true })}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {alarms.length > SHOWN && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-fit text-xs text-muted-foreground underline decoration-dotted underline-offset-4 hover:text-foreground"
        >
          {alarms.length - SHOWN} more active
        </button>
      )}
    </Card>
  );
}
