/**
 * Utility-side Curtailment Management Pipeline & Data Models.
 *
 * Provides data structures, mock data generators, and calculations for utility-level
 * DER curtailment dispatches, grid constraint mitigation, fleet compliance tracking,
 * and historical event logging.
 */

export type CurtailmentMode = "percentage" | "kw_cap" | "volt_watt";

export type DispatchReason =
  | "overvoltage_protection"
  | "transformer_overload"
  | "reverse_power_limit"
  | "frequency_high"
  | "market_economic";

export type ProtocolType = "IEEE 2030.5" | "OpenADR 2.0b" | "Modbus TCP" | "DNP3";

export type ComplianceStatus = "applied" | "pending" | "failed" | "exempt";

export interface CurtailmentEvent {
  id: string;
  taskId: number;
  feederId: string;
  scope: string; // e.g. "Feeder Wide", "Node 2 RMU", "Ranna 2MW Solar"
  mode: CurtailmentMode;
  targetLimitPct?: number;
  targetLimitKW?: number;
  reason: DispatchReason;
  protocol: ProtocolType;
  status: "active" | "scheduled" | "completed" | "revoked";
  startTime: number; // ts
  endTime?: number; // ts
  shavedCapacityMW: number;
  shavedEnergyMWh: number;
  initiator: "Automated Rule" | "Dispatcher (Olivera Queen)";
  affectedSitesCount: number;
}

export interface DerFleetSite {
  id: string;
  accountNumber: string;
  name: string;
  nodeName: string;
  busId: string;
  assetType: "Solar PV" | "Battery Storage" | "Commercial Solar" | "EVSE Fleet";
  capacityKW: number;
  currentExportKW: number;
  targetSetpointKW: number;
  curtailmentPct: number;
  status: ComplianceStatus;
  protocol: ProtocolType;
  lastAckTime: number; // ts
  dermsEnrolled: boolean;
}

export interface CurtailmentTimeSeriesPoint {
  ts: number;
  timeLabel: string;
  baselineSolarKW: number;
  curtailmentCapKW: number;
  actualInjectionKW: number;
  curtailedKW: number;
  isCurtailedWindow: boolean;
  eventMarker?: "CS" | "CE"; // Curtailment Start / Curtailment End
}

export const REASON_LABELS: Record<DispatchReason, { label: string; description: string; color: string }> = {
  overvoltage_protection: {
    label: "Over-voltage Protection",
    description: "Grid voltage at tail node exceeded +5.0% statutory threshold (1.05 pu)",
    color: "var(--status-critical)",
  },
  transformer_overload: {
    label: "Transformer Overload Shaving",
    description: "Primary substation transformer loading surpassed 95% thermal rating",
    color: "var(--status-warning)",
  },
  reverse_power_limit: {
    label: "Reverse Power Flow Limit",
    description: "Backfeed flow to 33/11kV primary exceeded reverse flow relay cap",
    color: "#f59e0b",
  },
  frequency_high: {
    label: "Over-frequency Mitigation",
    description: "National grid system frequency exceeded 50.4 Hz threshold",
    color: "#3b82f6",
  },
  market_economic: {
    label: "Market Economic Dispatch",
    description: "Negative spot market LMP pricing or over-generation dispatch signal",
    color: "#8b5cf6",
  },
};

/**
 * Generate mock DER fleet assets for a given feeder.
 */
export function getFeederFleetSites(feederId: string): DerFleetSite[] {
  const isKatunayake = feederId === "katunayake";
  const now = Date.now();

  if (isKatunayake) {
    return [
      {
        id: "kat_site_1",
        accountNumber: "CEB 6155516116656",
        name: "Katunayake Industrial Solar Park",
        nodeName: "Investment-zone RMU",
        busId: "katunayake_node_2",
        assetType: "Solar PV",
        capacityKW: 2000,
        currentExportKW: 300,
        targetSetpointKW: 300,
        curtailmentPct: 85,
        status: "applied",
        protocol: "IEEE 2030.5",
        lastAckTime: now - 120000,
        dermsEnrolled: true,
      },
      {
        id: "kat_site_2",
        accountNumber: "CEB 6155516118820",
        name: "Seeduwa Logistics Solar Array",
        nodeName: "Seeduwa sectionaliser",
        busId: "katunayake_node_1",
        assetType: "Commercial Solar",
        capacityKW: 1200,
        currentExportKW: 180,
        targetSetpointKW: 180,
        curtailmentPct: 85,
        status: "applied",
        protocol: "OpenADR 2.0b",
        lastAckTime: now - 180000,
        dermsEnrolled: true,
      },
      {
        id: "kat_site_3",
        accountNumber: "CEB 6155516119934",
        name: "Liyanagemulla Air Cargo Rooftop",
        nodeName: "Tail-end recloser — Liyanagemulla",
        busId: "katunayake_node_3",
        assetType: "Solar PV",
        capacityKW: 800,
        currentExportKW: 120,
        targetSetpointKW: 120,
        curtailmentPct: 85,
        status: "applied",
        protocol: "IEEE 2030.5",
        lastAckTime: now - 90000,
        dermsEnrolled: true,
      },
      {
        id: "kat_site_4",
        accountNumber: "CEB 6155516120112",
        name: "Katunayake BESS & Solar Microgrid",
        nodeName: "Katunayake 11 kV busbar",
        busId: "katunayake_node_0",
        assetType: "Battery Storage",
        capacityKW: 4000,
        currentExportKW: 0,
        targetSetpointKW: 0,
        curtailmentPct: 0,
        status: "applied",
        protocol: "Modbus TCP",
        lastAckTime: now - 45000,
        dermsEnrolled: true,
      },
      {
        id: "kat_site_5",
        accountNumber: "CEB 6155516124450",
        name: "Free Trade Zone Rooftop PV Phase II",
        nodeName: "Investment-zone RMU",
        busId: "katunayake_node_2",
        assetType: "Solar PV",
        capacityKW: 1500,
        currentExportKW: 1275,
        targetSetpointKW: 1275,
        curtailmentPct: 15,
        status: "pending",
        protocol: "IEEE 2030.5",
        lastAckTime: now - 350000,
        dermsEnrolled: true,
      },
      {
        id: "kat_site_6",
        accountNumber: "CEB 6155516129900",
        name: "Legacy Textile Mill Rooftop",
        nodeName: "Seeduwa sectionaliser",
        busId: "katunayake_node_1",
        assetType: "Commercial Solar",
        capacityKW: 450,
        currentExportKW: 380,
        targetSetpointKW: 450,
        curtailmentPct: 0,
        status: "exempt",
        protocol: "DNP3",
        lastAckTime: now - 800000,
        dermsEnrolled: false,
      },
    ];
  }

  // Default / Angulana Feeder
  return [
    {
      id: "ang_site_1",
      accountNumber: "CEB 412220199001",
      name: "Ranna 2MW Solar PV Station",
      nodeName: "Katubedda RMU",
      busId: "angulana_node_2",
      assetType: "Solar PV",
      capacityKW: 2000,
      currentExportKW: 300,
      targetSetpointKW: 300,
      curtailmentPct: 85,
      status: "applied",
      protocol: "IEEE 2030.5",
      lastAckTime: now - 110000,
      dermsEnrolled: true,
    },
    {
      id: "ang_site_2",
      accountNumber: "CEB 412220199044",
      name: "Velona Commercial Roof Array",
      nodeName: "Velona sectionaliser",
      busId: "angulana_node_1",
      assetType: "Commercial Solar",
      capacityKW: 950,
      currentExportKW: 142,
      targetSetpointKW: 142,
      curtailmentPct: 85,
      status: "applied",
      protocol: "OpenADR 2.0b",
      lastAckTime: now - 150000,
      dermsEnrolled: true,
    },
    {
      id: "ang_site_3",
      accountNumber: "CEB 412220199105",
      name: "Angulana South Solar Farm",
      nodeName: "Tail-end recloser — Angulana south",
      busId: "angulana_node_3",
      assetType: "Solar PV",
      capacityKW: 1600,
      currentExportKW: 240,
      targetSetpointKW: 240,
      curtailmentPct: 85,
      status: "applied",
      protocol: "IEEE 2030.5",
      lastAckTime: now - 95000,
      dermsEnrolled: true,
    },
    {
      id: "ang_site_4",
      accountNumber: "CEB 412220199333",
      name: "Moratuwa Residential Solar Aggregator",
      nodeName: "Katubedda RMU",
      busId: "angulana_node_2",
      assetType: "Solar PV",
      capacityKW: 1100,
      currentExportKW: 550,
      targetSetpointKW: 550,
      curtailmentPct: 50,
      status: "pending",
      protocol: "OpenADR 2.0b",
      lastAckTime: now - 400000,
      dermsEnrolled: true,
    },
    {
      id: "ang_site_5",
      accountNumber: "CEB 412220199888",
      name: "Velona Substation BESS",
      nodeName: "Angulana 11 kV busbar",
      busId: "angulana_node_0",
      assetType: "Battery Storage",
      capacityKW: 2500,
      currentExportKW: -800, // Charging / soaking
      targetSetpointKW: -800,
      curtailmentPct: 0,
      status: "applied",
      protocol: "Modbus TCP",
      lastAckTime: now - 30000,
      dermsEnrolled: true,
    },
  ];
}

/**
 * Generate initial active curtailment events.
 */
export function getInitialCurtailmentEvents(feederId: string): CurtailmentEvent[] {
  const now = Date.now();
  const startTime = now - 2 * 3600 * 1000; // 2 hours ago

  return [
    {
      id: "evt_100414",
      taskId: 100414,
      feederId,
      scope: "Feeder Wide DERMS Enrolled PV",
      mode: "percentage",
      targetLimitPct: 85,
      reason: "overvoltage_protection",
      protocol: "IEEE 2030.5",
      status: "active",
      startTime,
      shavedCapacityMW: 3.2,
      shavedEnergyMWh: 5.4,
      initiator: "Automated Rule",
      affectedSitesCount: 4,
    },
    {
      id: "evt_100415",
      taskId: 100415,
      feederId,
      scope: "Tail-end Node Recloser Solar Sites",
      mode: "kw_cap",
      targetLimitKW: 250,
      reason: "reverse_power_limit",
      protocol: "OpenADR 2.0b",
      status: "active",
      startTime: now - 45 * 60 * 1000,
      shavedCapacityMW: 1.1,
      shavedEnergyMWh: 1.8,
      initiator: "Dispatcher (Olivera Queen)",
      affectedSitesCount: 2,
    },
  ];
}

/**
 * Generate 24-hour time series for baseline vs curtailment cap vs actual export.
 */
export function getCurtailmentTimeSeries(
  feederId: string,
  events: CurtailmentEvent[]
): CurtailmentTimeSeriesPoint[] {
  const points: CurtailmentTimeSeriesPoint[] = [];
  const activeEvent = events.find((e) => e.status === "active");

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0).getTime();

  for (let i = 0; i < 96; i++) {
    const ts = startOfDay + i * 15 * 60 * 1000;
    const date = new Date(ts);
    const hour = date.getHours() + date.getMinutes() / 60;
    const timeLabel = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });

    // Solar shape baseline (kW)
    let solarShape = 0;
    if (hour >= 6 && hour <= 18) {
      solarShape = Math.sin(((hour - 6) / 12) * Math.PI);
    }

    const feederFactor = feederId === "katunayake" ? 5500 : 4200;
    const baselineSolarKW = Math.round(solarShape * feederFactor);

    // Midday curtailment window: 10:30 to 14:30
    const isCurtailedWindow = hour >= 10.5 && hour <= 14.5;

    let curtailmentCapKW = baselineSolarKW;
    let actualInjectionKW = baselineSolarKW;
    let curtailedKW = 0;

    if (isCurtailedWindow && baselineSolarKW > 0) {
      const activePct = activeEvent?.targetLimitPct ?? 85;
      curtailmentCapKW = Math.round(baselineSolarKW * (1 - activePct / 100));
      actualInjectionKW = curtailmentCapKW + Math.round((Math.random() - 0.5) * 40);
      curtailedKW = Math.max(0, baselineSolarKW - actualInjectionKW);
    }

    let eventMarker: "CS" | "CE" | undefined;
    if (Math.abs(hour - 10.5) < 0.1) eventMarker = "CS";
    if (Math.abs(hour - 14.5) < 0.1) eventMarker = "CE";

    points.push({
      ts,
      timeLabel,
      baselineSolarKW,
      curtailmentCapKW,
      actualInjectionKW,
      curtailedKW,
      isCurtailedWindow,
      eventMarker,
    });
  }

  return points;
}
