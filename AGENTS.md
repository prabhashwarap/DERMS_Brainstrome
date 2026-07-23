# Energy Forecast — Agent Guide

## graphify: read the code map before reading files

This repo ships a **code map** at [.graphify/map.md](.graphify/map.md) — a compact
index of every exported symbol in `src/` (functions, React components, types) with
its signature. It exists so you can locate code **without reading whole files**,
which keeps token usage low.

**Workflow for any code task:**

1. Open [.graphify/map.md](.graphify/map.md) and scan/grep it for the symbol,
   component, or file you need.
2. Open only the specific file(s) the map points you to — don't read directories
   wholesale.
3. If the map looks stale (you changed exports, or a symbol is missing), regenerate:
   ```bash
   npm run graphify
   ```

The map is generated from source by `scripts/graphify.mjs` (uses the TypeScript
compiler, no extra dependencies). `.graphify/map.md` is committed; `.graphify/map.json`
(the structured cache) is git-ignored.

A **pre-commit hook** (`.githooks/pre-commit`, activated via `core.hooksPath` on
`npm install`) regenerates and re-stages the map automatically whenever you commit
changes to `src/**/*.ts(x)` or the generator. So the map normally stays in sync on its
own — run `npm run graphify` manually only if you want to inspect changes before committing.

## Project layout

- `src/components/` — React UI (charts, map, panels, `ui/` primitives)
- `src/pipeline/` — forecasting logic (ingest, features, models, forecast, feeders)
- `src/lib/` — shared utilities

## Commands

- `npm run dev` — Vite dev server
- `npm run build` — typecheck (`tsc -b`) + build
- `npm run lint` — oxlint
- `npm run graphify` — regenerate the code map
