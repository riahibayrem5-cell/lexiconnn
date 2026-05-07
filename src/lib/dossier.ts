// Persistent book dossiers — saved in DB for signed-in users (forever, across devices),
// falls back to localStorage for guests.
import { supabase } from "@/integrations/supabase/client";
import { getCurrentLang } from "@/lib/i18n";

export interface DossierIdea { idea: string; explanation: string; whyItMatters: string; }
export interface DossierCharacter { name: string; role: string; description: string; arc?: string; }
export interface DossierTheme { name: string; description: string; }
export interface DossierTimelineBeat { act: string; event: string; }
export interface DossierQuote { quote: string; context?: string; }
export interface DossierSymbol { symbol: string; meaning: string; }
export interface DossierRecommendation { title: string; author: string; why: string; }

export interface BookDossier {
  oneLiner: string;
  genre?: string;
  moodTags?: string[];
  setting?: string;
  summary: string;
  themes: DossierTheme[];
  mainIdeas: DossierIdea[];
  characters: DossierCharacter[];
  timeline: DossierTimelineBeat[];
  keyQuotes: DossierQuote[];
  symbols?: DossierSymbol[];
  lessons: string[];
  discussionQuestions?: string[];
  criticisms?: string[];
  ifYouLiked?: DossierRecommendation[];
  ending?: string;
  twists?: string[];
}

export interface CachedDossier {
  bookId: string;
  title?: string;
  author?: string;
  generatedAt: string;
  extendedAt?: string;
  extensionCount?: number;
  dossier: BookDossier;
}

const GUEST_KEY = "lexicon-book-dossiers-v1";

function readGuestAll(): Record<string, CachedDossier> {
  try { return JSON.parse(localStorage.getItem(GUEST_KEY) || "{}"); } catch { return {}; }
}
function writeGuestAll(map: Record<string, CachedDossier>) {
  localStorage.setItem(GUEST_KEY, JSON.stringify(map));
  window.dispatchEvent(new CustomEvent("lexicon-dossier-change"));
}

export async function loadDossier(bookId: string): Promise<CachedDossier | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return readGuestAll()[bookId] ?? null;
  const { data, error } = await supabase
    .from("book_dossiers" as any)
    .select("*")
    .eq("book_id", bookId)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as any;
  return {
    bookId: row.book_id,
    generatedAt: row.generated_at,
    extendedAt: row.extended_at ?? undefined,
    extensionCount: row.extension_count ?? 0,
    dossier: row.dossier,
  };
}

export async function saveDossierRemote(args: {
  bookId: string; title: string; author: string;
  dossier: BookDossier; generatedAt?: string;
  isExtension?: boolean;
}) {
  const { data: { user } } = await supabase.auth.getUser();
  const generatedAt = args.generatedAt ?? new Date().toISOString();
  if (!user) {
    const all = readGuestAll();
    const prev = all[args.bookId];
    all[args.bookId] = {
      bookId: args.bookId,
      generatedAt: prev?.generatedAt ?? generatedAt,
      extendedAt: args.isExtension ? generatedAt : prev?.extendedAt,
      extensionCount: (prev?.extensionCount ?? 0) + (args.isExtension ? 1 : 0),
      dossier: args.dossier,
    };
    writeGuestAll(all);
    return all[args.bookId];
  }

  // Upsert in DB
  const { data: existing } = await supabase
    .from("book_dossiers" as any)
    .select("id, extension_count, generated_at")
    .eq("book_id", args.bookId)
    .maybeSingle();

  const existingRow = existing as any;
  const payload: any = {
    user_id: user.id,
    book_id: args.bookId,
    title: args.title,
    author: args.author,
    dossier: args.dossier,
    extension_count: (existingRow?.extension_count ?? 0) + (args.isExtension ? 1 : 0),
    extended_at: args.isExtension ? generatedAt : null,
  };

  if (existingRow) {
    if (!args.isExtension) payload.generated_at = generatedAt;
    await supabase.from("book_dossiers" as any).update(payload).eq("id", existingRow.id);
  } else {
    payload.generated_at = generatedAt;
    await supabase.from("book_dossiers" as any).insert(payload);
  }

  window.dispatchEvent(new CustomEvent("lexicon-dossier-change"));

  return {
    bookId: args.bookId,
    generatedAt: existingRow?.generated_at ?? generatedAt,
    extendedAt: args.isExtension ? generatedAt : undefined,
    extensionCount: payload.extension_count,
    dossier: args.dossier,
  };
}

export async function generateDossier(args: {
  title: string; author: string; year?: number;
  mode?: "create" | "extend";
  existing?: BookDossier;
}) {
  const { data, error } = await supabase.functions.invoke("book-dossier", {
    body: { ...args, language: getCurrentLang() },
  });
  if (error) throw error;
  if (!data?.dossier) throw new Error("Empty response");
  return data as { dossier: BookDossier; generatedAt: string };
}

// Bulk preload — used by History page to know which books already have dossiers
export async function loadDossierMap(bookIds: string[]): Promise<Set<string>> {
  if (bookIds.length === 0) return new Set();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    const all = readGuestAll();
    return new Set(bookIds.filter(id => all[id]));
  }
  const { data } = await supabase
    .from("book_dossiers" as any)
    .select("book_id")
    .in("book_id", bookIds);
  return new Set(((data ?? []) as any[]).map(r => r.book_id));
}

// Load every saved dossier for the current user (or guest map).
export async function loadAllDossiers(): Promise<CachedDossier[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return Object.values(readGuestAll()).sort((a, b) =>
      (b.extendedAt ?? b.generatedAt).localeCompare(a.extendedAt ?? a.generatedAt),
    );
  }
  const { data } = await supabase
    .from("book_dossiers" as any)
    .select("*")
    .order("generated_at", { ascending: false });
  return ((data ?? []) as any[]).map((row) => ({
    bookId: row.book_id,
    title: row.title,
    author: row.author,
    generatedAt: row.generated_at,
    extendedAt: row.extended_at ?? undefined,
    extensionCount: row.extension_count ?? 0,
    dossier: row.dossier,
  }));
}

// Extend a dossier `passes` times, feeding each pass back into the next.
export async function extendDossier(args: {
  bookId: string; title: string; author: string; year?: number;
  starting: BookDossier;
  passes: 1 | 2 | 3;
  onProgress?: (pass: number, total: number) => void;
}): Promise<CachedDossier> {
  let current = args.starting;
  let saved: CachedDossier | null = null;
  for (let i = 1; i <= args.passes; i++) {
    args.onProgress?.(i, args.passes);
    const { dossier, generatedAt } = await generateDossier({
      title: args.title, author: args.author, year: args.year,
      mode: "extend", existing: current,
    });
    current = dossier;
    saved = await saveDossierRemote({
      bookId: args.bookId, title: args.title, author: args.author,
      dossier, generatedAt, isExtension: true,
    });
  }
  if (!saved) throw new Error("No passes ran");
  return saved;
}
