import { useSyncExternalStore } from "react";

/**
 * Live read of the active theme from `data-theme` on <html>.
 *
 * The theme is owned by App (it sets `document.documentElement.dataset.theme`).
 * Components that need to react to it — chiefly the Leaflet map, whose tiles and
 * canvas markers are drawn outside React's styling and can't ride CSS variables
 * — subscribe here instead of threading a prop through every layer.
 */
function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  return () => observer.disconnect();
}

function getSnapshot(): "dark" | "light" {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

export function useTheme(): "dark" | "light" {
  // Server snapshot (last arg) mirrors index.html's default of light.
  return useSyncExternalStore(subscribe, getSnapshot, () => "light");
}
