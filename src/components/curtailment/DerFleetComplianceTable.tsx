import { CheckCircle2, Clock, AlertTriangle, ShieldOff, Zap } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { DerFleetSite } from "@/pipeline/curtailment";

interface Props {
  sites: DerFleetSite[];
}

export function DerFleetComplianceTable({ sites }: Props) {
  return (
    <Card className="flex flex-col gap-4 border-border/70 bg-card p-4 lg:p-5">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/60 pb-3">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-bold text-foreground uppercase tracking-wider">
            Feeder DER Fleet & Compliance Matrix
          </h2>
        </div>
        <span className="text-xs text-muted-foreground">
          {sites.length} Prosumer Sites Connected ({sites.filter((s) => s.dermsEnrolled).length} DERMS Enrolled)
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-border/60 bg-muted/30 text-muted-foreground text-[11px] font-semibold uppercase tracking-wider">
              <th className="py-2.5 px-3">Site / Account No.</th>
              <th className="py-2.5 px-3">Feeder Bus Node</th>
              <th className="py-2.5 px-3">Asset Tech</th>
              <th className="py-2.5 px-3 text-right">Capacity (kW)</th>
              <th className="py-2.5 px-3 text-right">Setpoint (kW)</th>
              <th className="py-2.5 px-3 text-center">Curtailment %</th>
              <th className="py-2.5 px-3 text-center">Execution State</th>
              <th className="py-2.5 px-3">Protocol</th>
              <th className="py-2.5 px-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {sites.map((site) => {
              const ackTimeStr = new Date(site.lastAckTime).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              });

              return (
                <tr key={site.id} className="hover:bg-muted/20 transition-colors">
                  <td className="py-3 px-3">
                    <div className="font-semibold text-foreground">{site.name}</div>
                    <div className="text-[11px] text-muted-foreground tnum">{site.accountNumber}</div>
                  </td>
                  <td className="py-3 px-3 text-muted-foreground">{site.nodeName}</td>
                  <td className="py-3 px-3">
                    <span className="inline-flex items-center gap-1 rounded bg-accent px-2 py-0.5 font-medium text-foreground text-[11px]">
                      {site.assetType}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-right font-semibold tnum text-foreground">
                    {site.capacityKW} kW
                  </td>
                  <td className="py-3 px-3 text-right font-bold tnum text-foreground">
                    {site.targetSetpointKW} kW
                  </td>
                  <td className="py-3 px-3 text-center">
                    {site.curtailmentPct > 0 ? (
                      <span className="rounded-full bg-rose-500/15 px-2 py-0.5 font-semibold text-rose-500 text-[11px]">
                        {site.curtailmentPct}%
                      </span>
                    ) : (
                      <span className="text-muted-foreground">0%</span>
                    )}
                  </td>
                  <td className="py-3 px-3 text-center">
                    <StatusBadge status={site.status} />
                  </td>
                  <td className="py-3 px-3 text-muted-foreground text-[11px]">
                    <div>{site.protocol}</div>
                    <div className="text-[10px] opacity-75">Ack {ackTimeStr}</div>
                  </td>
                  <td className="py-3 px-3 text-right">
                    <Button variant="ghost" size="sm" className="h-7 text-[11px] px-2 text-muted-foreground hover:text-foreground">
                      Telemetry
                    </Button>
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

function StatusBadge({ status }: { status: DerFleetSite["status"] }) {
  if (status === "applied") {
    return (
      <Badge variant="outline" className="gap-1 border-emerald-500/30 bg-emerald-500/10 text-emerald-500">
        <CheckCircle2 className="h-3 w-3" />
        Applied
      </Badge>
    );
  }
  if (status === "pending") {
    return (
      <Badge variant="outline" className="gap-1 border-amber-500/30 bg-amber-500/10 text-amber-500">
        <Clock className="h-3 w-3 animate-spin" />
        Pending
      </Badge>
    );
  }
  if (status === "failed") {
    return (
      <Badge variant="outline" className="gap-1 border-rose-500/40 bg-rose-500/10 text-rose-500">
        <AlertTriangle className="h-3 w-3" />
        Non-Compliant
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1 border-muted bg-muted/40 text-muted-foreground">
      <ShieldOff className="h-3 w-3" />
      Exempt
    </Badge>
  );
}
