// Cover acquisition pipeline — REAL covers ONLY.
// 1. The provided real cover URL (Google Books / Open Library result)
// 2. Open Library by ISBN (large)
// 3. Open Library cover-id search by title+author
// 4. Google Books search by title+author
// 5. Google Books search by ISBN
// 6. Gutendex / Project Gutenberg public covers
// 7. Internet Archive cover API via Open Library records
// If none found → return null. We NEVER auto-generate AI covers.
import { supabase } from "@/integrations/supabase/client";

const BUCKET = "book-covers";

async function urlExists(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    const timeout = window.setTimeout(() => resolve(false), 4500);
    img.onload = () => {
      window.clearTimeout(timeout);
      // Open Library placeholders are usually 1x1; real covers have meaningful dimensions.
      resolve(img.naturalWidth > 32 && img.naturalHeight > 32);
    };
    img.onerror = () => {
      window.clearTimeout(timeout);
      resolve(false);
    };
    img.referrerPolicy = "no-referrer";
    img.src = url;
  });
}

/** Mirror an Open Library cover into our bucket so it persists and is fast. */
async function mirrorToBucket(srcUrl: string, hint: string): Promise<string | null> {
  try {
    const res = await fetch(srcUrl);
    if (!res.ok) return null;
    const blob = await res.blob();
    if (blob.size < 1000) return null;
    const ext = (blob.type.split("/")[1] || "jpg").replace("jpeg", "jpg");
    const path = `real/${slugify(hint)}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, blob, { contentType: blob.type, upsert: false });
    if (error) {
      console.warn("mirror upload failed", error);
      return srcUrl; // fall back to direct OL url
    }
    return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  } catch (e) {
    console.warn("mirror failed", e);
    return srcUrl;
  }
}

/** Search Open Library by title+author and return the best cover URL, if any. */
async function findOpenLibraryCover(title: string, author: string): Promise<string | null> {
  try {
    const url = `https://openlibrary.org/search.json?title=${encodeURIComponent(title)}&author=${encodeURIComponent(author)}&limit=5`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    for (const d of (data.docs ?? []) as any[]) {
      if (d.cover_i) return `https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg`;
      if (d.isbn?.[0]) return `https://covers.openlibrary.org/b/isbn/${d.isbn[0]}-L.jpg`;
    }
    return null;
  } catch {
    return null;
  }
}

async function findGutendexCover(title: string, author: string): Promise<string | null> {
  try {
    const res = await fetch(`https://gutendex.com/books?search=${encodeURIComponent(`${title} ${author}`)}&languages=en`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.results?.[0]?.formats?.["image/jpeg"]?.replace(/^http:/, "https:") ?? null;
  } catch {
    return null;
  }
}

async function findInternetArchiveCover(title: string, author: string): Promise<string | null> {
  try {
    const res = await fetch(`https://openlibrary.org/search.json?title=${encodeURIComponent(title)}&author=${encodeURIComponent(author)}&language=eng&limit=10`);
    if (!res.ok) return null;
    const data = await res.json();
    for (const d of (data.docs ?? []) as any[]) {
      const id = d.lending_identifier_s ?? d.ia?.[0];
      if (id) return `https://archive.org/services/img/${id}`;
    }
    return null;
  } catch {
    return null;
  }
}

/** Search Google Books by title+author and return the largest available cover URL. */
async function findGoogleBooksCover(title: string, author: string): Promise<string | null> {
  try {
    const q = `intitle:${encodeURIComponent(title)}+inauthor:${encodeURIComponent(author)}`;
    const url = `https://www.googleapis.com/books/v1/volumes?q=${q}&langRestrict=en&maxResults=5&printType=books`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    for (const it of (data.items ?? []) as any[]) {
      const links = it.volumeInfo?.imageLinks ?? {};
      let cover: string | undefined =
        links.extraLarge || links.large || links.medium || links.thumbnail || links.smallThumbnail;
      if (cover) {
        cover = cover.replace(/^http:/, "https:").replace(/&edge=curl/, "").replace(/zoom=\d/, "zoom=2");
        return cover;
      }
    }
    return null;
  } catch {
    return null;
  }
}

/** Look up a Google Books cover from an ISBN directly. */
async function findGoogleByIsbn(isbn: string): Promise<string | null> {
  try {
    const url = `https://www.googleapis.com/books/v1/volumes?q=isbn:${encodeURIComponent(isbn)}&maxResults=1`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const links = data.items?.[0]?.volumeInfo?.imageLinks ?? {};
    let cover: string | undefined =
      links.extraLarge || links.large || links.medium || links.thumbnail || links.smallThumbnail;
    if (!cover) return null;
    return cover.replace(/^http:/, "https:").replace(/&edge=curl/, "").replace(/zoom=\d/, "zoom=2");
  } catch {
    return null;
  }
}

/** LibraryThing cover-by-ISBN — public, no key needed. */
async function findLibraryThingCover(isbn?: string): Promise<string | null> {
  if (!isbn) return null;
  const u = `https://covers.librarything.com/devkey/large/${encodeURIComponent(isbn)}`;
  return (await urlExists(u)) ? u : null;
}

/** Wikipedia page-image lookup — strong for canonical / classic titles. */
async function findWikipediaCover(title: string, author: string): Promise<string | null> {
  try {
    const q = `${title} ${author} novel book`;
    const search = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&origin=*&srlimit=1&srsearch=${encodeURIComponent(q)}`,
    );
    if (!search.ok) return null;
    const sj = await search.json();
    const pageTitle = sj.query?.search?.[0]?.title;
    if (!pageTitle) return null;
    const img = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&prop=pageimages&piprop=original&titles=${encodeURIComponent(pageTitle)}`,
    );
    if (!img.ok) return null;
    const ij = await img.json();
    const pages = ij.query?.pages ?? {};
    const first: any = Object.values(pages)[0];
    const src = first?.original?.source as string | undefined;
    return src && (await urlExists(src)) ? src : null;
  } catch {
    return null;
  }
}

/** Open Library cover-edition-key fallback — finds covers L/M variants miss. */
async function findOpenLibraryAnySize(title: string, author: string): Promise<string | null> {
  try {
    const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(`${title} ${author}`)}&limit=10`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    for (const d of (data.docs ?? []) as any[]) {
      if (d.cover_edition_key) {
        const u = `https://covers.openlibrary.org/b/olid/${d.cover_edition_key}-L.jpg`;
        if (await urlExists(u)) return u;
      }
      if (d.cover_i) {
        for (const s of ["L", "M"]) {
          const u = `https://covers.openlibrary.org/b/id/${d.cover_i}-${s}.jpg`;
          if (await urlExists(u)) return u;
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

export interface AcquiredCover {
  url: string;
  source: "openlibrary" | "google" | "gutendex" | "internetarchive" | "librarything" | "wikipedia" | "uploaded";
}

export async function acquireCover(opts: {
  title: string;
  author: string;
  year?: number;
  isbn?: string;
  openLibraryUrl?: string;
  hint?: string;
}): Promise<AcquiredCover | null> {
  const slug = `${opts.title}-${opts.author}`;

  type Candidate = { src: AcquiredCover["source"]; run: () => Promise<string | null> };
  const candidates: Candidate[] = [
    { src: "openlibrary", run: async () => (opts.openLibraryUrl && (await urlExists(opts.openLibraryUrl))) ? opts.openLibraryUrl! : null },
    { src: "openlibrary", run: async () => {
      if (!opts.isbn) return null;
      const u = `https://covers.openlibrary.org/b/isbn/${opts.isbn}-L.jpg`;
      return (await urlExists(u)) ? u : null;
    } },
    { src: "google", run: async () => {
      if (!opts.isbn) return null;
      const u = await findGoogleByIsbn(opts.isbn);
      return u && (await urlExists(u)) ? u : null;
    } },
    { src: "librarything", run: () => findLibraryThingCover(opts.isbn) },
    { src: "openlibrary", run: async () => {
      const u = await findOpenLibraryCover(opts.title, opts.author);
      return u && (await urlExists(u)) ? u : null;
    } },
    { src: "google", run: async () => {
      const u = await findGoogleBooksCover(opts.title, opts.author);
      return u && (await urlExists(u)) ? u : null;
    } },
    { src: "openlibrary", run: () => findOpenLibraryAnySize(opts.title, opts.author) },
    { src: "wikipedia", run: () => findWikipediaCover(opts.title, opts.author) },
    { src: "gutendex", run: async () => {
      const u = await findGutendexCover(opts.title, opts.author);
      return u && (await urlExists(u)) ? u : null;
    } },
    { src: "internetarchive", run: async () => {
      const u = await findInternetArchiveCover(opts.title, opts.author);
      return u && (await urlExists(u)) ? u : null;
    } },
  ];

  for (const c of candidates) {
    const found = await c.run();
    if (found) {
      const mirrored = await mirrorToBucket(found, slug);
      return { url: mirrored ?? found, source: c.src };
    }
  }

  return null;
}

export async function uploadCustomCover(file: File): Promise<string | null> {
  try {
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const path = `uploaded/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false });
    if (error) {
      console.error("upload custom cover failed", error);
      return null;
    }
    return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  } catch (e) {
    console.error("upload custom cover error", e);
    return null;
  }
}

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}
