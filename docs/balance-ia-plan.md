# Grid Balance — information architecture plan

> **Superseding §2–§3.2, §3.3 and §7: Balance is now the Dashboard, and it has
> no tabs.** The Balance destination and its Headroom and Assets tabs were
> removed; the Now tab's content became the **Dashboard** — the rail's first
> item and the app's landing page — restructured as a single scrolling page in
> the band order every public system-operator dashboard uses (CAISO Today's
> Outlook, Fingrid, EirGrid, National Grid ESO):
>
> ```
> status ribbon → solar headline → supply stack + frequency trace
>   → mix / solar today / ramp ahead / active conditions → model inputs
> ```
>
> §3.1's "one hero number" rule now applies twice, once per band: solar carried
> is the headline, frequency is the hero of its own panel, and nothing else on
> the page competes with either. What the tabs cost was the thing that motivated
> removing them: an operator had to navigate to assemble a picture one screen can
> hold.
>
> What went with the tabs, and why it was not merely relocated:
> - **The reserve ladder and the budget waterfall** (§3.2, §9) — they are a
>   planning workspace, not a glance. `buildSolarBudget`, `buildSolarReliefs`,
>   `buildReserveLadder` and `sustainMinutes` were deleted with them rather than
>   left as unreachable code; `SolarBudget`, `SolarRelief` and `ReserveRung` went
>   with their builders.
> - **The asset register** (§3.3) — per-unit output, SoH, cell flags and bus
>   voltage are a maintenance concern, and a balance dashboard that lists them is
>   answering a question nobody asked it.
> - **Ramp risk survived** (`buildRampRisk`) and is now a panel of its own. It is
>   the one Headroom quantity that is genuinely a glance: net demand minus solar,
>   against what the fleet can follow. CAISO gives it a chart for the same reason.
>
> Alarms are unchanged — still a cross-cutting drawer (§3.4), with a read-only
> three-row summary on the dashboard so a condition cannot hide behind a page of
> healthy numbers.

> **Scope change, superseding parts of §1–§3 below.** The product goal was
> narrowed to **maximise solar penetration while keeping the grid balanced**.
> Everything generation-related other than solar and storage was removed: no
> thermal, hydro or wind units, no per-unit conventional fleet, no wind anywhere
> in the model.
>
> Non-solar generation survives only as a **lumped constraint** — `CONVENTIONAL`
> in `fleet.ts`, two numbers: a must-run floor and a cap. That was kept
> deliberately: the minimum stable generation of must-run plant is the hard limit
> that forces solar to be curtailed, so deleting it would have deleted the thing
> the product exists to fight. It is never presented as a fleet, only as the
> slice of demand solar is not allowed to serve.
>
> Consequent redesigns:
> - **Now** leads with solar penetration as the hero, frequency beside it as the
>   constraint. The supply stack shows delivered solar solid and *spilled* solar
>   as a translucent band above the demand line.
> - **Headroom** replaced the reserve-first layout with a **budget waterfall**
>   (`buildSolarBudget`) plus a ranked list of what would buy more room
>   (`buildSolarReliefs`). See §9 for why a waterfall and not a limits ladder.
> - **Assets** lists solar sites, the aggregated rooftop fleet, storage and buses
>   — nothing else.
> - **Alarms** lead with curtailment, headroom exhaustion, inertia decay and
>   voltage rise under reverse flow.

Status: **implemented** (phases 1–6). Scope: real-time grid balance management in
Oversight+. This document is the design rationale; the code is in
`src/pipeline/system/`, `src/lib/useBalance.ts`, `src/lib/alarms.tsx` and
`src/components/balance/`.

---

## 1. The organising idea

The source material is a **data inventory** grouped by telemetry source (frequency,
generation, demand, renewables, BESS, voltage, weather, alarms). Shipping that
grouping as navigation would produce eight destinations that each answer half a
question, and an operator would have to visit four of them to answer the only
question that matters.

An operator asks three questions, in this order:

| Question | Horizon | What it needs |
| --- | --- | --- |
| **Am I balanced right now?** | seconds | frequency, RoCoF, net imbalance, gen vs load |
| **Can I stay balanced?** | minutes → hours | headroom, ramp rate, reserve, SOC, forecast |
| **What is causing it?** | on demand | per-unit, per-bus, per-asset detail |

So: **one nav destination, three tabs — Now / Headroom / Assets** — with alarms as
a cross-cutting layer and weather demoted to an input strip. Every one of your ten
categories lands somewhere; none of them gets its own page.

### Category → destination map

| # | Category | Lands in | Form |
| --- | --- | --- | --- |
| 1 | Frequency, RoCoF | **Now** | hero readout + 5-min trace |
| 2 | Generation MW/MVAr, must-run, outage | **Now** (stack) + **Assets** (register) | stacked area + table |
| 2 | Available capacity, ramp rate | **Headroom** | reserve ladder |
| 3 | Real-time load, regional breakdown | **Now** | stacked against generation |
| 3 | Short-term + day-ahead forecast | **Now** (dashed forward line) | reuses existing `Bundle` |
| 3 | Load shedding capability/status | **Headroom** | last rung of the reserve ladder |
| 4* | Tie-line / interchange flow | **Now** | signed term in the imbalance equation |
| 5* | Reserve & ancillary services | **Headroom** | the tab's spine |
| 6 | Solar/wind forecast vs actual | **Now** (in stack) + **Headroom** (ramp risk) | forecast-vs-actual pair |
| 6 | Curtailment | **Headroom** | negative headroom rung |
| 6 | Cloud/wind nowcast | **Now** input strip | sparkline, no chart |
| 7 | BESS SOC, charge/discharge, available power | **Headroom** | SOC is a *reserve duration*, not a battery stat |
| 7 | SOH, temperature, cell flags | **Assets** | health table, drill-down only |
| 8 | Bus voltages, stability margin | **Assets → Network** | locational, so it belongs on the map |
| 9 | Temperature, weather forecast | **Now** input strip + existing ConfigPanel | never its own page |
| 10 | Alarms and events | **cross-cutting drawer** | the Bell in `TopBar`, currently disabled |

\* Items 4 and 5 were absent from the source list (numbering skipped them).
Interchange and reserve are assumed, because the balance equation is wrong without
the first and the Headroom tab is empty without the second. Confirm before build.

---

## 2. Navigation

Insert one item into `NAV` in [AppShell.tsx](../src/components/AppShell.tsx#L30),
immediately above Forecasting — which also makes the three live destinations
contiguous instead of scattered among the inert ones:

```
Dashboard · Sites · Usage · Generation · [Balance] · Manage · Forecasting · Forecast+ · Settings
                                          ^ new, icon: Activity
```

Inside Balance, use the existing `ui/tabs.tsx`:

```
Balance    ● 49.98 Hz            [ Now ] [ Headroom ] [ Assets ]
```

**Rejected alternatives**, recorded so they aren't re-proposed:

- *Eight nav items, one per data category* — mirrors the source list, forces
  cross-referencing to answer any real question, and unbalances a rail that already
  has eight entries.
- *Folding balance into the existing Forecasting page* — a 06:00 batch bundle and a
  1 Hz frequency stream on one screen. Two clocks, one page: the user can never tell
  which numbers are live.
- *A single mega-dashboard* — no room for the reserve ladder or asset detail without
  either scrolling or shrinking the frequency readout below glanceable size.

---

## 3. Screen designs

### 3.1 Now — "am I balanced?"

```
┌──────────────────────────────────────────────────────────────────────┐
│  49.98 Hz          RoCoF  −0.02 Hz/s     Imbalance  −12 MW           │
│  ▁▂▃▂▁▂▃▄▃▂▁▂  5 min                    Gen 1 240 · Load 1 252       │
├──────────────────────────────────────────────────────────────────────┤
│  Generation vs demand                              last 6h → +4h     │
│  ████████ stacked by source ████████ ╌╌╌ forecast ╌╌╌                │
│  thermal · hydro · solar · wind · battery · import   ── actual load  │
├──────────────────────────────────────────────────────────────────────┤
│  27.4 °C ▁▂▃▄▃   cloud 0.42 ▃▄▂▁   wind 4.1 m/s ▂▂▃▂    ← inputs     │
└──────────────────────────────────────────────────────────────────────┘
```

Rules that keep it minimal:

- **One hero number.** Frequency is the only large-type figure. RoCoF and imbalance
  are secondary type — they qualify the hero, they don't compete with it.
- **The stack is the page.** Generation by source stacked, load as a single line over
  it. The gap between them *is* the imbalance; it should be visible without reading
  a number.
- **Forecast continues the same line** past `now`, dashed. Same axis, same colour,
  same units — no separate forecast panel. This is where the existing `Bundle`
  plugs in.
- **Weather is a strip, not a chart.** Three sparklines, ~32 px tall. They are model
  inputs; they earn a footer, not a section.
- **Nothing is coloured unless it deviates.** See §5.

### 3.2 Headroom — "can I hold it?"

The reserve ladder: one horizontal bar per response class, ordered by how fast it
arrives. This is the single view that answers "what have I got left, and how soon".

```
Response class        Available          Sustains for
──────────────────────────────────────────────────────
Inertial (<2 s)       ████░░░░  1.8 GWs      —
Primary (<10 s)       ██████░░   142 MW    10 min
  └ BESS               ████░░░░    64 MW    38 min  ← SOC-limited
  └ Hydro governor     ████████    78 MW      —
Secondary (<5 min)    █████░░░   210 MW      2 h
Tertiary (<30 min)    ███░░░░░   340 MW      —
Curtailment (down)    ██████░░   180 MW      —      ← solar/wind spill
Load shedding         ░░░░░░░░   ARMED             ← last rung, always visible
```

- **BESS lives here, not in its own section.** For a balancing operator, SOC is not
  a battery statistic — it is *how long primary reserve lasts*. Showing it as
  "sustains for 38 min" converts a number into a decision. SOH, temperature and cell
  flags are maintenance concerns and move to Assets.
- **Curtailment is negative headroom.** Down-regulation is reserve; it belongs on the
  same ladder, not in a renewables silo.
- **Ramp risk** sits beneath the ladder: forecast net-load ramp for the next 3 hours
  against sustained ramp capability. One line, one threshold, red only when the
  forecast ramp exceeds what the fleet can follow.

### 3.3 Assets — "what is causing it?"

One table, one filter row, one drill-down panel. No sub-tabs.

```
[ All ] [ Thermal ] [ Hydro ] [ Solar ] [ Wind ] [ BESS ] [ Buses ]

Unit            Output   MVAr   Available   Ramp      Status
Kelanitissa GT1  84 MW    12      +36 MW   8 MW/min   ● Running
Victoria H2      44 MW     6      +26 MW  32 MW/min   ◐ Must-run
Kerawalapitiya    0 MW     —           —        —     ○ Forced outage
Colombo BESS    −18 MW     4      +64 MW  instant    ● Charging · 62 % SOC
```

Row click opens a right-hand detail panel — the same pattern
[NodeDetailPanel.tsx](../src/components/NodeDetailPanel.tsx) already establishes.
Voltage and reactive power get a **Buses** filter here, and bus voltage is rendered
as a colour layer on the existing Forecast+ map rather than as another table:
voltage is a locational problem, and a map already exists to show location.

### 3.4 Alarms — cross-cutting

Activate the disabled Bell in [AppShell.tsx](../src/components/AppShell.tsx#L209).
It opens a right-hand drawer, never a page: alarms must be reachable from all three
tabs without losing the tab you're on.

- Three severities only: **critical / warning / info**. More tiers than an operator
  can act on differently is noise.
- Grouped by asset, newest first, with an unacknowledged count on the bell.
- Every alarm row deep-links to the asset or tab that explains it.

---

## 4. Data architecture

### 4.1 Two clocks — the critical structural decision

The current app recomputes an entire `Bundle` inside a `useMemo`
([App.tsx:49](../src/App.tsx#L49)) — full year of synthetic history, ridge fit,
28-day backtest. That is correct for a 06:00 daily job. It must **never** sit on the
path of a 1 Hz frequency update.

```
slow path   06:00 job  →  Bundle          →  forecast lines, day-ahead   (unchanged)
fast path   1 Hz tick  →  SystemTick      →  frequency, imbalance, stack
medium path 15 s poll  →  UnitTick[]      →  headroom ladder, asset table
```

Three independent hooks, three independent cadences. A frequency tick re-renders the
hero readout and nothing else.

### 4.2 Canonical schemas

New module `src/pipeline/system/`, following the existing ingest convention: a
deterministic seeded synthetic source behind one function, so the swap to a real
SCADA/EMS feed changes exactly one file — the same discipline
[ingest.ts](../src/pipeline/ingest.ts#L5) already documents.

```ts
// system/types.ts
export interface SystemTick {
  ts: number;
  frequencyHz: number;      // 50.000 nominal
  rocofHzPerS: number;      // signed; negative = falling
  generationMW: number;
  loadMW: number;
  interchangeMW: number;    // signed; positive = import
  imbalanceMW: number;      // gen + import − load
  inertiaGWs: number;       // drives the RoCoF alarm threshold
}

export interface Unit {
  id: string;
  name: string;
  kind: "thermal" | "hydro" | "solar" | "wind" | "battery";
  capacityMW: number;
  minStableMW: number;
  rampMWPerMin: number;
  responseClass: "inertial" | "primary" | "secondary" | "tertiary";
  mustRun: boolean;
}

export interface UnitTick {
  unitId: string;
  ts: number;
  outputMW: number;
  reactiveMVAr: number;
  availableUpMW: number;
  availableDownMW: number;
  status: "running" | "standby" | "forced-outage" | "planned-outage";
}

export interface BessTick extends UnitTick {
  socPct: number;
  sohPct: number;
  cellTempC: number;
  roundTripEff: number;
  flags: string[];
}

export interface BusTick {
  busId: string;
  ts: number;
  voltagePu: number;
  stabilityMarginPct: number;
}

export interface Alarm {
  id: string;
  ts: number;
  severity: "critical" | "warning" | "info";
  source: { kind: "unit" | "bus" | "system"; id: string };
  message: string;
  acknowledgedAt: number | null;
}
```

`ForecastPoint` and `Bundle` are untouched. The forward-forecast line on the Now tab
reads the existing bundle; no new forecast machinery.

### 4.3 Derived, not stored

Compute in a selector, never persist:

- `imbalanceMW` — from the tick's own terms, so it can't disagree with them
- reserve totals per class — sum of `availableUpMW` over units in that class
- BESS sustain minutes — `socPct × capacityMWh / dischargeMW`
- capacity headroom % — reuses `capacityMW()` from
  [feeders.ts](../src/pipeline/feeders.ts#L294)

---

## 5. Visual rules

Non-negotiable, because they are what makes ten data categories feel like one system.

1. **Colour means deviation, nothing else.** Normal state is monochrome. Source
   colours in the generation stack are the sole exception, and that palette is
   muted and fixed. No decorative colour anywhere.
2. **Thresholds are shared and configurable.** One table, read by chart bands,
   readouts, and the alarm engine alike — so a number can never be amber in one
   place and green in another. Indicative 50 Hz values:

   | Signal | Normal | Warning | Critical |
   | --- | --- | --- | --- |
   | Frequency | ±0.05 Hz | ±0.15 Hz | ±0.50 Hz |
   | RoCoF | <0.10 Hz/s | 0.10–0.50 | >0.50 Hz/s |
   | Bus voltage | 0.95–1.05 pu | ±7 % | ±10 % |
   | Primary reserve | >120 % of largest infeed | 100–120 % | <100 % |

3. **One number per tile.** A delta or a unit may accompany it. A second headline
   figure means it should have been two tiles.
4. **Sparkline before chart.** A secondary series gets ~32 px and no axes. Full
   charts are reserved for the generation stack and the frequency trace.
5. **Units always shown, never guessed:** MW, MVAr, Hz, Hz/s, pu, %, GWs. Reuse
   `formatPower` / `formatEnergy` from [utils.ts](../src/lib/utils.ts#L100).
6. **Staleness is visible.** Any tile whose feed has not updated within 3× its
   expected interval dims and shows its age. In a balancing view, a frozen number is
   more dangerous than a missing one.
7. **Progressive disclosure.** Each tab fits one screen at 1440×900 with no
   scrolling. Everything else is behind a row click.

---

## 6. Scope boundary (state it in the UI)

Oversight+ is currently a **distribution** product: LECO feeders, 13–22 MVA, netting
rooftop PV. Frequency, RoCoF and system inertia are **transmission** quantities that
a DSO observes but does not control.

The Balance tab must say so — a single line in the header, e.g.
*"System frequency and reserve sourced from CEB SCADA · LECO controls curtailment
and load shedding only."* Without it, the view implies control authority that doesn't
exist, which is the kind of misread that damages trust in a pilot.

---

## 7. Build sequence

Each phase is independently demonstrable.

| Phase | Delivers | Built in |
| --- | --- | --- |
| **1. Foundation** ✅ | schemas, seeded synthetic source, threshold table, three tick hooks | `pipeline/system/{types,thresholds,fleet,source,derive}.ts`, `lib/useBalance.ts` |
| **2. Now tab** ✅ | nav entry, tab shell, frequency hero, gen-vs-load stack, weather strip | `AppShell.tsx`, `App.tsx`, `balance/{BalanceView,NowTab,Sparkline}.tsx` |
| **3. Headroom tab** ✅ | reserve ladder, BESS as sustain-duration, curtailment, ramp risk | `balance/HeadroomTab.tsx`, `system/derive.ts` |
| **4. Assets tab** ✅ | unit/BESS/bus table, filter row, detail panel | `balance/AssetsTab.tsx` |
| **5. Alarms** ✅ | threshold-driven engine, lifecycle provider, bell badge, drawer | `system/alarms.ts`, `lib/alarms.tsx`, `balance/AlarmDrawer.tsx` |
| **6. Wiring** ✅ | short-term demand forecast continues the demand line past `now` | `lib/useBalance.ts` |

Not built: the bus-voltage colour layer on the Forecast+ map (§3.3). Voltage is
in the Assets table with a Buses filter and a detail panel; painting it onto the
Leaflet map is a separate change to `ForecastPlusMap.tsx` and was left out rather
than half-done.

---

## 8. Decisions taken, and what they rest on

The four open questions were resolved as follows in order to ship. Each is a
one-file change if the answer differs.

1. **Categories 4 and 5** — the source list skipped them. Assumed to be
   **interchange** and **reserves**; both are built in. Interchange is a signed
   term on `SystemTick`; reserve is the spine of the Headroom tab.
2. **Real feed or synthetic** — synthetic, behind one function, matching the
   posture `ingest.ts` already takes. `sampleSystemTick` is a *pure function of
   the timestamp*, so history is reconstructed by sampling backwards and RoCoF is
   a genuine derivative of the frequency series. A real SCADA feed replaces
   `source.ts` and nothing else.
3. **Scope** — system-level, sized at a 1 485 MW peak with a national-scale fleet,
   not LECO's ten feeders. The header states the boundary explicitly (§6), because
   a DSO observes frequency but does not control it.
4. **Wind** — included. It is named throughout the source material, and a balance
   view without it cannot show the ramp risk that motivates the tab.

### Model validation

The dispatch model was swept over 14 days at 5-minute resolution
(`worst imbalance ±25 MW · frequency in band 98.6 % · warning 1.4 % · critical 0 %`)
to confirm the fleet can actually follow demand at every instant. Two defects the
sweep caught, both fixed:

- **The fleet could not serve peak.** A 1 450 MW peak against 995 MW of
  dispatchable capacity produced a −486 MW deficit and a permanent critical
  frequency excursion. Fixed by adding baseload capacity and by making the tie-line
  schedule load-following.
- **A fixed 62/38 thermal-hydro split stranded headroom.** Hydro capped out at the
  evening peak while 300 MW of thermal sat idle, and the model reported a deficit
  that was an artefact of the allocator. Fixed with a top-up pass.

Minimum-generation oversupply is handled by **curtailing renewables**, not by
letting frequency run high — which is both what happens in practice and what makes
the curtailment rung on the ladder show real numbers.

### Palette

The six generation-source colours were validated with the dataviz colour checker
against both chart surfaces — lightness band, chroma floor, adjacent-pair CVD
separation, normal-vision floor and contrast all pass in light and dark. The dark
set is re-stepped for its surface rather than being an automatic flip of the light
one. Adjacent stacked segments carry a 2 px surface gap as secondary encoding, so
identity never rests on hue alone.

---

## 9. Solar refocus — design notes

### Why a budget, not a limits ladder

The first cut of the Headroom tab listed four parallel "limits" on solar —
minimum generation, storage absorption, inertia floor, network voltage — each
answering "how much solar could the grid carry if only this applied", with the
shortest bar binding.

The model sweep killed it. Minimum generation and the inertia floor are both
**linear in conventional output**, so one always dominates the other by a fixed
margin and the loser is permanently dead weight. Storage absorption was worse: it
is defined as min-gen *plus* charging, so it can never bind at all. Three of the
four rows were structurally incapable of being the answer.

The constraints are not parallel, they **nest**. Demand is the whole budget;
must-run plant and the tie-line each take a slice before solar gets any; storage
gives a slice back while charging. So the view became subtraction:

```
Demand                  + 1010 MW
Must-run generation      − 420 MW    holds 2.10 GW·s of inertia
Tie-line                 − 85.6 MW
Storage (charging)       + 16.0 MW
─────────────────────────────────
Room for solar           = 520 MW
Solar available            621 MW    525 taken · 96.2 spilled
```

Inertia is now reported as a *consequence* of the must-run floor rather than as a
rival to it, which is what it physically is. "What would buy more room" became a
separate ranked list, each lever sized against the solar actually being spilled —
so no lever is ever advertised as worth more than it would really deliver.

### Two facts that must never share a number

Rooftop PV is behind the meter and takes no dispatch instruction. When the room
shortfall exceeds what can actually be curtailed, the remainder becomes surplus,
not spill. The headline shows spilled MW; the uncurtailable remainder is called
out separately. Collapsing them into one figure would misreport both.

### Alarm calibration

Alarm conditions were swept over 7 days at 15-minute resolution and two fired
~100 % of the time — noise wearing the costume of signal:

- **Storage reserve cover** was measured against the largest single infeed. With
  conventional plant lumped there is no meaningful "biggest unit", and a 90 MW
  storage fleet can never cover a 300 MW block loss, so the indicator was
  permanently red. Now measured against a primary response requirement of 4 % of
  demand.
- **Monaragala stability margin** was mis-calibrated and sat below threshold at
  all times. Rebased so it only tightens under load and back-feed.

Resulting profile: one persistent forced outage (legitimately persistent),
inertia 27 % of samples, curtailment 7 %, voltage 7 %, margin 6 %, frequency
1.4 %.

### Model validation after the refocus

14-day sweep at 5-minute resolution:

| Measure | Value |
| --- | --- |
| Installed solar | 910 MW (570 utility + 340 rooftop) against a 1 485 MW peak |
| Worst imbalance | ±24 MW — the AGC tracking lag, nothing structural |
| Frequency in band | 98.3 % normal · 1.7 % warning · 0 % critical |
| Peak instantaneous penetration | 63.4 % |
| Solar energy share | 16.5 % of demand |
| Spilled | 3.7 % of available solar, peaking at 274 MW |
| Minimum inertia | 2.10 GW·s, at the must-run floor |

### Palette

Reduced to three identified series — solar, battery, import — revalidated with
the dataviz checker against both surfaces; all checks pass in light and dark.
Conventional is deliberately a **neutral, near-achromatic tone** rather than a
fourth identity: it is the backdrop solar is measured against, and giving it a
hue would let it compete with the series that matter.
