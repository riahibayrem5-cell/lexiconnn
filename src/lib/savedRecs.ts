// Saved recommendation searches — local-first store.
// Lets users revisit a past Recommendations page query and re-apply
// any of its editions to a Book Brain entry.
import { useEffect, useState, useCallback } from "react";

const KEY = "lexicon:saved-recs";
const HANDOFF_KEY = "lexicon:apply-edition";

export interface SavedEdition {
  language: string;
  languageLabel: string;
  title: string;
  author: string;
  publisher?: string;
  publishedDate?: string;
  isbn10?: string;
  isbn13?: string;
  pageCount?: number;
  coverUrl?: string;
  previewLink?: string;
  buyLink?: string;
}

export interface SavedToolRec {
  name: string;
  category: string;
  url?: string;
  why: string;
}

export interface SavedRec {
  id: string;
  query: string;
  detected?: { title: string; author: string; year?: number; confidence: number };
  editions: SavedEdition[];
  tools: SavedToolRec[];
  savedAt: string;
}

/** Payload handed off from Recommendations → BookBrain via sessionStorage. */
export interface EditionApplyPayload {
  bookId: string;
  recId: string;          // the SavedRec the edition came from
  edition: SavedEdition;
  detected?: SavedRec["detected"];
}

function readAll(): SavedRec[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function writeAll(list: SavedRec[]) {
  localStorage.setItem(KEY, JSON.stringify(list));
  // Notify other components in the same tab.
  window.dispatchEvent(new CustomEvent("lexicon:saved-recs-changed"));
}

export function useSavedRecs() {
  const [recs, setRecs] = useState<SavedRec[]>(() => readAll());

  useEffect(() => {
    const refresh = () => setRecs(readAll());
    window.addEventListener("lexicon:saved-recs-changed", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("lexicon:saved-recs-changed", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const save = useCallback((rec: Omit<SavedRec, "id" | "savedAt">) => {
    const list = readAll();
    // Replace any existing identical query (case-insensitive trimmed).
    const existing = list.findIndex(
      (r) => r.query.trim().toLowerCase() === rec.query.trim().toLowerCase()
    );
    const next: SavedRec = {
      ...rec,
      id: existing >= 0 ? list[existing].id : crypto.randomUUID(),
      savedAt: new Date().toISOString(),
    };
    if (existing >= 0) list.splice(existing, 1, next);
    else list.unshift(next);
    // Cap at 24 to keep storage bounded.
    writeAll(list.slice(0, 24));
    return next;
  }, []);

  const remove = useCallback((id: string) => {
    writeAll(readAll().filter((r) => r.id !== id));
  }, []);

  const clear = useCallback(() => writeAll([]), []);

  return { recs, save, remove, clear };
}

// ---------- Cross-page edition apply handoff ----------
export function stageEditionApply(payload: EditionApplyPayload) {
  sessionStorage.setItem(HANDOFF_KEY, JSON.stringify(payload));
}

export function consumeEditionApply(bookId: string): EditionApplyPayload | null {
  try {
    const raw = sessionStorage.getItem(HANDOFF_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as EditionApplyPayload;
    if (parsed.bookId !== bookId) return null;
    sessionStorage.removeItem(HANDOFF_KEY);
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Translate an edition + saved search into a partial Book update.
 * Used by BookBrain when a user accepts the "Apply edition" prompt.
 */
export function editionToBookPatch(payload: EditionApplyPayload) {
  const e = payload.edition;
  return {
    language: e.languageLabel,
    originalLanguage: payload.detected
      ? undefined // we don't reliably know — leave to user unless we add it later
      : undefined,
    isbn: e.isbn13 ?? e.isbn10,
    coverUrl: e.coverUrl,
    coverSource: "google" as const,
    pages: e.pageCount,
    year: e.publishedDate ? Number(e.publishedDate.slice(0, 4)) || undefined : undefined,
  };
}

/** A first-underlined "starter prompt" derived from the edition. */
export function firstUnderlinedPrompt(payload: EditionApplyPayload) {
  const e = payload.edition;
  return `Open “${e.title}” in ${e.languageLabel}. The first sentence I'd underline:`;
}
