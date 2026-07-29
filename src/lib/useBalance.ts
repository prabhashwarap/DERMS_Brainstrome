/**
 * Balance clocks.
 *
 * Three cadences, three hooks, deliberately not one store. The forecasting
 * bundle is a daily batch product costing a full model fit; the frequency
 * readout updates every second. Nothing that ticks at 1 Hz may sit on the same
 * render path as something that costs a ridge regression, so each hook owns its
 * own interval and only the components that read it re-render.
 *
 *   useSystemTick   1 s    frequency, RoCoF, imbalance
 *   useStackSeries  60 s   generation-vs-demand chart
 *   useFleetTick    15 s   per-unit and per-bus telemetry
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  sampleBusTicks,
  sampleSystemSeries,
  sampleSystemTick,
  sampleUnitTicks,
} from "@/pipeline/system/source";
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
export function useSystemTick(intervalMs = 1000): {
  tick: SystemTick;
  trace: { ts: number; frequencyHz: number }[];
} {
  const [tick, setTick] = useState(() => sampleSystemTick(Date.now()));
  const traceRef = useRef<{ ts: number; frequencyHz: number }[]>([]);
  const [trace, setTrace] = useState<{ ts: number; frequencyHz: number }[]>(() => {
    const now = Date.now();
    return sampleSystemSeries(now - TRACE_SECONDS * 1000, now, 1000).map((t) => ({
      ts: t.ts,
      frequencyHz: t.frequencyHz,
    }));
  });

  useEffect(() => {
    traceRef.current = trace;
    // Seeding runs once; the ref mirrors state so the interval can append
    // without re-subscribing on every tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      const next = sampleSystemTick(Date.now());
      setTick(next);
      const appended = [...traceRef.current, { ts: next.ts, frequencyHz: next.frequencyHz }];
      traceRef.current = appended.slice(-TRACE_SECONDS);
      setTrace(traceRef.current);
    }, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return { tick, trace };
}

export interface StackRow {
  ts: number;
  other?: number;
  solar?: number;
  battery?: number;
  /** Metered demand — past only. */
  load?: number;
  /** Short-term demand forecast — future only, plus one bridging point. */
  loadForecast?: number;
  /** Solar before curtailment. Sits above the stack whenever solar is spilled. */
  solarPotential: number;
  /** Weather inputs on the same timebase, for the input sparklines. */
  tempC: number;
  cloud: number;
}

const SOURCE_KEYS: SourceId[] = ["other", "solar"];

function buildStackRows(now: number): StackRow[] {
  const back = sampleSystemSeries(now - STACK_BACK_H * 3600_000, now, 15 * 60_000);
  const forward = sampleSystemSeries(
    now + 15 * 60_000,
    now + STACK_FORWARD_H * 3600_000,
    15 * 60_000
  );

  const toRow = (t: SystemTick): StackRow => ({
    ts: t.ts,
    battery: t.batteryMW,
    solarPotential: t.solarMW + t.curtailedMW,
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
export function useStackSeries(intervalMs = 60_000): { rows: StackRow[]; now: number } {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  const rows = useMemo(() => buildStackRows(now), [now]);
  return { rows, now };
}

/** Per-unit and per-bus telemetry. */
export function useFleetTick(intervalMs = 15_000): {
  ts: number;
  units: (UnitTick | BessTick)[];
  buses: BusTick[];
} {
  const [ts, setTs] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setTs(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  const units = useMemo(() => sampleUnitTicks(ts), [ts]);
  const buses = useMemo(() => sampleBusTicks(ts), [ts]);
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
