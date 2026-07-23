import React, { useState, useMemo, useEffect } from "react";
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
import { MapContainer, TileLayer, Marker, Popup, CircleMarker, Polyline, useMap } from "react-leaflet";
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
const feederIcon = createCustomIcon(<Cable className="w-4 h-4 text-red-600" />, "border-red-500 bg-red-50", 24);
const solarIcon = createCustomIcon(<Sun className="w-3.5 h-3.5 text-amber-600" />, "border-amber-500 bg-amber-50", 18);
const evIcon = createCustomIcon(<BatteryCharging className="w-3.5 h-3.5 text-emerald-600" />, "border-emerald-500 bg-emerald-50", 18);
const batteryIcon = createCustomIcon(<Battery className="w-3.5 h-3.5 text-purple-600" />, "border-purple-500 bg-purple-50", 18);
const branchHqIcon = createCustomIcon(<Building2 className="w-4 h-4 text-indigo-700" />, "border-indigo-600 bg-indigo-50", 28);
const cscHqIcon = createCustomIcon(<Building className="w-3.5 h-3.5 text-cyan-700" />, "border-cyan-600 bg-cyan-50", 24);
const feederIconMarker = createCustomIcon(<Waypoints className="w-3.5 h-3.5 text-rose-600" />, "border-rose-500 bg-rose-50", 20);

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

// Component to dynamically re-center Leaflet map when selection changes
function MapRecenter({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom, { animate: true });
  }, [center, zoom, map]);
  return null;
}

export function ForecastPlusMap() {
  const [branch, setBranch] = useState("all");
  const [csc, setCsc] = useState("all");
  const [feeder, setFeeder] = useState("all");

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

  const [legendOpen, setLegendOpen] = useState(true);

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

  // Generate grid network data
  const baseGrid = useMemo(() => {
    const [cLat, cLng] = mapCenter;
    const feederSubstation: [number, number] = [cLat, cLng];
    
    // Distribution transformers arranged in a ring around the feeder substation,
    // so the MV feeder lines fan out across the surrounding street network.
    const TX_COUNT = 8;
    const transformers: Array<{ id: string; pos: [number, number]; name: string }> = [];
    for (let i = 0; i < TX_COUNT; i++) {
      const angle = (i / TX_COUNT) * Math.PI * 2 + seed * 0.15;
      const ring = 0.0026 + ((i + seed) % 3) * 0.0011;
      transformers.push({
        id: `t${i + 1}`,
        pos: [cLat + Math.sin(angle) * ring, cLng + Math.cos(angle) * ring],
        name: `Tx Substation ${String(i + 1).padStart(2, "0")}`,
      });
    }

    return { feederSubstation, transformers };
  }, [mapCenter, seed]);

  const [roadRoutes, setRoadRoutes] = useState<Record<string, Array<[number, number]>>>({});

  const routeKey = (sub: [number, number], t: [number, number]) =>
    `${sub[0]}_${sub[1]}--${t[0]}_${t[1]}`;

  const fallbackRoute = (sub: [number, number], t: [number, number]): Array<[number, number]> => [
    sub,
    [sub[0], t[1]],
    t,
  ];

  // Fetch OSRM road paths
  useEffect(() => {
    let isMounted = true;
    const { feederSubstation, transformers } = baseGrid;

    transformers.forEach(t => {
      const key = routeKey(feederSubstation, t.pos);
      if (roadRoutes[key]) return;

      const url = `https://router.project-osrm.org/route/v1/driving/${feederSubstation[1]},${feederSubstation[0]};${t.pos[1]},${t.pos[0]}?geometries=geojson&overview=full`;
      
      fetch(url)
        .then(res => res.json())
        .then(data => {
          if (!isMounted) return;
          if (data.code === "Ok" && data.routes?.[0]?.geometry?.coordinates) {
            const coords: Array<[number, number]> = data.routes[0].geometry.coordinates.map(
              (c: [number, number]) => [c[1], c[0]]
            );
            setRoadRoutes(prev => ({ ...prev, [key]: coords }));
          }
        })
        .catch(() => {
          setRoadRoutes(prev => ({ ...prev, [key]: fallbackRoute(feederSubstation, t.pos) }));
        });
    });

    return () => { isMounted = false; };
  }, [baseGrid]);

  // Sample meter endpoints evenly along each transformer's actual road path so
  // meters and their service drops hug the streets (matching the reference map).
  const consumers = useMemo(() => {
    const { feederSubstation, transformers } = baseGrid;
    const out: Array<{
      id: string;
      pos: [number, number];
      roadPoint: [number, number];
      der?: "solar" | "ev" | "battery";
    }> = [];

    let cId = 0;
    transformers.forEach(t => {
      const path = roadRoutes[routeKey(feederSubstation, t.pos)] || fallbackRoute(feederSubstation, t.pos);
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
  }, [baseGrid, roadRoutes, seed]);

  const peakVal = (45.2 + seed * 1.5).toFixed(1);
  const energyVal = (312.4 + seed * 10).toFixed(1);
  const timeHour = 17 + (seed % 3);

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
        { key: "transmission", label: "Transmission", icon: Cable, color: "text-teal-600" },
        { key: "substation", label: "Substation", icon: Cable, color: "text-blue-600" },
        { key: "distribution", label: "Distribution", icon: Activity, color: "text-sky-500" },
        { key: "transformer", label: "Transformer", icon: Zap, color: "text-blue-500" },
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
              <span className="font-bold text-lg text-emerald-600">+{(seed * 0.4).toFixed(1)}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Map Area with Leaflet & Floating Layer Legend */}
      <div className="flex-1 rounded-lg overflow-hidden border border-border relative shadow-sm">
        <MapContainer center={mapCenter} zoom={mapZoom} style={{ height: "100%", width: "100%", zIndex: 0 }}>
          <MapRecenter center={mapCenter} zoom={mapZoom} />

          {/* Carto Positron Crisp Light Tile Layer (100% Free & Reliable) */}
          <TileLayer
            attribution='&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            maxZoom={19}
          />

          {/* LECO Org Hierarchy: Branch HQ */}
          {layers.branchHq && orgMarkers.branchHqs.map(b => (
            <Marker key={`branch-${b.id}`} position={b.center} icon={branchHqIcon}>
              <Popup>
                <div className="text-xs font-semibold">{b.name} Branch HQ</div>
                <div className="text-[11px] text-muted-foreground">LECO Branch Office &middot; {b.cscs.length} CSCs</div>
              </Popup>
            </Marker>
          ))}

          {/* LECO Org Hierarchy: CSC HQ */}
          {layers.cscHq && orgMarkers.cscHqs.map(c => (
            <Marker key={`csc-${c.id}`} position={c.center} icon={cscHqIcon}>
              <Popup>
                <div className="text-xs font-semibold">{c.name} CSC</div>
                <div className="text-[11px] text-muted-foreground">Consumer Service Center &middot; {c.feeders.length} feeders</div>
              </Popup>
            </Marker>
          ))}

          {/* LECO Org Hierarchy: Feeders */}
          {layers.feeder && orgMarkers.feeders.map(f => (
            <Marker key={`feeder-${f.id}`} position={f.center} icon={feederIconMarker}>
              <Popup>
                <div className="text-xs font-semibold">{f.name} Feeder</div>
                <div className="text-[11px] text-muted-foreground">{f.csc} CSC</div>
              </Popup>
            </Marker>
          ))}

          {/* Distribution Lines following OSM Road Network */}
          {layers.distribution && baseGrid.transformers.map(t => {
            const key = routeKey(baseGrid.feederSubstation, t.pos);
            const path = roadRoutes[key] || fallbackRoute(baseGrid.feederSubstation, t.pos);
            return (
              <Polyline 
                key={key} 
                positions={path} 
                pathOptions={{ color: '#0284c7', weight: 3.5, opacity: 0.9 }} 
              />
            );
          })}

          {/* Service Drop Lines */}
          {layers.distribution && consumers.map(c => (
            <Polyline
              key={`drop-${c.id}`}
              positions={[c.pos, c.roadPoint]}
              pathOptions={{ color: '#38bdf8', weight: 1.5, opacity: 0.7, dashArray: '3 3' }}
            />
          ))}

          {/* Substation Marker */}
          {layers.substation && (
            <Marker position={baseGrid.feederSubstation} icon={feederIcon}>
              <Popup>
                <div className="text-xs font-semibold">LECO Primary Substation</div>
                <div className="text-[11px] text-muted-foreground font-mono">ID: SUB-COLOMBO-01</div>
              </Popup>
            </Marker>
          )}

          {/* Transformers */}
          {layers.transformer && baseGrid.transformers.map(t => (
            <Marker key={t.id} position={t.pos} icon={transformerIcon}>
              <Popup>
                <div className="text-xs font-semibold">{t.name}</div>
                <div className="text-[11px] text-muted-foreground">Distribution Transformer 11kV/400V</div>
              </Popup>
            </Marker>
          ))}

          {/* Meter Endpoints & DERs */}
          {consumers.map(c => (
            <React.Fragment key={c.id}>
              {layers.meterEndpoint && (
                <CircleMarker 
                  center={c.pos} 
                  radius={4} 
                  pathOptions={{ color: '#ffffff', fillColor: '#0f172a', fillOpacity: 1, weight: 1.5 }}
                >
                  <Popup>
                    <div className="text-xs font-semibold font-mono">AMI Meter Endpoint</div>
                    <div className="text-[10px] text-muted-foreground">ID: {c.id}</div>
                  </Popup>
                </CircleMarker>
              )}

              {/* Distributed Solar */}
              {layers.distributedSolar && c.der === "solar" && (
                <Marker position={[c.pos[0] + 0.00008, c.pos[1] + 0.00008]} icon={solarIcon}>
                  <Popup>Distributed Rooftop Solar PV</Popup>
                </Marker>
              )}

              {/* EVSE */}
              {layers.evse && c.der === "ev" && (
                <Marker position={[c.pos[0] + 0.00008, c.pos[1] + 0.00008]} icon={evIcon}>
                  <Popup>Electric Vehicle Supply Equipment (EVSE)</Popup>
                </Marker>
              )}

              {/* Distributed Battery */}
              {layers.distributedBattery && c.der === "battery" && (
                <Marker position={[c.pos[0] + 0.00008, c.pos[1] + 0.00008]} icon={batteryIcon}>
                  <Popup>Distributed Battery Storage (BESS)</Popup>
                </Marker>
              )}
            </React.Fragment>
          ))}

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
    </div>
  );
}
