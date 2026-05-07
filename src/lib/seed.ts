import type { Book, BookStatus } from "./types";

const SPINE_PALETTE = [
  "30 35% 22%", "16 45% 28%", "41 35% 30%", "8 40% 24%",
  "25 30% 18%", "210 20% 18%", "90 20% 22%", "0 30% 22%",
  "30 50% 35%", "16 55% 35%", "41 25% 22%", "200 18% 20%",
];

export function pickSpineColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return `hsl(${SPINE_PALETTE[h % SPINE_PALETTE.length]})`;
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export const STATUS_LABEL: Record<BookStatus, string> = {
  reading: "Currently Reading",
  rereading: "Re-reading",
  finished: "Finished",
  want: "Want to Read",
  abandoned: "Abandoned",
};

export const STATUS_ORDER: BookStatus[] = ["reading", "rereading", "finished", "want", "abandoned"];

// Fresh start: every new user begins with an empty shelf.
export const SEED_BOOKS: Book[] = [];
