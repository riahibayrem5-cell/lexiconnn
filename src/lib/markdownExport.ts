/**
 * Markdown export — one .md per book, with quotes, journal, sessions.
 * No JSZip dependency — emits a single concatenated .md (with `---` separators)
 * which works in Notion/Obsidian as a vault "import-as-multiple" via splitter,
 * and stays light. We also expose perBookMarkdown() so callers can zip later.
 */
import type { Book } from "@/lib/types";

const sanitize = (s: string) => s.replace(/[\\/:*?"<>|]+/g, "").trim();

export function bookToMarkdown(book: Book): string {
  const inst = book.instances[book.instances.length - 1];
  const lines: string[] = [];
  lines.push(`# ${book.title}`);
  lines.push(`*by ${book.author}*${book.year ? ` · ${book.year}` : ""}`);
  lines.push("");
  lines.push(`- **Status:** ${book.status}`);
  if (book.pages) lines.push(`- **Pages:** ${book.pages}`);
  if (book.language) lines.push(`- **Language:** ${book.language}`);
  if (book.isbn) lines.push(`- **ISBN:** ${book.isbn}`);
  if (book.tags?.length) lines.push(`- **Tags:** ${book.tags.join(", ")}`);
  if (inst?.rating) lines.push(`- **Rating:** ${inst.rating}/10`);
  if (inst?.arcOutcome) lines.push(`- **Arc:** ${inst.arcOutcome}`);
  lines.push("");

  if (inst?.firstUnderlined) {
    lines.push(`> *First underlined:* ${inst.firstUnderlined}`);
    lines.push("");
  }

  if (inst?.quotes?.length) {
    lines.push(`## Quotes`);
    for (const q of inst.quotes) {
      lines.push(`> ${q.text}`);
      lines.push(`> — ${book.author}, *${book.title}*${q.page ? `, p. ${q.page}` : ""}`);
      if (q.note) lines.push(`> *${q.note}*`);
      lines.push("");
    }
  }

  if (inst?.journal?.length) {
    lines.push(`## Journal`);
    for (const j of inst.journal) {
      lines.push(`### ${new Date(j.date).toLocaleDateString()}`);
      lines.push(j.body);
      lines.push("");
    }
  }

  if (inst?.sessions?.length) {
    lines.push(`## Sessions`);
    for (const s of inst.sessions) {
      const range = s.pagesStart && s.pagesEnd ? ` · pp ${s.pagesStart}–${s.pagesEnd}` : "";
      lines.push(`- ${new Date(s.date).toLocaleDateString()} · ${s.durationMin} min${range}${s.note ? ` — ${s.note}` : ""}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

export function perBookMarkdown(books: Book[]): { filename: string; content: string }[] {
  return books.map(b => ({
    filename: `${sanitize(b.title) || "untitled"}.md`,
    content: bookToMarkdown(b),
  }));
}

export function exportLibraryMarkdown(books: Book[]): void {
  const blocks = books.map(b => bookToMarkdown(b)).join("\n\n---\n\n");
  const blob = new Blob([blocks], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `lexicon-library-${new Date().toISOString().slice(0, 10)}.md`;
  a.click();
  URL.revokeObjectURL(url);
}
