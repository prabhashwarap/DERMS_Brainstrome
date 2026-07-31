import { useState } from "react";
import { AlertTriangle, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { CurtailmentMode, DispatchReason, ProtocolType } from "@/pipeline/curtailment";

interface Props {
  open: boolean;
  onClose: () => void;
  onDispatch: (params: {
    scope: string;
    mode: CurtailmentMode;
    targetLimitPct?: number;
    targetLimitKW?: number;
    reason: DispatchReason;
    protocol: ProtocolType;
  }) => void;
}

export function DispatchModal({ open, onClose, onDispatch }: Props) {
  const [scope, setScope] = useState("Feeder Wide DERMS Enrolled PV");
  const [mode, setMode] = useState<CurtailmentMode>("percentage");
  const [targetLimitPct, setTargetLimitPct] = useState<number>(85);
  const [targetLimitKW, setTargetLimitKW] = useState<number>(300);
  const [reason, setReason] = useState<DispatchReason>("overvoltage_protection");
  const [protocol, setProtocol] = useState<ProtocolType>("IEEE 2030.5");

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onDispatch({
      scope,
      mode,
      targetLimitPct: mode === "percentage" ? targetLimitPct : undefined,
      targetLimitKW: mode === "kw_cap" ? targetLimitKW : undefined,
      reason,
      protocol,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <Card className="w-full max-w-lg overflow-hidden border-border bg-card shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between border-b border-border px-6 py-4 bg-muted/30">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-rose-500/10 text-rose-500 ring-1 ring-rose-500/20">
              <Send className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">Issue Utility Curtailment Order</h2>
              <p className="text-xs text-muted-foreground">Broadcast dispatch setpoint directive to DER fleet</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close dialog">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-6">
          {/* Target Scope */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Target Scope & Asset Group
            </label>
            <Select value={scope} onValueChange={setScope}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Feeder Wide DERMS Enrolled PV">Feeder Wide (All Enrolled DERs)</SelectItem>
                <SelectItem value="Tail-end Node Recloser Solar Sites">Tail-End Recloser Segment</SelectItem>
                <SelectItem value="Mid-section RMU Industrial Assets">Mid-Section Industrial RMU</SelectItem>
                <SelectItem value="Ranna 2MW Solar PV Station">Ranna 2MW Solar PV Station (Single Site)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Trigger Reason */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Dispatch Trigger Reason
            </label>
            <Select value={reason} onValueChange={(val) => setReason(val as DispatchReason)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="overvoltage_protection">Over-voltage Protection (&gt;1.05 pu)</SelectItem>
                <SelectItem value="transformer_overload">Substation Transformer Overload (&gt;95%)</SelectItem>
                <SelectItem value="reverse_power_limit">Reverse Power Backfeed Limit Exceeded</SelectItem>
                <SelectItem value="frequency_high">System Over-frequency Mitigation (&gt;50.4 Hz)</SelectItem>
                <SelectItem value="market_economic">Economic / Market Negative Pricing Dispatch</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Curtailment Control Mode & Value */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Control Mode
              </label>
              <Select value={mode} onValueChange={(val) => setMode(val as CurtailmentMode)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percentage">Percentage Curtailment (%)</SelectItem>
                  <SelectItem value="kw_cap">Absolute Output Cap (kW)</SelectItem>
                  <SelectItem value="volt_watt">Autonomous Volt-Watt Curve</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {mode === "percentage" ? "Curtailment %" : mode === "kw_cap" ? "Max Cap (kW)" : "Volt-Watt Mode"}
              </label>
              {mode === "percentage" ? (
                <Select
                  value={String(targetLimitPct)}
                  onValueChange={(val) => setTargetLimitPct(Number(val))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="25">25 % Curtailment</SelectItem>
                    <SelectItem value="50">50 % Curtailment</SelectItem>
                    <SelectItem value="75">75 % Curtailment</SelectItem>
                    <SelectItem value="85">85 % Curtailment (Standard)</SelectItem>
                    <SelectItem value="100">100 % (Full Trip / Zero Export)</SelectItem>
                  </SelectContent>
                </Select>
              ) : mode === "kw_cap" ? (
                <input
                  type="number"
                  value={targetLimitKW}
                  onChange={(e) => setTargetLimitKW(Number(e.target.value))}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              ) : (
                <div className="flex h-9 items-center px-3 rounded-md border border-input text-xs text-muted-foreground bg-muted/40">
                  IEEE 1547 Volt-Watt Enabled
                </div>
              )}
            </div>
          </div>

          {/* Protocol Selection */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Telecommunication Protocol
            </label>
            <Select value={protocol} onValueChange={(val) => setProtocol(val as ProtocolType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="IEEE 2030.5">IEEE 2030.5 (Smart Inverter Direct)</SelectItem>
                <SelectItem value="OpenADR 2.0b">OpenADR 2.0b (Aggregator Gateway)</SelectItem>
                <SelectItem value="Modbus TCP">Modbus TCP (Substation Gateway)</SelectItem>
                <SelectItem value="DNP3">DNP3 Outstation (Legacy SCADA)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>
              Executing this order will immediately issue setpoint control commands to smart inverters across the feeder.
            </span>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" className="gap-2 bg-rose-600 hover:bg-rose-700 text-white">
              <Send className="h-4 w-4" />
              Dispatch Order
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
