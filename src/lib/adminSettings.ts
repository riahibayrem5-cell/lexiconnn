import { useEffect, useState } from "react";

export const ADMIN_SETTINGS_KEY = "lexicon:admin-settings";

export type PageKey = "/" | "/review" | "/oracle" | "/ritual" | "/quotes" | "/archive" | "/admin" | "/settings";

export interface PageCopy {
  eyebrow: string;
  title: string;
  emphasis: string;
  subtitle: string;
}

export interface AdminSettings {
  brandName: string;
  brandInitial: string;
  establishedText: string;
  agentEnabled: boolean;
  shelfCoverReveal: boolean;
  oracleCards: number;
  oracleDescriptionWords: number;
  premiumDepth: number;
  nav: Record<PageKey, { label: string; visible: boolean }>;
  pages: Record<PageKey, PageCopy>;
}

export const DEFAULT_ADMIN_SETTINGS: AdminSettings = {
  brandName: "LEXICON",
  brandInitial: "L",
  establishedText: `EST. ${new Date().getFullYear()}`,
  agentEnabled: false,
  shelfCoverReveal: true,
  oracleCards: 5,
  oracleDescriptionWords: 42,
  premiumDepth: 70,
  nav: {
    "/": { label: "Shelf", visible: true },
    "/review": { label: "Review Desk", visible: true },
    "/oracle": { label: "Oracle", visible: true },
    "/ritual": { label: "Reading Ritual", visible: true },
    "/quotes": { label: "Quotes Vault", visible: true },
    "/archive": { label: "Archive", visible: true },
    "/admin": { label: "Admin Panel", visible: true },
    "/settings": { label: "Settings", visible: true },
  },
  pages: {
    "/": { eyebrow: "The Shelf", title: "The library,", emphasis: "in spines", subtitle: "Your collection. Hover a spine for the marrow. Click once for the cover, twice for the dossier." },
    "/review": { eyebrow: "Review Desk", title: "Turn the shelf into", emphasis: "action", subtitle: "A productive queue for neglected books, missing notes, and next reading decisions." },
    "/oracle": { eyebrow: "The Oracle", title: "Ask,", emphasis: "earnestly", subtitle: "An AI fluent in your library. The more you read, the sharper it gets." },
    "/ritual": { eyebrow: "Reading Ritual", title: "A session,", emphasis: "kept", subtitle: "Track the pages, mood, and ideas that make reading cumulative." },
    "/quotes": { eyebrow: "The Vault", title: "Sentences worth", emphasis: "keeping", subtitle: "Your saved fragments, organized by resonance and source." },
    "/archive": { eyebrow: "Archive", title: "Every finished", emphasis: "volume", subtitle: "The long memory of your reading life." },
    "/admin": { eyebrow: "Admin Panel", title: "Edit the", emphasis: "whole website", subtitle: "Customize identity, page text, navigation, behavior, and visual depth from one cockpit." },
    "/settings": { eyebrow: "The Workshop", title: "House", emphasis: "keeping", subtitle: "Backup, import, choose a binding for your library." },
  },
};

export function readAdminSettings(): AdminSettings {
  try {
    const parsed = JSON.parse(localStorage.getItem(ADMIN_SETTINGS_KEY) || "{}");
    return {
      ...DEFAULT_ADMIN_SETTINGS,
      ...parsed,
      nav: { ...DEFAULT_ADMIN_SETTINGS.nav, ...(parsed.nav ?? {}) },
      pages: { ...DEFAULT_ADMIN_SETTINGS.pages, ...(parsed.pages ?? {}) },
    };
  } catch {
    return DEFAULT_ADMIN_SETTINGS;
  }
}

export function writeAdminSettings(settings: AdminSettings) {
  localStorage.setItem(ADMIN_SETTINGS_KEY, JSON.stringify(settings));
  document.documentElement.style.setProperty("--admin-depth", `${settings.premiumDepth}%`);
  window.dispatchEvent(new CustomEvent("lexicon-admin-settings"));
}

export function useAdminSettings() {
  const [settings, setSettings] = useState<AdminSettings>(() => readAdminSettings());

  useEffect(() => {
    writeAdminSettings(settings);
  }, [settings]);

  useEffect(() => {
    const sync = () => setSettings(readAdminSettings());
    window.addEventListener("lexicon-admin-settings", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("lexicon-admin-settings", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return { settings, setSettings };
}