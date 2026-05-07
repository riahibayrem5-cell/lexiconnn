// Goodreads sync — pulls public RSS feeds for read / currently-reading / to-read shelves
// Triggered manually (per-user) or by pg_cron (service-role, all enabled users).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const SHELVES = [
  { gr: "read", status: "finished" as const },
  { gr: "currently-reading", status: "reading" as const },
  { gr: "to-read", status: "want" as const },
];

interface GRItem {
  goodreads_id: string;
  title: string;
  author: string;
  isbn?: string;
  cover_url?: string;
  pages?: number;
  year?: number;
  rating?: number; // 1..5 → mapped to 1..10
  status: "finished" | "reading" | "want";
}

function pick(xml: string, tag: string): string | undefined {
  const re = new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>|<${tag}>([\\s\\S]*?)</${tag}>`);
  const m = xml.match(re);
  const v = (m?.[1] ?? m?.[2] ?? "").trim();
  return v || undefined;
}

function parseRSS(xml: string, status: GRItem["status"]): GRItem[] {
  const items: GRItem[] = [];
  const itemBlocks = xml.split(/<item>/).slice(1);
  for (const raw of itemBlocks) {
    const block = "<item>" + raw.split("</item>")[0] + "</item>";
    const goodreads_id = pick(block, "book_id");
    const title = pick(block, "title");
    const author = pick(block, "author_name");
    if (!goodreads_id || !title || !author) continue;
    const isbn = pick(block, "isbn") ?? pick(block, "isbn13");
    const cover_url =
      pick(block, "book_large_image_url") ??
      pick(block, "book_medium_image_url") ??
      pick(block, "book_image_url");
    const pagesStr = pick(block, "num_pages");
    const yearStr = pick(block, "book_published");
    const ratingStr = pick(block, "user_rating");
    items.push({
      goodreads_id,
      title,
      author,
      isbn,
      cover_url,
      pages: pagesStr ? parseInt(pagesStr, 10) || undefined : undefined,
      year: yearStr ? parseInt(yearStr, 10) || undefined : undefined,
      rating: ratingStr ? parseInt(ratingStr, 10) || undefined : undefined,
      status,
    });
  }
  return items;
}

function extractGoodreadsId(input: string): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (/^\d+$/.test(trimmed)) return trimmed;
  const m = trimmed.match(/goodreads\.com\/(?:user|review\/list)\/(?:show\/)?(\d+)/i);
  return m?.[1] ?? null;
}

async function syncOneUser(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  userId: string,
  goodreadsUserId: string,
): Promise<{ added: number; updated: number; errors: string[] }> {
  const errors: string[] = [];
  let added = 0;
  let updated = 0;

  for (const shelf of SHELVES) {
    try {
      const url = `https://www.goodreads.com/review/list_rss/${goodreadsUserId}?shelf=${shelf.gr}`;
      const res = await fetch(url, { headers: { "User-Agent": "LexiconShelfSync/1.0" } });
      if (!res.ok) {
        errors.push(`${shelf.gr}: HTTP ${res.status}`);
        continue;
      }
      const xml = await res.text();
      const items = parseRSS(xml, shelf.status);

      for (const it of items) {
        const { data: existing } = await supabase
          .from("books")
          .select("id, status, instances")
          .eq("user_id", userId)
          .eq("goodreads_id", it.goodreads_id)
          .maybeSingle();

        if (existing) {
          // Only update status if user hadn't customized it past Goodreads scope
          const patch: Record<string, unknown> = { status: it.status };
          if (it.rating && Array.isArray((existing as any).instances)) {
            const inst = [...(existing as any).instances];
            if (inst[0]) {
              inst[0] = { ...inst[0], rating: it.rating * 2 };
              patch.instances = inst;
            }
          }
          const { error } = await supabase.from("books").update(patch).eq("id", (existing as any).id);
          if (error) errors.push(`update ${it.title}: ${error.message}`);
          else updated++;
        } else {
          const instance = {
            id: crypto.randomUUID(),
            journal: [],
            quotes: [],
            arc: [],
            sessions: [],
            ...(it.rating ? { rating: it.rating * 2 } : {}),
            ...(shelf.status === "finished" ? { finishedAt: new Date().toISOString() } : {}),
            ...(shelf.status === "reading" ? { startedAt: new Date().toISOString() } : {}),
          };
          const { error } = await supabase.from("books").insert({
            user_id: userId,
            goodreads_id: it.goodreads_id,
            title: it.title,
            author: it.author,
            isbn: it.isbn ?? null,
            cover_url: it.cover_url ?? null,
            cover_source: it.cover_url ? "google" : "none",
            pages: it.pages ?? null,
            year: it.year ?? null,
            status: it.status,
            format: "physical",
            tags: ["goodreads"],
            ai_tags: [],
            connections: [],
            instances: [instance],
            added_at: new Date().toISOString(),
          });
          if (error) errors.push(`insert ${it.title}: ${error.message}`);
          else added++;
        }
      }
    } catch (e) {
      errors.push(`${shelf.gr}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  await supabase
    .from("profiles")
    .update({ goodreads_last_synced_at: new Date().toISOString() })
    .eq("user_id", userId);

  return { added, updated, errors };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

    let body: { mode?: "user" | "all"; goodreads_url?: string } = {};
    try { body = await req.json(); } catch { /* GET or empty */ }

    // Cron / scheduled mode: sync ALL enabled users.
    // Auth: caller must present the secret stored in app_config.goodreads_cron_secret
    // as a Bearer token (the pg_cron job reads it from the same row).
    if (body.mode === "all") {
      const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
      const { data: secretRow } = await admin
        .from("app_config")
        .select("value")
        .eq("key", "goodreads_cron_secret")
        .maybeSingle();
      const expected = (secretRow as { value?: string } | null)?.value;
      const auth = req.headers.get("Authorization") ?? "";
      const presented = auth.replace(/^Bearer\s+/i, "");
      if (!expected || presented !== expected) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: profiles, error } = await admin
        .from("profiles")
        .select("user_id, goodreads_user_id")
        .eq("goodreads_sync_enabled", true)
        .not("goodreads_user_id", "is", null);
      if (error) throw error;

      const results: Record<string, unknown> = {};
      for (const p of profiles ?? []) {
        results[(p as any).user_id] = await syncOneUser(
          admin,
          (p as any).user_id,
          (p as any).goodreads_user_id,
        );
      }
      return new Response(JSON.stringify({ ok: true, results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // User-triggered mode: requires JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claims, error: claimsErr } = await supabase.auth.getClaims(
      authHeader.replace("Bearer ", ""),
    );
    if (claimsErr || !claims?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claims.claims.sub as string;

    // If a new URL was provided, save it first
    if (body.goodreads_url) {
      const grId = extractGoodreadsId(body.goodreads_url);
      if (!grId) {
        return new Response(
          JSON.stringify({ error: "Could not parse Goodreads user ID from URL" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      await supabase
        .from("profiles")
        .update({
          goodreads_user_id: grId,
          goodreads_url: body.goodreads_url,
          goodreads_sync_enabled: true,
        })
        .eq("user_id", userId);
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("goodreads_user_id")
      .eq("user_id", userId)
      .maybeSingle();

    const grId = (profile as any)?.goodreads_user_id;
    if (!grId) {
      return new Response(
        JSON.stringify({ error: "No Goodreads URL configured. Paste your profile URL first." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const result = await syncOneUser(admin, userId, grId);
    return new Response(JSON.stringify({ ok: true, ...result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
