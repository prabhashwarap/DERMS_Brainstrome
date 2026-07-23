import React, { useState, useMemo, useEffect, useRef } from "react";
import { NodeDetailPanel, lecoAccountNumber, type MapNodeDetails } from "./NodeDetailPanel";
import { Badge } from "@/components/ui/badge";
import { formatPower, formatEnergy } from "@/lib/utils";
import { useTheme } from "@/lib/useTheme";
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
  Layers,
  Search,
  X,
  RotateCcw,
  Sparkles,
  Filter,
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

// LECO Grid Hierarchy: Branch -> CSC (Consumer Service Center) -> Substation -> Feeder -> Transformer -> Consumer
// Source: Lanka Electricity Company (LECO) branch/CSC network (leco.lk).
// LECO operates 7 branches covering the urban Western & Southern coastal belt.
type Feeder = { id: string; name: string; center?: [number, number] };
type Csc = { id: string; name: string; center: [number, number]; substationName: string; feeders: Feeder[] };
type Branch = { id: string; name: string; center: [number, number]; cscs: Csc[] };

const LECO_DATA: { branches: Branch[] } = {
  branches: [
    {
      id: "kotte",
      name: "Kotte",
      center: [6.8912, 79.8995],
      cscs: [
        {
          id: "pitakotte",
          name: "Pita Kotte",
          center: [6.8855, 79.9030],
          substationName: "Pita Kotte Substation",
          feeders: [
            { id: "pitakotte_f1", name: "Pita Kotte", center: [6.8840, 79.9055] },
            { id: "pitakotte_f2", name: "Nawala", center: [6.8895, 79.8915] },
          ],
        },
        {
          id: "kolonnawa",
          name: "Kolonnawa",
          center: [6.9295, 79.8860],
          substationName: "Kolonnawa Substation",
          feeders: [
            { id: "kolonnawa_f1", name: "Kolonnawa", center: [6.9315, 79.8875] },
            { id: "kolonnawa_f2", name: "Wellampitiya", center: [6.9405, 79.8830] },
          ],
        },
        {
          id: "kotikawatta",
          name: "Kotikawatta",
          center: [6.9380, 79.9120],
          substationName: "Kotikawatta Substation",
          feeders: [
            { id: "kotikawatta_f1", name: "Kotikawatta", center: [6.9390, 79.9135] },
            { id: "kotikawatta_f2", name: "Angoda", center: [6.9280, 79.9250] },
          ],
        },
      ],
    },
    {
      id: "nugegoda",
      name: "Nugegoda",
      center: [6.8685, 79.8975],
      cscs: [
        {
          id: "boralesgamuwa",
          name: "Boralesgamuwa",
          center: [6.8390, 79.9015],
          substationName: "Boralesgamuwa Substation",
          feeders: [
            { id: "boralesgamuwa_f1", name: "Boralesgamuwa", center: [6.8405, 79.9030] },
            { id: "boralesgamuwa_f2", name: "Katuwawala", center: [6.8310, 79.9090] },
          ],
        },
        {
          id: "nugegoda_csc",
          name: "Nugegoda",
          center: [6.8710, 79.8910],
          substationName: "Nugegoda Substation",
          feeders: [
            { id: "nugegoda_f1", name: "Nugegoda Town", center: [6.8690, 79.8935] },
            { id: "nugegoda_f2", name: "Delkanda", center: [6.8580, 79.8995] },
          ],
        },
        {
          id: "maharagama",
          name: "Maharagama",
          center: [6.8465, 79.9260],
          substationName: "Maharagama Substation",
          feeders: [
            { id: "maharagama_f1", name: "Maharagama", center: [6.8475, 79.9285] },
            { id: "maharagama_f2", name: "Pannipitiya", center: [6.8430, 79.9480] },
          ],
        },
      ],
    },
    {
      id: "kelaniya",
      name: "Kelaniya",
      center: [6.9600, 79.9160],
      cscs: [
        {
          id: "dalugama",
          name: "Dalugama",
          center: [6.9635, 79.9180],
          substationName: "Dalugama Substation",
          feeders: [
            { id: "dalugama_f1", name: "Dalugama", center: [6.9645, 79.9195] },
            { id: "dalugama_f2", name: "Kiribathgoda", center: [6.9740, 79.9280] },
          ],
        },
        {
          id: "mahara",
          name: "Mahara",
          center: [7.0090, 79.9510],
          substationName: "Mahara Substation",
          feeders: [
            { id: "mahara_f1", name: "Mahara", center: [7.0110, 79.9525] },
            { id: "mahara_f2", name: "Kadawatha", center: [7.0020, 79.9535] },
          ],
        },
        {
          id: "kandana",
          name: "Kandana",
          center: [7.0460, 79.8970],
          substationName: "Kandana Substation",
          feeders: [
            { id: "kandana_f1", name: "Kandana", center: [7.0470, 79.8985] },
            { id: "kandana_f2", name: "Ragama", center: [7.0280, 79.9210] },
          ],
        },
        {
          id: "wattala",
          name: "Wattala",
          center: [6.9880, 79.8920],
          substationName: "Wattala Substation",
          feeders: [
            { id: "wattala_f1", name: "Wattala", center: [6.9890, 79.8935] },
            { id: "wattala_f2", name: "Hendala", center: [6.9830, 79.8820] },
          ],
        },
      ],
    },
    {
      id: "moratuwa",
      name: "Moratuwa",
      center: [6.7758, 79.8814],
      cscs: [
        {
          id: "moratuwa_north",
          name: "Moratuwa North",
          center: [6.8042, 79.8785],
          substationName: "Angulana Substation",
          feeders: [
            { id: "moratuwa_north_f1", name: "Rawatawatta", center: [6.7865, 79.8850] },
            { id: "angulana", name: "Velona / Angulana", center: [6.8020, 79.8770] },
          ],
        },
        {
          id: "moratuwa_south",
          name: "Moratuwa South",
          center: [6.7610, 79.8875],
          substationName: "Moratuwa South Substation",
          feeders: [
            { id: "moratuwa_south_f1", name: "Katubedda", center: [6.7970, 79.9010] },
            { id: "moratuwa_south_f2", name: "Koralawella", center: [6.7485, 79.8890] },
          ],
        },
        {
          id: "keselwatta",
          name: "Keselwatta",
          center: [6.7350, 79.9040],
          substationName: "Keselwatta Substation",
          feeders: [
            { id: "keselwatta_f1", name: "Keselwatta", center: [6.7360, 79.9025] },
            { id: "keselwatta_f2", name: "Wekada", center: [6.7230, 79.9080] },
          ],
        },
        {
          id: "panadura",
          name: "Panadura",
          center: [6.7135, 79.9065],
          substationName: "Panadura Substation",
          feeders: [
            { id: "panadura_f1", name: "Panadura Town", center: [6.7145, 79.9050] },
            { id: "panadura_f2", name: "Walana", center: [6.7260, 79.9160] },
          ],
        },
      ],
    },
    {
      id: "kalutara",
      name: "Kalutara",
      center: [6.5840, 79.9610],
      cscs: [
        {
          id: "payagala",
          name: "Payagala",
          center: [6.5180, 79.9790],
          substationName: "Payagala Substation",
          feeders: [
            { id: "payagala_f1", name: "Payagala", center: [6.5190, 79.9805] },
            { id: "payagala_f2", name: "Maggona", center: [6.4980, 79.9880] },
          ],
        },
        {
          id: "kalutara_csc",
          name: "Kalutara",
          center: [6.5855, 79.9620],
          substationName: "Kalutara Substation",
          feeders: [
            { id: "kalutara_f1", name: "Kalutara North", center: [6.5980, 79.9570] },
            { id: "kalutara_f2", name: "Kalutara South", center: [6.5740, 79.9660] },
          ],
        },
        {
          id: "aluthgama",
          name: "Aluthgama",
          center: [6.4320, 79.9980],
          substationName: "Aluthgama Substation",
          feeders: [
            { id: "aluthgama_f1", name: "Aluthgama", center: [6.4330, 79.9995] },
            { id: "aluthgama_f2", name: "Beruwala", center: [6.4780, 79.9830] },
          ],
        },
      ],
    },
    {
      id: "negombo",
      name: "Negombo",
      center: [7.2090, 79.8370],
      cscs: [
        {
          id: "negombo_csc",
          name: "Negombo",
          center: [7.2105, 79.8390],
          substationName: "Negombo Substation",
          feeders: [
            { id: "negombo_f1", name: "Negombo Town", center: [7.2115, 79.8380] },
            { id: "negombo_f2", name: "Kochchikade", center: [7.2650, 79.8510] },
          ],
        },
        {
          id: "seeduwa",
          name: "Seeduwa",
          center: [7.1700, 79.8850],
          substationName: "Katunayake Substation",
          feeders: [
            { id: "seeduwa_f1", name: "Seeduwa", center: [7.1430, 79.8810] },
            { id: "katunayake", name: "Seeduwa / Katunayake", center: [7.1720, 79.8870] },
          ],
        },
        {
          id: "jaela",
          name: "Ja-Ela",
          center: [7.0740, 79.8930],
          substationName: "Ja-Ela Substation",
          feeders: [
            { id: "jaela_f1", name: "Ja-Ela", center: [7.0750, 79.8945] },
            { id: "jaela_f2", name: "Ekala", center: [7.0890, 79.9120] },
          ],
        },
      ],
    },
    {
      id: "galle",
      name: "Galle",
      center: [6.0530, 80.2175],
      cscs: [
        {
          id: "ambalangoda",
          name: "Ambalangoda",
          center: [6.2360, 80.0540],
          substationName: "Ambalangoda Substation",
          feeders: [
            { id: "ambalangoda_f1", name: "Ambalangoda", center: [6.2370, 80.0555] },
            { id: "ambalangoda_f2", name: "Balapitiya", center: [6.2610, 80.0380] },
          ],
        },
        {
          id: "hikkaduwa",
          name: "Hikkaduwa",
          center: [6.1390, 80.1010],
          substationName: "Hikkaduwa Substation",
          feeders: [
            { id: "hikkaduwa_f1", name: "Hikkaduwa", center: [6.1400, 80.1025] },
            { id: "hikkaduwa_f2", name: "Dodanduwa", center: [6.1090, 80.1250] },
          ],
        },
        {
          id: "galle_csc",
          name: "Galle",
          center: [6.0545, 80.2185],
          substationName: "Galle Substation",
          feeders: [
            { id: "galle_f1", name: "Galle Fort", center: [6.0310, 80.2170] },
            { id: "galle_f2", name: "Karapitiya", center: [6.0640, 80.2260] },
          ],
        },
      ],
    },
  ],
};

const DEFAULT_CENTER: [number, number] = [6.9271, 79.8612];

// Returns the accurate geographic center for a feeder, or calculates a deterministic offset near its CSC.
function feederCenter(cscOrCenter: Csc | [number, number], feederOrId: Feeder | string): [number, number] {
  if (typeof feederOrId !== "string" && feederOrId.center) {
    return feederOrId.center;
  }

  const cscCenter = Array.isArray(cscOrCenter) ? cscOrCenter : cscOrCenter.center;
  const feederId = typeof feederOrId === "string" ? feederOrId : feederOrId.id;

  let h = 0;
  for (let i = 0; i < feederId.length; i++) h = (h * 31 + feederId.charCodeAt(i)) & 0xffff;
  const dLat = (((h & 0xff) / 255) - 0.5) * 0.015;
  const dLng = ((((h >> 8) & 0xff) / 255) - 0.5) * 0.015;
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
function feederMetrics(feederId: string): { peak: number; energy: number; peakHour: number; solar: number } {
  if (feederId === "angulana" || feederId === "moratuwa_north_f2") {
    // 13 MVA feeder · 0.95 PF · 0.52 load factor · 9% solar penetration
    const peak = 13 * 0.95 * 0.52;
    const energy = peak * 24 * 0.52;
    const peakHour = 19;
    const solar = peak * 0.09 * 5.5;
    return { peak, energy, peakHour, solar };
  }
  if (feederId === "katunayake" || feederId === "seeduwa_f2") {
    // 22 MVA feeder · 0.95 PF · 0.58 load factor · 34% solar penetration
    const peak = 22 * 0.95 * 0.58;
    const energy = peak * 24 * 0.58;
    const peakHour = 18;
    const solar = peak * 0.34 * 5.5;
    return { peak, energy, peakHour, solar };
  }
  const h = hashStr(feederId);
  const peak = 3.2 + (h % 40) / 10; // ~3.2-7.1 MW per feeder
  const loadFactor = 0.55 + ((h >> 3) % 26) / 100; // 0.55-0.80
  const energy = peak * 24 * loadFactor;
  const peakHour = 17 + ((h >> 5) % 4); // 17:00-20:00
  // Behind-the-meter rooftop PV: penetration 5-35% of peak, ~5.5 solar-hours/day.
  const solarPen = 0.05 + ((h >> 7) % 31) / 100;
  const solar = peak * solarPen * 5.5;
  return { peak, energy, peakHour, solar };
}

/** Helper icon renderer for Advance Search results */
function getNodeIcon(type: MapNodeDetails["type"]) {
  switch (type) {
    case "branch":
      return <Building2 className="w-4 h-4 text-indigo-600" />;
    case "csc":
      return <Building className="w-4 h-4 text-cyan-600" />;
    case "feeder":
      return <Waypoints className="w-4 h-4 text-rose-500" />;
    case "substation":
      return <Cable className="w-4 h-4 text-red-500" />;
    case "transformer":
      return <Zap className="w-4 h-4 text-blue-500" />;
    case "distributedSolar":
    case "utilitySolar":
      return <Sun className="w-4 h-4 text-amber-500" />;
    case "evse":
      return <BatteryCharging className="w-4 h-4 text-emerald-500" />;
    case "distributedBattery":
    case "utilityBattery":
      return <Battery className="w-4 h-4 text-purple-500" />;
    case "meterEndpoint":
    default:
      return <Grid className="w-4 h-4 text-slate-600" />;
  }
}

/** Compact minimal tile in the map summary strip. */
function StatTile({
  icon,
  tint,
  label,
  value,
  unit,
  valueClass,
}: {
  icon: React.ReactNode;
  tint: string;
  label: string;
  value: string;
  unit?: string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-background/80 px-2.5 py-1 min-w-0 shadow-2xs transition-colors hover:bg-background">
      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${tint}`}>
        {icon}
      </span>
      <div className="flex items-baseline gap-1 min-w-0">
        <span className="truncate text-[11px] font-medium text-muted-foreground">
          {label}:
        </span>
        <span className={`text-xs font-bold leading-tight tabular-nums shrink-0 ${valueClass ?? "text-foreground"}`}>
          {value}
        </span>
        {unit && <span className="text-[10px] font-medium text-muted-foreground shrink-0">{unit}</span>}
      </div>
    </div>
  );
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

// Dynamically frame the map to the current scope or search focus.
function MapView({
  sites,
  center,
  zoom,
  searchFocus,
}: {
  sites: Array<[number, number]>;
  center: [number, number];
  zoom: number;
  searchFocus?: { center: [number, number]; zoom: number; id: string } | null;
}) {
  const map = useMap();
  useEffect(() => {
    if (searchFocus) {
      map.flyTo(searchFocus.center, searchFocus.zoom, { animate: true, duration: 1.2 });
    } else if (sites.length > 1) {
      map.fitBounds(L.latLngBounds(sites), { padding: [60, 60], animate: true });
    } else {
      map.setView(center, zoom, { animate: true });
    }
  }, [sites, center, zoom, searchFocus, map]);
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
  const theme = useTheme();
  const [branch, setBranch] = useState("moratuwa");
  const [csc, setCsc] = useState("moratuwa_north");
  const [feeder, setFeeder] = useState("angulana");
  const [selectedNode, setSelectedNode] = useState<MapNodeDetails | null>(null);
  // Id of the marker currently hovered. When set, every other node on the map
  // dims to 50% so the hovered element (and its popup context) reads clearly.
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // Advance Search States
  const [searchQuery, setSearchQuery] = useState("");
  const [searchCategory, setSearchCategory] = useState("all");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchFocus, setSearchFocus] = useState<{ center: [number, number]; zoom: number; id: string } | null>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Computed index of ALL searchable nodes across the entire LECO grid network
  const allMapNodes = useMemo<MapNodeDetails[]>(() => {
    const nodes: MapNodeDetails[] = [];

    LECO_DATA.branches.forEach(b => {
      // Branch HQ
      nodes.push({
        id: `branch-${b.id}`,
        name: `${b.name} Branch HQ`,
        type: "branch",
        typeName: "Branch HQ",
        branchId: b.id,
        branchName: `${b.name} Branch`,
        center: b.center,
        status: "Normal",
      });

      b.cscs.forEach(c => {
        // CSC HQ
        nodes.push({
          id: `csc-${c.id}`,
          name: `${c.name} CSC HQ`,
          type: "csc",
          typeName: "CSC HQ",
          branchId: b.id,
          branchName: `${b.name} Branch`,
          cscId: c.id,
          cscName: `${c.name} CSC`,
          substationName: c.substationName,
          center: c.center,
          status: "Normal",
        });

        // Primary Substation
        nodes.push({
          id: `sub-${c.id}`,
          name: c.substationName,
          type: "substation",
          typeName: "Primary Substation",
          branchId: b.id,
          branchName: `${b.name} Branch`,
          cscId: c.id,
          cscName: `${c.name} CSC`,
          substationName: c.substationName,
          center: c.center,
          status: "Normal",
        });

        c.feeders.forEach(f => {
          const fCenter = feederCenter(c, f);
          // Feeder Line
          nodes.push({
            id: `feeder-${f.id}`,
            name: `${f.name} Feeder`,
            type: "feeder",
            typeName: "11kV Feeder Line",
            branchId: b.id,
            branchName: `${b.name} Branch`,
            cscId: c.id,
            cscName: `${c.name} CSC`,
            substationName: c.substationName,
            feederId: f.id,
            feederName: f.name,
            center: fCenter,
            status: "Normal",
          });

          // Distribution Transformers & DERs
          const seedVal = hashStr(f.id);
          const txCount = 5;
          for (let i = 0; i < txCount; i++) {
            const angle = (i / txCount) * Math.PI * 2 + (seedVal % 10) * 0.15;
            const ring = 0.0026 + ((i + seedVal) % 3) * 0.0011;
            const tPos: [number, number] = [
              fCenter[0] + Math.sin(angle) * ring,
              fCenter[1] + Math.cos(angle) * ring,
            ];
            const tId = `${f.id}-t${i + 1}`;
            const tName = `${f.name} Tx ${String(i + 1).padStart(2, "0")}`;

            nodes.push({
              id: tId,
              name: tName,
              type: "transformer",
              typeName: "Distribution Transformer 11kV/400V",
              branchId: b.id,
              branchName: `${b.name} Branch`,
              cscId: c.id,
              cscName: `${c.name} CSC`,
              substationName: c.substationName,
              feederId: f.id,
              feederName: f.name,
              transformerId: tId,
              transformerName: tName,
              center: tPos,
              status: "Optimal",
            });

            if (i === 0) {
              nodes.push({
                id: `solar-${tId}`,
                name: `${f.name} Rooftop Solar PV`,
                type: "distributedSolar",
                typeName: "Distributed Rooftop Solar PV",
                branchId: b.id,
                branchName: `${b.name} Branch`,
                cscId: c.id,
                cscName: `${c.name} CSC`,
                substationName: c.substationName,
                feederId: f.id,
                feederName: f.name,
                transformerId: tId,
                transformerName: tName,
                center: [tPos[0] + 0.0001, tPos[1] + 0.0001],
                status: "Active",
              });
            } else if (i === 1) {
              nodes.push({
                id: `ev-${tId}`,
                name: `${f.name} EV Charger EVSE`,
                type: "evse",
                typeName: "EV Fast Charger",
                branchId: b.id,
                branchName: `${b.name} Branch`,
                cscId: c.id,
                cscName: `${c.name} CSC`,
                substationName: c.substationName,
                feederId: f.id,
                feederName: f.name,
                transformerId: tId,
                transformerName: tName,
                center: [tPos[0] - 0.0001, tPos[1] + 0.0001],
                status: "Active",
              });
            } else if (i === 2) {
              nodes.push({
                id: `bess-${tId}`,
                name: `${f.name} Battery Storage BESS`,
                type: "distributedBattery",
                typeName: "Battery Energy Storage System",
                branchId: b.id,
                branchName: `${b.name} Branch`,
                cscId: c.id,
                cscName: `${c.name} CSC`,
                substationName: c.substationName,
                feederId: f.id,
                feederName: f.name,
                transformerId: tId,
                transformerName: tName,
                center: [tPos[0] + 0.0001, tPos[1] - 0.0001],
                status: "Optimal",
              });
            } else {
              nodes.push({
                id: `meter-${tId}`,
                name: `AMI Meter · A/C ${lecoAccountNumber(`meter-${tId}`)}`,
                type: "meterEndpoint",
                typeName: "Smart Meter Consumer",
                branchId: b.id,
                branchName: `${b.name} Branch`,
                cscId: c.id,
                cscName: `${c.name} CSC`,
                substationName: c.substationName,
                feederId: f.id,
                feederName: f.name,
                transformerId: tId,
                transformerName: tName,
                center: tPos,
                status: "Normal",
              });
            }
          }
        });
      });
    });

    return nodes;
  }, []);

  // Close search dropdown on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setIsSearchOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Hotkey listener for '/' key to focus search input
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (
        e.key === "/" &&
        document.activeElement !== searchInputRef.current &&
        !(document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement)
      ) {
        e.preventDefault();
        searchInputRef.current?.focus();
        setIsSearchOpen(true);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const filteredSearchNodes = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase().trim();

    return allMapNodes.filter(node => {
      // Category filter match
      if (searchCategory === "branch" && node.type !== "branch") return false;
      if (searchCategory === "csc" && node.type !== "csc") return false;
      if (searchCategory === "substation" && node.type !== "substation") return false;
      if (searchCategory === "feeder" && node.type !== "feeder") return false;
      if (searchCategory === "transformer" && node.type !== "transformer") return false;
      if (searchCategory === "der" && !["distributedSolar", "utilitySolar", "evse", "distributedBattery", "utilityBattery"].includes(node.type)) return false;
      if (searchCategory === "meterEndpoint" && node.type !== "meterEndpoint") return false;

      // Text match across fields
      const searchHaystack = [
        node.name,
        node.typeName,
        node.id,
        node.branchName,
        node.cscName,
        node.substationName,
        node.feederName,
        node.transformerName,
      ].filter(Boolean).join(" ").toLowerCase();

      return searchHaystack.includes(q);
    });
  }, [allMapNodes, searchQuery, searchCategory]);

  const handleSelectSearchNode = (node: MapNodeDetails) => {
    // Update filter dropdown hierarchy to match node if present
    if (node.branchId) setBranch(node.branchId);
    if (node.cscId) setCsc(node.cscId);
    if (node.feederId) setFeeder(node.feederId);

    // Set map focus coordinates
    if (node.center) {
      setSearchFocus({
        center: node.center,
        zoom: 16,
        id: node.id,
      });
    }

    // Trigger side panel
    setSelectedNode(node);

    // Close search dropdown
    setIsSearchOpen(false);
  };

  const handleResetFilters = () => {
    setBranch("moratuwa");
    setCsc("moratuwa_north");
    setFeeder("angulana");
    setSearchFocus(null);
  };

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
    setSearchFocus(null);
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
  // changes). Seeded to the default feeder view's zoom (Velona / Angulana) so
  // the initial level of detail matches the framed feeder.
  const [liveZoom, setLiveZoom] = useState(16);

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
    setSearchFocus(null);
  };

  const handleCscChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setCsc(e.target.value);
    setFeeder("all");
    setSearchFocus(null);
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
    return feederCenter(c, f);
  }, [branch, csc, feeder]);

  const mapZoom = useMemo(() => {
    if (feeder !== "all") return 16;
    if (csc !== "all") return 14;
    if (branch !== "all") return 12;
    return 11;
  }, [branch, csc, feeder]);

  // Org-hierarchy HQ markers scoped to the current drill-down so the map stays
  // readable: all Branch HQs at the top level, then CSC HQs within a branch.
  // Feeders are rendered per in-scope site (see scopeSites), not here.
  const orgMarkers = useMemo(() => {
    const selectedBranch = LECO_DATA.branches.find(b => b.id === branch);
    const branchHqs = selectedBranch ? [selectedBranch] : LECO_DATA.branches;

    const cscHqs = selectedBranch
      ? (csc === "all" ? selectedBranch.cscs : selectedBranch.cscs.filter(c => c.id === csc))
      : [];

    return { branchHqs, cscHqs };
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
      substationName: string;
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
          substationName: c.substationName,
          cscName: c.name,
          branchName: b.name,
          center: feederCenter(c, f),
        }));
      });
    });
    return sites;
  }, [branch, csc, feeder]);

  // Stable array of site centers for MapView. Derived from the memoized scopeSites.
  const scopeCenters = useMemo(() => scopeSites.map(s => s.center), [scopeSites]);

  // Level of detail scales inversely with how many feeders are on screen.
  const detail = useMemo(() => {
    const n = scopeSites.length;
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
      const transformers: Array<{
        id: string;
        pos: [number, number];
        name: string;
        substationName: string;
        cscName: string;
        branchName: string;
        feederId: string;
        feederName: string;
      }> = [];
      for (let i = 0; i < detail.txPerSite; i++) {
        const angle = (i / detail.txPerSite) * Math.PI * 2 + (si + seed) * 0.15;
        const ring = 0.0026 + ((i + seed) % 3) * 0.0011;
        transformers.push({
          id: `${s.feederId}-t${i + 1}`,
          pos: [cLat + Math.sin(angle) * ring, cLng + Math.cos(angle) * ring],
          name: `${s.feederName} Tx ${String(i + 1).padStart(2, "0")}`,
          substationName: s.substationName,
          cscName: s.cscName,
          branchName: s.branchName,
          feederId: s.feederId,
          feederName: s.feederName,
        });
      }
      return { ...s, substation: s.center, transformers };
    });
  }, [scopeSites, detail.txPerSite, seed]);

  const [roadRoutes, setRoadRoutes] = useState<Record<string, Array<[number, number]>>>({});

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

    const pending: Record<string, Array<[number, number]>> = {};
    const flush = () => {
      const keys = Object.keys(pending);
      if (keys.length === 0) return;
      const batch = { ...pending };
      keys.forEach(k => delete pending[k]);
      setRoadRoutes(prev => ({ ...prev, ...batch }));
    };
    const flushTimer = window.setInterval(() => {
      if (!cancelled) flush();
    }, 400);

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
            pending[job.key] = data.routes[0].geometry.coordinates.map(
              (c: [number, number]) => [c[1], c[0]]
            );
          } else {
            pending[job.key] = fallbackRoute(job.sub, job.pos);
          }
        })
        .catch(() => {
          if (!cancelled) pending[job.key] = fallbackRoute(job.sub, job.pos);
        })
        .then(runNext);
    };

    Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, () => runNext())
    ).then(() => {
      if (!cancelled) flush();
    });

    return () => {
      cancelled = true;
      window.clearInterval(flushTimer);
    };
  }, [baseGrid]);

  const consumers = useMemo(() => {
    const out: Array<{
      id: string;
      pos: [number, number];
      roadPoint: [number, number];
      der?: "solar" | "ev" | "battery";
      branchName: string;
      cscName: string;
      substationName: string;
      feederId: string;
      feederName: string;
      transformerId: string;
      transformerName: string;
    }> = [];
    if (!detail.showMeters) return out;

    let cId = 0;
    const allTransformers = baseGrid.flatMap(site =>
      site.transformers.map(t => ({ site, substation: site.substation, t }))
    );
    allTransformers.forEach(({ site, substation, t }) => {
      const path = roadRoutes[routeKey(substation, t.pos)] || fallbackRoute(substation, t.pos);
      if (path.length < 2) return;

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

        out.push({
          id: `meter-${cId++}`,
          pos: [houseLat, houseLng],
          roadPoint: [rLat, rLng],
          der,
          branchName: site.branchName,
          cscName: site.cscName,
          substationName: site.substationName,
          feederId: site.feederId,
          feederName: site.feederName,
          transformerId: t.id,
          transformerName: t.name,
        });
      }
    });
    return out;
  }, [baseGrid, roadRoutes, seed, detail.showMeters]);

  // Aggregate forecast stats rolled up over scope.
  const stats = useMemo(() => {
    const metrics = scopeSites.map(s => feederMetrics(s.feederId));
    const peak = metrics.reduce((s, m) => s + m.peak, 0);
    const energy = metrics.reduce((s, m) => s + m.energy, 0);
    const solar = metrics.reduce((s, m) => s + m.solar, 0);
    const peakHour = metrics.length
      ? metrics.reduce((a, b) => (b.peak > a.peak ? b : a)).peakHour
      : 18;
    const scopeKey = `${branch}|${csc}|${feeder}`;
    const vsAverage = ((hashStr(scopeKey) % 120) / 10) - 4;

    const pFmt = formatPower(peak);
    const eFmt = formatEnergy(energy);
    const sFmt = formatEnergy(solar);

    return {
      peakVal: pFmt.value,
      peakUnit: pFmt.unit,
      energyVal: eFmt.value,
      energyUnit: eFmt.unit,
      solarVal: sFmt.value,
      solarUnit: sFmt.unit,
      timeHour: peakHour,
      vsAverage,
      feederCount: scopeSites.length,
    };
  }, [scopeSites, branch, csc, feeder]);

  const { timeHour } = stats;

  const scopeLabel = useMemo(() => {
    const b = LECO_DATA.branches.find(x => x.id === branch);
    if (!b) return "All Branches";
    const c = b.cscs.find(x => x.id === csc);
    if (!c) return `${b.name} Branch`;
    const f = c.feeders.find(x => x.id === feeder);
    if (!f) return `${c.name} CSC`;
    return `${f.name} Feeder`;
  }, [branch, csc, feeder]);

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

  const markerLayers = useMemo(
    () => {
      // Full opacity for the hovered node (or when nothing is hovered); every
      // other node dims to 50%. `hoverProps` wires a marker into this state.
      const opacityFor = (id: string) => (hoveredId && hoveredId !== id ? 0.5 : 1);
      const lineOpacity = (base: number, id?: string) =>
        hoveredId && hoveredId !== id ? base * 0.5 : base;
      const hoverProps = (id: string) => ({
        mouseover: () => setHoveredId(id),
        mouseout: () => setHoveredId((cur) => (cur === id ? null : cur)),
      });
      return (
      <>
        {/* LECO Org Hierarchy: Branch HQ */}
        {layers.branchHq && orgMarkers.branchHqs.map(b => {
          const nodeData: MapNodeDetails = {
            id: b.id,
            name: `${b.name} Branch HQ`,
            type: "branch",
            typeName: "Branch HQ",
            branchId: b.id,
            branchName: `${b.name} Branch`,
            center: b.center,
            status: "Normal"
          };
          return (
            <Marker
              key={`branch-${b.id}`}
              position={b.center}
              icon={branchHqIcon}
              opacity={opacityFor(b.id)}
              eventHandlers={{ click: () => setSelectedNode(nodeData), ...hoverProps(b.id) }}
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
            cscName: `${c.name} CSC`,
            substationName: c.substationName,
            center: c.center,
            status: "Normal"
          };
          return (
            <Marker
              key={`csc-${c.id}`}
              position={c.center}
              icon={cscHqIcon}
              opacity={opacityFor(c.id)}
              eventHandlers={{ click: () => setSelectedNode(nodeData), ...hoverProps(c.id) }}
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

        {/* LECO Org Hierarchy: Feeders — one per feeder in the active scope
            (a single feeder, a CSC's feeders, a whole branch, or all), placed
            just off its substation pin so both stay legible. */}
        {layers.feeder && scopeSites.map(s => {
          const m = feederMetrics(s.feederId);
          const feederNodeId = `feeder-${s.feederId}`;
          const pos: [number, number] = [s.center[0] + 0.0006, s.center[1]];
          const nodeData: MapNodeDetails = {
            id: feederNodeId,
            name: `${s.feederName} Feeder`,
            type: "feeder",
            typeName: "Feeder Line",
            branchName: `${s.branchName} Branch`,
            cscName: `${s.cscName} CSC`,
            substationName: s.substationName,
            feederId: s.feederId,
            feederName: s.feederName,
            center: pos,
            status: "Normal"
          };
          return (
            <Marker
              key={feederNodeId}
              position={pos}
              icon={feederIcon}
              opacity={opacityFor(feederNodeId)}
              eventHandlers={{ click: () => setSelectedNode(nodeData), ...hoverProps(feederNodeId) }}
            >
              <Popup>
                <div className="flex flex-col gap-1 min-w-[210px] p-0.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-foreground">{s.feederName} Feeder</span>
                    <Badge variant="outline" className="text-[9px] font-semibold py-0 px-1 text-rose-600 border-rose-200 bg-rose-50">11kV Feeder</Badge>
                  </div>
                  <div className="text-[11px] text-muted-foreground font-medium">
                    {s.cscName} CSC &middot; {s.substationName}
                  </div>

                  <div className="grid grid-cols-2 gap-1.5 my-1.5 bg-muted/40 p-1.5 rounded-md border border-border/50 text-[10px]">
                    <div>
                      <span className="text-muted-foreground block">Firm Capacity:</span>
                      <span className="font-semibold text-foreground">{(m.peak * 1.8).toFixed(1)} MW</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block">Forecast Peak:</span>
                      <span className="font-semibold text-foreground">{m.peak.toFixed(2)} MW</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block">Peak Time:</span>
                      <span className="font-semibold text-foreground">{m.peakHour}:00 LKT</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block">Rooftop Solar:</span>
                      <span className="font-semibold text-amber-600">{m.solar.toFixed(1)} MWh/d</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setSelectedNode(nodeData)}
                    className="px-2.5 py-1.5 bg-primary text-primary-foreground text-[10px] font-semibold rounded-md shadow-xs hover:bg-primary/90 transition-colors w-full flex items-center justify-center gap-1"
                  >
                    View Feeder Forecast & Analytics
                  </button>
                </div>
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
                pathOptions={{ color: '#0284c7', weight: 3.5, opacity: lineOpacity(0.9, `feeder-${site.feederId}`) }}
                eventHandlers={{
                  click: () => setSelectedNode({
                    id: `feeder-${site.feederId}`,
                    name: `${site.feederName} Distribution Line`,
                    type: "feeder",
                    typeName: "11kV Distribution Line",
                    branchName: site.branchName,
                    cscName: site.cscName,
                    substationName: site.substationName,
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
            pathOptions={{ color: '#38bdf8', weight: 1.5, opacity: lineOpacity(0.7, c.id), dashArray: '3 3' }}
          />
        ))}

        {/* Substation Markers (one per feeder in scope) */}
        {layers.substation && baseGrid.map(site => {
          const nodeData: MapNodeDetails = {
            id: `sub-${site.feederId}`,
            name: site.substationName,
            type: "substation",
            typeName: "Primary Substation",
            branchName: site.branchName,
            cscName: site.cscName,
            substationName: site.substationName,
            feederName: site.feederName,
            center: site.substation,
            status: "Normal"
          };
          return (
            <Marker
              key={`sub-${site.feederId}`}
              position={site.substation}
              icon={substationIcon}
              opacity={opacityFor(`sub-${site.feederId}`)}
              eventHandlers={{ click: () => setSelectedNode(nodeData), ...hoverProps(`sub-${site.feederId}`) }}
            >
              <Popup>
                <div className="text-xs font-semibold">{site.substationName}</div>
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
              substationName: site.substationName,
              feederId: site.feederId,
              feederName: site.feederName,
              transformerId: t.id,
              transformerName: t.name,
              center: t.pos,
              status: "Optimal"
            };
            return (
              <Marker
                key={t.id}
                position={t.pos}
                icon={transformerIcon}
                opacity={opacityFor(t.id)}
                eventHandlers={{ click: () => setSelectedNode(nodeData), ...hoverProps(t.id) }}
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
          const acctNo = lecoAccountNumber(c.id);
          const meterNode: MapNodeDetails = {
            id: c.id,
            name: `AMI Smart Meter · A/C ${acctNo}`,
            type: "meterEndpoint",
            typeName: "Smart Meter Consumer",
            branchName: c.branchName,
            cscName: c.cscName,
            substationName: c.substationName,
            feederId: c.feederId,
            feederName: c.feederName,
            transformerId: c.transformerId,
            transformerName: c.transformerName,
            consumerId: c.id,
            consumerName: `AMI Meter · A/C ${acctNo}`,
            center: c.pos,
            status: "Normal"
          };
          const solarNode: MapNodeDetails = {
            id: `pv-${c.id}`,
            name: `Rooftop Solar PV (${c.id})`,
            type: "distributedSolar",
            typeName: "Distributed Solar PV",
            branchName: c.branchName,
            cscName: c.cscName,
            substationName: c.substationName,
            feederId: c.feederId,
            feederName: c.feederName,
            transformerId: c.transformerId,
            transformerName: c.transformerName,
            consumerId: c.id,
            consumerName: `Consumer (${c.id})`,
            center: c.pos,
            status: "Active"
          };
          const evNode: MapNodeDetails = {
            id: `ev-${c.id}`,
            name: `EV Charger EVSE (${c.id})`,
            type: "evse",
            typeName: "EV Fast Charger",
            branchName: c.branchName,
            cscName: c.cscName,
            substationName: c.substationName,
            feederId: c.feederId,
            feederName: c.feederName,
            transformerId: c.transformerId,
            transformerName: c.transformerName,
            consumerId: c.id,
            consumerName: `Consumer (${c.id})`,
            center: c.pos,
            status: "Active"
          };
          const batteryNode: MapNodeDetails = {
            id: `bess-${c.id}`,
            name: `Battery Storage BESS (${c.id})`,
            type: "distributedBattery",
            typeName: "Distributed Battery BESS",
            branchName: c.branchName,
            cscName: c.cscName,
            substationName: c.substationName,
            feederId: c.feederId,
            feederName: c.feederName,
            transformerId: c.transformerId,
            transformerName: c.transformerName,
            consumerId: c.id,
            consumerName: `Consumer (${c.id})`,
            center: c.pos,
            status: "Optimal"
          };

          return (
            <React.Fragment key={c.id}>
              {layers.meterEndpoint && (
                <CircleMarker
                  center={c.pos}
                  radius={4.5}
                  pathOptions={{ color: theme === "dark" ? '#0b0e1a' : '#ffffff', fillColor: theme === "dark" ? '#e2e8f0' : '#0f172a', fillOpacity: opacityFor(c.id), opacity: opacityFor(c.id), weight: 1.5 }}
                  eventHandlers={{ click: () => setSelectedNode(meterNode), ...hoverProps(c.id) }}
                >
                  <Popup>
                    <div className="text-xs font-semibold">Meter Endpoint</div>
                    <div className="text-[11px] text-muted-foreground mb-1.5">AMI Smart Meter &middot; <span className="font-mono">LECO A/C: {acctNo}</span></div>
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
                  opacity={opacityFor(solarNode.id)}
                  eventHandlers={{ click: () => setSelectedNode(solarNode), ...hoverProps(solarNode.id) }}
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
                  opacity={opacityFor(evNode.id)}
                  eventHandlers={{ click: () => setSelectedNode(evNode), ...hoverProps(evNode.id) }}
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
                  opacity={opacityFor(batteryNode.id)}
                  eventHandlers={{ click: () => setSelectedNode(batteryNode), ...hoverProps(batteryNode.id) }}
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
      );
    },
    [layers, orgMarkers, scopeSites, baseGrid, roadRoutes, consumers, hoveredId, theme]
  );

  return (
    <div className="flex flex-col w-full h-[calc(100vh-80px)] gap-3">
      
      {/* Sleek Minimal Header: Advance Search, Scope Filters & Active Stats */}
      <div className="relative z-50 bg-card/90 backdrop-blur-md p-3 rounded-xl border border-border/80 shadow-xs flex flex-col gap-2.5">
        
        {/* Controls Row: Advance Search & Scope Filters */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-2.5">
          
          {/* Left: Advance Search Bar */}
          <div className="relative flex-1 min-w-0" ref={searchContainerRef}>
            <div className="flex items-center gap-2 bg-background border border-border/70 rounded-lg h-9 px-2.5 focus-within:ring-2 focus-within:ring-primary/30 focus-within:border-primary transition-all shadow-2xs">
              <Search className="w-4 h-4 text-muted-foreground shrink-0" />
              
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setIsSearchOpen(true);
                }}
                onFocus={() => setIsSearchOpen(true)}
                placeholder="Search any node, feeder, substation, DER..."
                className="w-full bg-transparent text-xs text-foreground placeholder:text-muted-foreground/70 focus:outline-none min-w-[180px]"
              />

              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery("");
                    setIsSearchOpen(false);
                  }}
                  className="p-0.5 hover:bg-muted rounded-md text-muted-foreground transition-colors shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}

              <div className="h-3.5 w-[1px] bg-border shrink-0" />

              {/* Category Filter Dropdown Pill */}
              <select
                value={searchCategory}
                onChange={(e) => setSearchCategory(e.target.value)}
                className="bg-muted/50 hover:bg-muted text-[11px] font-medium text-foreground px-2 py-0.5 rounded border border-border/40 focus:outline-none cursor-pointer shrink-0"
              >
                <option value="all">All Types</option>
                <option value="branch">Branch HQs</option>
                <option value="csc">CSC HQs</option>
                <option value="substation">Substations</option>
                <option value="feeder">Feeders</option>
                <option value="transformer">Transformers</option>
                <option value="der">Solar & DERs</option>
                <option value="meterEndpoint">Smart Meters</option>
              </select>

              <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground bg-muted/60 rounded border border-border/60 shrink-0">
                /
              </kbd>
            </div>

            {/* Advance Search Dropdown Overlay */}
            {isSearchOpen && filteredSearchNodes.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 z-[9999] bg-card border border-border shadow-xl rounded-lg max-h-[320px] overflow-y-auto divide-y divide-border/40 animate-in fade-in-50 slide-in-from-top-1 duration-150">
                <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex justify-between items-center bg-muted/40">
                  <span>Search Results ({filteredSearchNodes.length})</span>
                  <span>Click to Focus Map</span>
                </div>

                {filteredSearchNodes.slice(0, 15).map((node) => (
                  <button
                    key={node.id}
                    type="button"
                    onClick={() => handleSelectSearchNode(node)}
                    className="w-full flex items-center justify-between p-2 text-left hover:bg-accent/50 transition-colors group"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="p-1.5 rounded-md bg-muted/60 group-hover:bg-muted shrink-0 transition-colors">
                        {getNodeIcon(node.type)}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-xs font-semibold text-foreground truncate">
                          {node.name}
                        </span>
                        <span className="text-[11px] text-muted-foreground truncate">
                          {[node.substationName, node.cscName, node.branchName].filter(Boolean).join(" · ")}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <Badge variant="outline" className="text-[9px] font-medium uppercase tracking-wider py-0 px-1.5">
                        {node.typeName}
                      </Badge>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Right: Scope Filters Dropdown Pill */}
          <div className="flex items-center gap-1.5 flex-wrap sm:flex-nowrap shrink-0">
            <div className="flex items-center gap-1 bg-background border border-border/70 rounded-lg h-9 px-2 shadow-2xs text-xs">
              <Filter className="w-3.5 h-3.5 text-primary shrink-0 ml-0.5" />
              <span className="font-semibold text-muted-foreground text-[11px] shrink-0">Scope:</span>
              
              <select
                value={branch}
                onChange={handleBranchChange}
                className="h-7 px-1 bg-transparent text-xs font-medium focus:outline-none cursor-pointer text-foreground"
              >
                <option value="all">All Branches</option>
                {LECO_DATA.branches.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>

              <span className="text-muted-foreground/40 text-[10px]">/</span>

              <select
                value={csc}
                onChange={handleCscChange}
                disabled={branch === "all"}
                className="h-7 px-1 bg-transparent text-xs font-medium focus:outline-none cursor-pointer text-foreground disabled:opacity-40"
              >
                <option value="all">All CSCs</option>
                {availableCscs.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>

              <span className="text-muted-foreground/40 text-[10px]">/</span>

              <select
                value={feeder}
                onChange={(e) => {
                  setFeeder(e.target.value);
                  setSearchFocus(null);
                }}
                disabled={csc === "all"}
                className="h-7 px-1 bg-transparent text-xs font-medium focus:outline-none cursor-pointer text-foreground disabled:opacity-40"
              >
                <option value="all">All Feeders</option>
                {availableFeeders.map(f => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>

            {(branch !== "moratuwa" || csc !== "moratuwa_north" || feeder !== "angulana" || searchFocus !== null) && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="flex items-center gap-1 h-9 px-2 bg-muted/60 hover:bg-muted text-xs font-medium text-muted-foreground hover:text-foreground rounded-lg transition-colors border border-border/50"
                title="Reset filters"
              >
                <RotateCcw className="w-3 h-3" />
                <span className="hidden sm:inline">Reset</span>
              </button>
            )}
          </div>
        </div>

        {/* Minimal Streamlined Active Scope Stats Strip */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/40 pt-2">
          
          {/* Active Scope Label */}
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground shrink-0">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
            <span className="font-semibold text-foreground">{scopeLabel}</span>
            <span className="text-muted-foreground/60">&middot;</span>
            <span>{stats.feederCount} feeder{stats.feederCount === 1 ? "" : "s"}</span>
          </div>

          {/* Minimal Inline Stats Pills */}
          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            <StatTile
              icon={<Zap className="w-3.5 h-3.5 text-primary" />}
              tint="bg-primary/10"
              label="Peak"
              value={stats.peakVal}
              unit={stats.peakUnit}
            />
            <StatTile
              icon={<EnergyIcon className="w-3.5 h-3.5 text-amber-500" />}
              tint="bg-amber-500/10"
              label="Energy"
              value={stats.energyVal}
              unit={stats.energyUnit}
            />
            <StatTile
              icon={<Sun className="w-3.5 h-3.5 text-amber-500" />}
              tint="bg-amber-500/10"
              label="Solar"
              value={stats.solarVal}
              unit={stats.solarUnit}
            />
            <StatTile
              icon={<Clock className="w-3.5 h-3.5 text-blue-500" />}
              tint="bg-blue-500/10"
              label="Peak Time"
              value={`${timeHour}:00`}
            />
            <StatTile
              icon={<Percent className="w-3.5 h-3.5 text-emerald-500" />}
              tint="bg-emerald-500/10"
              label="vs Avg"
              value={`${stats.vsAverage >= 0 ? "+" : ""}${stats.vsAverage.toFixed(1)}%`}
              valueClass={stats.vsAverage >= 0 ? "text-emerald-600 font-bold" : "text-rose-600 font-bold"}
            />
          </div>
        </div>
      </div>

      {/* Map Area & Floating Overlay Container */}
      <div className="flex-1 min-h-0 relative rounded-lg overflow-hidden border border-border shadow-sm">
        
        {/* Full Width Map View */}
        <div className="w-full h-full">
          <MapContainer center={mapCenter} zoom={mapZoom} style={{ height: "100%", width: "100%", zIndex: 0 }}>
            <MapView sites={scopeCenters} center={mapCenter} zoom={mapZoom} searchFocus={searchFocus} />
            <ZoomWatcher onZoom={setLiveZoom} />

            {/* Carto basemap — Positron in light, Dark Matter in dark. The key
                forces a tile-layer remount so the URL actually swaps on theme
                change (react-leaflet does not treat `url` as reactive). */}
            <TileLayer
              key={theme}
              attribution='&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url={
                theme === "dark"
                  ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                  : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
              }
              maxZoom={19}
            />

            {markerLayers}
          </MapContainer>

          {/* Floating Right-Side Layer Legend Box */}
          <div className="absolute top-4 right-4 z-[400] bg-card rounded-lg border border-border shadow-md w-60 text-xs overflow-hidden">
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
              className="fixed inset-0 z-[9998] bg-black/50 animate-in fade-in duration-150 cursor-pointer"
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
