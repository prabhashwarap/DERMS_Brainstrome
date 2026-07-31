import { Play, RotateCcw, ShieldAlert, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { REASON_LABELS, type CurtailmentEvent } from "@/pipeline/curtailment";

interface Props {
  events: CurtailmentEvent[];
  onRevoke: (id: string) => void;
}

export function ActiveDispatchesPanel({ events, onRevoke }: Props) {
  const activeEvents = events.filter((e) => e.status === "active");

  return (
    <Card className="flex flex-col gap-3 border-border/70 bg-card p-4 lg:p-5">
      <div className="flex items-center justify-between border-b border-border/60 pb-3">
        <div className="flex items-center gap-2">
          <Play className="h-4 w-4 text-emerald-500 fill-emerald-500/20" />
          <h2 className="text-sm font-bold text-foreground uppercase tracking-wider">
            Active Utility Dispatch Directives
          </h2>
          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-500 border border-emerald-500/30">
            {activeEvents.length} Active
          </span>
        </div>
      </div>

      {activeEvents.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-8 text-center border border-dashed border-border rounded-lg bg-muted/20">
          <CheckCircle2 className="h-8 w-8 text-emerald-500 mb-2 opacity-80" />
          <span className="text-sm font-medium text-foreground">Full Generation Authorized</span>
          <span className="text-xs text-muted-foreground mt-0.5">
            No active grid curtailment directives currently applied on this feeder.
          </span>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {activeEvents.map((evt) => {
            const reasonInfo = REASON_LABELS[evt.reason];
            const startTimeStr = new Date(evt.startTime).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            });

            return (
              <div
                key={evt.id}
                className="flex flex-col gap-3 rounded-lg border border-border/80 bg-muted/30 p-4 transition-all hover:border-primary/40"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary border border-primary/20">
                      Task ID {evt.taskId}
                    </span>
                    <span className="text-xs font-semibold text-foreground">{evt.scope}</span>
                    <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[11px] font-semibold text-rose-500">
                      {evt.targetLimitPct !== undefined ? `${evt.targetLimitPct}% Limit` : `${evt.targetLimitKW} kW Cap`}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Issued at {startTimeStr}</span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onRevoke(evt.id)}
                      className="h-7 text-xs text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 gap-1.5"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Revoke
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-border/40 text-xs">
                  <div>
                    <span className="text-muted-foreground block text-[10px] uppercase font-medium">Trigger Reason</span>
                    <span className="font-semibold text-foreground flex items-center gap-1 mt-0.5">
                      <ShieldAlert className="h-3 w-3 text-amber-500" />
                      {reasonInfo.label}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[10px] uppercase font-medium">Shaved Capacity</span>
                    <span className="font-bold text-rose-500 mt-0.5 block">{evt.shavedCapacityMW.toFixed(1)} MW</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[10px] uppercase font-medium">Protocol</span>
                    <span className="font-medium text-foreground mt-0.5 block">{evt.protocol}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[10px] uppercase font-medium">Initiator</span>
                    <span className="font-medium text-foreground mt-0.5 block truncate">{evt.initiator}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
