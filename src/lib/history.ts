import { newId } from "./seed";

const HISTORY_KEY = "lexicon-history-log";

export type HistoryKind = "book" | "search" | "agent" | "shelf" | "settings" | "review";

export interface HistoryEntry {
  id: string;
  at: string;
  kind: HistoryKind;
  action: string;
  detail: string;
  editable?: boolean;
}

export function readHistory(): HistoryEntry[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeHistory(entries: HistoryEntry[]) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(0, 300)));
  window.dispatchEvent(new CustomEvent("lexicon-history-change"));
}

export function logHistory(entry: Omit<HistoryEntry, "id" | "at">) {
  writeHistory([{ id: newId(), at: new Date().toISOString(), ...entry }, ...readHistory()]);
}