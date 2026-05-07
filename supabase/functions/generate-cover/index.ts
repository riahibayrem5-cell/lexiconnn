// Generates an AI book cover via Lovable AI (Gemini image), uploads to the
// book-covers bucket, and returns the public URL.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Body {
  title: string;
  author: string;
  year?: number;
  hint?: string;
  style?: string;        // e.g. "Penguin Classics", "NYRB", "Modernist", "Brutalist", "Watercolor"
  palette?: string;      // e.g. "muted earth tones", "stark black & red", "pastel"
  mood?: string;         // e.g. "melancholic", "haunting", "luminous"
  typography?: string;   // e.g. "serif display", "bold sans", "hand-lettered"
  imagery?: string;      // e.g. "abstract", "botanical", "geometric"
  extra?: string;        // free-form user instructions
  language?: "en" | "ar";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = (await req.json()) as Body;
    const { title, author, year, hint, style, palette, mood, typography, imagery, extra, language } = body;
    if (!title || !author) {
      return new Response(JSON.stringify({ error: "title and author required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY missing");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const isArabic = language === "ar";

    const styleLine = style ? `Design language: ${style}.` : `Design language: serious literary press (Penguin Classics, NYRB, Faber, Knopf).`;
    const paletteLine = palette ? `Color palette: ${palette}.` : "";
    const moodLine = mood ? `Mood: ${mood}.` : "";
    const typoLine = typography ? `Typography: ${typography}.` : "Typographic title and author name clearly legible.";
    const imageryLine = imagery ? `Imagery: ${imagery}.` : "";
    const extraLine = extra ? `Additional direction: ${extra}.` : "";

    const arabicBlock = isArabic
      ? ` LANGUAGE OF ALL TEXT ON THE COVER: Arabic only. Render the title and author entirely in beautifully typeset Arabic script (Naskh or Thuluth-inspired serif). The title should be the Arabic translation/transliteration of "${title}" and the author should be "${author}" rendered in Arabic letters. Right-to-left typesetting. Use elegant Arabic calligraphy aesthetics — diacritics optional. NO Latin letters anywhere on the cover. Spelling must be perfectly correct Arabic. `
      : "";

    const prompt = `Design a realistic, editorial book cover for "${title}" by ${author}${
      year ? ` (${year})` : ""
    }. ${hint ? `Themes: ${hint}.` : ""} ${styleLine} ${paletteLine} ${moodLine} ${typoLine} ${imageryLine} ${extraLine}${arabicBlock} Vertical 2:3 aspect ratio. Dignified, considered. No people's faces unless abstract. No watermarks, no fake barcodes, no QR codes, no logos.`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image",
        messages: [{ role: "user", content: prompt }],
        modalities: ["image", "text"],
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      throw new Error(`AI gateway ${aiRes.status}: ${errText}`);
    }

    const aiJson = await aiRes.json();
    const dataUrl: string | undefined = aiJson?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!dataUrl) throw new Error("No image returned from AI");

    // data:image/png;base64,XXXX
    const match = dataUrl.match(/^data:(image\/[a-zA-Z]+);base64,(.+)$/);
    if (!match) throw new Error("Invalid image data URL");
    const mime = match[1];
    const ext = mime.split("/")[1] || "png";
    const base64 = match[2];
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const filename = `ai/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("book-covers")
      .upload(filename, bytes, { contentType: mime, upsert: false });
    if (upErr) throw upErr;

    const { data: pub } = supabase.storage.from("book-covers").getPublicUrl(filename);

    return new Response(JSON.stringify({ url: pub.publicUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-cover error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
