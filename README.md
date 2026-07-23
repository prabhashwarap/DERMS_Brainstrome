# LECO Day-Ahead Load Forecasting — v1 demonstration

Front-end pilot for the Lanka Electricity Company: a day-ahead net-load forecast
for two distribution feeders, on realistic synthetic data, built to the Oversight
design language.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build
```

Everything on screen is generated in the browser at load. There is no mock JSON
of pre-baked curves — the synthetic feeder, the feature builder, the two models
and the backtest all run for real, in the order a production pipeline would run
them.

---

## Information architecture

The pilot sits inside the Oversight shell — persistent left rail, thin top bar,
content area. Only **Forecasting** is built; the other rail entries are rendered
inert rather than omitted, so the section occupies its real position in the
product and the navigation needs no redesign when it merges in.

Within the section, the screen answers four questions in the order an energy
purchaser asks them.

| Zone | Location | Question it answers |
|---|---|---|
| Scope & provenance | toolbar under the top bar | *Which feeder, how fresh, and can I trust the source?* |
| Executive summary | KPI row | *How high, how much, when, and how does that compare to yesterday?* |
| Primary analytical view | main canvas | *What is the shape, and how uncertain is it?* |
| Context & validation | right sidebar | *Why this shape, and how wrong is the model usually?* |

The zoning is fixed. A feeder switch repaints every zone in place — nothing
moves, so an operator builds positional memory and stops reading labels.

### Decisions worth defending

**No map.** Day-ahead purchasing is a temporal problem. Spending half the canvas
on feeder geography would compress the one chart the decision actually depends
on. Geography belongs in outage management, which is a different screen.

**Confidence bands, never error bars.** At 15-minute resolution a day is 96
points; error bars would be 96 vertical ticks through the trend line. The band
is filled at ~17% alpha so gridlines and the expected line read straight
through it, and its edges are interpolated so it reads as an envelope rather
than a comb.

**Solid means recorded, dashed means predicted.** The line style carries the
distinction, a vertical divider marks T-0, and the horizon carries a 4.5% tint.
Three redundant cues, because "is this real or predicted?" is the one question
that must never require inspection.

**One axis, always.** Temperature is not overlaid on the load chart. A second
y-scale on a shared plot invites false correlation readings; instead the
temperature curve sits in the context panel on its own scale, and hovering the
load chart highlights the matching hour there. Same insight, no lying geometry.

**Reserved space for what v1 does not build.** Alerts, settings and the user
menu occupy disabled slots in the header. When auth and alerting land they drop
into existing space rather than forcing a re-layout.

**Colour is signal, not decoration.** Saturated red, amber and orange appear
nowhere in the interface. They are held in reserve for the alarm layer that
follows v1; using them for ordinary data would spend their emergency value.

### Palette

Data colours were validated against both surfaces (lightness band, chroma
floor, CVD separation, normal-vision separation, contrast):

| Role | Dark | Light |
|---|---|---|
| Actual load | `#0C9FBD` | `#0093B5` |
| Forecast | `#22D3EE` (dashed) | `#12B4D8` (dashed) |
| Confidence band | actual hue @ 17% | actual hue @ 16% |
| Similar-day baseline | `#8257F5` | `#6D28D9` |

Light is the default, matching the Oversight platform shell. Dark is the same
tokens restepped for a navy surface — one click in the top bar — because control
rooms run 24/7 and a luminous screen at 03:00 is a fatigue problem.

---

## Pipeline

Four stages, split exactly where the real system splits, so the LECO feed can be
swapped in at stage 1 without touching anything downstream.

```
src/pipeline/
  feeders.ts    asset register — capacity, solar penetration, load mix
  calendar.ts   Asia/Colombo calendar, Sri Lankan public holidays
  ingest.ts     ← THE SWAP POINT. Emits Reading[] in the canonical schema.
  features.ts   Reading[] → design matrix (all features knowable at 06:00)
  models.ts     similar-day baseline + ridge regression
  forecast.ts   the 06:00 job: train → predict → backtest → serve a Bundle
```

`loadFeederHistory` is the only function that knows the data is synthetic. Point
it at the real meter feed and the rest of the file tree is unchanged.

### Synthetic data

Twelve months of 15-minute readings per feeder, from a parametric model rather
than noise:

```
load = base × shape(hour) × weekday × season × weather × holiday − rooftop PV
       + AR(1) noise
```

Weather is generated *first*, as its own AR(1) series, and load depends on it —
the same causal direction the real feeder has. Both feeders are seeded, so the
demo is identical on every reload.

- **Angulana** (13 MVA, ~9% solar, residential): the Sri Lankan double hump — a
  modest 05:30–06:30 domestic peak, midday dip, dominant 18:30–22:30 evening
  peak. Narrow, even confidence bands.
- **Katunayake** (22 MVA, ~34% solar, industrial + commercial): a duck curve. On
  clear days rooftop PV pushes metered net load below the morning shoulder, then
  generation collapses into the evening ramp. Bands widen sharply through the
  midday belly and the ramp, which is the honest picture: that is where the model
  genuinely knows least.

Weekends drop (Sundays furthest, and further still on the industrial feeder),
Poya days and public holidays drop, and hot months lift the afternoon and
evening.

### Models

1. **Similar-day baseline** — mean of the last 4 matching weekdays (non-holiday),
   with a damped correction for recent level drift. Implemented first; it sets
   the bar.
2. **Ridge regression** — hour-of-day harmonics (3), weekday, weekend and holiday
   flags, month, forecast temperature and its cooling excess, clear-sky and
   cloud terms, and same-slot lags at 1 day and 7 days plus a trailing 24 h mean.
   Fitted by Cholesky solve on standardised columns.

No neural network. On synthetic data a bigger model would only prove it can
learn the generator.

### Evaluation

MAPE on a 28-day held-out tail the model never saw during fitting. Both models
are scored on the same window and both are shown, because the comparison is the
point: an operator who can see the production model beat the naive baseline has
a reason to trust it. The interval half-widths come from the same backtest —
the 95th percentile of held-out error *per hour of day*, smoothed — so the band
is measured, not assumed, and widens where the model has historically struggled.

Accuracy on synthetic data measures the pipeline, not the future. The framework
is what carries over when the real feed arrives.

---

## Out of scope for v1

Transformer and smart-meter drill-down, solar generation decomposition, model
comparison views, historical error tracking, auth and alerting. Each has a
landing place in the current layout — the feeder dropdown becomes a cascading
tree, the chart legend becomes layer toggles, the accuracy card becomes a
clickable deep-dive, the reserved header slots become the user menu.
