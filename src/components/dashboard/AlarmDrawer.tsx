/**
 * Alarms — a drawer, never a page.
 *
 * Alarms cut across every tab, so they must be reachable without leaving the
 * one you are on. Three severities only: more tiers than an operator can act on
 * differently is noise wearing the costume of precision.
 */

import { AlertTriangle, Check, Info, OctagonAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAlarms } from "@/lib/alarms";
import { formatLKT } from "@/pipeline/calendar";
import type { Severity } from "@/pipeline/system/types";
import { cn } from "@/lib/utils";

const SEVERITY: Record<
  Severity,
  { label: string; icon: typeof AlertTriangle; className: string }
> = {
  critical: {
    label: "Critical",
    icon: OctagonAlert,
    className: "text-[var(--status-critical)]",
  },
  warning: {
    label: "Warning",
    icon: AlertTriangle,
    className: "text-[var(--status-warning)]",
  },
  info: { label: "Info", icon: Info, className: "text-muted-foreground" },
};

export function AlarmDrawer() {
  const { alarms, open, setOpen, acknowledge, acknowledgeAll, unacknowledged } = useAlarms();

  if (!open) return null;

  // Grouped by asset, most severe first — the sort already ran in the provider.
  return (
    <>
      <button
        type="button"
        aria-label="Close alarms"
        onClick={() => setOpen(false)}
        className="fixed inset-0 z-40 bg-black/40"
      />
      <aside
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-border bg-card"
        aria-label="Alarms and events"
      >
        <header className="flex items-center gap-3 border-b border-border px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold">Alarms and events</h2>
            <p className="text-xs text-muted-foreground">
              {alarms.length} active · {unacknowledged} unacknowledged
            </p>
          </div>
          <div className="ml-auto flex items-center gap-1">
            {unacknowledged > 0 && (
              <Button variant="ghost" size="sm" onClick={acknowledgeAll} className="text-xs">
                Acknowledge all
              </Button>
            )}
            <Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="Close">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto">
          {alarms.length === 0 ? (
            <p className="px-5 py-8 text-sm text-muted-foreground">
              No active alarms. Conditions are re-evaluated every five seconds.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {alarms.map((a) => {
                const s = SEVERITY[a.severity];
                const Icon = s.icon;
                const acked = a.acknowledgedAt !== null;
                return (
                  <li key={a.id} className={cn("flex gap-3 px-5 py-3", acked && "opacity-55")}>
                    <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", s.className)} aria-hidden />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm font-medium">{a.source.label}</span>
                        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                          {s.label}
                        </span>
                      </div>
                      <p className="mt-0.5 text-sm text-muted-foreground">{a.message}</p>
                      <p className="tnum mt-1 text-[11px] text-muted-foreground">
                        since {formatLKT(a.ts, { time: true })}
                      </p>
                    </div>
                    {!acked && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => acknowledge(a.id)}
                        aria-label={`Acknowledge ${a.source.label}`}
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <footer className="border-t border-border px-5 py-3 text-[11px] text-muted-foreground">
          Severity is derived from the same threshold table the readouts use, so
          an amber tile and an amber alarm always mean the same thing.
        </footer>
      </aside>
    </>
  );
}
