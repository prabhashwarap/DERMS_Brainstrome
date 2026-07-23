import React, { useState, useMemo, useEffect } from "react";
import { NodeDetailPanel, type MapNodeDetails } from "./NodeDetailPanel";
import {
  Zap,
  Cable,
  Sun,
  BatteryCharging,
  Battery,
  Radio,
  Activity,
  Grid,
  Zap as EnergyIcon,
  Clock,
  Percent,
  Check,
  Building2,
  Building,
  Waypoints,
  ChevronDown,
  ChevronRight,
  Layers
} from "lucide-react";
import { MapContainer, TileLayer, Marker, Popup, CircleMarker, Polyline, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { renderToStaticMarkup } from "react-dom/server";
import "leaflet/dist/leaflet.css";

const createCustomIcon = (iconNode: React.ReactElement, colorClass: string, size: number = 18) => {
  const iconMarkup = renderToStaticMarkup(
    <div className={`flex items-center justify-center rounded-sm bg-background border shadow-md ${colorClass}`} style={{ width: size, height: size }}>
      {iconNode}
    </div>
  );
  
  return L.divIcon({
    html: iconMarkup,
    className: "custom-leaflet-icon",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2]
  });
};

const transformerIcon = createCustomIcon(<Zap className="w-3.5 h-3.5 text-blue-600" />, "border-blue-500 bg-blue-50", 20);
const substationIcon = createCustomIcon(<Cable className="w-4 h-4 text-red-600" />, "border-red-500 bg-red-50", 24);
const distributedSolarIcon = createCustomIcon(<Sun className="w-3.5 h-3.5 text-amber-600" />, "border-amber-500 bg-amber-50", 18);
const evseIcon = createCustomIcon(<BatteryCharging className="w-3.5 h-3.5 text-emerald-600" />, "border-emerald-500 bg-emerald-50", 18);
const distributedBatteryIcon = createCustomIcon(<Battery className="w-3.5 h-3.5 text-purple-600" />, "border-purple-500 bg-purple-50", 18);
const branchHqIcon = createCustomIcon(<Building2 className="w-4 h-4 text-indigo-700" />, "border-indigo-600 bg-indigo-50", 28);
const cscHqIcon = createCustomIcon(<Building className="w-3.5 h-3.5 text-cyan-700" />, "border-cyan-600 bg-cyan-50", 24);
const feederIcon = createCustomIcon(<Waypoints className="w-3.5 h-3.5 text-rose-600" />, "border-rose-500 bg-rose-50", 20);

// LECO Grid Hierarchy: Branch -> CSC (Consumer Service Center) -> Feeder
// Source: Lanka Electricity Company (LECO) branch/CSC network (leco.lk).
// LECO operates 7 branches covering the urban Western & Southern coastal belt.
type Feeder = { id: string; name: string };
type Csc = { id: string; name: string; center: [number, number]; feeders: Feeder[] };
type Branch = { id: string; name: string; center: [number, number]; cscs: Csc[] };

const LECO_DATA: { branches: Branch[] } = {
  branches: [
    {
      id: "kotte",
      name: "Kotte",
      center: [6.9089, 79.8936],
      cscs: [
        { id: "pitakotte", name: "Pita Kotte", center: [6.8869, 79.9036], feeders: [{ id: "pitakotte_f1", name: "Pita Kotte" }, { id: "pitakotte_f2", name: "Nawala" }] },
        { id: "kolonnawa", name: "Kolonnawa", center: [6.9333, 79.8853], feeders: [{ id: "kolonnawa_f1", name: "Kolonnawa" }, { id: "kolonnawa_f2", name: "Wellampitiya" }] },
        { id: "kotikawatta", name: "Kotikawatta", center: [6.9430, 79.8994], feeders: [{ id: "kotikawatta_f1", name: "Kotikawatta" }, { id: "kotikawatta_f2", name: "Angoda" }] },
      ],
    },
    {
      id: "nugegoda",
      name: "Nugegoda",
      center: [6.8649, 79.8990],
      cscs: [
        { id: "boralesgamuwa", name: "Boralesgamuwa", center: [6.8411, 79.9020], feeders: [{ id: "boralesgamuwa_f1", name: "Boralesgamuwa" }, { id: "boralesgamuwa_f2", name: "Katuwawala" }] },
        { id: "nugegoda_csc", name: "Nugegoda", center: [6.8724, 79.8890], feeders: [{ id: "nugegoda_f1", name: "Nugegoda Town" }, { id: "nugegoda_f2", name: "Delkanda" }] },
        { id: "maharagama", name: "Maharagama", center: [6.8480, 79.9265], feeders: [{ id: "maharagama_f1", name: "Maharagama" }, { id: "maharagama_f2", name: "Pannipitiya" }] },
      ],
    },
    {
      id: "kelaniya",
      name: "Kelaniya",
      center: [6.9614, 79.9186],
      cscs: [
        { id: "dalugama", name: "Dalugama", center: [6.9614, 79.9186], feeders: [{ id: "dalugama_f1", name: "Dalugama" }, { id: "dalugama_f2", name: "Kiribathgoda" }] },
        { id: "mahara", name: "Mahara", center: [7.0130, 79.9490], feeders: [{ id: "mahara_f1", name: "Mahara" }, { id: "mahara_f2", name: "Kadawatha" }] },
        { id: "kandana", name: "Kandana", center: [7.0470, 79.8940], feeders: [{ id: "kandana_f1", name: "Kandana" }, { id: "kandana_f2", name: "Ragama" }] },
        { id: "wattala", name: "Wattala", center: [6.9892, 79.8925], feeders: [{ id: "wattala_f1", name: "Wattala" }, { id: "wattala_f2", name: "Hendala" }] },
      ],
    },
    {
      id: "moratuwa",
      name: "Moratuwa",
      center: [6.7730, 79.8820],
      cscs: [
        { id: "moratuwa_north", name: "Moratuwa North", center: [6.7900, 79.8860], feeders: [{ id: "moratuwa_north_f1", name: "Rawatawatta" }, { id: "moratuwa_north_f2", name: "Angulana" }] },
        { id: "moratuwa_south", name: "Moratuwa South", center: [6.7600, 79.8810], feeders: [{ id: "moratuwa_south_f1", name: "Katubedda" }, { id: "moratuwa_south_f2", name: "Koralawella" }] },
        { id: "keselwatta", name: "Keselwatta", center: [6.7150, 79.9010], feeders: [{ id: "keselwatta_f1", name: "Keselwatta" }, { id: "keselwatta_f2", name: "Wekada" }] },
        { id: "panadura", name: "Panadura", center: [6.7130, 79.9070], feeders: [{ id: "panadura_f1", name: "Panadura Town" }, { id: "panadura_f2", name: "Walana" }] },
      ],
    },
    {
      id: "kalutara",
      name: "Kalutara",
      center: [6.5854, 79.9607],
      cscs: [
        { id: "payagala", name: "Payagala", center: [6.5170, 79.9800], feeders: [{ id: "payagala_f1", name: "Payagala" }, { id: "payagala_f2", name: "Maggona" }] },
        { id: "kalutara_csc", name: "Kalutara", center: [6.5854, 79.9607], feeders: [{ id: "kalutara_f1", name: "Kalutara North" }, { id: "kalutara_f2", name: "Kalutara South" }] },
        { id: "aluthgama", name: "Aluthgama", center: [6.4310, 79.9970], feeders: [{ id: "aluthgama_f1", name: "Aluthgama" }, { id: "aluthgama_f2", name: "Beruwala" }] },
      ],
    },
    {
      id: "negombo",
      name: "Negombo",
      center: [7.2083, 79.8358],
      cscs: [
        { id: "negombo_csc", name: "Negombo", center: [7.2083, 79.8358], feeders: [{ id: "negombo_f1", name: "Negombo Town" }, { id: "negombo_f2", name: "Kochchikade" }] },
        { id: "seeduwa", name: "Seeduwa", center: [7.1400, 79.8770], feeders: [{ id: "seeduwa_f1", name: "Seeduwa" }, { id: "seeduwa_f2", name: "Katunayake" }] },
        { id: "jaela", name: "Ja-Ela", center: [7.0744, 79.8920], feeders: [{ id: "jaela_f1", name: "Ja-Ela" }, { id: "jaela_f2", name: "Ekala" }] },
      ],
    },
    {
      id: "galle",
      name: "Galle",
      center: [6.0535, 80.2170],
      cscs: [
        { id: "ambalangoda", name: "Ambalangoda", center: [6.2354, 80.0538], feeders: [{ id: "ambalangoda_f1", name: "Ambalangoda" }, { id: "ambalangoda_f2", name: "Balapitiya" }] },
        { id: "hikkaduwa", name: "Hikkaduwa", center: [6.1395, 80.1006], feeders: [{ id: "hikkaduwa_f1", name: "Hikkaduwa" }, { id: "hikkaduwa_f2", name: "Dodanduwa" }] },
        { id: "galle_csc", name: "Galle", center: [6.0535, 80.2170], feeders: [{ id: "galle_f1", name: "Galle Fort" }, { id: "galle_f2", name: "Karapitiya" }] },
      ],
    },
  ],
};

const DEFAULT_CENTER: [number, number] = [6.9271, 79.8612];

// Deterministic small offset so each feeder sits at a distinct point near its CSC.
function feederCenter(cscCenter: [number, number], feederId: string): [number, number] {
  let h = 0;
  for (let i = 0; i < feederId.length; i++) h = (h * 31 + feederId.charCodeAt(i)) & 0xffff;
  const dLat = (((h & 0xff) / 255) - 0.5) * 0.018;
  const dLng = ((((h >> 8) & 0xff) / 255) - 0.5) * 0.018;
  return [cscCenter[0] + dLat, cscCenter[1] + dLng];
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 131 + s.charCodeAt(i)) & 0x7fffffff;
  return h;
}

const routeKey = (sub: [number, number], t: [number, number]) =>
  `${sub[0]}_${sub[1]}--${t[0]}_${t[1]}`;

const fallbackRoute = (sub: [number, number], t: [number, number]): Array<[number, number]> => [
  sub,
  [sub[0], t[1]],
  t,
];

// Deterministic per-feeder forecast so aggregate stats are a real roll-up of
// whatever is in scope (a single feeder, a CSC's feeders, a branch, or all).
function feederMetrics(feederId: string): { peak: number; energy: number; peakHour: number } {
  const h = hashStr(feederId);
  const peak = 3.2 + (h % 40) / 10; // ~3.2-7.1 MW per feeder
  const loadFactor = 0.55 + ((h >> 3) % 26) / 100; // 0.55-0.80
  const energy = peak * 24 * loadFactor;
  const peakHour = 17 + ((h >> 5) % 4); // 17:00-20:00
  return { peak, energy, peakHour };
}

interface LayerVisibility {
  branchHq: boolean;
  cscHq: boolean;
  feeder: boolean;
  substation: boolean;
  distribution: boolean;
  transformer: boolean;
  meterEndpoint: boolean;
  distributedBattery: boolean;
  distributedSolar: boolean;
  evse: boolean;
  utilityBattery: boolean;
  utilitySolar: boolean;
  recloser: boolean;
  transmission: boolean;
}

// Dynamically frame the map to the current scope: fit to all site centers when
// several feeders are in view (e.g. all branches), otherwise center + zoom in.
function MapView({
  sites,
  center,
  zoom,
}: {
  sites: Array<[number, number]>;
  center: [number, number];
  zoom: number;
}) {
  const map = useMap();
  useEffect(() => {
    if (sites.length > 1) {
      map.fitBounds(L.latLngBounds(sites), { padding: [60, 60], animate: true });
    } else {
      map.setView(center, zoom, { animate: true });
    }
  }, [sites, center, zoom, map]);
  return null;
}

// Lift the map's live zoom level into React state so the level of detail can
// respond to the user scrolling/zooming, not just to filter changes.
function ZoomWatcher({ onZoom }: { onZoom: (z: number) => void }) {
  const map = useMapEvents({
    zoomend: () => onZoom(map.getZoom()),
  });
  return null;
}

export function ForecastPlusMap() {
  const [branch, setBranch] = useState("nugegoda");
  const [csc, setCsc] = useState("maharagama");
  const [feeder, setFeeder] = useState("all");
  const [selectedNode, setSelectedNode] = useState<MapNodeDetails | null>(null);

  const handleFilterToNode = (n: MapNodeDetails) => {
    if (n.branchId) {
      setBranch(n.branchId);
      setCsc("all");
      setFeeder("all");
    } else if (n.branchName) {
      const foundBranch = LECO_DATA.branches.find(b => b.name === n.branchName);
      if (foundBranch) {
        setBranch(foundBranch.id);
        setCsc("all");
        setFeeder("all");
      }
    }
    if (n.cscId) {
      setCsc(n.cscId);
      setFeeder("all");
    } else if (n.cscName) {
      const foundBranch = LECO_DATA.branches.find(b => b.cscs.some(c => c.name === n.cscName));
      if (foundBranch) {
        setBranch(foundBranch.id);
        const foundCsc = foundBranch.cscs.find(c => c.name === n.cscName);
        if (foundCsc) setCsc(foundCsc.id);
        setFeeder("all");
      }
    }
    if (n.feederId) {
      setFeeder(n.feederId);
    }
  };

  // Default view: core network layers only. Everything else is opt-in.
  const [layers, setLayers] = useState<LayerVisibility>({
    branchHq: false,
    cscHq: false,
    feeder: true,
    substation: true,
    distribution: true,
    transformer: true,
    meterEndpoint: true,
    distributedBattery: false,
    distributedSolar: false,
    evse: false,
    utilityBattery: false,
    utilitySolar: false,
    recloser: false,
    transmission: false,
  });

  const [legendOpen, setLegendOpen] = useState(false);

  // Live map zoom level, updated as the user scrolls/zooms (not just on filter
  // changes). Seeded to the initial filter-derived zoom below (zoom level 14 for CSC view).
  const [liveZoom, setLiveZoom] = useState(14);

  const availableCscs = useMemo(() => {
    if (branch === "all") return [];
    return LECO_DATA.branches.find(b => b.id === branch)?.cscs || [];
  }, [branch]);

  const availableFeeders = useMemo(() => {
    if (csc === "all") return [];
    return availableCscs.find(c => c.id === csc)?.feeders || [];
  }, [csc, availableCscs]);

  const handleBranchChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setBranch(e.target.value);
    setCsc("all");
    setFeeder("all");
  };

  const handleCscChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setCsc(e.target.value);
    setFeeder("all");
  };

  const toggleLayer = (key: keyof LayerVisibility) => {
    setLayers(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const seed = useMemo(() => {
    let s = 1;
    if (branch !== "all") s += 2;
    if (csc !== "all") s += 3;
    if (feeder !== "all") s += 5;
    return s;
  }, [branch, csc, feeder]);

  const mapCenter = useMemo<[number, number]>(() => {
    const b = LECO_DATA.branches.find(x => x.id === branch);
    if (!b) return DEFAULT_CENTER;
    const c = b.cscs.find(x => x.id === csc);
    if (!c) return b.center;
    const f = c.feeders.find(x => x.id === feeder);
    if (!f) return c.center;
    return feederCenter(c.center, f.id);
  }, [branch, csc, feeder]);

  const mapZoom = useMemo(() => {
    if (feeder !== "all") return 16;
    if (csc !== "all") return 14;
    if (branch !== "all") return 12;
    return 11;
  }, [branch, csc, feeder]);

  // Org-hierarchy markers scoped to the current drill-down so the map stays readable:
  // all Branch HQs at the top level, then CSC HQs within a branch, then Feeders within a CSC.
  const orgMarkers = useMemo(() => {
    const selectedBranch = LECO_DATA.branches.find(b => b.id === branch);
    const branchHqs = selectedBranch ? [selectedBranch] : LECO_DATA.branches;

    const cscHqs = selectedBranch
      ? (csc === "all" ? selectedBranch.cscs : selectedBranch.cscs.filter(c => c.id === csc))
      : [];

    const selectedCsc = selectedBranch?.cscs.find(c => c.id === csc);
    const feeders = selectedCsc
      ? selectedCsc.feeders.map(f => ({
          id: f.id,
          name: f.name,
          csc: selectedCsc.name,
          center: feederCenter(selectedCsc.center, f.id),
        }))
      : [];

    return { branchHqs, cscHqs, feeders };
  }, [branch, csc]);

  // One grid "site" per feeder in scope, positioned at that feeder's location.
  // This is what makes the network span the whole selection: a single feeder at
  // full detail, or every feeder across all branches at once.
  const scopeSites = useMemo(() => {
    const branches = branch === "all"
      ? LECO_DATA.branches
      : LECO_DATA.branches.filter(b => b.id === branch);
    const sites: Array<{
      feederId: string;
      feederName: string;
      cscName: string;
      branchName: string;
      center: [number, number];
    }> = [];
    branches.forEach(b => {
      const cscs = csc === "all" ? b.cscs : b.cscs.filter(c => c.id === csc);
      cscs.forEach(c => {
        const feeders = feeder === "all" ? c.feeders : c.feeders.filter(f => f.id === feeder);
        feeders.forEach(f => sites.push({
          feederId: f.id,
          feederName: f.name,
          cscName: c.name,
          branchName: b.name,
          center: feederCenter(c.center, f.id),
        }));
      });
    });
    return sites;
  }, [branch, csc, feeder]);

  // Stable array of site centers for MapView. Derived from the memoized
  // scopeSites so its identity only changes when the filter scope changes —
  // NOT on every render (e.g. a zoom-triggered re-render), which would
  // otherwise make MapView re-fit the bounds and fight the user's scroll-zoom.
  const scopeCenters = useMemo(() => scopeSites.map(s => s.center), [scopeSites]);

  // Level of detail scales inversely with how many feeders are on screen: fewer
  // transformers per site and no meter endpoints at wide scopes so the map stays
  // legible. Distribution lines are always road-routed (see the throttled fetch
  // below) so they stay aligned to streets at every zoom level.
  const detail = useMemo(() => {
    const n = scopeSites.length;
    // Zoom drives how much detail to draw; the scope size caps it so a wide
    // selection (e.g. all branches) can never explode into thousands of markers.
    const zoomTx = liveZoom >= 15 ? 8 : liveZoom >= 13 ? 5 : 3;
    const scopeTx = n <= 2 ? 8 : n <= 8 ? 5 : 3;
    return {
      txPerSite: Math.min(zoomTx, scopeTx),
      showMeters: liveZoom >= 14 && n <= 2,
    };
  }, [scopeSites.length, liveZoom]);

  // Generate grid network data for every site in scope.
  const baseGrid = useMemo(() => {
    return scopeSites.map((s, si) => {
      const [cLat, cLng] = s.center;
      // Distribution transformers arranged in a ring around the feeder
      // substation, so the MV feeder lines fan out across the street network.
      const transformers: Array<{ id: string; pos: [number, number]; name: string }> = [];
      for (let i = 0; i < detail.txPerSite; i++) {
        const angle = (i / detail.txPerSite) * Math.PI * 2 + (si + seed) * 0.15;
        const ring = 0.0026 + ((i + seed) % 3) * 0.0011;
        transformers.push({
          id: `${s.feederId}-t${i + 1}`,
          pos: [cLat + Math.sin(angle) * ring, cLng + Math.cos(angle) * ring],
          name: `${s.feederName} Tx ${String(i + 1).padStart(2, "0")}`,
        });
      }
      return { ...s, substation: s.center, transformers };
    });
  }, [scopeSites, detail.txPerSite, seed]);

  const [roadRoutes, setRoadRoutes] = useState<Record<string, Array<[number, number]>>>({});

  // Fetch OSRM road paths so distribution lines follow the street network at
  // every scope. A wide view (all branches) can need ~140 routes, so we run them
  // through a small concurrency-limited queue rather than firing all at once,
  // which would get rate-limited by the public OSRM server.
  useEffect(() => {
    let cancelled = false;

    const jobs: Array<{ key: string; sub: [number, number]; pos: [number, number] }> = [];
    baseGrid.forEach(site => {
      site.transformers.forEach(t => {
        const key = routeKey(site.substation, t.pos);
        if (!roadRoutes[key]) jobs.push({ key, sub: site.substation, pos: t.pos });
      });
    });
    if (jobs.length === 0) return;

    let next = 0;
    const CONCURRENCY = 6;

    const runNext = (): Promise<void> => {
      if (cancelled) return Promise.resolve();
      const job = jobs[next++];
      if (!job) return Promise.resolve();

      const url = `https://router.project-osrm.org/route/v1/driving/${job.sub[1]},${job.sub[0]};${job.pos[1]},${job.pos[0]}?geometries=geojson&overview=full`;

      return fetch(url)
        .then(res => res.json())
        .then(data => {
          if (cancelled) return;
          if (data.code === "Ok" && data.routes?.[0]?.geometry?.coordinates) {
            const coords: Array<[number, number]> = data.routes[0].geometry.coordinates.map(
              (c: [number, number]) => [c[1], c[0]]
            );
            setRoadRoutes(prev => ({ ...prev, [job.key]: coords }));
          } else {
            setRoadRoutes(prev => ({ ...prev, [job.key]: fallbackRoute(job.sub, job.pos) }));
          }
        })
        .catch(() => {
          if (!cancelled) setRoadRoutes(prev => ({ ...prev, [job.key]: fallbackRoute(job.sub, job.pos) }));
        })
        .then(runNext);
    };

    Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, () => runNext())
    );

    return () => { cancelled = true; };
  }, [baseGrid]);

  // Sample meter endpoints evenly along each transformer's actual road path so
  // meters and their service drops hug the streets (matching the reference map).
  const consumers = useMemo(() => {
    const out: Array<{
      id: string;
      pos: [number, number];
      roadPoint: [number, number];
      der?: "solar" | "ev" | "battery";
    }> = [];
    if (!detail.showMeters) return out;

    let cId = 0;
    const allTransformers = baseGrid.flatMap(site =>
      site.transformers.map(t => ({ substation: site.substation, t }))
    );
    allTransformers.forEach(({ substation, t }) => {
      const path = roadRoutes[routeKey(substation, t.pos)] || fallbackRoute(substation, t.pos);
      if (path.length < 2) return;

      // Cumulative length so we can space meters evenly along the route.
      const cum: number[] = [0];
      for (let i = 1; i < path.length; i++) {
        const dLat = path[i][0] - path[i - 1][0];
        const dLng = path[i][1] - path[i - 1][1];
        cum.push(cum[i - 1] + Math.hypot(dLat, dLng));
      }
      const total = cum[cum.length - 1];
      if (total === 0) return;

      const count = 14;
      for (let k = 1; k <= count; k++) {
        const target = (k / (count + 1)) * total;
        let seg = 1;
        while (seg < cum.length - 1 && cum[seg] < target) seg++;
        const segLen = cum[seg] - cum[seg - 1] || 1;
        const f = (target - cum[seg - 1]) / segLen;
        const rLat = path[seg - 1][0] + (path[seg][0] - path[seg - 1][0]) * f;
        const rLng = path[seg - 1][1] + (path[seg][1] - path[seg - 1][1]) * f;

        // Perpendicular offset to place the house off the road, alternating sides.
        const dLat = path[seg][0] - path[seg - 1][0];
        const dLng = path[seg][1] - path[seg - 1][1];
        const len = Math.hypot(dLat, dLng) || 1;
        const side = k % 2 === 0 ? 1 : -1;
        const offset = 0.00022 * side;
        const houseLat = rLat + (-dLng / len) * offset;
        const houseLng = rLng + (dLat / len) * offset;

        let der: "solar" | "ev" | "battery" | undefined;
        if ((cId + seed) % 5 === 0) der = "solar";
        else if ((cId + seed) % 9 === 0) der = "ev";
        else if ((cId + seed) % 13 === 0) der = "battery";

        out.push({ id: `meter-${cId++}`, pos: [houseLat, houseLng], roadPoint: [rLat, rLng], der });
      }
    });
    return out;
  }, [baseGrid, roadRoutes, seed, detail.showMeters]);

  // Aggregate forecast stats rolled up over exactly the feeders in scope.
  const stats = useMemo(() => {
    const metrics = scopeSites.map(s => feederMetrics(s.feederId));
    const peak = metrics.reduce((s, m) => s + m.peak, 0);
    const energy = metrics.reduce((s, m) => s + m.energy, 0);
    // Time of system peak is driven by the largest feeder in scope.
    const peakHour = metrics.length
      ? metrics.reduce((a, b) => (b.peak > a.peak ? b : a)).peakHour
      : 18;
    // Deterministic deviation vs. seasonal average for this scope (-4% .. +8%).
    const scopeKey = `${branch}|${csc}|${feeder}`;
    const vsAverage = ((hashStr(scopeKey) % 120) / 10) - 4;
    const fmtStat = (v: number) => {
      const abs = Math.abs(v);
      if (abs >= 10) return v.toFixed(1);
      if (abs >= 1) return v.toFixed(2);
      if (abs >= 0.01) return v.toFixed(3);
      return v.toFixed(4);
    };
    return {
      peakVal: fmtStat(peak),
      energyVal: fmtStat(energy),
      timeHour: peakHour,
      vsAverage,
      feederCount: scopeSites.length,
    };
  }, [scopeSites, branch, csc, feeder]);

  const { peakVal, energyVal, timeHour } = stats;

  // Human-readable description of the active filter scope.
  const scopeLabel = useMemo(() => {
    const b = LECO_DATA.branches.find(x => x.id === branch);
    if (!b) return "All Branches";
    const c = b.cscs.find(x => x.id === csc);
    if (!c) return `${b.name} Branch`;
    const f = c.feeders.find(x => x.id === feeder);
    if (!f) return `${c.name} CSC`;
    return `${f.name} Feeder`;
  }, [branch, csc, feeder]);

  // Grouped top-down: organization -> network (HV to LV) -> DER & storage -> protection.
  const legendGroups: Array<{
    title: string;
    items: Array<{ key: keyof LayerVisibility; label: string; icon: typeof Zap; color: string }>;
  }> = [
    {
      title: "Organization",
      items: [
        { key: "branchHq", label: "Branch HQ", icon: Building2, color: "text-indigo-700" },
        { key: "cscHq", label: "CSC HQ", icon: Building, color: "text-cyan-700" },
        { key: "feeder", label: "Feeder", icon: Waypoints, color: "text-rose-600" },
      ],
    },
    {
      title: "Network",
      items: [
        { key: "transmission", label: "Transmission Line", icon: Cable, color: "text-teal-600" },
        { key: "substation", label: "Substation", icon: Cable, color: "text-blue-600" },
        { key: "distribution", label: "Distribution Line", icon: Activity, color: "text-sky-500" },
        { key: "transformer", label: "Distribution Transformer", icon: Zap, color: "text-blue-500" },
        { key: "meterEndpoint", label: "Meter Endpoint", icon: Grid, color: "text-slate-800" },
      ],
    },
    {
      title: "DER & Storage",
      items: [
        { key: "distributedSolar", label: "Distributed Solar", icon: Sun, color: "text-amber-500" },
        { key: "distributedBattery", label: "Distributed Battery", icon: Battery, color: "text-purple-600" },
        { key: "evse", label: "EVSE", icon: BatteryCharging, color: "text-emerald-600" },
        { key: "utilitySolar", label: "Utility Solar", icon: Sun, color: "text-orange-500" },
        { key: "utilityBattery", label: "Utility Battery", icon: Battery, color: "text-indigo-600" },
      ],
    },
    {
      title: "Protection",
      items: [
        { key: "recloser", label: "Recloser", icon: Radio, color: "text-rose-500" },
      ],
    },
  ];

  // The marker/line layers depend only on the filter scope, zoom-derived
  // detail, and fetched routes -- never on `selectedNode`. Memoizing the
  // element keeps its reference stable, so opening/closing the detail panel
  // (a `selectedNode` change) makes React skip re-reconciling the hundreds of
  // Leaflet layers instead of rebinding every marker's handlers.
  const markerLayers = useMemo(
    () => (
      <>
            {/* LECO Org Hierarchy: Branch HQ */}
            {layers.branchHq && orgMarkers.branchHqs.map(b => {
              const nodeData: MapNodeDetails = {
                id: b.id,
                name: `${b.name} Branch HQ`,
                type: "branch",
                typeName: "Branch HQ",
                branchId: b.id,
                branchName: b.name,
                center: b.center,
                status: "Normal"
              };
              return (
                <Marker
                  key={`branch-${b.id}`}
                  position={b.center}
                  icon={branchHqIcon}
                  eventHandlers={{ click: () => setSelectedNode(nodeData) }}
                >
                  <Popup>
                    <div className="text-xs font-semibold">{b.name} Branch HQ</div>
                    <div className="text-[11px] text-muted-foreground mb-1.5">LECO Branch Office &middot; {b.cscs.length} CSCs</div>
                    <button
                      type="button"
                      onClick={() => setSelectedNode(nodeData)}
                      className="px-2 py-1 bg-primary text-primary-foreground text-[10px] font-semibold rounded shadow-xs hover:bg-primary/90 transition-colors w-full"
                    >
                      View Branch Forecast
                    </button>
                  </Popup>
                </Marker>
              );
            })}

            {/* LECO Org Hierarchy: CSC HQ */}
            {layers.cscHq && orgMarkers.cscHqs.map(c => {
              const nodeData: MapNodeDetails = {
                id: c.id,
                name: `${c.name} CSC HQ`,
                type: "csc",
                typeName: "CSC HQ",
                cscId: c.id,
                cscName: c.name,
                center: c.center,
                status: "Normal"
              };
              return (
                <Marker
                  key={`csc-${c.id}`}
                  position={c.center}
                  icon={cscHqIcon}
                  eventHandlers={{ click: () => setSelectedNode(nodeData) }}
                >
                  <Popup>
                    <div className="text-xs font-semibold">{c.name} CSC HQ</div>
                    <div className="text-[11px] text-muted-foreground mb-1.5">Consumer Service Center &middot; {c.feeders.length} feeders</div>
                    <button
                      type="button"
                      onClick={() => setSelectedNode(nodeData)}
                      className="px-2 py-1 bg-primary text-primary-foreground text-[10px] font-semibold rounded shadow-xs hover:bg-primary/90 transition-colors w-full"
                    >
                      View CSC Forecast
                    </button>
                  </Popup>
                </Marker>
              );
            })}

            {/* LECO Org Hierarchy: Feeders */}
            {layers.feeder && orgMarkers.feeders.map(f => {
              const nodeData: MapNodeDetails = {
                id: f.id,
                name: `${f.name} Feeder`,
                type: "feeder",
                typeName: "Feeder Line",
                feederId: f.id,
                feederName: f.name,
                cscName: f.csc,
                center: f.center,
                status: "Normal"
              };
              return (
                <Marker
                  key={`feeder-${f.id}`}
                  position={f.center}
                  icon={feederIcon}
                  eventHandlers={{ click: () => setSelectedNode(nodeData) }}
                >
                  <Popup>
                    <div className="text-xs font-semibold">{f.name} Feeder</div>
                    <div className="text-[11px] text-muted-foreground mb-1.5">{f.csc} CSC</div>
                    <button
                      type="button"
                      onClick={() => setSelectedNode(nodeData)}
                      className="px-2 py-1 bg-primary text-primary-foreground text-[10px] font-semibold rounded shadow-xs hover:bg-primary/90 transition-colors w-full"
                    >
                      View Feeder Forecast
                    </button>
                  </Popup>
                </Marker>
              );
            })}

            {/* Distribution Lines following OSM Road Network */}
            {layers.distribution && baseGrid.flatMap(site =>
              site.transformers.map(t => {
                const key = routeKey(site.substation, t.pos);
                const path = roadRoutes[key] || fallbackRoute(site.substation, t.pos);
                return (
                  <Polyline
                    key={key}
                    positions={path}
                    pathOptions={{ color: '#0284c7', weight: 3.5, opacity: 0.9 }}
                    eventHandlers={{
                      click: () => setSelectedNode({
                        id: `feeder-${site.feederId}`,
                        name: `${site.feederName} Distribution Line`,
                        type: "feeder",
                        typeName: "11kV Distribution Line",
                        branchName: site.branchName,
                        cscName: site.cscName,
                        feederName: site.feederName,
                        status: "Normal"
                      })
                    }}
                  />
                );
              })
            )}

            {/* Service Drop Lines */}
            {layers.distribution && consumers.map(c => (
              <Polyline
                key={`drop-${c.id}`}
                positions={[c.pos, c.roadPoint]}
                pathOptions={{ color: '#38bdf8', weight: 1.5, opacity: 0.7, dashArray: '3 3' }}
              />
            ))}

            {/* Substation Markers (one per feeder in scope) */}
            {layers.substation && baseGrid.map(site => {
              const nodeData: MapNodeDetails = {
                id: `sub-${site.feederId}`,
                name: `${site.feederName} Substation`,
                type: "substation",
                typeName: "Primary Substation",
                branchName: site.branchName,
                cscName: site.cscName,
                feederName: site.feederName,
                center: site.substation,
                status: "Normal"
              };
              return (
                <Marker
                  key={`sub-${site.feederId}`}
                  position={site.substation}
                  icon={substationIcon}
                  eventHandlers={{ click: () => setSelectedNode(nodeData) }}
                >
                  <Popup>
                    <div className="text-xs font-semibold">{site.feederName} Substation</div>
                    <div className="text-[11px] text-muted-foreground">{site.cscName} CSC &middot; {site.branchName} Branch</div>
                    <div className="text-[11px] text-muted-foreground font-mono mb-1.5">ID: SUB-{site.feederId.toUpperCase()}</div>
                    <button
                      type="button"
                      onClick={() => setSelectedNode(nodeData)}
                      className="px-2 py-1 bg-primary text-primary-foreground text-[10px] font-semibold rounded shadow-xs hover:bg-primary/90 transition-colors w-full"
                    >
                      View Substation Forecast
                    </button>
                  </Popup>
                </Marker>
              );
            })}

            {/* Transformers */}
            {layers.transformer && baseGrid.flatMap(site =>
              site.transformers.map(t => {
                const nodeData: MapNodeDetails = {
                  id: t.id,
                  name: t.name,
                  type: "transformer",
                  typeName: "Distribution Transformer",
                  branchName: site.branchName,
                  cscName: site.cscName,
                  feederName: site.feederName,
                  center: t.pos,
                  status: "Optimal"
                };
                return (
                  <Marker
                    key={t.id}
                    position={t.pos}
                    icon={transformerIcon}
                    eventHandlers={{ click: () => setSelectedNode(nodeData) }}
                  >
                    <Popup>
                      <div className="text-xs font-semibold">{t.name}</div>
                      <div className="text-[11px] text-muted-foreground mb-1.5">Distribution Transformer 11kV/400V</div>
                      <button
                        type="button"
                        onClick={() => setSelectedNode(nodeData)}
                        className="px-2 py-1 bg-primary text-primary-foreground text-[10px] font-semibold rounded shadow-xs hover:bg-primary/90 transition-colors w-full"
                      >
                        View Transformer Forecast
                      </button>
                    </Popup>
                  </Marker>
                );
              })
            )}

            {/* Meter Endpoints & DERs */}
            {consumers.map(c => {
              const meterNode: MapNodeDetails = {
                id: c.id,
                name: `AMI Smart Meter (${c.id})`,
                type: "meterEndpoint",
                typeName: "Smart Meter Endpoint",
                center: c.pos,
                status: "Normal"
              };
              const solarNode: MapNodeDetails = {
                id: `pv-${c.id}`,
                name: `Rooftop Solar PV (${c.id})`,
                type: "distributedSolar",
                typeName: "Distributed Solar PV",
                center: c.pos,
                status: "Active"
              };
              const evNode: MapNodeDetails = {
                id: `ev-${c.id}`,
                name: `EV Charger EVSE (${c.id})`,
                type: "evse",
                typeName: "EV Fast Charger",
                center: c.pos,
                status: "Active"
              };
              const batteryNode: MapNodeDetails = {
                id: `bess-${c.id}`,
                name: `Battery Storage BESS (${c.id})`,
                type: "distributedBattery",
                typeName: "Distributed Battery BESS",
                center: c.pos,
                status: "Optimal"
              };

              return (
                <React.Fragment key={c.id}>
                  {layers.meterEndpoint && (
                    <CircleMarker 
                      center={c.pos} 
                      radius={4.5} 
                      pathOptions={{ color: '#ffffff', fillColor: '#0f172a', fillOpacity: 1, weight: 1.5 }}
                      eventHandlers={{ click: () => setSelectedNode(meterNode) }}
                    >
                      <Popup>
                        <div className="text-xs font-semibold">Meter Endpoint</div>
                        <div className="text-[11px] text-muted-foreground mb-1.5">AMI Smart Meter &middot; <span className="font-mono">ID: {c.id}</span></div>
                        <button
                          type="button"
                          onClick={() => setSelectedNode(meterNode)}
                          className="px-2 py-1 bg-primary text-primary-foreground text-[10px] font-semibold rounded shadow-xs hover:bg-primary/90 transition-colors w-full"
                        >
                          View Meter Forecast
                        </button>
                      </Popup>
                    </CircleMarker>
                  )}

                  {/* Distributed Solar */}
                  {layers.distributedSolar && c.der === "solar" && (
                    <Marker
                      position={[c.pos[0] + 0.00008, c.pos[1] + 0.00008]}
                      icon={distributedSolarIcon}
                      eventHandlers={{ click: () => setSelectedNode(solarNode) }}
                    >
                      <Popup>
                        <div className="text-xs font-semibold">Distributed Solar</div>
                        <div className="text-[11px] text-muted-foreground mb-1.5">Rooftop Solar PV System</div>
                        <button
                          type="button"
                          onClick={() => setSelectedNode(solarNode)}
                          className="px-2 py-1 bg-amber-600 text-white text-[10px] font-semibold rounded shadow-xs hover:bg-amber-700 transition-colors w-full"
                        >
                          View Solar Forecast
                        </button>
                      </Popup>
                    </Marker>
                  )}

                  {/* EVSE */}
                  {layers.evse && c.der === "ev" && (
                    <Marker
                      position={[c.pos[0] + 0.00008, c.pos[1] + 0.00008]}
                      icon={evseIcon}
                      eventHandlers={{ click: () => setSelectedNode(evNode) }}
                    >
                      <Popup>
                        <div className="text-xs font-semibold">EVSE Charging Station</div>
                        <div className="text-[11px] text-muted-foreground mb-1.5">EV Supply Equipment</div>
                        <button
                          type="button"
                          onClick={() => setSelectedNode(evNode)}
                          className="px-2 py-1 bg-emerald-600 text-white text-[10px] font-semibold rounded shadow-xs hover:bg-emerald-700 transition-colors w-full"
                        >
                          View EVSE Forecast
                        </button>
                      </Popup>
                    </Marker>
                  )}

                  {/* Distributed Battery */}
                  {layers.distributedBattery && c.der === "battery" && (
                    <Marker
                      position={[c.pos[0] + 0.00008, c.pos[1] + 0.00008]}
                      icon={distributedBatteryIcon}
                      eventHandlers={{ click: () => setSelectedNode(batteryNode) }}
                    >
                      <Popup>
                        <div className="text-xs font-semibold">Distributed Battery Storage</div>
                        <div className="text-[11px] text-muted-foreground mb-1.5">Battery Storage (BESS)</div>
                        <button
                          type="button"
                          onClick={() => setSelectedNode(batteryNode)}
                          className="px-2 py-1 bg-purple-600 text-white text-[10px] font-semibold rounded shadow-xs hover:bg-purple-700 transition-colors w-full"
                        >
                          View Battery Forecast
                        </button>
                      </Popup>
                    </Marker>
                  )}
                </React.Fragment>
              );
            })}

      </>
    ),
    [layers, orgMarkers, baseGrid, roadRoutes, consumers]
  );

  return (
    <div className="flex flex-col w-full h-[calc(100vh-90px)] gap-4">
      {/* Top Bar (Filters & Data Summary) */}
      <div className="flex justify-between items-start gap-4 flex-wrap lg:flex-nowrap">
        
        {/* Filters Panel */}
        <div className="bg-card p-4 rounded-lg border border-border flex gap-4 items-end shadow-sm">
          <div>
            <label className="block text-xs text-muted-foreground mb-1 font-medium">Branch</label>
            <select 
              value={branch} 
              onChange={handleBranchChange}
              className="h-9 px-3 py-1 bg-background border border-border rounded-md text-sm min-w-[130px] focus:ring-1 focus:ring-primary"
            >
              <option value="all">All Branches</option>
              {LECO_DATA.branches.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1 font-medium">CSC</label>
            <select 
              value={csc} 
              onChange={handleCscChange}
              disabled={branch === "all"}
              className="h-9 px-3 py-1 bg-background border border-border rounded-md text-sm min-w-[130px] focus:ring-1 focus:ring-primary disabled:opacity-50"
            >
              <option value="all">All CSCs</option>
              {availableCscs.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1 font-medium">Feeder</label>
            <select 
              value={feeder} 
              onChange={(e) => setFeeder(e.target.value)}
              disabled={csc === "all"}
              className="h-9 px-3 py-1 bg-background border border-border rounded-md text-sm min-w-[130px] focus:ring-1 focus:ring-primary disabled:opacity-50"
            >
              <option value="all">All Feeders</option>
              {availableFeeders.map(f => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Summary Panel */}
        <div className="bg-card p-4 rounded-lg border border-border flex-1 lg:max-w-xl shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {scopeLabel}
            </span>
            <span className="text-[11px] text-muted-foreground">
              {stats.feederCount} feeder{stats.feederCount === 1 ? "" : "s"} in scope
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 items-center">
            <div className="flex flex-col border-r border-border/50 pr-4">
              <span className="text-xs text-muted-foreground flex items-center gap-1 mb-1 whitespace-nowrap">
                <Zap className="w-3 h-3 text-primary" /> Forecast Peak
              </span>
              <span className="font-bold text-lg">{peakVal} MW</span>
            </div>
            <div className="flex flex-col border-r border-border/50 pr-4">
              <span className="text-xs text-muted-foreground flex items-center gap-1 mb-1 whitespace-nowrap">
                <EnergyIcon className="w-3 h-3 text-amber-500" /> Forecast Energy
              </span>
              <span className="font-bold text-lg">{energyVal} MWh</span>
            </div>
            <div className="flex flex-col border-r border-border/50 pr-4">
              <span className="text-xs text-muted-foreground flex items-center gap-1 mb-1 whitespace-nowrap">
                <Clock className="w-3 h-3 text-blue-500" /> Time of Peak
              </span>
              <span className="font-bold text-lg">{timeHour}:00</span>
            </div>
            <div className="flex flex-col">
              <span className="text-xs text-muted-foreground flex items-center gap-1 mb-1 whitespace-nowrap">
                <Percent className="w-3 h-3 text-emerald-500" /> vs. Average
              </span>
              <span className={`font-bold text-lg ${stats.vsAverage >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                {stats.vsAverage >= 0 ? "+" : ""}{stats.vsAverage.toFixed(1)}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Map Area & Floating Overlay Container */}
      <div className="flex-1 min-h-0 relative rounded-lg overflow-hidden border border-border shadow-sm">
        
        {/* Full Width Map View */}
        <div className="w-full h-full">
          <MapContainer center={mapCenter} zoom={mapZoom} style={{ height: "100%", width: "100%", zIndex: 0 }}>
            <MapView sites={scopeCenters} center={mapCenter} zoom={mapZoom} />
            <ZoomWatcher onZoom={setLiveZoom} />

            {/* Carto Positron Crisp Light Tile Layer (100% Free & Reliable) */}
            <TileLayer
              attribution='&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
              maxZoom={19}
            />

            {markerLayers}
          </MapContainer>

          {/* Floating Right-Side Layer Legend Box (collapsible) */}
          <div className="absolute top-4 right-4 z-[400] bg-background/95 backdrop-blur-md rounded-lg border border-border shadow-xl w-60 text-xs overflow-hidden">
            <button
              type="button"
              onClick={() => setLegendOpen(o => !o)}
              className="w-full flex items-center justify-between px-3 py-2 hover:bg-accent/40 transition-colors"
            >
              <span className="flex items-center gap-2 font-semibold text-muted-foreground uppercase text-[10px] tracking-wider">
                <Layers className="w-3.5 h-3.5 text-primary" /> Grid Layers
              </span>
              {legendOpen
                ? <ChevronDown className="w-4 h-4 text-muted-foreground" />
                : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
            </button>

            {legendOpen && (
              <div className="max-h-[calc(100vh-300px)] overflow-y-auto border-t border-border/40">
                {legendGroups.map(group => (
                  <div key={group.title} className="border-b border-border/40 last:border-b-0">
                    <div className="px-3 pt-2 pb-1 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                      {group.title}
                    </div>
                    {group.items.map(({ key, label, icon: Icon, color }) => {
                      const active = layers[key];
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => toggleLayer(key)}
                          className={`w-full flex items-center justify-between px-3 py-1.5 hover:bg-accent/60 transition-colors text-left ${
                            active ? "bg-accent/40 text-foreground font-medium" : "text-muted-foreground"
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${color}`} />
                            <span className="truncate">{label}</span>
                          </div>
                          {active && <Check className="w-3.5 h-3.5 text-primary flex-shrink-0 ml-1" />}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

        {/* System-Wide Side Panel Overlay & Backdrop */}
        {selectedNode && (
          <>
            {/* Full Viewport Backdrop */}
            <div
              className="fixed inset-0 z-[9998] bg-black/40 dark:bg-black/60 backdrop-blur-xs animate-in fade-in duration-200 cursor-pointer"
              onClick={() => setSelectedNode(null)}
              aria-label="Click away to close node panel"
            />

            {/* System-Wide Slide-Out Panel Wrapper */}
            <div
              className="fixed top-0 right-0 bottom-0 z-[9999] w-[95%] sm:w-[90%] md:w-[850px] lg:w-[980px] xl:w-[1100px] max-w-full shadow-2xl bg-background border-l border-border animate-in slide-in-from-right duration-300"
              onClick={(e) => e.stopPropagation()}
            >
              <NodeDetailPanel
                node={selectedNode}
                onClose={() => setSelectedNode(null)}
                onFilterToNode={handleFilterToNode}
              />
            </div>
          </>
        )}

      </div>
    </div>
  );
}
