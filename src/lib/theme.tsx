import { createContext, useContext, useEffect, useState, ReactNode } from "react";

export type ThemeId = "amber" | "ivory" | "midnight" | "forest" | "crimson" | "da7ee7";

export interface ThemeMeta {
  id: ThemeId;
  name: string;
  tagline: string;
  swatch: [string, string, string]; // bg, surface, primary (hsl strings)
  mood: "dark" | "light";
}

export const THEMES: ThemeMeta[] = [
  {
    id: "amber",
    name: "Amber Library",
    tagline: "Rare bookshop at 2am · gold foil on ebony",
    swatch: ["hsl(30 18% 5%)", "hsl(30 14% 11%)", "hsl(41 55% 54%)"],
    mood: "dark",
  },
  {
    id: "ivory",
    name: "Ivory Vellum",
    tagline: "Daylight reading room · cream paper, ink, oxblood",
    swatch: ["hsl(38 45% 94%)", "hsl(38 40% 92%)", "hsl(0 55% 32%)"],
    mood: "light",
  },
  {
    id: "midnight",
    name: "Midnight Velvet",
    tagline: "Moonlit study · navy and silver foil",
    swatch: ["hsl(222 35% 7%)", "hsl(222 28% 13%)", "hsl(210 35% 78%)"],
    mood: "dark",
  },
  {
    id: "forest",
    name: "Forest Bindery",
    tagline: "Botanist's archive · deep green and aged brass",
    swatch: ["hsl(150 25% 6%)", "hsl(150 20% 12%)", "hsl(38 55% 52%)"],
    mood: "dark",
  },
  {
    id: "crimson",
    name: "Crimson Folio",
    tagline: "Antiquarian gravitas · oxblood, ivory, gold",
    swatch: ["hsl(0 28% 6%)", "hsl(0 22% 12%)", "hsl(41 65% 58%)"],
    mood: "dark",
  },
  {
    id: "da7ee7",
    name: "Da7ee7",
    tagline: "Retro YouTube energy · violet, hot pink, creamy yellow",
    swatch: ["hsl(280 35% 8%)", "hsl(280 30% 14%)", "hsl(320 75% 60%)"],
    mood: "dark",
  },
];

const STORAGE_KEY = "lexicon:theme";
const DEFAULT_THEME: ThemeId = "amber";

interface ThemeCtx {
  theme: ThemeId;
  setTheme: (t: ThemeId) => void;
  meta: ThemeMeta;
}

const Ctx = createContext<ThemeCtx | null>(null);

function applyTheme(t: ThemeId) {
  document.documentElement.setAttribute("data-theme", t);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>(() => {
    if (typeof window === "undefined") return DEFAULT_THEME;
    const stored = localStorage.getItem(STORAGE_KEY) as ThemeId | null;
    return stored && THEMES.some(t => t.id === stored) ? stored : DEFAULT_THEME;
  });

  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const setTheme = (t: ThemeId) => setThemeState(t);
  const meta = THEMES.find(t => t.id === theme) ?? THEMES[0];

  return <Ctx.Provider value={{ theme, setTheme, meta }}>{children}</Ctx.Provider>;
}

export function useTheme() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useTheme must be used inside ThemeProvider");
  return c;
}
