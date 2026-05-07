import { useEffect, useState } from "react";

export type ShelfScaleMode = "compact" | "true";
export type ShelfViewMode = "3d" | "flat";

const KEY = "lexicon:shelf-scale-mode";
const VIEW_KEY = "lexicon:shelf-view-mode";

// Module-level store so EVERY component using the hook updates instantly
// without relying on the unreliable cross-component event dance.
type State = { scaleMode: ShelfScaleMode; viewMode: ShelfViewMode };
const listeners = new Set<(s: State) => void>();

function read(): State {
  if (typeof window === "undefined") return { scaleMode: "true", viewMode: "flat" };
  const scale = localStorage.getItem(KEY) === "compact" ? "compact" : "true";
  const view = localStorage.getItem(VIEW_KEY);
  // Default to "flat" — much lighter on GPU/CPU and handles huge libraries.
  const viewMode: ShelfViewMode = view === "3d" ? "3d" : "flat";
  return { scaleMode: scale, viewMode };
}

let state: State = read();

function set(partial: Partial<State>) {
  state = { ...state, ...partial };
  if (typeof window !== "undefined") {
    localStorage.setItem(KEY, state.scaleMode);
    localStorage.setItem(VIEW_KEY, state.viewMode);
  }
  for (const l of listeners) l(state);
}

if (typeof window !== "undefined") {
  // Cross-tab sync
  window.addEventListener("storage", (e) => {
    if (e.key === KEY || e.key === VIEW_KEY) {
      state = read();
      for (const l of listeners) l(state);
    }
  });
}

export function useShelfSettings() {
  const [s, setS] = useState<State>(state);
  useEffect(() => {
    const fn = (next: State) => setS(next);
    listeners.add(fn);
    setS(state);
    return () => { listeners.delete(fn); };
  }, []);
  return {
    scaleMode: s.scaleMode,
    viewMode: s.viewMode,
    setScaleMode: (m: ShelfScaleMode) => set({ scaleMode: m }),
    setViewMode: (m: ShelfViewMode) => set({ viewMode: m }),
  };
}

export function hasPageCountIssue(pages?: number) {
  return !Number.isFinite(pages) || !pages || pages < 48 || pages > 1400;
}
