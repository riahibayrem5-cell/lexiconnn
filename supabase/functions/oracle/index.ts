import { aiChat } from "../_shared/ai.ts";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYS = `You are LEXICON's resident reading intelligence — a literate, well-read, slightly dry-witted advisor in the tradition of a great editor. Recommend serious, widely respected, highly rated books with durable critical reputation. Avoid shallow airport-business/self-help defaults, novelty picks, summaries, workbooks, and generic BookTok answers unless truly apt. Ground every claim in the user's actual reading history. Use elegant, restrained prose. Keep responses concise.`;

function buildPrompt(mode: string, input: any, book?: any): string {
  if (mode === "dissection") {
    return `Below is a reader's personal record of a book. Write a "dissection" — a reflective, intimate essay (3 short paragraphs) that interprets THEIR particular experience of this book based on their notes, quotes, rating, and emotional arc. Do not summarize the book's plot. Reflect their reading back to them with insight.

BOOK: ${book.title} by ${book.author}${book.year ? ` (${book.year})` : ""}
Tags: ${book.tags?.join(", ") ?? "—"}
Rating: ${book.rating ?? "—"}/10
First underlined: ${book.firstUnderlined ?? "—"}
Quotes saved: ${(book.quotes ?? []).map((q: any) => `"${q.text}" [${q.resonance}]${q.note ? ` — ${q.note}` : ""}`).join(" / ") || "none"}
Journal entries: ${(book.journal ?? []).join(" || ") || "none"}
Emotional arc: ${(book.arc ?? []).map((a: any) => `${a.point}%:${a.mood}/5`).join(" → ") || "none"}`;
  }
  if (mode === "what-next") {
    return `The reader's mood: "${input.mood}". Time available: ${input.time}. Wants: ${input.kind}.
Their strongest/highest-rated finished books: ${(input.favorites ?? input.last3).map((b: any) => `${b.title} by ${b.author} (${b.rating ?? "?"}/10; tags: ${(b.tags ?? []).join(",")})`).join("; ")}
Their recent finished books: ${input.last3.map((b: any) => `${b.title} by ${b.author} (${b.rating ?? "?"}/10)`).join("; ")}
Books already on their shelf, which you MUST NOT recommend: ${input.shelved.map((b: any) => b.title + " — " + b.author).join("; ")}

Recommend exactly 5 real books that are NOT in the shelf list. Prefer books with strong critical reputation, major awards, canon status, or consistently high reader ratings. Each description must be 28-42 words, one sentence, specific to this reader, and must fit a compact card. Return ONLY compact JSON with this shape: {"recommendations":[{"title":"","author":"","year":1900,"description":"28-42 words on why it fits","searchQuery":"title author","qualitySignal":"award/canon/reputation/high-rated reason"}]}.`;
  }
  if (mode === "thematic") {
    return `Theme: "${input.theme}". The reader's finished books with their notes/quotes:
${input.finished.map((b: any) => `- ${b.title} by ${b.author} (rating ${b.rating ?? "?"}, tags: ${b.tags.join(",")}); quotes: ${b.quotes.join(" | ")}`).join("\n")}

Write a thematic essay (3 paragraphs) that synthesizes how this theme appears across their library. Name patterns they may not have noticed. Quote their own saved quotes when fitting.`;
  }
  if (mode === "author") {
    return `Author: ${input.author}. The reader owns: ${input.owned.join(", ")}. Their Want list: ${input.want.map((b: any) => b.title).join(", ")}.
Write an "Author Universe" piece (3 paragraphs): the author's major influences (referencing any matches in the Want list), who they influenced, the literary/philosophical movement they belong to, and a specific reading path through this author's other works.`;
  }
  if (mode === "compare") {
    return `Compare these two books across six dimensions: Prose Style, Philosophical Position, Emotional Demand on Reader, Structural Ambition, Cultural Weight, Personal Resonance.

A: ${input.a.title} by ${input.a.author} — rating ${input.a.rating ?? "?"}, tags ${input.a.tags.join(",")}, quotes: ${input.a.quotes.join(" | ")}
B: ${input.b.title} by ${input.b.author} — rating ${input.b.rating ?? "?"}, tags ${input.b.tags.join(",")}, quotes: ${input.b.quotes.join(" | ")}

Write a structured but graceful parallel dossier. Use the dimension names as inline anchors. End with one sentence on what choosing one over the other would say about the reader today.`;
  }
  if (mode === "wrapped") {
    return `Year: ${input.year}. The reader finished these books:
${input.books.map((b: any) => `- ${b.title} by ${b.author} (${b.rating ?? "?"}/10, arc: ${b.arc ?? "?"}, tags: ${b.tags.join(",")})`).join("\n")}

Write a single, beautiful paragraph beginning "Your reading identity this year was…" that captures the through-line of their year — the questions they were chasing, the tones they sought.`;
  }
  return "Respond briefly.";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { mode, input, book, language } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY missing");

    const prompt = buildPrompt(mode, input, book);

    const isArabic = language === "ar";
    const arabicSys = isArabic
      ? " IMPORTANT: Respond entirely in fluent literary Modern Standard Arabic (الفصحى). Use proper Arabic punctuation. For the 'what-next' JSON mode, render `title`, `author`, `description`, and `qualitySignal` in Arabic, BUT keep `searchQuery` in English/Latin script (it is used to query an English book catalog). For all other modes, every word of the response must be Arabic."
      : "";

    const r = await aiChat({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYS + arabicSys },
          { role: "user", content: prompt },
        ],
      });

    if (r.status === 429) {
      return new Response(JSON.stringify({ error: "Rate limit reached. A breath, then try again." }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (r.status === 402) {
      return new Response(JSON.stringify({ error: "Lovable AI credits exhausted. Add credits in Settings → Workspace → Usage." }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!r.ok) {
      const t = await r.text();
      console.error("AI error", r.status, t);
      return new Response(JSON.stringify({ error: "The Oracle is silent." }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const data = await r.json();
    const text = data.choices?.[0]?.message?.content ?? "";
    return new Response(JSON.stringify({ text }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
