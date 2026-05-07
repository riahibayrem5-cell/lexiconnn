// Book search: real public metadata APIs only. No generated covers.
// Priority: Google Books + Gutendex + Open Library, with English editions first.

const OL_BASE = "https://openlibrary.org";
const GB_BASE = "https://www.googleapis.com/books/v1";
const GUTENDEX_BASE = "https://gutendex.com/books";

export interface OLResult {
  key: string;            // unique id
  title: string;
  author: string;
  year?: number;
  isbn?: string;
  coverId?: number;
  coverUrl?: string;
  language?: string;
  source?: "google" | "openlibrary" | "gutendex" | "internetarchive";
  pages?: number;
  categories?: string[];
  isFiction?: boolean;
  publisher?: string;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const hasLatinQuery = (s: string) => /[a-z]/i.test(s);
const isMostlyLatin = (s: string) => !/[\u0400-\u04FF\u0370-\u03FF\u0590-\u05FF\u0600-\u06FF\u3040-\u30FF\u4E00-\u9FFF]/.test(s);
const badTitle = (title: string) => /\b(study guide|summary|workbook|analysis|lesson plan|sparknotes|cliffsnotes|book notes|companion)\b/i.test(title);
const shallowCategory = (categories?: string[]) => (categories ?? []).some(c => /self-help|business|success|motivational|study aid|juvenile/i.test(c));
const improveGoogleCover = (cover: string) =>
  cover.replace(/^http:/, "https:").replace(/&edge=curl/, "").replace(/zoom=\d/, "zoom=2");
const latinAuthorAliases: Record<string, string> = {
  "фёдор михайлович достоевский": "Fyodor Dostoevsky",
  "федор михайлович достоевский": "Fyodor Dostoevsky",
  "лев толстой": "Leo Tolstoy",
  "лев николаевич толстой": "Leo Tolstoy",
  "анто́н че́хов": "Anton Chekhov",
  "антон павлович чехов": "Anton Chekhov",
  "όμηρος": "Homer",
};
const latinizeAuthor = (author: string) => latinAuthorAliases[author.toLowerCase()] ?? author;

const CACHE_PREFIX = "lexicon-api-cache:";
const CACHE_TTL = 1000 * 60 * 60 * 24;

async function cachedJson<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const cacheKey = `${CACHE_PREFIX}${key}`;
  try {
    const cached = JSON.parse(localStorage.getItem(cacheKey) || "null");
    if (cached?.time && Date.now() - cached.time < CACHE_TTL) return cached.value as T;
  } catch { /* ignore corrupt cache */ }
  const value = await fetcher();
  try { localStorage.setItem(cacheKey, JSON.stringify({ time: Date.now(), value })); } catch { /* storage full */ }
  return value;
}

// Famous classic authors — for these, prefer Penguin Classics editions.
const CLASSIC_AUTHORS = /\b(dostoev|tolstoy|chekhov|dickens|austen|bront[eë]|hugo|flaubert|kafka|proust|melville|hawthorne|hardy|eliot|thackeray|joyce|woolf|orwell|huxley|fitzgerald|hemingway|faulkner|steinbeck|wharton|conrad|stevenson|wilde|shelley|stoker|poe|wells|verne|dumas|balzac|stendhal|zola|maupassant|gogol|turgenev|pushkin|gorky|nabokov|camus|sartre|mann|hesse|rilke|borges|cervantes|homer|virgil|ovid|plato|aristotle|sophocles|aeschylus|euripides|dante|machiavelli|shakespeare|milton|chaucer|swift|defoe|goethe|schiller|nietzsche|freud|marx|murakami)/i;

const isPenguinClassic = (publisher?: string) =>
  !!publisher && /penguin\s+(classics|books)|penguin\b/i.test(publisher);

function scoreEnglishResult(r: OLResult, query: string) {
  const title = norm(r.title);
  const q = norm(query);
  const queryWords = q.split(" ").filter(Boolean);
  const titleMatches = queryWords.filter(w => title.includes(w)).length;
  const exactTitle = title === q ? 140 : title.includes(q) || q.includes(title) ? 55 : 0;
  const isClassic = CLASSIC_AUTHORS.test(r.author) || CLASSIC_AUTHORS.test(query);
  return (
    (badTitle(r.title) || badTitle(r.author) ? -300 : 0) +
    (r.language === "en" || r.language === "eng" ? 80 : 0) +
    (isMostlyLatin(r.title) ? 35 : -60) +
    (r.coverUrl ? 20 : 0) +
    (r.pages && r.pages > 120 ? 12 : 0) +
    (shallowCategory(r.categories) ? -35 : 0) +
    (isClassic && isPenguinClassic(r.publisher) ? 220 : 0) +
    exactTitle +
    titleMatches * 8 +
    (r.source === "google" ? 10 : r.source === "gutendex" ? 8 : 0)
  );
}

export function normalizeBookQuery(input: string) {
  let q = input.trim().replace(/[“”]/g, '"').replace(/[’]/g, "'");
  const called = q.match(/(?:book\s+)?by\s+(.+?)\s+(?:called|titled|named)\s+["']?(.+?)["']?$/i);
  if (called) return `${called[2]} ${called[1]}`.trim();
  const titleBy = q.match(/(?:called|titled|named)\s+["']?(.+?)["']?\s+by\s+(.+)$/i);
  if (titleBy) return `${titleBy[1]} ${titleBy[2]}`.trim();
  q = q.replace(/^(please\s+)?(add|shelve|save|search|find|look for|show me|give me)\s+/i, "");
  q = q.replace(/^a\s+book\s+/i, "").replace(/^the\s+book\s+/i, "");
  return q.trim();
}

// ---------- Google Books ----------
async function searchGoogleBooks(q: string, limit = 10): Promise<OLResult[]> {
  // langRestrict + filter=ebooks-or-print favors editions with rich metadata
  const url = `${GB_BASE}/volumes?q=${encodeURIComponent(q)}&langRestrict=en&maxResults=${limit}&printType=books&orderBy=relevance`;
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    const items = (data.items ?? []) as any[];
    return items
      .map((it): OLResult | null => {
        const v = it.volumeInfo ?? {};
        // Skip non-English results that slipped through
        if (v.language && v.language !== "en") return null;
        const title: string = v.title ?? "";
        if (!title) return null;
        const author: string = (v.authors && v.authors[0]) ?? "Unknown";
        const year = v.publishedDate ? Number(String(v.publishedDate).slice(0, 4)) : undefined;
        const isbn =
          (v.industryIdentifiers ?? []).find((i: any) => i.type === "ISBN_13")?.identifier ??
          (v.industryIdentifiers ?? []).find((i: any) => i.type === "ISBN_10")?.identifier;
        // Prefer the largest cover Google offers; force https
        const links = v.imageLinks ?? {};
        const coverUrl = links.extraLarge || links.large || links.medium || links.thumbnail || links.smallThumbnail;
        return {
          key: `gb:${it.id}`,
          title,
          author,
          year: Number.isFinite(year as number) ? year : undefined,
          isbn,
          coverUrl: coverUrl ? improveGoogleCover(coverUrl) : undefined,
          language: "en",
          source: "google",
          pages: v.pageCount,
          categories: v.categories ?? [],
          isFiction: (v.categories ?? []).some((c: string) => /fiction|novel|literature/i.test(c)),
          publisher: v.publisher,
        };
      })
      .filter((x): x is OLResult => x !== null);
  } catch {
    return [];
  }
}

// ---------- Gutendex / Project Gutenberg (public-domain English covers) ----------
async function searchGutendexEnglish(q: string, limit = 10): Promise<OLResult[]> {
  const url = `${GUTENDEX_BASE}?search=${encodeURIComponent(q)}&languages=en`;
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    return ((data.results ?? []) as any[]).slice(0, limit).map((d): OLResult => ({
      key: `gut:${d.id}`,
      title: d.title,
      author: d.authors?.[0]?.name ?? "Unknown",
      year: d.authors?.[0]?.birth_year,
      coverUrl: d.formats?.["image/jpeg"]?.replace(/^http:/, "https:"),
      language: "en",
      source: "gutendex",
      categories: d.subjects?.slice(0, 4) ?? [],
      isFiction: (d.subjects ?? []).some((s: string) => /fiction|novel|literature/i.test(s)),
    }));
  } catch {
    return [];
  }
}

// ---------- Open Library (fallback) ----------
async function searchOpenLibraryEnglish(q: string, limit = 10): Promise<OLResult[]> {
  // language:eng filter forces English editions
  const url = `${OL_BASE}/search.json?q=${encodeURIComponent(q)}&language=eng&limit=${limit * 3}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.docs ?? [])
      .filter((d: any) => !hasLatinQuery(q) || isMostlyLatin(d.title ?? ""))
      .map((d: any) => ({
      key: `ol:${d.key}`,
      title: d.title,
      author: latinizeAuthor((d.author_name && d.author_name[0]) ?? "Unknown"),
      year: d.first_publish_year,
      isbn: d.isbn?.[0],
      coverId: d.cover_i,
      coverUrl: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg` : undefined,
      language: "en",
      source: "openlibrary" as const,
      pages: d.number_of_pages_median,
      categories: d.subject?.slice(0, 4) ?? [],
      isFiction: (d.subject ?? []).some((s: string) => /fiction|novel|literature/i.test(s)),
      publisher: (d.publisher && d.publisher[0]) ?? undefined,
    }));
  } catch {
    return [];
  }
}

/** Public API used by the app. Google Books primary, OL fallback, English-only. */
export async function searchOpenLibrary(q: string, limit = 8): Promise<OLResult[]> {
  const query = normalizeBookQuery(q);
  if (!query.trim()) return [];

  return cachedJson(`search:${norm(query)}:${limit}`, async () => {

    const wantsPenguin = CLASSIC_AUTHORS.test(query);
    // Run providers in parallel; rank English/Latin-title editions before originals.
    const [google, googlePenguin, gutendex, openlib] = await Promise.all([
      searchGoogleBooks(query, limit),
      wantsPenguin ? searchGoogleBooks(`${query} inpublisher:"penguin classics"`, Math.min(8, limit)) : Promise.resolve([] as OLResult[]),
      searchGutendexEnglish(query, limit),
      searchOpenLibraryEnglish(query, limit * 2),
    ]);

  const ranked = [...googlePenguin, ...google, ...gutendex, ...openlib]
    .filter(r => !badTitle(r.title) && !badTitle(r.author))
    .sort((a, b) => scoreEnglishResult(b, query) - scoreEnglishResult(a, query));

  // De-duplicate: same title + author (case-insensitive) -> keep highest ranked
  const seen = new Set<string>();
  const merged: OLResult[] = [];

  for (const r of ranked) {
    const key = `${norm(r.title)}::${norm(r.author)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(r);
    if (merged.length >= limit) break;
  }

  // If both APIs returned nothing English, fall back to a permissive OL query so user
  // still sees something rather than an empty list.
  if (merged.length === 0) {
    try {
      const res = await fetch(`${OL_BASE}/search.json?q=${encodeURIComponent(query)}&limit=${limit}`);
      if (res.ok) {
        const data = await res.json();
        return (data.docs ?? []).filter((d: any) => !badTitle(d.title ?? "") && !badTitle(d.author_name?.[0] ?? "")).map((d: any) => ({
          key: `ol:${d.key}`,
          title: d.title,
          author: latinizeAuthor((d.author_name && d.author_name[0]) ?? "Unknown"),
          year: d.first_publish_year,
          isbn: d.isbn?.[0],
          coverId: d.cover_i,
          coverUrl: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg` : undefined,
          language: d.language?.[0],
          source: "openlibrary" as const,
          pages: d.number_of_pages_median,
          categories: d.subject?.slice(0, 4) ?? [],
          isFiction: (d.subject ?? []).some((s: string) => /fiction|novel|literature/i.test(s)),
        }));
      }
    } catch { /* ignore */ }
  }

    return merged;
  });
}

export async function enrichBookMetadata(input: { title: string; author: string; isbn?: string }) {
  const results = await searchOpenLibrary(input.isbn || `${input.title} ${input.author}`, 5);
  return results[0] ?? null;
}

export function coverFromIsbn(isbn: string): string {
  return `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`;
}
