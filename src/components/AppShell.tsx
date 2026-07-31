import { useState, type ReactNode } from "react";
import {
  Bell,
  Gauge,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Settings,
  SlidersHorizontal,
  Sun,
  SunMedium,
  TrendingUp,
  Map,
  ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAlarms } from "@/lib/alarms";
import { cn } from "@/lib/utils";

/**
 * Platform chrome.
 *
 * The Oversight+ shell: persistent left rail, thin top bar, content area. Only
 * Dashboard, Forecasting and Forecast+ are built — the rest of the rail is
 * rendered inert rather than omitted, so the pilot sits in its real position in
 * the product and the navigation doesn't have to be redesigned when it merges in.
 */

export const NAV = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "curtailment", label: "Curtailment", icon: ShieldAlert },
  { id: "sites", label: "Sites", icon: SunMedium },
  { id: "usage", label: "Usage", icon: Gauge },
  { id: "generation", label: "Generation", icon: Sun },
  { id: "manage", label: "Manage", icon: SlidersHorizontal },
  { id: "forecasting", label: "Forecasting", icon: TrendingUp },
  { id: "forecastPlus", label: "Forecast+", icon: Map },
  { id: "settings", label: "Settings", icon: Settings },
] as const;

export type NavId = (typeof NAV)[number]["id"];

/** The destinations that are actually built. The rest render inert. */
const LIVE: ReadonlySet<string> = new Set(["dashboard", "curtailment", "forecasting", "forecastPlus"]);

interface Props {
  title: string;
  theme: "dark" | "light";
  activeNav: NavId;
  onNavChange: (id: NavId) => void;
  onThemeChange: (t: "dark" | "light") => void;
  onConfigToggle: () => void;
  children: ReactNode;
}

export function AppShell({ title, theme, activeNav, onNavChange, onThemeChange, onConfigToggle, children }: Props) {
  // Open by default on desktop; on a laptop-narrow or tablet screen the rail
  // would cover the chart, so it starts closed and opens as an overlay.
  const [open, setOpen] = useState(() => window.innerWidth >= 1024);

  return (
    <div className="min-h-screen bg-background">
      <Sidebar open={open} onClose={() => setOpen(false)} activeNav={activeNav} onNavChange={onNavChange} />

      <div className={cn("transition-[padding] duration-200", open ? "lg:pl-64" : "lg:pl-0")}>
        <TopBar
          title={title}
          theme={theme}
          activeNav={activeNav}
          onThemeChange={onThemeChange}
          onToggleSidebar={() => setOpen((v) => !v)}
          onConfigToggle={onConfigToggle}
        />
        {children}
      </div>

      {/* Scrim for the overlay rail on small screens. */}
      {open && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
        />
      )}
    </div>
  );
}

function Sidebar({ open, onClose, activeNav, onNavChange }: { open: boolean; onClose: () => void; activeNav: NavId; onNavChange: (id: NavId) => void; }) {
  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-border bg-card transition-transform duration-200",
        open ? "translate-x-0" : "-translate-x-full"
      )}
      aria-label="Main navigation"
    >
      <div className="px-6 py-6">
        <Logo className="h-9" />
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-3">
        {NAV.map(({ id, label, icon: Icon }) => {
          const active = id === activeNav;
          if (active) {
            return (
              <a
                key={id}
                href="#main"
                aria-current="page"
                className="flex items-center gap-3 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground"
              >
                <Icon className="h-[18px] w-[18px]" />
                {label}
              </a>
            );
          }
          if (LIVE.has(id)) {
             return (
               <button
                 key={id}
                 onClick={() => onNavChange(id)}
                 className="flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground"
               >
                 <Icon className="h-[18px] w-[18px]" />
                 {label}
               </button>
             );
          }
          return (
            <Tooltip key={id}>
              <TooltipTrigger asChild>
                <span
                  aria-disabled
                  className="flex cursor-not-allowed items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-medium text-muted-foreground/60"
                >
                  <Icon className="h-[18px] w-[18px]" />
                  {label}
                </span>
              </TooltipTrigger>
              <TooltipContent side="right">
                Part of the wider Oversight+ platform - outside the forecasting pilot.
              </TooltipContent>
            </Tooltip>
          );
        })}
      </nav>

      <div className="px-3 pb-6">
        <span
          aria-disabled
          className="flex cursor-not-allowed items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-medium text-muted-foreground/60"
        >
          <LogOut className="h-[18px] w-[18px]" />
          Logout
        </span>
      </div>

      <button
        type="button"
        onClick={onClose}
        className="absolute right-2 top-6 rounded-md p-2 text-muted-foreground hover:bg-accent lg:hidden"
        aria-label="Close navigation"
      >
        <Menu className="h-4 w-4" />
      </button>
    </aside>
  );
}

/**
 * The bell is the only cross-cutting control in the chrome: alarms have to be
 * reachable from every destination without leaving the one you are on.
 *
 * It subscribes to the alarm context itself rather than taking props, so a
 * re-evaluation repaints this button and nothing else.
 */
function AlarmBell() {
  const { unacknowledged, criticalCount, setOpen } = useAlarms();
  const hasCritical = criticalCount > 0;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setOpen(true)}
          aria-label={`Alarms — ${unacknowledged} unacknowledged`}
          className="relative"
        >
          <Bell className="h-5 w-5" />
          {unacknowledged > 0 && (
            <span
              className={cn(
                "absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold text-white",
                hasCritical ? "bg-[var(--status-critical)]" : "bg-[var(--status-warning)]"
              )}
            >
              {unacknowledged}
            </span>
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {unacknowledged > 0
          ? `${unacknowledged} unacknowledged alarm${unacknowledged === 1 ? "" : "s"}`
          : "No unacknowledged alarms"}
      </TooltipContent>
    </Tooltip>
  );
}

function TopBar({
  title,
  theme,
  activeNav,
  onThemeChange,
  onToggleSidebar,
  onConfigToggle,
}: {
  title: string;
  theme: "dark" | "light";
  activeNav: NavId;
  onThemeChange: (t: "dark" | "light") => void;
  onToggleSidebar: () => void;
  onConfigToggle: () => void;
}) {
  return (
    <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-background/90 px-4 py-3 backdrop-blur lg:px-6">
      <Button variant="ghost" size="icon" onClick={onToggleSidebar} aria-label="Toggle navigation">
        <Menu className="h-5 w-5" />
      </Button>
      <h1 className="text-xl font-bold tracking-tight">{title}</h1>

      <div className="ml-auto flex items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onThemeChange(theme === "dark" ? "light" : "dark")}
              aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            Dark is the control-room default. Light is for meeting-room projection.
          </TooltipContent>
        </Tooltip>

        <AlarmBell />

        {activeNav !== "forecastPlus" && activeNav !== "dashboard" && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={onConfigToggle} aria-label="Open configuration">
                <Settings className="h-5 w-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Configuration</TooltipContent>
          </Tooltip>
        )}

        <div className="flex items-center gap-3 pl-1">
          <span
            className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary ring-2 ring-primary/25"
            aria-hidden
          >
            OQ
          </span>
          <div className="hidden leading-tight sm:block">
            <div className="text-sm font-semibold">Olivera Queen</div>
            <div className="text-xs text-muted-foreground">olivera@gmail.com</div>
          </div>
        </div>
      </div>
    </header>
  );
}
