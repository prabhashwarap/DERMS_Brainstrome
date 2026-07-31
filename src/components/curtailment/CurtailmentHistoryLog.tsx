import { useState } from "react";
import { History, Search, Download, CheckCircle2, Clock, AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { REASON_LABELS, type CurtailmentEvent } from "@/pipeline/curtailment";

interface Props {
  events: CurtailmentEvent[];
}

export function CurtailmentHistoryLog({ events }: Props) {
  const [searchTerm, setSearchTerm] = useState("");

  const historicalEvents = events.filter((e) =>
    e.scope.toLowerCase().includes(searchTerm.toLowerCase()) ||
    String(e.taskId).includes(searchTerm)
  );

  return (
    <Card className="flex flex-col gap-4 border-border/70 bg-card p-4 lg:p-5">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/60 pb-3">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-bold text-foreground uppercase tracking-wider">
            Utility Curtailment Audit History Log
          </h2>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search Task ID or Scope..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-8 rounded-md border border-input bg-transparent pl-8 pr-3 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring w-[200px]"
            />
          </div>

          <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
            <Download className="h-3.5 w-3.5" />
            Export Audit Log
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-border/60 bg-muted/30 text-muted-foreground text-[11px] font-semibold uppercase tracking-wider">
              <th className="py-2.5 px-3">Time / Date</th>
              <th className="py-2.5 px-3">Task ID</th>
              <th className="py-2.5 px-3">Scope & Target</th>
              <th className="py-2.5 px-3 text-center">Power Limit</th>
              <th className="py-2.5 px-3">Trigger Reason</th>
              <th className="py-2.5 px-3 text-center">Dispatch State</th>
              <th className="py-2.5 px-3 text-center">Execution Status</th>
              <th className="py-2.5 px-3 text-right">Shaved Energy</th>
              <th className="py-2.5 px-3">Callback Protocol</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {historicalEvents.map((evt) => {
              const timeStr = new Date(evt.startTime).toLocaleString([], {
                month: "numeric",
                day: "numeric",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              });
              const reasonInfo = REASON_LABELS[evt.reason];

              return (
                <tr key={evt.id} className="hover:bg-muted/20 transition-colors">
                  <td className="py-3 px-3 tnum text-muted-foreground font-medium">{timeStr}</td>
                  <td className="py-3 px-3 font-bold tnum text-primary">{evt.taskId}</td>
                  <td className="py-3 px-3 font-semibold text-foreground">{evt.scope}</td>
                  <td className="py-3 px-3 text-center font-bold text-rose-500">
                    {evt.targetLimitPct !== undefined ? `${evt.targetLimitPct}%` : `${evt.targetLimitKW} kW`}
                  </td>
                  <td className="py-3 px-3 text-muted-foreground">{reasonInfo.label}</td>
                  <td className="py-3 px-3 text-center">
                    <span className="inline-flex rounded-full bg-emerald-500/15 px-2 py-0.5 font-semibold text-emerald-500 text-[11px]">
                      Applied
                    </span>
                  </td>
                  <td className="py-3 px-3 text-center">
                    {evt.status === "active" ? (
                      <span className="inline-flex items-center gap-1 font-semibold text-emerald-500">
                        <CheckCircle2 className="h-3 w-3" /> Success
                      </span>
                    ) : evt.status === "revoked" ? (
                      <span className="inline-flex items-center gap-1 font-semibold text-muted-foreground">
                        <Clock className="h-3 w-3" /> Released
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 font-semibold text-amber-500">
                        <AlertTriangle className="h-3 w-3" /> Partial
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-3 text-right font-bold tnum text-foreground">
                    {evt.shavedEnergyMWh.toFixed(1)} MWh
                  </td>
                  <td className="py-3 px-3 text-muted-foreground">
                    <span className="truncate block font-medium text-foreground">{evt.protocol}</span>
                    <span className="text-[10px] text-muted-foreground">Full Generation Authorized</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
