// Generates a beautifully designed shareable quote card image via AI image generation.
// Returns a data URL that the client downloads as PNG.
import { aiChat } from "../_shared/ai.ts";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Body {
  text: string;
  author: string;
  title: string;
  theme?: string; // optional aesthetic hint
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { text, author, title, theme } = (await req.json()) as Body;
    if (!text || !author || !title) {
      return new Response(JSON.stringify({ error: "text, author, title required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY missing");

    // Trim very long quotes so the typography stays legible
    const safeText = text.length > 360 ? text.slice(0, 357) + "…" : text;

    const prompt = `Design a museum-quality square (1:1) shareable literary quote card.

QUOTE TO TYPESET (this exact text MUST appear, verbatim, perfectly legible, no typos, no extra words):
"${safeText}"

ATTRIBUTION (must appear, smaller, below the quote): — ${author.toUpperCase()}, ${title.toUpperCase()}

SMALL FOOTER: LEXICON

AESTHETIC: editorial luxury, dark moody library at 2am, warm amber lamplight on aged paper, subtle gold-foil accents, deep ink-black or oxblood background, classical serif typography for the quote (think Cormorant or Garamond), mono-spaced caps for attribution. ${theme ? `Mood: ${theme}.` : ""}

COMPOSITION: generous margins, the quote dominates the canvas, centered or rule-of-thirds, hairline gold border or ornament, refined paper texture overlay. Like a New Yorker pull-quote crossed with a Penguin Classics endpaper.

RULES: NO emojis. NO watermarks. NO QR codes. NO Lorem Ipsum. The quote text and attribution MUST be spelled exactly as given. Sophisticated, adult, literary — never cartoonish.`;

    const aiRes = await aiChat({
        // Pro image model for legible typography
        model: "google/gemini-3-pro-image-preview",
        messages: [{ role: "user", content: prompt }],
        modalities: ["image", "text"],
      });

    if (!aiRes.ok) {
      if (aiRes.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited — try again shortly." }), {
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
    const dataUrl: string | undefined =
      aiJson?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!dataUrl) throw new Error("No image returned from AI");

    return new Response(JSON.stringify({ url: dataUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("quote-card error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});