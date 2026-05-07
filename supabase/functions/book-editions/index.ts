// Smart multi-language edition finder.
// Detects the book the user means, then returns best editions in
// English, Arabic, French, and German with ISBN + cover + publisher data.
import { aiChat } from "../_shared/ai.ts";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LANGS = [
  { code: "en", label: "English" },
  { code: "ar", label: "Arabic" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
] as const;

type Edition = {
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
  rationale?: string;
};

async function gbSearch(query: string, lang: string, limit = 8) {
  const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&langRestrict=${lang}&maxResults=${limit}&printType=books&orderBy=relevance`;
  const r = await fetch(url);
  if (!r.ok) return [];
  const j = await r.json();
  return (j.items ?? []) as any[];
}

function pickBestEdition(items: any[], lang: string, langLabel: string): Edition | null {
  // Prefer items with ISBN-13, cover, publisher, page count.
  const scored = items
    .map((it) => {
      const v = it.volumeInfo ?? {};
      if (v.language && v.language !== lang) return null;
      const ids: any[] = v.industryIdentifiers ?? [];
      const isbn13 = ids.find((i) => i.type === "ISBN_13")?.identifier;
      const isbn10 = ids.find((i) => i.type === "ISBN_10")?.identifier;
      const links = v.imageLinks ?? {};
      const cover = links.extraLarge || links.large || links.medium || links.thumbnail;
      const score =
        (isbn13 ? 40 : 0) +
        (isbn10 ? 12 : 0) +
        (cover ? 25 : 0) +
        (v.publisher ? 12 : 0) +
        (v.pageCount && v.pageCount > 80 ? 10 : 0) +
        (v.ratingsCount ? Math.min(20, Math.log2(v.ratingsCount + 1) * 4) : 0);
      return {
        score,
        edition: {
          language: lang,
          languageLabel: langLabel,
          title: v.title ?? "Unknown",
          author: (v.authors ?? ["Unknown"])[0],
          publisher: v.publisher,
          publishedDate: v.publishedDate,
          isbn10,
          isbn13,
          pageCount: v.pageCount,
          coverUrl: cover ? cover.replace(/^http:/, "https:").replace(/zoom=\d/, "zoom=2") : undefined,
          previewLink: v.previewLink,
          buyLink: it.saleInfo?.buyLink,
        } as Edition,
      };
    })
    .filter(Boolean)
    .sort((a: any, b: any) => b.score - a.score);
  return scored[0]?.edition ?? null;
}

async function detectCanonical(rawQuery: string, apiKey: string) {
  // Ask AI to canonicalize the query into a confident title/author guess.
  try {
    const r = await aiChat({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "You identify books from short or noisy queries. Return the canonical English title and original author. Never invent. If unsure, return your best single guess and a confidence 0-1." },
          { role: "user", content: `User query: "${rawQuery}"` },
        ],
        tools: [{
          type: "function",
          function: {
            name: "identify_book",
            parameters: {
              type: "object",
              properties: {
                title: { type: "string" },
                author: { type: "string" },
                originalLanguage: { type: "string" },
                year: { type: ["integer", "null"] },
                confidence: { type: "number", minimum: 0, maximum: 1 },
              },
              required: ["title", "author", "confidence"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "identify_book" } },
      });
    if (!r.ok) return null;
    const j = await r.json();
    const args = j?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    return args ? JSON.parse(args) : null;
  } catch {
    return null;
  }
}

async function suggestTools(book: { title: string; author: string }, apiKey: string) {
  try {
    const r = await aiChat({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "You recommend AI-powered reading and study tools that pair well with a specific book. Suggest real, well-known products. No invented URLs." },
          { role: "user", content: `Suggest 5 AI-powered tools to deepen the experience of reading "${book.title}" by ${book.author}. Mix study, audio, summary, language learning, and discussion tools.` },
        ],
        tools: [{
          type: "function",
          function: {
            name: "return_tools",
            parameters: {
              type: "object",
              properties: {
                tools: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      name: { type: "string" },
                      category: { type: "string" },
                      url: { type: "string" },
                      why: { type: "string" },
                    },
                    required: ["name", "category", "why"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["tools"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "return_tools" } },
      });
    if (!r.ok) return [];
    const j = await r.json();
    const args = j?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    return args ? JSON.parse(args).tools ?? [] : [];
  } catch {
    return [];
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { query } = await req.json();
    if (!query || typeof query !== "string" || query.trim().length < 2) {
      return new Response(JSON.stringify({ error: "query required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY missing");

    // Step 1: canonicalize via AI
    const detected = await detectCanonical(query, apiKey);
    const baseQuery = detected?.title && detected?.author
      ? `intitle:"${detected.title}" inauthor:"${detected.author}"`
      : query;

    // Step 2: search Google Books per language in parallel
    const editionResults = await Promise.all(
      LANGS.map(async (l) => {
        const items = await gbSearch(baseQuery, l.code, 8);
        return pickBestEdition(items, l.code, l.label);
      })
    );

    // Step 3: AI tool suggestions (don't block on failure)
    const tools = detected?.title
      ? await suggestTools({ title: detected.title, author: detected.author }, apiKey)
      : [];

    return new Response(JSON.stringify({
      query,
      detected,
      editions: editionResults.filter(Boolean),
      tools,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("book-editions error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
