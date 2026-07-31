/**
 * Grid Risk Index (GRI) Engine
 *
 * Real-time composite risk quantification for DER-heavy distribution feeders.
 * Evaluates non-synchronous generation (IBR ratio), voltage stability margins,
 * net load ramp rates, frequency/RoCoF stress, and transformer thermal loading.
 *
 * Modeled after competitive industry frameworks (GE Vernova GridOS, Siemens Spectrum Power 7,
 * and ETAP Real-Time Microgrid Risk Index).
 */

import { buildRampRisk, reserveCoverPct } from "./derive";
import { feederModel } from "./fleet";
import { sampleBusTicks, sampleSystemTick, sampleUnitTicks } from "./source";
import type { BusTick, FeederModel, SystemTick, UnitTick } from "./types";

export type RiskTier = "low" | "moderate" | "high" | "critical";

export interface GridRiskSubIndex {
  id: "nonSync" | "voltage" | "ramp" | "frequency" | "thermal";
  name: string;
  shortName: string;
  score: number; // 0 - 100
  weight: number; // default sum to 1.0
  contribution: number; // score * weight
  tier: RiskTier;
  detail: string;
  metricLabel: string;
  metricValue: string;
}

export interface PreventiveWarning {
  id: string;
  subIndexId: GridRiskSubIndex["id"];
  severity: "critical" | "warning" | "info";
  title: string;
  rootCause: string;
  mitigation: string;
  actionableTarget?: string;
  timestamp: number;
}

export interface GridRiskIndex {
  score: number; // 0 - 100
  tier: RiskTier;
  trend: "rising" | "stable" | "falling";
  trendDelta: number; // score difference over last 15 mins
  escalationApplied: boolean;
  escalationMultiplier: number;
  primaryRiskDriver: GridRiskSubIndex;
  subIndices: Record<GridRiskSubIndex["id"], GridRiskSubIndex>;
  subIndicesList: GridRiskSubIndex[];
  preventiveWarnings: PreventiveWarning[];
  recommendation: string;
}

export interface GridRiskHistoryPoint {
  ts: number;
  score: number;
  nonSyncScore: number;
  voltageScore: number;
  rampScore: number;
  frequencyScore: number;
  thermalScore: number;
}

export interface RiskWeights {
  nonSync: number;
  voltage: number;
  ramp: number;
  frequency: number;
  thermal: number;
}

export const DEFAULT_RISK_WEIGHTS: RiskWeights = {
  nonSync: 0.25,
  voltage: 0.25,
  ramp: 0.2,
  frequency: 0.15,
  thermal: 0.15,
};

function scoreToTier(score: number): RiskTier {
  if (score >= 75) return "critical";
  if (score >= 50) return "high";
  if (score >= 25) return "moderate";
  return "low";
}

/**
 * Compute real-time Grid Risk Index (GRI) for a given feeder tick state.
 */
export function computeGridRiskIndex(
  tick: SystemTick,
  unitTicks: UnitTick[],
  busTicks: BusTick[],
  feeder: FeederModel,
  customWeights: RiskWeights = DEFAULT_RISK_WEIGHTS
): GridRiskIndex {
  const w = customWeights;

  /* ------------------------------------------------------------------ */
  /* 1. Non-Synchronous Generation & Inertia Risk (I_NS)                */
  /* ------------------------------------------------------------------ */
  const totalSupply = Math.max(0.001, tick.generationMW + tick.gridImportMW);
  const nonSyncGenMW = tick.solarMW + Math.max(0, tick.batteryMW ?? 0);
  const nsprRatio = Math.min(1.0, nonSyncGenMW / totalSupply);
  const nsprScore = nsprRatio * 100;

  // National inertia reference: 25 GWs is standard high-inertia, 12 GWs is low inertia floor
  const inertiaLossPct = Math.max(
    0,
    Math.min(100, ((25.0 - tick.inertiaGWs) / (25.0 - 12.0)) * 100)
  );
  const nonSyncScore = Math.min(100, Math.round(0.6 * nsprScore + 0.4 * inertiaLossPct));

  const nonSyncSub: GridRiskSubIndex = {
    id: "nonSync",
    name: "Non-Synchronous Generation Ratio",
    shortName: "IBR & Inertia",
    score: nonSyncScore,
    weight: w.nonSync,
    contribution: Number((nonSyncScore * w.nonSync).toFixed(1)),
    tier: scoreToTier(nonSyncScore),
    detail: `IBR share ${(nsprRatio * 100).toFixed(0)}% · Grid inertia ${tick.inertiaGWs.toFixed(
      1
    )} GW·s`,
    metricLabel: "Non-Sync Penetration",
    metricValue: `${(nsprRatio * 100).toFixed(0)}%`,
  };

  /* ------------------------------------------------------------------ */
  /* 2. Voltage Fluctuation & Margin Risk (I_volt)                     */
  /* ------------------------------------------------------------------ */
  let maxVoltageDevPu = 0;
  let minStabilityMarginPct = 100;
  let worstBusName = "";

  for (const b of busTicks) {
    const dev = Math.abs(b.voltagePu - 1.0);
    if (dev > maxVoltageDevPu) {
      maxVoltageDevPu = dev;
      worstBusName = b.busId;
    }
    if (b.stabilityMarginPct < minStabilityMarginPct) {
      minStabilityMarginPct = b.stabilityMarginPct;
    }
  }

  // Statutory band is +/- 0.05 pu (5%). So dev 0.05 = 100 score.
  const voltageDevScore = Math.min(100, (maxVoltageDevPu / 0.05) * 100);
  const marginDepletionScore = Math.max(0, 100 - minStabilityMarginPct);
  const voltageScore = Math.min(
    100,
    Math.round(Math.max(voltageDevScore, marginDepletionScore * 0.9))
  );

  const voltageSub: GridRiskSubIndex = {
    id: "voltage",
    name: "Voltage Fluctuation & Margin Risk",
    shortName: "Voltage Volatility",
    score: voltageScore,
    weight: w.voltage,
    contribution: Number((voltageScore * w.voltage).toFixed(1)),
    tier: scoreToTier(voltageScore),
    detail: `Max bus dev ±${(maxVoltageDevPu * 100).toFixed(1)}% at ${worstBusName} · Margin left ${minStabilityMarginPct.toFixed(
      0
    )}%`,
    metricLabel: "Min Voltage Margin",
    metricValue: `${minStabilityMarginPct.toFixed(0)}%`,
  };

  /* ------------------------------------------------------------------ */
  /* 3. Net Load Ramp Rate & Reserve Stress (I_ramp)                   */
  /* ------------------------------------------------------------------ */
  const rampRisk = buildRampRisk(tick.ts, unitTicks, feeder.id, 4);
  const rampStressRatio =
    rampRisk.capabilityMWPerMin > 0
      ? Math.abs(rampRisk.requiredMWPerMin) / rampRisk.capabilityMWPerMin
      : 2.0;
  const rampStressScore = Math.min(100, rampStressRatio * 100);

  const coverPct = reserveCoverPct(unitTicks, tick, feeder.id);
  const reserveGapScore = Math.max(0, 100 - coverPct);

  const rampScore = Math.min(
    100,
    Math.round(0.65 * rampStressScore + 0.35 * reserveGapScore)
  );

  const rampSub: GridRiskSubIndex = {
    id: "ramp",
    name: "Net-Load Ramp & Reserve Stress",
    shortName: "Ramp & Reserve",
    score: rampScore,
    weight: w.ramp,
    contribution: Number((rampScore * w.ramp).toFixed(1)),
    tier: scoreToTier(rampScore),
    detail: `Ramp slope ${Math.abs(rampRisk.requiredMWPerMin).toFixed(
      2
    )} MW/min vs ${rampRisk.capabilityMWPerMin.toFixed(2)} capability · BESS cover ${coverPct.toFixed(0)}%`,
    metricLabel: "Peak Ramp Slope",
    metricValue: `${Math.abs(rampRisk.requiredMWPerMin).toFixed(2)} MW/m`,
  };

  /* ------------------------------------------------------------------ */
  /* 4. Frequency & RoCoF Stress (I_freq)                             */
  /* ------------------------------------------------------------------ */
  const freqDevHz = Math.abs(tick.frequencyHz - 50.0);
  const freqDevScore = Math.min(100, (freqDevHz / 0.5) * 100); // 0.5 Hz = 100 score
  const rocofAbs = Math.abs(tick.rocofHzPerS);
  const rocofScore = Math.min(100, (rocofAbs / 0.5) * 100); // 0.5 Hz/s = 100 score

  const frequencyScore = Math.min(
    100,
    Math.round(0.5 * freqDevScore + 0.5 * rocofScore)
  );

  const frequencySub: GridRiskSubIndex = {
    id: "frequency",
    name: "Frequency & RoCoF Stress",
    shortName: "Freq & RoCoF",
    score: frequencyScore,
    weight: w.frequency,
    contribution: Number((frequencyScore * w.frequency).toFixed(1)),
    tier: scoreToTier(frequencyScore),
    detail: `Grid freq ${tick.frequencyHz.toFixed(3)} Hz · RoCoF ${tick.rocofHzPerS.toFixed(
      3
    )} Hz/s`,
    metricLabel: "RoCoF Rate",
    metricValue: `${tick.rocofHzPerS.toFixed(2)} Hz/s`,
  };

  /* ------------------------------------------------------------------ */
  /* 5. Thermal Loading & Reverse Power Stress (I_thermal)            */
  /* ------------------------------------------------------------------ */
  const loadingScore = Math.min(100, tick.transformerLoadingPct);
  const reverseFlowMW = Math.max(0, -tick.transformerFlowMW);
  const exportLimitMW = Math.max(0.1, feeder.exportLimitMW);
  const reverseFlowScore = Math.min(100, (reverseFlowMW / exportLimitMW) * 100);

  const thermalScore = Math.min(
    100,
    Math.round(Math.max(loadingScore, reverseFlowScore))
  );

  const thermalSub: GridRiskSubIndex = {
    id: "thermal",
    name: "Thermal Loading & Reverse Power Risk",
    shortName: "Thermal & Backfeed",
    score: thermalScore,
    weight: w.thermal,
    contribution: Number((thermalScore * w.thermal).toFixed(1)),
    tier: scoreToTier(thermalScore),
    detail: `Substation load ${tick.transformerLoadingPct.toFixed(
      0
    )}% · Export flow ${reverseFlowMW.toFixed(2)} MW (${(
      (reverseFlowMW / exportLimitMW) *
      100
    ).toFixed(0)}% limit)`,
    metricLabel: "Tx Loading",
    metricValue: `${tick.transformerLoadingPct.toFixed(0)}%`,
  };

  /* ------------------------------------------------------------------ */
  /* Aggregation & Critical Escalation                                  */
  /* ------------------------------------------------------------------ */
  const subIndicesList = [
    nonSyncSub,
    voltageSub,
    rampSub,
    frequencySub,
    thermalSub,
  ];
  const subIndicesMap = {
    nonSync: nonSyncSub,
    voltage: voltageSub,
    ramp: rampSub,
    frequency: frequencySub,
    thermal: thermalSub,
  };

  // Base weighted score
  const weightSum = Object.values(w).reduce((a, b) => a + b, 0);
  const normWeights = weightSum > 0 ? weightSum : 1.0;
  const rawWeightedScore =
    subIndicesList.reduce((acc, sub) => acc + sub.score * sub.weight, 0) /
    normWeights;

  // Find max sub-index score to evaluate single-point vulnerability
  const maxSubScore = Math.max(...subIndicesList.map((s) => s.score));
  let escalationMultiplier = 1.0;
  let escalationApplied = false;

  if (maxSubScore >= 80) {
    escalationApplied = true;
    // Escalates between 1.15x and 1.35x based on magnitude above 80
    escalationMultiplier = 1.15 + ((maxSubScore - 80) / 20) * 0.2;
  }

  const finalScore = Math.min(
    100,
    Math.round(rawWeightedScore * escalationMultiplier)
  );
  const tier = scoreToTier(finalScore);

  // Identify primary risk driver
  const primaryRiskDriver = subIndicesList.reduce((prev, current) =>
    current.score > prev.score ? current : prev
  );

  /* ------------------------------------------------------------------ */
  /* Trend Calculation (15m historical delta check)                     */
  /* ------------------------------------------------------------------ */
  const pastTick = sampleSystemTick(tick.ts - 15 * 60_000, feeder.id);
  const pastNspr =
    (pastTick.solarMW + Math.max(0, pastTick.batteryMW ?? 0)) /
    Math.max(0.001, pastTick.generationMW + pastTick.gridImportMW);
  const pastScore = Math.round(
    0.25 * (pastNspr * 100) +
      0.25 * (pastTick.transformerLoadingPct * 0.8) +
      0.2 * (pastTick.curtailedMW > 0 ? 70 : 30) +
      0.15 * (Math.abs(pastTick.frequencyHz - 50) * 100) +
      0.15 * pastTick.transformerLoadingPct
  );

  const trendDelta = finalScore - pastScore;
  const trend: GridRiskIndex["trend"] =
    trendDelta > 2 ? "rising" : trendDelta < -2 ? "falling" : "stable";

  /* ------------------------------------------------------------------ */
  /* Preventive Operational Warnings & Advisories                       */
  /* ------------------------------------------------------------------ */
  const preventiveWarnings: PreventiveWarning[] = [];

  if (nonSyncSub.score >= 50) {
    preventiveWarnings.push({
      id: "warn-nonsync",
      subIndexId: "nonSync",
      severity: nonSyncSub.score >= 75 ? "critical" : "warning",
      title: "Low System Inertia & High IBR Dominance",
      rootCause: `Inverter-Based Resources account for ${(nsprRatio * 100).toFixed(
        0
      )}% of supply while grid inertia drops to ${tick.inertiaGWs.toFixed(1)} GW·s.`,
      mitigation:
        "Arm Fast Frequency Response (FFR) on BESS fleet and pre-condition virtual synchronous generator (VSG) droop characteristics.",
      actionableTarget: "Enable BESS VSG Mode",
      timestamp: tick.ts,
    });
  }

  if (voltageSub.score >= 50) {
    preventiveWarnings.push({
      id: "warn-voltage",
      subIndexId: "voltage",
      severity: voltageSub.score >= 75 ? "critical" : "warning",
      title: "Feeder Voltage Margin Exhaustion",
      rootCause: `Tail-end bus voltage swing reached ±${(maxVoltageDevPu * 100).toFixed(
        1
      )}% with only ${minStabilityMarginPct.toFixed(0)}% statutory band remaining.`,
      mitigation:
        "Trigger active Volt-Var reactive power absorption on commercial solar inverters and adjust substation OLTC tap.",
      actionableTarget: "Dispatch Volt-Var Curve Q-Absorb",
      timestamp: tick.ts,
    });
  }

  if (rampSub.score >= 50) {
    preventiveWarnings.push({
      id: "warn-ramp",
      subIndexId: "ramp",
      severity: rampSub.score >= 75 ? "critical" : "warning",
      title: "Steep Net-Load Ramp & Battery Reserve Deficit",
      rootCause: `Evening sunset ramp requirement (${Math.abs(
        rampRisk.requiredMWPerMin
      ).toFixed(2)} MW/min) approaches feeder DER ramping capability.`,
      mitigation:
        "Pre-charge BESS to >80% SoC immediately and enable V1G EV smart charging modulation to defer domestic load.",
      actionableTarget: "Arm BESS Peak Ramp Reserve",
      timestamp: tick.ts,
    });
  }

  if (frequencySub.score >= 50) {
    preventiveWarnings.push({
      id: "warn-freq",
      subIndexId: "frequency",
      severity: frequencySub.score >= 75 ? "critical" : "warning",
      title: "High Rate of Change of Frequency (RoCoF)",
      rootCause: `Grid RoCoF exceeds nominal boundary (${tick.rocofHzPerS.toFixed(
        3
      )} Hz/s) with frequency offset of ${(tick.frequencyHz - 50).toFixed(3)} Hz.`,
      mitigation:
        "Inhibit non-critical EV charging clusters and activate primary reserve battery discharge.",
      actionableTarget: "Trigger Primary Frequency Hold",
      timestamp: tick.ts,
    });
  }

  if (thermalSub.score >= 50) {
    preventiveWarnings.push({
      id: "warn-thermal",
      subIndexId: "thermal",
      severity: thermalSub.score >= 75 ? "critical" : "warning",
      title: "Distribution Transformer & Export Limit Stress",
      rootCause: `Transformer loading reached ${tick.transformerLoadingPct.toFixed(
        0
      )}% under back-feed export of ${reverseFlowMW.toFixed(2)} MW.`,
      mitigation:
        "Execute dynamic volt-watt curtailment ceiling and initiate peak-shaving battery soak charging.",
      actionableTarget: "Enforce Dynamic Export Cap",
      timestamp: tick.ts,
    });
  }

  let recommendation = "Grid status nominal. All operational parameters within safe statutory limits.";
  if (tier === "critical") {
    recommendation = `CRITICAL RISK: ${primaryRiskDriver.name} is severely elevated (${primaryRiskDriver.score}/100). Immediate preventive dispatch recommended.`;
  } else if (tier === "high") {
    recommendation = `HIGH RISK WATCH: ${primaryRiskDriver.name} is driving grid stress (${primaryRiskDriver.score}/100). Review preventive warnings.`;
  } else if (tier === "moderate") {
    recommendation = `MODERATE RISK: Solar generation & load ramp slopes warrant monitoring (${primaryRiskDriver.name}: ${primaryRiskDriver.score}/100).`;
  }

  return {
    score: finalScore,
    tier,
    trend,
    trendDelta,
    escalationApplied,
    escalationMultiplier,
    primaryRiskDriver,
    subIndices: subIndicesMap,
    subIndicesList,
    preventiveWarnings,
    recommendation,
  };
}

/**
 * Generate historical 24h Grid Risk Index series for sparklines and charts.
 */
export function generateGridRiskHistory(
  now: number,
  feederId: string,
  durationHours = 24,
  stepMinutes = 30
): GridRiskHistoryPoint[] {
  const f = feederModel(feederId);
  const points: GridRiskHistoryPoint[] = [];
  const totalMs = durationHours * 3600_000;
  const stepMs = stepMinutes * 60_000;
  const startTime = now - totalMs;

  for (let ts = startTime; ts <= now; ts += stepMs) {
    const t = sampleSystemTick(ts, feederId);
    const uTicks = sampleUnitTicks(ts, feederId);
    const bTicks = sampleBusTicks(ts, feederId);

    const gri = computeGridRiskIndex(t, uTicks, bTicks, f);
    points.push({
      ts,
      score: gri.score,
      nonSyncScore: gri.subIndices.nonSync.score,
      voltageScore: gri.subIndices.voltage.score,
      rampScore: gri.subIndices.ramp.score,
      frequencyScore: gri.subIndices.frequency.score,
      thermalScore: gri.subIndices.thermal.score,
    });
  }

  return points;
}
