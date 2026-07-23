# Code Map (graphify)

_30 files · 90 exported symbols · regenerate with `npm run graphify`._

Read this map to locate code, then open only the file(s) you need. Signatures are compact (params + annotated return type); tags like `[memo]` note wrappers.

## src/App.tsx
- App()

## src/components/AppShell.tsx
- const NAV
- type NavId
- AppShell({ title, theme, activeNav, onNavChange, onThemeChange, onConfigToggle, children }: Props)

## src/components/ConfigPanel.tsx
- ConfigPanel({ open, onClose, runAt, onRunAtChange, overrides, onOverridesChange, }: ConfigPanelProps)

## src/components/ContextPanel.tsx
- ContextPanel({ bundle, hoverTs }: Props)

## src/components/ForecastChart.tsx
- type RangeKey
- interface ChartRow
- fn buildChartRows(bundle: Bundle, range: RangeKey): ChartRow[]
- ForecastChart()  [memo]

## src/components/ForecastPlus.tsx
- ForecastPlus()

## src/components/ForecastPlusMap.tsx
- ForecastPlusMap()

## src/components/ForecastTable.tsx
- ForecastTable({ bundle }: { bundle: Bundle })  [memo]

## src/components/ForecastToolbar.tsx
- ForecastToolbar({ feederId, onFeederChange, generatedAt }: Props)

## src/components/GenerationEvCharts.tsx
- GenerationEvCharts({ bundle }: Props)

## src/components/KpiRow.tsx
- KpiRow({ bundle, solar = false, }: { bundle: Bundle; /** Show the rooftop-PV generation tile (Forecast+ node panels only). */ solar?: boolean; })  [memo]

## src/components/Logo.tsx
- Logo({ className }: { className?: string })

## src/components/NodeDetailPanel.tsx
- interface MapNodeDetails
- NodeDetailPanel({ node, onClose, onFilterToNode }: NodeDetailPanelProps)

## src/components/ui/badge.tsx
- interface BadgeProps
- ↳ Badge
- ↳ badgeVariants

## src/components/ui/button.tsx
- interface ButtonProps
- ↳ Button
- ↳ buttonVariants

## src/components/ui/card.tsx
- ↳ Card
- ↳ CardHeader
- ↳ CardTitle
- ↳ CardDescription
- ↳ CardContent

## src/components/ui/select.tsx
- ↳ Select
- ↳ SelectValue
- ↳ SelectTrigger
- ↳ SelectContent
- ↳ SelectItem

## src/components/ui/separator.tsx
- ↳ Separator

## src/components/ui/switch.tsx
- ↳ Switch

## src/components/ui/tabs.tsx
- ↳ Tabs
- ↳ TabsList
- ↳ TabsTrigger
- ↳ TabsContent

## src/components/ui/tooltip.tsx
- ↳ Tooltip
- ↳ TooltipTrigger
- ↳ TooltipContent
- ↳ TooltipProvider

## src/lib/utils.ts
- fn cn(...inputs: ClassValue[])

## src/pipeline/calendar.ts
- const LKT_OFFSET_MIN
- interface LocalParts
- fn localParts(ts: number): LocalParts
- fn formatLKT(ts: number, opts: { date?: boolean; time?: boolean })
- const MONTHS
- const WEEKDAYS
- fn isHoliday(p: LocalParts): boolean
- const QUARTER_MS
- const SLOTS_PER_DAY
- fn floorQuarter(ts: number)
- fn startOfLocalDay(ts: number): number

## src/pipeline/features.ts
- const FEATURE_NAMES
- type FeatureRow
- interface FrameRow
- interface FeatureContext
- fn buildRow(c: FeatureContext): FeatureRow
- fn buildFrame(readings: Reading[], parts: LocalPartsLike[]): FrameRow[]
- fn trailingMean(readings: Reading[], endIndex: number): number
- interface LocalPartsLike

## src/pipeline/feeders.ts
- type FeederId
- interface Feeder
- const FEEDERS
- const FEEDER_LIST  [values]
- fn capacityMW(f: Feeder)

## src/pipeline/forecast.ts
- interface ForecastPoint
- interface HistoryPoint
- interface Accuracy
- interface Bundle
- const RUN_HOUR
- interface PredictionOverrides
- fn runForecast(feeder: Feeder, now: number, overrides?: PredictionOverrides): Bundle
- ↳ mean

## src/pipeline/ingest.ts
- interface Reading
- interface HistoryOptions
- fn loadFeederHistory(feeder: Feeder, opts: HistoryOptions): Reading[]
- ↳ SLOTS_PER_DAY

## src/pipeline/models.ts
- fn similarDayForecast(readings: Reading[], parts: LocalParts[], originIndex: number, targetWeekday: number, targetIsHoliday: boolean, k): number[]
- interface RidgeModel
- fn fitRidge(rows: FrameRow[], lambda): RidgeModel
- fn mean(xs: number[])

## src/pipeline/scheduler.ts
- fn lastRunAtOrBefore(now: number): number
- fn nextRunAfter(now: number): number
- fn scheduleDailyRun(onRun: (runAt: number) => void, clock: () => number): () => void
- ↳ LKT_OFFSET_MIN

