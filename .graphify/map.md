# Code Map (graphify)

_63 files · 217 exported symbols · regenerate with `npm run graphify`._

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

## src/components/curtailment/ActiveDispatchesPanel.tsx
- ActiveDispatchesPanel({ events, onRevoke }: Props)

## src/components/curtailment/CurtailmentChart.tsx
- CurtailmentChart({ series, curtailedPct, commandsCount, successfulCount, failedCount, }: Props)

## src/components/curtailment/CurtailmentHistoryLog.tsx
- CurtailmentHistoryLog({ events }: Props)

## src/components/curtailment/CurtailmentView.tsx
- CurtailmentView({ feederId, onFeederChange }: Props)

## src/components/curtailment/DerFleetComplianceTable.tsx
- DerFleetComplianceTable({ sites }: Props)

## src/components/curtailment/DispatchModal.tsx
- DispatchModal({ open, onClose, onDispatch }: Props)

## src/components/dashboard/AlarmDrawer.tsx
- AlarmDrawer()

## src/components/dashboard/BatteryStorageChart.tsx
- BatteryStorageChart({ rows, now, tick, feeder, }: { rows: StackRow[]; now: number; tick: SystemTick; feeder: FeederModel; })  [memo]

## src/components/dashboard/DashboardView.tsx
- DashboardView({ feederId, onFeederChange, }: { feederId: string; onFeederChange: (id: string) => void; })

## src/components/dashboard/EvChargingChart.tsx
- EvChargingChart({ rows, now, tick, feeder, }: { rows: StackRow[]; now: number; tick: SystemTick; feeder: FeederModel; })  [memo]

## src/components/dashboard/EventsPanel.tsx
- EventsPanel()

## src/components/dashboard/FrequencyPanel.tsx
- FrequencyPanel({ tick, trace, }: { tick: SystemTick; trace: { ts: number; frequencyHz: number }[]; })

## src/components/dashboard/GridRiskPanel.tsx
- GridRiskCard({ feederId, onClick }: CardProps)
- GridRiskSidePanel({ feederId, open, onClose }: SidePanelProps)

## src/components/dashboard/RampPanel.tsx
- RampPanel({ now, units, feederId, }: { now: number; units: (UnitTick | BessTick)[]; feederId: string; })  [memo]

## src/components/dashboard/SolarExportChart.tsx
- SolarExportChart({ rows, now, tick, feeder, }: { rows: StackRow[]; now: number; tick: SystemTick; feeder: FeederModel; })  [memo]

## src/components/dashboard/SolarToday.tsx
- SolarToday({ now, feeder, }: { now: number; feeder: FeederModel; })  [memo]

## src/components/dashboard/Sparkline.tsx
- Sparkline({ values, stroke = "var(--viz-input)", height = 32, width = 96, className, label, }: Props)

## src/components/dashboard/SupplyMix.tsx
- SupplyMix({ tick }: { tick: SystemTick })

## src/components/dashboard/SupplyStack.tsx
- const SOURCE_COLOR
- SupplyStack({ rows, now, tick, feeder, }: { rows: StackRow[]; now: number; tick: SystemTick; feeder: FeederModel; })  [memo]

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
- AlarmProvider({ feederId, children, }: { feederId: string; children: ReactNode; })
- fn useAlarms(): AlarmState

## src/lib/useBalance.ts
- fn useSystemTick(feederId: string, intervalMs): { tick: SystemTick; trace: { ts: number; frequencyHz: number }[]; }
- interface StackRow
- fn useStackSeries(feederId: string, intervalMs): { rows: StackRow[]; now: number }
- fn useFleetTick(feederId: string, intervalMs): { ts: number; units: (UnitTick | BessTick)[]; buses: BusTick[]; }
- fn useIsStale(lastTs: number, expectedIntervalMs: number): boolean
- fn useGridRisk(feederId: string, customWeights?: RiskWeights, intervalMs): { gri: GridRiskIndex; history: GridRiskHistoryPoint[]; now: number; }

## src/lib/useCurtailment.ts
- fn useCurtailment(feederId: string)

## src/lib/useTheme.ts
- fn useTheme(): "dark" | "light"

## src/lib/utils.ts
- fn cn(...inputs: ClassValue[])
- fn formatPower(valMW: number): { value: string; unit: string; full: string }
- fn formatMW(valMW: number): string
- fn formatSignedMW(valMW: number): string
- fn formatMWh(valMWh: number): string
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

## src/pipeline/curtailment.ts
- type CurtailmentMode
- type DispatchReason
- type ProtocolType
- type ComplianceStatus
- interface CurtailmentEvent
- interface DerFleetSite
- interface CurtailmentTimeSeriesPoint
- const REASON_LABELS
- fn getFeederFleetSites(feederId: string): DerFleetSite[]
- fn getInitialCurtailmentEvents(feederId: string): CurtailmentEvent[]
- fn getCurtailmentTimeSeries(feederId: string, events: CurtailmentEvent[]): CurtailmentTimeSeriesPoint[]

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
- fn evaluateAlarms(tick: SystemTick, unitTicks: UnitTick[], busTicks: BusTick[], feederId: string): AlarmCondition[]
- fn sortAlarms(a: Alarm, b: Alarm)

## src/pipeline/system/derive.ts
- fn peakShaveRequirementMW(demandMW: number)
- fn reserveCoverPct(ticks: UnitTick[], tick: SystemTick, feederId: string): number
- interface RampRisk
- fn buildRampRisk(now: number, ticks: UnitTick[], feederId: string, lookAheadHours): RampRisk
- fn solarDayTotals(from: number, to: number, feederId: string, stepMs)
- fn feederDayTotals(from: number, to: number, feederId: string, stepMs)

## src/pipeline/system/fleet.ts
- const NATIONAL_GRID
- const FEEDER_RAMP_MW_PER_MIN
- const FEEDER_MODEL_LIST  [map]
- FEEDER_MODELS(m)  [fromEntries][map]
- const DEFAULT_FEEDER_ID
- fn feederModel(id: string): FeederModel
- fn phaseVoltageKV(f: FeederModel)
- fn installedSolarMW(f: FeederModel): number
- fn dispatchableSolarMW(f: FeederModel): number
- fn installedStorageMW(f: FeederModel): number
- fn installedStorageMWh(f: FeederModel): number
- fn hasStorage(f: FeederModel): boolean
- fn solarPenetrationPct(f: FeederModel): number
- fn evConnectedMW(ev: EvFleet)
- fn evChargerCount(ev: EvFleet)
- fn evEnrolledShare(ev: EvFleet)
- fn unitById(f: FeederModel, id: string): Unit | undefined
- fn busById(f: FeederModel, id: string): Bus | undefined

## src/pipeline/system/gridRisk.ts
- type RiskTier
- interface GridRiskSubIndex
- interface PreventiveWarning
- interface GridRiskIndex
- interface GridRiskHistoryPoint
- interface RiskWeights
- const DEFAULT_RISK_WEIGHTS
- fn computeGridRiskIndex(tick: SystemTick, unitTicks: UnitTick[], busTicks: BusTick[], feeder: FeederModel, customWeights: RiskWeights): GridRiskIndex
- fn generateGridRiskHistory(now: number, feederId: string, durationHours, stepMinutes): GridRiskHistoryPoint[]

## src/pipeline/system/source.ts
- fn socAt(h: number)
- fn sampleSystemTick(ts: number, feederId: string): SystemTick
- fn sampleUnitTicks(ts: number, feederId: string): (UnitTick | BessTick)[]
- fn sampleBusTicks(ts: number, feederId: string): BusTick[]
- fn sampleSystemSeries(from: number, to: number, stepMs: number, feederId: string): SystemTick[]
- ↳ MV_VOLTAGE_BAND_PU

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
- type LoadHump
- interface EvFleet
- interface FeederModel
- interface Bus
- interface BusTick
- interface SystemTick
- type Severity
- interface Alarm

