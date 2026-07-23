import { ForecastPlusMap } from "./ForecastPlusMap";

export function ForecastPlus() {
  return (
    <main className="flex flex-col min-h-0 bg-background flex-1">
      <div className="flex-1 overflow-auto p-4 lg:p-6 bg-muted/20">
        <ForecastPlusMap />
      </div>
    </main>
  );
}

