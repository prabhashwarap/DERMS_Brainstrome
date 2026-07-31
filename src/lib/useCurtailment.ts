import { useCallback, useState } from "react";
import {
  getCurtailmentTimeSeries,
  getFeederFleetSites,
  getInitialCurtailmentEvents,
  type CurtailmentEvent,
  type CurtailmentMode,
  type DerFleetSite,
  type DispatchReason,
  type ProtocolType,
} from "@/pipeline/curtailment";

export function useCurtailment(feederId: string) {
  const [events, setEvents] = useState<CurtailmentEvent[]>(() => getInitialCurtailmentEvents(feederId));
  const [sites, setSites] = useState<DerFleetSite[]>(() => getFeederFleetSites(feederId));
  const [autoVoltWattEnabled, setAutoVoltWattEnabled] = useState(true);

  // Issue a new dispatch command
  const issueDispatchOrder = useCallback(
    (params: {
      scope: string;
      mode: CurtailmentMode;
      targetLimitPct?: number;
      targetLimitKW?: number;
      reason: DispatchReason;
      protocol: ProtocolType;
    }) => {
      const newTaskId = Math.floor(100000 + Math.random() * 900000);
      const newEvent: CurtailmentEvent = {
        id: `evt_${newTaskId}`,
        taskId: newTaskId,
        feederId,
        scope: params.scope,
        mode: params.mode,
        targetLimitPct: params.targetLimitPct,
        targetLimitKW: params.targetLimitKW,
        reason: params.reason,
        protocol: params.protocol,
        status: "active",
        startTime: Date.now(),
        shavedCapacityMW: params.targetLimitPct ? (params.targetLimitPct / 100) * 3.5 : 2.0,
        shavedEnergyMWh: 1.2,
        initiator: "Dispatcher (Olivera Queen)",
        affectedSitesCount: sites.filter((s) => s.dermsEnrolled).length,
      };

      setEvents((prev) => [newEvent, ...prev]);

      // Update fleet sites setpoint
      if (params.targetLimitPct !== undefined) {
        const pct = params.targetLimitPct;
        setSites((prev) =>
          prev.map((site) => {
            if (!site.dermsEnrolled) return site;
            const newCap = Math.round(site.capacityKW * (1 - pct / 100));
            return {
              ...site,
              curtailmentPct: pct,
              targetSetpointKW: newCap,
              currentExportKW: newCap,
              status: "applied",
              lastAckTime: Date.now(),
            };
          })
        );
      }
    },
    [feederId, sites]
  );

  // Revoke an active dispatch order
  const revokeDispatchOrder = useCallback((id: string) => {
    setEvents((prev) =>
      prev.map((evt) => (evt.id === id ? { ...evt, status: "revoked", endTime: Date.now() } : evt))
    );

    // Reset sites to full generation if no active events remain
    setSites((prev) =>
      prev.map((site) => ({
        ...site,
        curtailmentPct: 0,
        targetSetpointKW: site.capacityKW,
        currentExportKW: site.capacityKW,
        status: "applied",
        lastAckTime: Date.now(),
      }))
    );
  }, []);

  // Emergency Zero Export Trip
  const triggerEmergencyTrip = useCallback(() => {
    issueDispatchOrder({
      scope: "Entire Feeder (Emergency Zero Export)",
      mode: "percentage",
      targetLimitPct: 100,
      reason: "overvoltage_protection",
      protocol: "IEEE 2030.5",
    });
  }, [issueDispatchOrder]);

  const activeEvents = events.filter((e) => e.status === "active");
  const series = getCurtailmentTimeSeries(feederId, events);

  const totalCapacityKW = sites.reduce((sum, s) => sum + s.capacityKW, 0);
  const currentExportKW = sites.reduce((sum, s) => sum + s.currentExportKW, 0);
  const totalShavedMW = activeEvents.reduce((sum, e) => sum + e.shavedCapacityMW, 0);
  const totalShavedMWh = events.reduce((sum, e) => sum + e.shavedEnergyMWh, 0);

  const compliantCount = sites.filter((s) => s.status === "applied").length;
  const complianceRatePct = sites.length > 0 ? Math.round((compliantCount / sites.length) * 100) : 100;

  return {
    events,
    activeEvents,
    sites,
    series,
    autoVoltWattEnabled,
    setAutoVoltWattEnabled,
    totalCapacityKW,
    currentExportKW,
    totalShavedMW,
    totalShavedMWh,
    complianceRatePct,
    issueDispatchOrder,
    revokeDispatchOrder,
    triggerEmergencyTrip,
  };
}
