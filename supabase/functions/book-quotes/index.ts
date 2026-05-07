// Returns 5–7 accurate, well-known quotes for a given book.
// Uses Lovable AI Gemini with structured tool-calling so the output is reliable JSON.
import { aiChat } from "../_shared/ai.ts";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Body {
  title: string;
  author: string;
  year?: number;
  count?: number;
  language?: "en" | "ar";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { title, author, year, count = 6, language } = (await req.json()) as Body;
    if (!title || !author) {
      return new Response(JSON.stringify({ error: "title and author required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY missing");

    const isArabic = language === "ar";
    const langSys = isArabic
      ? " For each quote, return the text translated into fluent literary Arabic preserving the meaning faithfully (or, if a recognized Arabic translation of this book exists, the corresponding Arabic line). The `context` and `theme` fields must also be in Arabic."
      : "";

    const system = `You are a literary archivist. You only return quotes you are confident appear verbatim in the named book. If you are not confident, omit that quote rather than invent one. Never paraphrase. Never hallucinate page numbers — leave page blank if unsure.${langSys}`;

    const user = `Return ${count} of the most resonant, widely-cited verbatim quotations from the book "${title}" by ${author}${year ? ` (${year})` : ""}. Prefer lines that capture the book's central themes, philosophy, or most memorable prose. Each quote MUST be word-for-word accurate.${isArabic ? " Output every field in Arabic." : ""}`;

    const aiRes = await aiChat({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        tools: [{
          type: "function",
          function: {
            name: "return_quotes",
            description: "Return verified verbatim quotations from the book.",
            parameters: {
              type: "object",
              properties: {
                quotes: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      text: { type: "string", description: "The exact verbatim quote." },
                      context: { type: "string", description: "One short sentence on what this passage is about or which character speaks it." },
                      theme: { type: "string", description: "One-or-two-word theme tag (e.g. 'mortality', 'faith')." },
                    },
                    required: ["text", "context", "theme"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["quotes"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "return_quotes" } },
      });

    if (!aiRes.ok) {
      if (aiRes.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited — try again in a minute." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiRes.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted — please add funds." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await aiRes.text();
      throw new Error(`AI gateway ${aiRes.status}: ${t}`);
    }

    const aiJson = await aiRes.json();
    const args = aiJson?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) throw new Error("No structured output from AI");
    const parsed = JSON.parse(args);

    return new Response(JSON.stringify({ quotes: parsed.quotes ?? [] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("book-quotes error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});