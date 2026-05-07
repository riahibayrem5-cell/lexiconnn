import { aiChat } from "../_shared/ai.ts";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYS = `You are LEXICON's Reading Ritual coach — quiet, literary, like a thoughtful friend who reads everything. Speak in short, elegant prose. Never use emojis. Never be cheerful or generic.`;

function buildPrompt(mode: string, input: any): string {
  if (mode === "pick") {
    return `The reader wants to begin a session. Their mood: "${input.mood ?? "unspecified"}". Available time: ${input.minutes ?? 30} minutes.

Currently active books on their shelf (status reading or rereading):
${(input.active ?? []).map((b: any) => `- ${b.title} by ${b.author} (last opened: ${b.lastOpenedAt ?? "never"}, sessions: ${b.sessions ?? 0}, last note: ${b.lastNote ?? "—"})`).join("\n") || "none"}

Pick ONE book to read tonight. Return ONLY compact JSON: {"bookTitle":"exact title from the list","reason":"15-25 words on why this one tonight"}.`;
  }
  if (mode === "nudge") {
    return `Mid-session check-in. The reader has been reading "${input.title}" by ${input.author} for ${input.minutes} minutes. Their mood pulse: ${input.mood ?? "unspecified"}.
Write ONE single sentence (max 18 words) — a quiet, literary nudge. Either a question to notice something, or a small observation. No advice. No exclamation marks.`;
  }
  if (mode === "reflect") {
    return `The reader just finished a ${input.minutes}-minute session of "${input.title}" by ${input.author}.
Pages: ${input.pagesStart ?? "?"} → ${input.pagesEnd ?? "?"} (${input.pagesRead ?? 0} pages).
Mood after: ${input.moodAfter ?? "—"}/5.
Their closing thought: "${input.note ?? ""}"
Quote captured: "${input.quote ?? ""}"

Write a 2-3 sentence reflection in second person ("you") that mirrors their session back with insight. Reference what they wrote. Do not summarize the book. End with one sentence pointing toward what to watch for next session.`;
  }
  return "Respond briefly.";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { mode, input, language } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY missing");

    const isArabic = language === "ar";
    const arabicSys = isArabic
      ? " IMPORTANT: Respond entirely in fluent literary Modern Standard Arabic. For 'pick' mode, keep `bookTitle` exactly as it appears in the provided list (do NOT translate it), but write `reason` in Arabic."
      : "";

    const r = await aiChat({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYS + arabicSys },
          { role: "user", content: buildPrompt(mode, input) },
        ],
      });

    if (r.status === 429 || r.status === 402) {
      return new Response(JSON.stringify({ error: r.status === 429 ? "Rate limit. A breath, then try again." : "AI credits exhausted." }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!r.ok) {
      console.error("ritual-coach AI error", r.status, await r.text());
      return new Response(JSON.stringify({ error: "Coach unavailable" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const data = await r.json();
    const text = data.choices?.[0]?.message?.content ?? "";
    return new Response(JSON.stringify({ text }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("ritual-coach error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
