import { ForecastPlusMap } from "./ForecastPlusMap";

export function ForecastPlus() {
  return (
    <main className="flex flex-col min-h-0 bg-background flex-1">
      <div className="p-3 lg:p-4 bg-muted/20">
        <ForecastPlusMap />
      </div>
    </main>
  );
}

