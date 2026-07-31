import { useState } from "react";
import { Send, AlertOctagon, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FEEDER_MODEL_LIST, feederModel } from "@/pipeline/system/fleet";
import { useCurtailment } from "@/lib/useCurtailment";
import { CurtailmentChart } from "./CurtailmentChart";
import { ActiveDispatchesPanel } from "./ActiveDispatchesPanel";
import { DerFleetComplianceTable } from "./DerFleetComplianceTable";
import { CurtailmentHistoryLog } from "./CurtailmentHistoryLog";
import { DispatchModal } from "./DispatchModal";

interface Props {
  feederId: string;
  onFeederChange: (id: string) => void;
}

export function CurtailmentView({ feederId, onFeederChange }: Props) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const feeder = feederModel(feederId);

  const {
    events,
    activeEvents,
    sites,
    series,
    autoVoltWattEnabled,
    setAutoVoltWattEnabled,
    totalShavedMW,
    totalShavedMWh,
    complianceRatePct,
    issueDispatchOrder,
    revokeDispatchOrder,
    triggerEmergencyTrip,
  } = useCurtailment(feederId);

  const activePct = activeEvents[0]?.targetLimitPct ?? 85;

  return (
    <main id="main" className="flex flex-col gap-5 p-4 lg:p-6">
      <h1 className="sr-only">Utility Curtailment Control Center</h1>

      {/* Feeder Scope & Top Action Bar */}
      <Card className="overflow-hidden border-border/70 bg-gradient-to-br from-background via-background to-muted/40 p-4 lg:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Select value={feeder.id} onValueChange={onFeederChange}>
                <SelectTrigger className="h-auto w-[280px] py-1.5" aria-label="Select feeder">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FEEDER_MODEL_LIST.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      <span className="flex min-w-0 flex-col items-start">
                        <span className="truncate">{item.shortName}</span>
                        <span className="truncate text-[11px] text-muted-foreground">
                          {item.capacityMVA} MVA · {item.mix}
                        </span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="inline-flex rounded-full border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary">
                Utility Dispatch Control
              </span>
            </div>
            <span className="text-[11px] text-muted-foreground hidden xl:inline">
              {feeder.name} · {feeder.substation} Substation
            </span>
          </div>

          {/* Utility Controls */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Automated Rules Toggle */}
            <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-1.5 text-xs">
              <ShieldCheck className="h-4 w-4 text-emerald-500" />
              <span className="font-medium text-foreground">Auto Volt-Watt Rules</span>
              <Switch
                checked={autoVoltWattEnabled}
                onCheckedChange={setAutoVoltWattEnabled}
                aria-label="Toggle Auto Volt-Watt protection"
              />
            </div>

            {/* Emergency Trip Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={triggerEmergencyTrip}
              className="gap-1.5 border-rose-500/40 text-rose-500 hover:bg-rose-500/10 hover:text-rose-600"
            >
              <AlertOctagon className="h-4 w-4" />
              Zero Export Trip
            </Button>

            {/* Issue Curtailment Command Button */}
            <Button
              size="sm"
              onClick={() => setIsModalOpen(true)}
              className="gap-2 bg-rose-600 hover:bg-rose-700 text-white font-medium shadow"
            >
              <Send className="h-4 w-4" />
              Issue Curtailment Order
            </Button>
          </div>
        </div>

        {/* Four Utility Metrics Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-border/60">
          <MetricTile
            label="Curtailed Power Capacity"
            value={`${totalShavedMW.toFixed(1)} MW`}
            note={`${activePct}% Limit Applied across DERs`}
            badge="ACTIVE"
            badgeColor="bg-rose-500/15 text-rose-500 border-rose-500/30"
          />
          <MetricTile
            label="Shaved Generation Today"
            value={`${totalShavedMWh.toFixed(1)} MWh`}
            note="Prevented Substation Backfeed Overload"
            badge="DAY TOTAL"
            badgeColor="bg-amber-500/15 text-amber-500 border-amber-500/30"
          />
          <MetricTile
            label="Active Dispatch Directives"
            value={`${activeEvents.length}`}
            note={`${events.length} Total Directives Executed Today`}
            badge="DISPATCH"
            badgeColor="bg-primary/15 text-primary border-primary/30"
          />
          <MetricTile
            label="DER Fleet Compliance Rate"
            value={`${complianceRatePct}%`}
            note={`${sites.filter((s) => s.status === "applied").length} / ${sites.length} Inverters Acknowledged`}
            badge="TELEMETRY"
            badgeColor="bg-emerald-500/15 text-emerald-500 border-emerald-500/30"
          />
        </div>
      </Card>

      {/* Main Curtailment Power Chart */}
      <CurtailmentChart
        series={series}
        curtailedPct={activePct}
        commandsCount={events.length * 68}
        successfulCount={events.length * 65}
        failedCount={events.length * 3}
      />

      {/* Active Dispatches Panel */}
      <ActiveDispatchesPanel events={events} onRevoke={revokeDispatchOrder} />

      {/* Connected DER Fleet Compliance Matrix */}
      <DerFleetComplianceTable sites={sites} />

      {/* Curtailment Audit History Log */}
      <CurtailmentHistoryLog events={events} />

      {/* Modal for creating a new dispatch order */}
      <DispatchModal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onDispatch={issueDispatchOrder}
      />

      <footer className="pb-2 text-[11px] text-muted-foreground">
        Oversight+ DERMS Utility Control Hub · IEEE 2030.5 &amp; OpenADR 2.0b Control Gateway · {feeder.operator}
      </footer>
    </main>
  );
}

function MetricTile({
  label,
  value,
  note,
  badge,
  badgeColor,
}: {
  label: string;
  value: string;
  note: string;
  badge: string;
  badgeColor: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border/60 bg-muted/20 p-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <span className={`rounded-full px-1.5 py-0.2 text-[9px] font-bold uppercase tracking-wider border ${badgeColor}`}>
          {badge}
        </span>
      </div>
      <span className="tnum text-xl font-bold leading-tight text-foreground">{value}</span>
      <span className="tnum text-[11px] text-muted-foreground truncate">{note}</span>
    </div>
  );
}
