// Oracle Chat — streaming, persona-aware, library-aware.
// Receives the chat history + a "context pack" summarizing the user's library
// + persona + model + reasoning effort and streams an SSE response.
import { aiChat } from "../_shared/ai.ts";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PERSONAS: Record<string, string> = {
  editor:
    "You are a literate, dry-witted editor in the tradition of a great literary press. Concise, exacting, allergic to clichés. You quote the user's own notes when apt.",
  mentor:
    "You are a warm, patient reading mentor. You meet the reader where they are, encourage curiosity, and gently push them toward harder works when ready.",
  critic:
    "You are a brutalist literary critic. Honest, unflinching, willing to call a book overrated. You always justify your verdicts with concrete textual evidence.",
  scholar:
    "You are a polymath scholar — comparative literature, philosophy, history. You draw connections across traditions and centuries, citing influences and inheritances.",
  poet:
    "You are a poet of recommendations. You speak in image and rhythm. Brief, lyrical, musical — every reply could be read aloud.",
};

const LENS: Record<string, string> = {
  literary: "Privilege literary craft, prose, and form.",
  philosophical: "Privilege ideas, arguments, and conceptual stakes.",
  emotional: "Privilege emotional truth, character interiority, and resonance.",
  historical: "Privilege historical and cultural context.",
  escapist: "Privilege immersion, plot, and world-building.",
};

const SYS_BASE = `You are LEXICON's Oracle — a reading intelligence with full visibility into the user's library. Always ground recommendations and observations in their actual reading history (titles, ratings, tags, quotes, abandoned books, patterns). Avoid airport-business defaults and BookTok clichés unless truly apt. Render responses in clean Markdown with short paragraphs.`;

interface Body {
  messages: { role: "user" | "assistant"; content: string }[];
  context?: any;
  persona?: string;
  lens?: string;
  model?: string;
  reasoning?: "minimal" | "low" | "medium" | "high";
  language?: "en" | "ar";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, context, persona = "editor", lens = "literary", model = "google/gemini-3-flash-preview", reasoning, language = "en" } = (await req.json()) as Body;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY missing");

    const personaText = PERSONAS[persona] ?? PERSONAS.editor;
    const lensText = LENS[lens] ?? LENS.literary;

    const ctxBlock = context
      ? `\n\nREADER CONTEXT (use this; do not invent facts):\n${JSON.stringify(context).slice(0, 12000)}`
      : "";

    const langLine = language === "ar"
      ? `\n\nLANGUAGE: Respond ENTIRELY in fluent literary Modern Standard Arabic (الفصحى). Translate any English book titles or quotes into Arabic when a recognized Arabic edition exists, otherwise transliterate carefully. Use proper Arabic punctuation. Never mix English sentences into the reply. Markdown formatting still applies.`
      : "";

    const system = `${SYS_BASE}${langLine}\n\nVoice: ${personaText}\nLens: ${lensText}${ctxBlock}`;

    const body: any = {
      model,
      messages: [
        { role: "system", content: system },
        ...messages,
      ],
      stream: true,
    };
    if (reasoning && (model.includes("gpt-5") || model.includes("gemini-3"))) {
      body.reasoning = { effort: reasoning };
    }

    const r = await aiChat(body);

    if (r.status === 429) {
      return new Response(JSON.stringify({ error: "Rate limit reached. A breath, then try again." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (r.status === 402) {
      return new Response(JSON.stringify({ error: "Lovable AI credits exhausted. Add credits in Settings → Workspace → Usage." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!r.ok || !r.body) {
      const t = await r.text();
      console.error("AI error", r.status, t);
      return new Response(JSON.stringify({ error: "The Oracle is silent." }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(r.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
