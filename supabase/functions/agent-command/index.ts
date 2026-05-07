import { aiChat } from "../_shared/ai.ts";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { message } = await req.json();
    if (!message || typeof message !== "string") {
      return new Response(JSON.stringify({ error: "message required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY missing");

    const r = await aiChat({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "Parse a user's library-agent command. Return one action only. For book search/add, extract the real book title and author if stated; remove filler like 'a book by' and 'called'. Supported actions: add_book, search_book, remove_book, set_status, rate_book, tag_book, add_note, add_quote, move_book, navigate, recommend, export_library, unknown." },
          { role: "user", content: message },
        ],
        tools: [{
          type: "function",
          function: {
            name: "command",
            description: "Normalized library command",
            parameters: {
              type: "object",
              properties: {
                action: { type: "string", enum: ["add_book", "search_book", "remove_book", "set_status", "rate_book", "tag_book", "add_note", "add_quote", "move_book", "navigate", "recommend", "export_library", "unknown"] },
                title: { type: ["string", "null"] },
                author: { type: ["string", "null"] },
                query: { type: ["string", "null"] },
                targetTitle: { type: ["string", "null"] },
                route: { type: ["string", "null"], enum: ["shelf", "oracle", "ritual", "quotes", "archive", "constellation", "brain", "settings", null] },
                status: { type: ["string", "null"], enum: ["want", "reading", "finished", "abandoned", "rereading", null] },
                rating: { type: ["integer", "null"], minimum: 1, maximum: 10 },
                tag: { type: ["string", "null"] },
                text: { type: ["string", "null"] },
                confidence: { type: "number", minimum: 0, maximum: 1 }
              },
              required: ["action", "title", "author", "query", "targetTitle", "route", "status", "rating", "tag", "text", "confidence"],
              additionalProperties: false
            }
          }
        }],
        tool_choice: { type: "function", function: { name: "command" } }
      });

    if (r.status === 429 || r.status === 402) {
      return new Response(JSON.stringify({ error: r.status === 429 ? "AI rate limit reached" : "AI credits exhausted" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!r.ok) {
      console.error("agent-command AI error", r.status, await r.text());
      return new Response(JSON.stringify({ error: "Agent parser unavailable" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const data = await r.json();
    const args = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    return new Response(args || JSON.stringify({ action: "unknown", confidence: 0 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("agent-command error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});