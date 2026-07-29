/**
 * Supply mix right now.
 *
 * The panel every operator dashboard carries beside the stack, because the stack
 * answers "how did we get here" and this answers "what is serving demand at this
 * instant". One 100 % bar, then the same four categories as a table with MW and
 * share — the bar for the proportion, the table because a proportion nobody can
 * read a number off is only half the fact.
 *
 * Storage and the tie-line are signed. A charging battery and an export are both
 * *negative supply*, and rolling them into the bar as though they were serving
 * demand would misreport the mix; they are listed with their sign and excluded
 * from the bar instead.
 */

import { Card } from "@/components/ui/card";
import { PanelHeader } from "./tiles";
import { SOURCE_COLOR } from "./SupplyStack";
import { SOURCE_LABEL, SOURCE_ORDER, type SourceId } from "@/pipeline/system/types";
import type { SystemTick } from "@/pipeline/system/types";
import { cn, formatMW, formatSignedMW } from "@/lib/utils";

/** Why a category is negative — the one thing a signed MW figure cannot say. */
const NEGATIVE_NOTE: Partial<Record<SourceId, string>> = {
  other: "export/charging",
};

/**
 * Named `SupplyMix`, not `MixPanel`: `mixpanel` is an analytics vendor that
 * EasyPrivacy blocks as a bare URL token, so an ad blocker refuses to fetch any
 * module whose path contains it — and in dev, where Vite serves every module as
 * its own request, that takes the whole dashboard down with it.
 */
export function SupplyMix({ tick }: { tick: SystemTick }) {
  const served = SOURCE_ORDER.reduce((a, id) => a + Math.max(0, tick.bySource[id]), 0);

  return (
    <Card className="flex flex-col gap-4 p-5">
      <PanelHeader title="Supply mix" note={`Serving ${formatMW(served)} MW at this instant`} />

      {/* 2px surface gaps between segments: the secondary encoding that keeps
          adjacent categories separable without relying on hue. */}
      <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full bg-muted">
        {SOURCE_ORDER.map((id) => {
          const mw = Math.max(0, tick.bySource[id]);
          const pct = served > 0 ? (100 * mw) / served : 0;
          if (pct < 0.1) return null;
          return (
            <span
              key={id}
              className="h-full first:rounded-l-full last:rounded-r-full"
              style={{ width: `${pct}%`, background: SOURCE_COLOR[id] }}
              aria-hidden
            />
          );
        })}
      </div>

      <table className="w-full text-sm">
        <caption className="sr-only">Supply by source, megawatts and share of served demand</caption>
        <tbody>
          {SOURCE_ORDER.map((id) => {
            const mw = tick.bySource[id];
            const pct = served > 0 ? (100 * Math.max(0, mw)) / served : 0;
            const negative = mw < -0.5;
            return (
              <tr key={id} className="border-b border-border last:border-0">
                <td className="py-1.5">
                  <span className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                      style={{ background: SOURCE_COLOR[id] }}
                      aria-hidden
                    />
                    <span className="text-muted-foreground">{SOURCE_LABEL[id]}</span>
                    {negative && (
                      <span className="text-[11px] uppercase tracking-wide text-muted-foreground/70">
                        {NEGATIVE_NOTE[id]}
                      </span>
                    )}
                  </span>
                </td>
                <td className="tnum py-1.5 text-right font-medium">
                  {negative ? formatSignedMW(mw) : formatMW(mw)}
                </td>
                <td
                  className={cn(
                    "tnum w-14 py-1.5 text-right text-xs",
                    negative ? "text-muted-foreground/60" : "text-muted-foreground"
                  )}
                >
                  {negative ? "—" : `${pct.toFixed(0)} %`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

    </Card>
  );
}
