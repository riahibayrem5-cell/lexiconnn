// Generates a 2D book spine via Lovable AI (Nano Banana / Gemini image),
// uploads it to the book-covers bucket under spines/, and returns the URL.
//
// Spine design rules (encoded into the prompt):
//   • Width = (pages / 400) inch  → mapped to image aspect ratio
//   • Style sampled from the supplied front cover image (color/font/texture)
//   • Title ≤ 10 chars  → STACKED letters, vertically centered, oriented upright
//   • Title > 10 chars  → CONTINUOUS, rotated 90° clockwise, flowing top→bottom
//   • Author at top, horizontal, all-caps; page count + small publisher mark at bottom
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Body {
  bookId?: string;
  title: string;
  author: string;
  pages?: number;
  coverUrl?: string;
  publisher?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { bookId, title, author, pages, coverUrl, publisher } = (await req.json()) as Body;
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

    const safePages = Math.max(48, Math.min(1400, pages ?? 320));
    const widthInches = +(safePages / 400).toFixed(2);
    const aspect = `1:${Math.round(9 / Math.max(0.35, widthInches))}`;
    const isShortTitle = title.length <= 10;
    const titleStyle = isShortTitle
      ? `STACKED LAYOUT — render the title as individual capital letters, one letter per line, perfectly centered horizontally on the spine, vertically stacked top-to-bottom in the MIDDLE third of the spine. Each letter is upright and readable as you tilt your head. Letters in order: ${title.toUpperCase().split("").join(" / ")}. Use a tall serif/display typeface scaled so each letter nearly fills the spine width.`
      : `CONTINUOUS LAYOUT — render the full title "${title.toUpperCase()}" as a single horizontal text string, then rotate the entire string 90° CLOCKWISE so it reads from TOP to BOTTOM down the spine, occupying the middle two-thirds of the spine length. Use a tall serif/display typeface, generous letter-spacing, all caps.`;

    const prompt = [
      `Design a single, photorealistic flat 2D BOOK SPINE strictly following this print template (no front cover, no 3D mockup, no perspective, straight-on view only).`,
      `Aspect ratio approximately ${aspect} — very tall and narrow, like a real ${widthInches} inch thick book spine.`,
      `LAYOUT (top → bottom, in this exact order):`,
      `  1. TOP ZONE: AUTHOR NAME "${author.toUpperCase()}" placed horizontally (NOT rotated), all-caps, small letter-spacing, centered, in a small thin sans/serif. Sits in the top ~12% of the spine.`,
      `  2. MIDDLE ZONE: TITLE — ${titleStyle}`,
      `  3. LOWER ZONE: PAGE COUNT "${safePages} PP" placed horizontally, small caps, centered, in the bottom ~18% area above the publisher mark.`,
      `  4. BOTTOM ZONE: a tiny generic open-book icon glyph, centered, with the word "${(publisher ?? "PUBLISHER").toUpperCase()}" in very small caps directly beneath it.`,
      coverUrl
        ? `STYLE MATCH: sample the dominant background color, paper/cloth/leather texture, and typeface FAMILY from the supplied front cover so this spine looks like the SAME physical book. Apply matching color/design to subtle margin design zones along the left and right vertical edges of the spine.`
        : `Use a dignified literary press style (Penguin Classics / NYRB / Faber feel). Add subtle margin design zones along the left and right vertical edges.`,
      `Add subtle gold or silver foil details for title/author if the cover style suggests it. Include faint top and bottom board edges so it reads as a real bound book.`,
      `STRICT NEGATIVE CONSTRAINTS: NO barcodes, NO QR codes, NO ISBN numbers, NO watermarks, NO grid lines, NO ruler marks, NO template annotations, NO labels like "[AUTHOR NAME]" or "[TITLE]" or "[PAGE COUNT]" — only render the actual provided values. NO 3D perspective, NO shadow of a 3D book, NO front cover visible. ABSOLUTELY no extra text beyond author / title / page count / publisher.`,
    ].join(" ");

    const messages: any[] = [{ role: "user", content: [] as any[] }];
    messages[0].content.push({ type: "text", text: prompt });
    if (coverUrl) {
      messages[0].content.push({ type: "image_url", image_url: { url: coverUrl } });
    }

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image",
        messages,
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

    const match = dataUrl.match(/^data:(image\/[a-zA-Z]+);base64,(.+)$/);
    if (!match) throw new Error("Invalid image data URL");
    const mime = match[1];
    const ext = mime.split("/")[1] || "png";
    const bytes = Uint8Array.from(atob(match[2]), (c) => c.charCodeAt(0));

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const filename = `spines/${bookId ?? crypto.randomUUID()}-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("book-covers")
      .upload(filename, bytes, { contentType: mime, upsert: false });
    if (upErr) throw upErr;

    const { data: pub } = supabase.storage.from("book-covers").getPublicUrl(filename);

    // If we know the bookId, persist the link directly so the agent loop doesn't have to.
    if (bookId) {
      await supabase
        .from("books")
        .update({ spine_url: pub.publicUrl, spine_generated_at: new Date().toISOString() })
        .eq("id", bookId);
    }

    return new Response(
      JSON.stringify({ url: pub.publicUrl, widthInches, layout: title.length <= 10 ? "stacked" : "continuous" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("generate-spine error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
