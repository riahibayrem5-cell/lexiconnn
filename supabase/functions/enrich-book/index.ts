import { aiChat } from "../_shared/ai.ts";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { title, author, subjects = [], isbn, year, format } = await req.json();
    if (!title || !author) {
      return new Response(JSON.stringify({ error: "title and author required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY missing");

    const prompt = `For the book "${title}" by ${author}, return concise library enrichment only: 5 lowercase category tags, whether it is fiction, a one-sentence shelf note, and a conservative estimated page count if exact metadata is missing. Use edition clues only: ISBN ${isbn ?? "unknown"}, year ${year ?? "unknown"}, format ${format ?? "unknown"}, source subjects ${(subjects ?? []).join(", ")}. Page estimate must be an integer between 48 and 1400 or null if impossible. Do not invent cover art.`;

    const r = await aiChat({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "user", content: prompt }],
        tools: [{
          type: "function",
          function: {
            name: "return_enrichment",
            description: "Return safe book metadata enrichment.",
            parameters: {
              type: "object",
              properties: {
                tags: { type: "array", items: { type: "string" } },
                isFiction: { type: "boolean" },
                note: { type: "string" },
                estimatedPages: { type: ["integer", "null"], minimum: 48, maximum: 1400 }
              },
              required: ["tags", "isFiction", "note", "estimatedPages"],
              additionalProperties: false
            }
          }
        }],
        tool_choice: { type: "function", function: { name: "return_enrichment" } }
      });

    if (r.status === 429 || r.status === 402) {
      return new Response(JSON.stringify({ error: r.status === 429 ? "AI rate limit reached" : "AI credits exhausted", fallback: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!r.ok) {
      console.error("enrich-book AI error", r.status, await r.text());
      return new Response(JSON.stringify({ error: "AI enrichment unavailable", fallback: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const data = await r.json();
    const args = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    return new Response(args || JSON.stringify({ tags: [], isFiction: false, note: "", estimatedPages: null }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("enrich-book error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown", fallback: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
