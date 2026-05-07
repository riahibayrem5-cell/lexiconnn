import { aiChat } from "../_shared/ai.ts";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYS_PLAN = `You are LEXICON's library agent. Convert the user's natural language into ONE OR MORE atomic actions, executed in order. Use exact book titles when the book is on the user's shelf — match against the provided shelf list. For "this book" / "this one" / "current" use the provided contextBookTitle. Never invent books not requested. If the user asks a question instead of giving a command, return a single qa action.`;

const SYS_QA = `You are LEXICON's resident reading intelligence — literate, dry, well-read. Answer questions about the reader's own library using ONLY the data provided. Be concise (2-4 sentences). Quote exact titles. If the data does not contain the answer, say so plainly.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { mode, message, contextBookTitle, shelf, libraryDigest } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY missing");

    if (mode === "qa") {
      const r = await aiChat({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: SYS_QA },
            { role: "user", content: `Reader's library digest:\n${libraryDigest}\n\nQuestion: ${message}` },
          ],
        });
      if (r.status === 429 || r.status === 402) {
        return new Response(JSON.stringify({ error: r.status === 429 ? "Rate limit. A breath, then try again." : "AI credits exhausted." }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (!r.ok) return new Response(JSON.stringify({ error: "Agent unavailable" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const data = await r.json();
      return new Response(JSON.stringify({ answer: data.choices?.[0]?.message?.content ?? "" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // mode === "plan"
    const r = await aiChat({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYS_PLAN },
          { role: "user", content: `Current page context book: ${contextBookTitle ?? "none"}.
Shelf (titles only): ${shelf}.
User said: "${message}"` },
        ],
        tools: [{
          type: "function",
          function: {
            name: "plan",
            description: "Ordered list of atomic actions to execute.",
            parameters: {
              type: "object",
              properties: {
                actions: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      action: { type: "string", enum: ["add_book", "search_book", "remove_book", "set_status", "rate_book", "tag_book", "add_note", "add_quote", "navigate", "recommend", "export_library", "qa", "unknown"] },
                      title: { type: ["string", "null"] },
                      author: { type: ["string", "null"] },
                      query: { type: ["string", "null"] },
                      route: { type: ["string", "null"], enum: ["shelf", "oracle", "ritual", "quotes", "archive", "brain", "settings", "history", "recommendations", "review", null] },
                      status: { type: ["string", "null"], enum: ["want", "reading", "finished", "abandoned", "rereading", null] },
                      rating: { type: ["integer", "null"], minimum: 1, maximum: 10 },
                      tag: { type: ["string", "null"] },
                      text: { type: ["string", "null"] }
                    },
                    required: ["action", "title", "author", "query", "route", "status", "rating", "tag", "text"],
                    additionalProperties: false
                  }
                },
                confidence: { type: "number", minimum: 0, maximum: 1 }
              },
              required: ["actions", "confidence"],
              additionalProperties: false
            }
          }
        }],
        tool_choice: { type: "function", function: { name: "plan" } }
      });

    if (r.status === 429 || r.status === 402) {
      return new Response(JSON.stringify({ error: r.status === 429 ? "Rate limit." : "AI credits exhausted." }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!r.ok) {
      console.error("agent-brain plan err", r.status, await r.text());
      return new Response(JSON.stringify({ error: "Agent unavailable" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const data = await r.json();
    const args = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    return new Response(args || JSON.stringify({ actions: [], confidence: 0 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("agent-brain error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
