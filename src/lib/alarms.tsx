/**
 * Alarm lifecycle.
 *
 * `evaluateAlarms` is stateless — it reports what is true right now. This
 * provider adds the two things a stateless evaluator cannot know: when a
 * condition *started*, and whether anyone has acknowledged it. A condition that
 * stays true keeps its original timestamp and its acknowledgement; one that
 * clears is dropped.
 *
 * It lives in a provider rather than in `App` so that a 5-second re-evaluation
 * repaints the bell and the drawer only — not the forecasting page underneath.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { evaluateAlarms, sortAlarms } from "@/pipeline/system/alarms";
import {
  sampleBusTicks,
  sampleSystemTick,
  sampleUnitTicks,
} from "@/pipeline/system/source";
import type { Alarm } from "@/pipeline/system/types";

/** How often conditions are re-evaluated. Independent of the display cadence. */
const EVAL_MS = 5_000;

interface AlarmState {
  alarms: Alarm[];
  unacknowledged: number;
  criticalCount: number;
  acknowledge: (id: string) => void;
  acknowledgeAll: () => void;
  open: boolean;
  setOpen: (v: boolean) => void;
}

const AlarmContext = createContext<AlarmState | null>(null);

interface Tracked {
  firstSeen: number;
  acknowledgedAt: number | null;
}

export function AlarmProvider({ children }: { children: ReactNode }) {
  const [alarms, setAlarms] = useState<Alarm[]>([]);
  const [open, setOpen] = useState(false);
  // Lifecycle lives in a ref, not state: it is bookkeeping the evaluator reads,
  // and the rendered value is `alarms`. Keeping it out of state avoids a second
  // render pass on every five-second evaluation.
  const trackedRef = useRef<Map<string, Tracked>>(new Map());

  useEffect(() => {
    const evaluate = () => {
      const now = Date.now();
      const conditions = evaluateAlarms(
        sampleSystemTick(now),
        sampleUnitTicks(now),
        sampleBusTicks(now)
      );

      // A condition that persists keeps its original timestamp and its
      // acknowledgement; one that has cleared falls out of the new map.
      const next = new Map<string, Tracked>();
      for (const c of conditions) {
        next.set(c.id, trackedRef.current.get(c.id) ?? { firstSeen: now, acknowledgedAt: null });
      }
      trackedRef.current = next;

      setAlarms(
        conditions
          .map((c) => ({
            ...c,
            ts: next.get(c.id)!.firstSeen,
            acknowledgedAt: next.get(c.id)!.acknowledgedAt,
          }))
          .sort(sortAlarms)
      );
    };

    evaluate();
    const id = setInterval(evaluate, EVAL_MS);
    return () => clearInterval(id);
  }, []);

  const acknowledge = useCallback((id: string) => {
    const now = Date.now();
    const entry = trackedRef.current.get(id);
    if (entry) trackedRef.current.set(id, { ...entry, acknowledgedAt: now });
    setAlarms((prev) => prev.map((a) => (a.id === id ? { ...a, acknowledgedAt: now } : a)));
  }, []);

  const acknowledgeAll = useCallback(() => {
    const now = Date.now();
    for (const [k, v] of trackedRef.current) {
      trackedRef.current.set(k, { ...v, acknowledgedAt: v.acknowledgedAt ?? now });
    }
    setAlarms((prev) => prev.map((a) => ({ ...a, acknowledgedAt: a.acknowledgedAt ?? now })));
  }, []);

  const value = useMemo<AlarmState>(
    () => ({
      alarms,
      unacknowledged: alarms.filter((a) => a.acknowledgedAt === null).length,
      criticalCount: alarms.filter((a) => a.severity === "critical").length,
      acknowledge,
      acknowledgeAll,
      open,
      setOpen,
    }),
    [alarms, acknowledge, acknowledgeAll, open]
  );

  // `children` is a stable element reference from the caller, so a re-evaluation
  // repaints only the components that call `useAlarms`.
  return <AlarmContext.Provider value={value}>{children}</AlarmContext.Provider>;
}

export function useAlarms(): AlarmState {
  const ctx = useContext(AlarmContext);
  if (!ctx) throw new Error("useAlarms must be used inside <AlarmProvider>");
  return ctx;
}
