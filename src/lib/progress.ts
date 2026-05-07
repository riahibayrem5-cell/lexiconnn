import type { Book } from "./types";

/** Latest known page position from sessions (pagesEnd of latest session that has it). */
export function latestPagePosition(book: Book): number | undefined {
  for (let i = book.instances.length - 1; i >= 0; i--) {
    const sessions = book.instances[i].sessions;
    for (let j = sessions.length - 1; j >= 0; j--) {
      const e = sessions[j].pagesEnd;
      if (typeof e === "number" && e > 0) return e;
    }
  }
  return undefined;
}

/** Reading progress as a 0-1 ratio. Returns undefined if we can't compute it. */
export function bookProgress(book: Book): number | undefined {
  if (book.status === "finished") return 1;
  if (!book.pages || book.pages <= 0) return undefined;
  const pos = latestPagePosition(book);
  if (!pos) return undefined;
  return Math.max(0, Math.min(1, pos / book.pages));
}

/** Total minutes logged across all sessions of a book. */
export function totalMinutes(book: Book): number {
  return book.instances.reduce((s, i) => s + i.sessions.reduce((ss, x) => ss + x.durationMin, 0), 0);
}

/** Sum minutes read today across all books. */
export function minutesToday(books: Book[]): number {
  const today = new Date().toDateString();
  let total = 0;
  for (const b of books) {
    for (const i of b.instances) {
      for (const s of i.sessions) {
        if (new Date(s.date).toDateString() === today) total += s.durationMin;
      }
    }
  }
  return total;
}

/** Sum minutes read this calendar week (Mon-Sun). */
export function minutesThisWeek(books: Book[]): number {
  const now = new Date();
  const day = (now.getDay() + 6) % 7; // make Monday = 0
  const monday = new Date(now); monday.setDate(now.getDate() - day); monday.setHours(0, 0, 0, 0);
  let total = 0;
  for (const b of books) {
    for (const i of b.instances) {
      for (const s of i.sessions) {
        if (new Date(s.date) >= monday) total += s.durationMin;
      }
    }
  }
  return total;
}

/** Day-streak of consecutive days with at least one logged session, ending today. */
export function readingStreak(books: Book[]): number {
  const set = new Set<string>();
  for (const b of books) for (const i of b.instances) for (const s of i.sessions)
    set.add(new Date(s.date).toDateString());
  let streak = 0;
  const today = new Date();
  for (let i = 0; i < 365; i++) {
    const d = new Date(today); d.setDate(today.getDate() - i);
    if (set.has(d.toDateString())) streak++; else break;
  }
  return streak;
}
