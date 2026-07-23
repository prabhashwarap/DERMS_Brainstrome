import { X } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { PredictionOverrides } from "@/pipeline/forecast";

interface ConfigPanelProps {
  open: boolean;
  onClose: () => void;
  runAt: number;
  onRunAtChange: (ts: number) => void;
  overrides: PredictionOverrides;
  onOverridesChange: (o: PredictionOverrides) => void;
}

export function ConfigPanel({
  open,
  onClose,
  runAt,
  onRunAtChange,
  overrides,
  onOverridesChange,
}: ConfigPanelProps) {
  // We'll use a simple native datetime-local input for runAt
  // datetime-local expects YYYY-MM-DDThh:mm
  const runAtString = format(runAt, "yyyy-MM-dd'T'HH:mm");

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.value) return;
    const date = new Date(e.target.value);
    if (!isNaN(date.getTime())) {
      onRunAtChange(date.getTime());
    }
  };

  return (
    <>
      {/* Scrim for the side panel */}
      {open && (
        <button
          type="button"
          aria-label="Close configuration"
          onClick={onClose}
          className="fixed inset-0 z-40 bg-black/50 transition-opacity"
        />
      )}

      {/* The side panel */}
      <div
        className={cn(
          "fixed inset-y-0 right-0 z-50 w-80 flex flex-col border-l border-border bg-card shadow-lg transition-transform duration-300 ease-in-out",
          open ? "translate-x-0" : "translate-x-full"
        )}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-4">
          <h2 className="text-lg font-semibold tracking-tight">Configuration</h2>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close configuration">
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          <div className="space-y-3">
            <div>
              <label htmlFor="runAt" className="text-sm font-medium text-foreground">
                Forecast Date
              </label>
              <p className="text-xs text-muted-foreground mb-2">
                Simulate generating the forecast at a different time.
              </p>
            </div>
            <input
              type="datetime-local"
              id="runAt"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              value={runAtString}
              onChange={handleDateChange}
            />
          </div>

          <div className="space-y-4 pt-4 border-t border-border">
            <div>
              <label className="text-sm font-medium text-foreground">
                Prediction Overrides
              </label>
              <p className="text-xs text-muted-foreground mt-1 mb-4">
                Force specific conditions for the forecast horizon.
              </p>
            </div>

            <div className="space-y-2">
              <label htmlFor="dayType" className="text-sm font-medium text-foreground">Day Type</label>
              <select
                id="dayType"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                value={overrides.isHoliday ? "holiday" : overrides.weekday !== null && overrides.weekday !== undefined ? overrides.weekday.toString() : "auto"}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === "auto") {
                    onOverridesChange({ ...overrides, isHoliday: null, weekday: null });
                  } else if (val === "holiday") {
                    onOverridesChange({ ...overrides, isHoliday: true, weekday: null });
                  } else {
                    onOverridesChange({ ...overrides, isHoliday: false, weekday: parseInt(val, 10) });
                  }
                }}
              >
                <option value="auto">Auto (Actual Date)</option>
                <option value="1">Weekday (Mon-Fri)</option>
                <option value="6">Saturday</option>
                <option value="0">Sunday</option>
                <option value="holiday">Public Holiday</option>
              </select>
            </div>

            <div className="space-y-2">
              <label htmlFor="weather" className="text-sm font-medium text-foreground">Weather</label>
              <select
                id="weather"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                value={overrides.cloud !== null && overrides.cloud !== undefined ? overrides.cloud.toString() : "auto"}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === "auto") {
                    onOverridesChange({ ...overrides, cloud: null });
                  } else {
                    onOverridesChange({ ...overrides, cloud: parseFloat(val) });
                  }
                }}
              >
                <option value="auto">Auto (Seasonal Profile)</option>
                <option value="0">Clear / Sunny</option>
                <option value="0.5">Partly Cloudy</option>
                <option value="0.9">Overcast</option>
              </select>
            </div>

            <div className="space-y-2">
              <label htmlFor="tempOverride" className="text-sm font-medium text-foreground">Temperature</label>
              <select
                id="tempOverride"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                value={overrides.tempC !== null && overrides.tempC !== undefined ? "manual" : "auto"}
                onChange={(e) => {
                  if (e.target.value === "auto") {
                    onOverridesChange({ ...overrides, tempC: null });
                  } else {
                    onOverridesChange({ ...overrides, tempC: 30 }); // Default override value
                  }
                }}
              >
                <option value="auto">Auto (Seasonal Profile)</option>
                <option value="manual">Override Manually</option>
              </select>

              {overrides.tempC !== null && overrides.tempC !== undefined && (
                <div className="flex items-center gap-3 pt-2">
                  <input
                    type="range"
                    min="20" max="40" step="0.5"
                    className="flex-1 accent-primary"
                    value={overrides.tempC}
                    onChange={(e) => onOverridesChange({ ...overrides, tempC: parseFloat(e.target.value) })}
                  />
                  <span className="text-sm font-medium w-12 text-right text-muted-foreground">{overrides.tempC.toFixed(1)}°C</span>
                </div>
              )}
            </div>

          </div>
        </div>
      </div>
    </>
  );
}
