import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppShell, type NavId } from "@/components/AppShell";
import { ForecastToolbar } from "@/components/ForecastToolbar";
import { KpiRow } from "@/components/KpiRow";
import { ForecastChart, type RangeKey } from "@/components/ForecastChart";
import { ContextPanel } from "@/components/ContextPanel";
import { ForecastTable } from "@/components/ForecastTable";
import { ConfigPanel } from "@/components/ConfigPanel";
// The Forecast+ map pulls in Leaflet/react-leaflet (~150 kB). It is a separate
// tab, so load it on demand instead of shipping it in the initial bundle for
// everyone who only opens the default forecasting view.
const ForecastPlus = lazy(() =>
  import("@/components/ForecastPlus").then((m) => ({ default: m.ForecastPlus }))
);
import { FEEDERS, type FeederId } from "@/pipeline/feeders";
import { runForecast, type PredictionOverrides } from "@/pipeline/forecast";
import { lastRunAtOrBefore, scheduleDailyRun } from "@/pipeline/scheduler";

/**
 * The demo runs the whole pipeline in the browser on load. In production the
 * 06:00 job runs server-side and this component fetches the bundle — the shape
 * it consumes is the same either way, which is the point of the split.
 */
export default function App() {
  const [feederId, setFeederId] = useState<FeederId>("angulana");
  const [range, setRange] = useState<RangeKey>("7d");
  const [showBaseline, setShowBaseline] = useState(false);
  const [hoverTs, setHoverTs] = useState<number | null>(null);
  const [theme, setTheme] = useState<"dark" | "light">("light");
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [activeNav, setActiveNav] = useState<NavId>("forecasting");
  const [predictionOverrides, setPredictionOverrides] = useState<PredictionOverrides>({});

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  // `runAt` is the instant of the current 06:00 LKT job. It is fixed between
  // runs — so the forecast does not drift under the viewer mid-demo — and is
  // advanced by the scheduler when the next 06:00 boundary is crossed, exactly
  // as the server-side job would republish the bundle. During a meeting the
  // page can stay open across 06:00 and pick up the new day's forecast on its
  // own.
  const [runAt, setRunAt] = useState(() => lastRunAtOrBefore(Date.now()));

  useEffect(() => scheduleDailyRun(setRunAt), []);

  const bundle = useMemo(
    () => runForecast(FEEDERS[feederId], runAt, predictionOverrides),
    [feederId, runAt, predictionOverrides]
  );

  return (
    <TooltipProvider delayDuration={200}>
      <AppShell
        title="Forecasting"
        theme={theme}
        activeNav={activeNav}
        onNavChange={setActiveNav}
        onThemeChange={setTheme}
        onConfigToggle={() => setIsConfigOpen(true)}
      >
        {activeNav === "forecastPlus" ? (
          <Suspense
            fallback={
              <div className="flex flex-1 items-center justify-center p-10 text-sm text-muted-foreground">
                Loading grid map…
              </div>
            }
          >
            <ForecastPlus />
          </Suspense>
        ) : (
          <main id="main" className="flex flex-col gap-4 p-4 lg:p-6">
          <ForecastToolbar
            feederId={feederId}
            onFeederChange={setFeederId}
            generatedAt={bundle.generatedAt}
          />

          <KpiRow bundle={bundle} />

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            {/* self-start so the chart keeps its designed height instead of
                stretching to match a taller context column */}
            <div className="flex min-w-0 flex-col gap-4 self-start">
              <ForecastChart
                bundle={bundle}
                range={range}
                onRangeChange={setRange}
                showBaseline={showBaseline}
                onShowBaselineChange={setShowBaseline}
                onHover={setHoverTs}
              />
              <ForecastTable bundle={bundle} />
            </div>

            <ContextPanel bundle={bundle} hoverTs={hoverTs} />
          </div>

          <footer className="pb-2 text-[11px] text-muted-foreground">
            LECO Day-Ahead Load Forecasting · Pilot v1 · Synthetic feeder model figures.
          </footer>
        </main>
        )}
      </AppShell>
      <ConfigPanel
        open={isConfigOpen}
        onClose={() => setIsConfigOpen(false)}
        runAt={runAt}
        onRunAtChange={setRunAt}
        overrides={predictionOverrides}
        onOverridesChange={setPredictionOverrides}
      />
    </TooltipProvider>
  );
}
