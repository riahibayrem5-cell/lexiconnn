// Generate a rich, generous, structured dossier about a book.
// Returns: summary, themes, 5 main ideas, characters, plot timeline,
// key quotes, symbols/motifs, lessons, criticisms, recommended-if-you-liked, spoilers.
import { aiChat } from "../_shared/ai.ts";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SCHEMA = {
  type: "object",
  properties: {
    oneLiner: { type: "string", description: "A single elegant sentence capturing the book." },
    genre: { type: "string" },
    moodTags: { type: "array", items: { type: "string" } },
    setting: { type: "string", description: "Time + place." },
    summary: { type: "string", description: "Spoiler-free summary, 3-5 sentences." },
    themes: {
      type: "array",
      items: {
        type: "object",
        properties: { name: { type: "string" }, description: { type: "string" } },
        required: ["name", "description"],
        additionalProperties: false,
      },
    },
    mainIdeas: {
      type: "array",
      description: "Exactly 5 core ideas the reader should remember.",
      items: {
        type: "object",
        properties: {
          idea: { type: "string" },
          explanation: { type: "string" },
          whyItMatters: { type: "string" },
        },
        required: ["idea", "explanation", "whyItMatters"],
        additionalProperties: false,
      },
    },
    characters: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          role: { type: "string", description: "Protagonist, antagonist, mentor, foil, etc." },
          description: { type: "string" },
          arc: { type: "string", description: "How they change." },
        },
        required: ["name", "role", "description"],
        additionalProperties: false,
      },
    },
    timeline: {
      type: "array",
      description: "Major plot beats in order. SPOILERS allowed here.",
      items: {
        type: "object",
        properties: {
          act: { type: "string" },
          event: { type: "string" },
        },
        required: ["act", "event"],
        additionalProperties: false,
      },
    },
    keyQuotes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          quote: { type: "string" },
          context: { type: "string" },
        },
        required: ["quote"],
        additionalProperties: false,
      },
    },
    symbols: {
      type: "array",
      items: {
        type: "object",
        properties: {
          symbol: { type: "string" },
          meaning: { type: "string" },
        },
        required: ["symbol", "meaning"],
        additionalProperties: false,
      },
    },
    lessons: {
      type: "array",
      description: "Personal takeaways the reader can carry into life.",
      items: { type: "string" },
    },
    discussionQuestions: { type: "array", items: { type: "string" } },
    criticisms: { type: "array", items: { type: "string" } },
    ifYouLiked: {
      type: "array",
      description: "Books to read next.",
      items: {
        type: "object",
        properties: { title: { type: "string" }, author: { type: "string" }, why: { type: "string" } },
        required: ["title", "author", "why"],
        additionalProperties: false,
      },
    },
    ending: { type: "string", description: "How the book ends. SPOILER." },
    twists: { type: "array", items: { type: "string" }, description: "Major twists. SPOILERS." },
  },
  required: ["oneLiner", "summary", "themes", "mainIdeas", "characters", "timeline", "keyQuotes", "lessons"],
  additionalProperties: false,
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { title, author, year, mode, existing, language } = await req.json();
    if (!title || !author) {
      return new Response(JSON.stringify({ error: "title and author required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY missing");

    const isExtend = mode === "extend" && existing;
    const isArabic = language === "ar";

    const langDirective = isArabic
      ? "CRITICAL: Write EVERY field of the dossier in fluent, literary Modern Standard Arabic (الفصحى). All strings — oneLiner, summary, themes, mainIdeas, characters, timeline, keyQuotes (translate quotes into Arabic, preserving meaning), symbols, lessons, discussionQuestions, criticisms, ifYouLiked.why, ending, twists, genre, setting, moodTags — must be Arabic. Do not mix English and Arabic in any field. Use proper Arabic punctuation (، and ؛ and ؟). Names of authors and book titles should appear in Arabic when a well-known Arabic translation/transliteration exists, otherwise transliterate carefully."
      : "Write everything in English.";

    const systemPrompt = isExtend
      ? [
          "You are a literary scholar EXTENDING an existing book dossier with deeper, novel insights the reader hasn't seen yet.",
          "You will be given the previous dossier. Your job: keep its structure, but expand every section with NEW material:",
          "- Add 2-3 NEW themes, NEW symbols, NEW characters (minor ones), NEW lessons.",
          "- Rewrite mainIdeas to be deeper / more nuanced (still exactly 5).",
          "- Expand timeline with more granular beats.",
          "- Add fresh quotes not in the previous version.",
          "- Add new discussion questions, new criticisms, new recommendations.",
          "- Keep summary spoiler-free; spoilers stay in timeline/ending/twists.",
          "Be generous, specific, accurate. No invented facts.",
          langDirective,
        ].join(" ")
      : [
          "You are a literary scholar writing a personal memory dossier for a reader who finished a book.",
          "Be generous, specific, accurate. No invented facts. If unsure about a detail, omit it rather than guess.",
          "For mainIdeas, return EXACTLY 5 items.",
          "For characters, include all major characters (typically 4-10).",
          "For timeline, cover beginning, rising action, midpoint, climax, resolution.",
          "Spoilers belong in: timeline, ending, twists. Keep summary spoiler-free.",
          langDirective,
        ].join(" ");

    const userContent = isExtend
      ? `Extend the dossier for: "${title}" by ${author}${year ? ` (${year})` : ""}.\n\nPREVIOUS DOSSIER:\n${JSON.stringify(existing, null, 2)}\n\nReturn a richer, deeper version with NEW insights. Do not just copy — go further.${isArabic ? " Respond entirely in Arabic." : ""}`
      : `Build the complete dossier for: "${title}" by ${author}${year ? ` (${year})` : ""}.${isArabic ? " Respond entirely in Arabic." : ""}`;

    const r = await aiChat({
      model: "google/gemini-2.5-pro",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      tools: [{
        type: "function",
        function: { name: "build_dossier", description: "Return the dossier", parameters: SCHEMA },
      }],
      tool_choice: { type: "function", function: { name: "build_dossier" } },
    });

    if (r.status === 429) {
      return new Response(JSON.stringify({ error: "Rate limit. Try again in a moment." }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (r.status === 402) {
      return new Response(JSON.stringify({ error: "AI credits exhausted. Add credits in Settings → Workspace → Usage." }), {
        status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!r.ok) {
      const t = await r.text();
      console.error("ai error", r.status, t);
      throw new Error("AI generation failed");
    }
    const j = await r.json();
    const args = j?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    const dossier = args ? JSON.parse(args) : null;
    if (!dossier) throw new Error("Empty dossier");
    return new Response(JSON.stringify({ dossier, generatedAt: new Date().toISOString() }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("book-dossier", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
