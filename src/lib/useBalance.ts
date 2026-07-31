/**
 * Balance clocks.
 *
 * Three cadences, three hooks, deliberately not one store. The forecasting
 * bundle is a daily batch product costing a full model fit; the frequency
 * readout updates every second. Nothing that ticks at 1 Hz may sit on the same
 * render path as something that costs a ridge regression, so each hook owns its
 * own interval and only the components that read it re-render.
 *
 *   useSystemTick   1 s    transformer flow, frequency, RoCoF
 *   useStackSeries  60 s   supply-vs-demand chart
 *   useFleetTick    15 s   per-unit and per-LV-node telemetry
 *
 * Each takes the selected LV feeder id and carries it in its effect deps, so
 * switching feeders re-seeds the traces from the new network rather than letting
 * one feeder's history bleed into another's chart.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  sampleBusTicks,
  sampleSystemSeries,
  sampleSystemTick,
  sampleUnitTicks,
} from "@/pipeline/system/source";
import {
  computeGridRiskIndex,
  generateGridRiskHistory,
  type GridRiskHistoryPoint,
  type GridRiskIndex,
  type RiskWeights,
} from "@/pipeline/system/gridRisk";
import { feederModel } from "@/pipeline/system/fleet";
import type {
  BessTick,
  BusTick,
  SourceId,
  SystemTick,
  UnitTick,
} from "@/pipeline/system/types";

/** Frequency trace window, seconds. */
const TRACE_SECONDS = 300;

/** How far the generation stack looks back and forward, hours. */
const STACK_BACK_H = 24;
const STACK_FORWARD_H = 24;

/**
 * The 1 Hz system tick plus a rolling 5-minute frequency trace.
 *
 * The trace is seeded by sampling backwards on mount rather than filling up
 * over five minutes — the source is a pure function of time, so the history is
 * as real as the live values.
 */
const seedTrace = (feederId: string) => {
  const now = Date.now();
  return sampleSystemSeries(now - TRACE_SECONDS * 1000, now, 1000, feederId).map((t) => ({
    ts: t.ts,
    frequencyHz: t.frequencyHz,
  }));
};

export function useSystemTick(
  feederId: string,
  intervalMs = 1000
): {
  tick: SystemTick;
  trace: { ts: number; frequencyHz: number }[];
} {
  const [tick, setTick] = useState(() => sampleSystemTick(Date.now(), feederId));
  const traceRef = useRef<{ ts: number; frequencyHz: number }[]>([]);
  const [trace, setTrace] = useState(() => seedTrace(feederId));

  // Re-seed on a feeder change rather than appending across it. The trace is a
  // history *of a network*; carrying five minutes of one feeder's frequency into
  // another's chart would draw a splice that never happened.
  useEffect(() => {
    const seeded = seedTrace(feederId);
    traceRef.current = seeded;
    setTrace(seeded);
    setTick(sampleSystemTick(Date.now(), feederId));
  }, [feederId]);

  useEffect(() => {
    const id = setInterval(() => {
      const next = sampleSystemTick(Date.now(), feederId);
      setTick(next);
      const appended = [...traceRef.current, { ts: next.ts, frequencyHz: next.frequencyHz }];
      traceRef.current = appended.slice(-TRACE_SECONDS);
      setTrace(traceRef.current);
    }, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, feederId]);

  return { tick, trace };
}

export interface StackRow {
  ts: number;
  /** Import through the transformer, MW. Negative when back-feeding. */
  grid?: number;
  solar?: number;
  /** Storage output, MW. Negative while charging. */
  battery?: number;
  /** Metered demand — past only. */
  load?: number;
  /** Short-term demand forecast — future only, plus one bridging point. */
  loadForecast?: number;
  /** PV before curtailment. Sits above the stack whenever PV is curtailed. */
  solarPotential: number;
  /** Signed transformer flow, MW. Negative means the feeder is back-feeding. */
  transformerFlow: number;
  /** EV charging as delivered under smart charging, MW. */
  ev: number;
  /** What the same chargers would have drawn uncontrolled, MW. */
  evUnmanaged: number;
  /** Storage state of charge, %. */
  socPct: number;
  /** Weather inputs on the same timebase, for the input sparklines. */
  tempC: number;
  cloud: number;
}

const SOURCE_KEYS: SourceId[] = ["solar", "battery", "grid"];

function buildStackRows(now: number, feederId: string): StackRow[] {
  const back = sampleSystemSeries(now - STACK_BACK_H * 3600_000, now, 15 * 60_000, feederId);
  const forward = sampleSystemSeries(
    now + 15 * 60_000,
    now + STACK_FORWARD_H * 3600_000,
    15 * 60_000,
    feederId
  );

  // `battery` is filled by the SOURCE_KEYS loop below along with the other two
  // sources, so it is not set here — one write per field, one source of truth.
  const toRow = (t: SystemTick): StackRow => ({
    ts: t.ts,
    solarPotential: t.solarMW + t.curtailedMW,
    transformerFlow: t.transformerFlowMW,
    ev: t.evMW,
    evUnmanaged: t.evUnmanagedMW,
    socPct: t.socPct,
    ...t.weather,
  });

  const rows: StackRow[] = back.map((t) => {
    const row = toRow(t);
    row.load = t.loadMW;
    for (const k of SOURCE_KEYS) row[k] = t.bySource[k];
    return row;
  });

  // Join the two lines at T-0 so the forecast continues the demand line rather
  // than starting beside it.
  if (rows.length) rows[rows.length - 1].loadForecast = rows[rows.length - 1].load;

  for (const t of forward) {
    const row = toRow(t);
    row.loadForecast = t.loadMW;
    for (const k of SOURCE_KEYS) row[k] = t.bySource[k];
    rows.push(row);
  }
  return rows;
}

/** Generation-vs-demand series. One minute is finer than the chart can show. */
export function useStackSeries(
  feederId: string,
  intervalMs = 60_000
): { rows: StackRow[]; now: number } {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  const rows = useMemo(() => buildStackRows(now, feederId), [now, feederId]);
  return { rows, now };
}

/** Per-unit and per-bus telemetry. */
export function useFleetTick(
  feederId: string,
  intervalMs = 15_000
): {
  ts: number;
  units: (UnitTick | BessTick)[];
  buses: BusTick[];
} {
  const [ts, setTs] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setTs(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  const units = useMemo(() => sampleUnitTicks(ts, feederId), [ts, feederId]);
  const buses = useMemo(() => sampleBusTicks(ts, feederId), [ts, feederId]);
  return { ts, units, buses };
}

/** True once a feed has missed three expected updates. */
export function useIsStale(lastTs: number, expectedIntervalMs: number): boolean {
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), expectedIntervalMs);
    return () => clearInterval(id);
  }, [expectedIntervalMs]);
  return Date.now() - lastTs > expectedIntervalMs * 3;
}

/**
 * Grid Risk Index real-time hook.
 * Returns real-time composite GRI, sub-indices, history points, and operational warnings.
 */
export function useGridRisk(
  feederId: string,
  customWeights?: RiskWeights,
  intervalMs = 1000
): {
  gri: GridRiskIndex;
  history: GridRiskHistoryPoint[];
  now: number;
} {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, feederId]);

  const f = useMemo(() => feederModel(feederId), [feederId]);

  const gri = useMemo(() => {
    const t = sampleSystemTick(now, feederId);
    const uTicks = sampleUnitTicks(now, feederId);
    const bTicks = sampleBusTicks(now, feederId);
    return computeGridRiskIndex(t, uTicks, bTicks, f, customWeights);
  }, [now, feederId, f, customWeights]);

  // Generate 24h history memoised on feeder change or every 60s
  const historyWindow = Math.floor(now / 60_000);
  const history = useMemo(() => {
    return generateGridRiskHistory(historyWindow * 60_000, feederId, 24, 30);
  }, [historyWindow, feederId]);

  return { gri, history, now };
}
