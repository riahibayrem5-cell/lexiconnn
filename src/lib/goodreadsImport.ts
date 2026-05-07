// Goodreads CSV importer — parses the standard Goodreads export and adds books
// via the supplied addBook callback. Used by Settings page.
import type { BookStatus } from "@/lib/types";
import { acquireCover } from "@/lib/covers";

type AddBookFn = (b: Record<string, unknown>) => Promise<unknown>;

const SHELF_MAP: Record<string, BookStatus> = {
  read: "finished",
  "currently-reading": "reading",
  "to-read": "want",
};

function parseRow(row: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < row.length; i++) {
    const c = row[i];
    if (c === '"') {
      if (q && row[i + 1] === '"') { cur += '"'; i++; }
      else q = !q;
    } else if (c === "," && !q) {
      out.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

export async function importGoodreadsCsv(
  file: File,
  addBook: AddBookFn,
): Promise<{ added: number }> {
  const text = await file.text();
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) throw new Error("Empty CSV");

  const headers = parseRow(lines[0]).map(h => h.trim().toLowerCase());
  const idx = (name: string) => headers.indexOf(name.toLowerCase());
  const cTitle = idx("title");
  const cAuthor = idx("author");
  const cIsbn = idx("isbn13") >= 0 ? idx("isbn13") : idx("isbn");
  const cYear = idx("original publication year") >= 0
    ? idx("original publication year")
    : idx("year published");
  const cPages = idx("number of pages");
  const cShelf = idx("exclusive shelf");
  const cRating = idx("my rating");
  const cReview = idx("my review");
  if (cTitle < 0 || cAuthor < 0) throw new Error("Not a Goodreads export");

  const rows = lines.slice(1).map(parseRow);
  let added = 0;
  for (const r of rows.slice(0, 200)) {
    const title = (r[cTitle] || "").replace(/^="|"$/g, "").trim();
    const author = (r[cAuthor] || "").replace(/^="|"$/g, "").trim();
    if (!title || !author) continue;
    const isbn = cIsbn >= 0 ? (r[cIsbn] || "").replace(/[="]/g, "").trim() || undefined : undefined;
    const year = cYear >= 0 ? Number((r[cYear] || "").replace(/[="]/g, "")) || undefined : undefined;
    const pages = cPages >= 0 ? Number((r[cPages] || "").replace(/[="]/g, "")) || undefined : undefined;
    const shelf = cShelf >= 0 ? (r[cShelf] || "").replace(/[="]/g, "").trim().toLowerCase() : "to-read";
    const status: BookStatus = SHELF_MAP[shelf] ?? "want";
    const rating = cRating >= 0 ? Number(r[cRating]) || 0 : 0;
    const howIFound = cReview >= 0 ? (r[cReview] || "").replace(/^="|"$/g, "").slice(0, 200) : "";

    const acquired = isbn ? await acquireCover({ title, author, year, isbn }) : null;
    const created = await addBook({
      title, author, year, isbn,
      coverUrl: acquired?.url,
      coverSource: acquired?.source ?? "none",
      pages,
      status,
      tags: ["goodreads"],
      howIFound,
      instances: rating
        ? [{
            id: crypto.randomUUID(),
            startedAt: new Date().toISOString(),
            finishedAt: new Date().toISOString(),
            rating: rating * 2,
            sessions: [],
            quotes: [],
          }]
        : [],
    });
    if (created) added++;
  }
  return { added };
}
