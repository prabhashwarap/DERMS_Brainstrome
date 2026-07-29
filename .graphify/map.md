# Code Map (graphify)

_50 files · 170 exported symbols · regenerate with `npm run graphify`._

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
- ForecastTable({ bundle, showGeneration = false, }: { bundle: Bundle; showGeneration?: boolean; })  [memo]

## src/components/ForecastToolbar.tsx
- ForecastToolbar({ feederId, onFeederChange, bundle }: Props)

## src/components/GenerationEvCharts.tsx
- GenerationEvCharts({ bundle }: Props)

## src/components/KpiRow.tsx
- KpiRow({ bundle, solar = false, }: { bundle: Bundle; /** Show the rooftop-PV generation tile (Forecast+ node panels only). */ solar?: boolean; })  [memo]

## src/components/Logo.tsx
- Logo({ className }: { className?: string })

## src/components/NodeDetailPanel.tsx
- interface MapNodeDetails
- fn lecoAccountNumber(nodeId: string): string
- NodeDetailPanel({ node, onClose, onFilterToNode }: NodeDetailPanelProps)

## src/components/dashboard/AlarmDrawer.tsx
- AlarmDrawer()

## src/components/dashboard/DashboardView.tsx
- DashboardView({ bundle, feederId, onFeederChange, }: { bundle: Bundle; feederId: FeederId; onFeederChange: (id: FeederId) => void; })

## src/components/dashboard/EventsPanel.tsx
- EventsPanel()

## src/components/dashboard/FrequencyPanel.tsx
- FrequencyPanel({ tick, trace, }: { tick: SystemTick; trace: { ts: number; frequencyHz: number }[]; })

## src/components/dashboard/RampPanel.tsx
- RampPanel({ now, units, }: { now: number; units: (UnitTick | BessTick)[]; })  [memo]

## src/components/dashboard/SolarToday.tsx
- SolarToday({ now }: { now: number })  [memo]

## src/components/dashboard/Sparkline.tsx
- Sparkline({ values, stroke = "var(--viz-input)", height = 32, width = 96, className, label, }: Props)

## src/components/dashboard/SupplyMix.tsx
- SupplyMix({ tick }: { tick: SystemTick })

## src/components/dashboard/SupplyStack.tsx
- const SOURCE_COLOR
- SupplyStack({ rows, now, tick, }: { rows: StackRow[]; now: number; tick: SystemTick; })  [memo]

## src/components/dashboard/tiles.tsx
- Term({ children, help }: { children: React.ReactNode; help: string })
- PanelHeader({ title, note, children, }: { title: string; note: string; children?: React.ReactNode; })
- StatTile({ label, value, unit, level = "normal", footnote, help, size = "md", }: { label: string; value: string; unit?: string; level?: Level; footnote?: React.ReactNode; help: string; size?: "md" | "lg"; })
- Meter({ value, max = 100, color = "var(--src-solar)", marker, markerLabel, label, }: { value: number; max?: number; color?: string; marker?: number; markerLabel?: string; label: string; })

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

## src/lib/alarms.tsx
- AlarmProvider({ children }: { children: ReactNode })
- fn useAlarms(): AlarmState

## src/lib/useBalance.ts
- fn useSystemTick(intervalMs): { tick: SystemTick; trace: { ts: number; frequencyHz: number }[]; }
- interface StackRow
- fn useStackSeries(intervalMs): { rows: StackRow[]; now: number }
- fn useFleetTick(intervalMs): { ts: number; units: (UnitTick | BessTick)[]; buses: BusTick[]; }
- fn useIsStale(lastTs: number, expectedIntervalMs: number): boolean

## src/lib/useTheme.ts
- fn useTheme(): "dark" | "light"

## src/lib/utils.ts
- fn cn(...inputs: ClassValue[])
- fn formatPower(valMW: number): { value: string; unit: string; full: string }
- fn formatMW(valMW: number): string
- fn formatSignedMW(valMW: number): string
- fn formatEnergy(valMWh: number): { value: string; unit: string; full: string }

## src/pipeline/calendar.ts
- const LKT_OFFSET_MIN
- interface LocalParts
- fn localParts(ts: number): LocalParts
- fn formatLKT(ts: number, opts: { date?: boolean; time?: boolean })
- const MONTHS
- const WEEKDAYS
- const HOLIDAY_MAP
- fn getHolidayName(p: LocalParts): string | null
- fn isHoliday(p: LocalParts): boolean
- const QUARTER_MS
- const SLOTS_PER_DAY
- fn floorQuarter(ts: number)
- fn startOfLocalDay(ts: number): number

## src/pipeline/der.ts
- fn jitter(ts: number, salt: number): number
- fn pvClearSky(decimalHour: number): number
- type EvProfile
- fn evShape(ts: number, profileType: EvProfile): number

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
- const FEEDER_LIST
- fn capacityMW(f: Feeder)

## src/pipeline/forecast.ts
- interface ForecastPoint
- interface HistoryPoint
- interface Accuracy
- interface DayTypeInfo
- interface Bundle
- fn deriveDayType(horizonStart: number, overrides?: PredictionOverrides): DayTypeInfo
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

## src/pipeline/system/alarms.ts
- type AlarmCondition
- fn evaluateAlarms(tick: SystemTick, unitTicks: UnitTick[], busTicks: BusTick[]): AlarmCondition[]
- fn sortAlarms(a: Alarm, b: Alarm)

## src/pipeline/system/derive.ts
- fn primaryRequirementMW(demandMW: number)
- fn reserveCoverPct(ticks: UnitTick[], tick: SystemTick): number
- interface RampRisk
- fn buildRampRisk(now: number, ticks: UnitTick[], lookAheadHours): RampRisk
- fn solarDayTotals(from: number, to: number, stepMs)

## src/pipeline/system/fleet.ts
- const CONVENTIONAL
- const BUSES
- const UNITS
- UNIT_BY_ID(u)  [fromEntries][map]
- BUS_BY_ID(b)  [fromEntries][map]
- fn installedSolarMW(): number
- fn dispatchableSolarMW(): number
- fn installedStorageMW(): number
- fn installedStorageMWh(): number
- fn largestInfeedMW(): number

## src/pipeline/system/source.ts
- fn sampleSystemTick(ts: number): SystemTick
- fn sampleUnitTicks(ts: number): (UnitTick | BessTick)[]
- fn sampleBusTicks(ts: number): BusTick[]
- fn sampleSystemSeries(from: number, to: number, stepMs: number): SystemTick[]
- ↳ SYSTEM_PEAK_MW

## src/pipeline/system/thresholds.ts
- type Level
- const NOMINAL_HZ
- const THRESHOLDS
- fn classifyDeviation(deviation: number, band: { warning: number; critical: number }): Level
- fn classifyFloor(value: number, band: { warning: number; critical: number }): Level
- fn classifyCeiling(value: number, band: { warning: number; critical: number }): Level
- const LEVEL_CLASS
- STALE_AFTER(expectedIntervalMs: number)

## src/pipeline/system/types.ts
- type ResponseClass
- type UnitKind
- type UnitStatus
- const SOURCE_ORDER
- type SourceId
- const SOURCE_LABEL
- interface Unit
- interface UnitTick
- interface BessTick
- interface Bus
- interface BusTick
- interface SystemTick
- type Severity
- interface Alarm

