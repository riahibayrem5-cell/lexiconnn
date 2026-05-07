// LEXICON core types

export type BookStatus = "want" | "reading" | "finished" | "abandoned" | "rereading";
export type BookFormat = "physical" | "ebook" | "audiobook" | "dual";
export type ArcOutcome = "positive" | "complex" | "difficult";
export type ResonanceTag =
  | "beautiful-language"
  | "philosophical-bomb"
  | "character-truth"
  | "funny"
  | "painful"
  | "i-needed-this";
export type RelationshipType =
  | "thematically-similar"
  | "contradicts"
  | "continues"
  | "influenced-by"
  | "made-me-think-of";

export interface ReadingSession {
  id: string;
  date: string;            // ISO
  durationMin: number;
  pagesStart?: number;
  pagesEnd?: number;
  moodBefore?: number;     // 1-5
  moodAfter?: number;      // 1-5
  note?: string;
  surprise?: string;
  thinking?: string;
  energy?: number;         // 1-5
}

export interface JournalEntry {
  id: string;
  date: string;
  body: string;
}

export interface Quote {
  id: string;
  text: string;
  page?: string;
  note?: string;
  resonance?: ResonanceTag;
  savedAt: string;
}

export interface ArcCheckin {
  point: 0 | 25 | 50 | 75 | 100;
  mood: 1 | 2 | 3 | 4 | 5;     // 1=heavy, 5=elated
  note?: string;
  at: string;
}

export interface Connection {
  toBookId: string;
  type: RelationshipType;
  note?: string;
}

export interface ReadingInstance {
  id: string;
  startedAt?: string;
  finishedAt?: string;
  rating?: number;          // 1-10
  journal: JournalEntry[];
  quotes: Quote[];
  arc: ArcCheckin[];
  sessions: ReadingSession[];
  firstUnderlined?: string;
  arcOutcome?: ArcOutcome;
}

export interface Book {
  id: string;
  title: string;
  author: string;
  year?: number;
  language?: string;
  originalLanguage?: string;
  isbn?: string;
  coverUrl?: string;
  spineUrl?: string;          // AI-generated 2D spine artwork (cloud-stored)
  spineGeneratedAt?: string;
  spineColor?: string;        // hsl color string
  spineWidth?: number;        // px override
  spineHeight?: number;       // px override
  status: BookStatus;
  format: BookFormat;
  tags: string[];
  aiTags?: string[];
  howIFound?: string;
  connections: Connection[];
  instances: ReadingInstance[];   // 1+ for re-reads
  changedHowIThink?: boolean;
  addedAt: string;
  lastOpenedAt?: string;
  isFiction?: boolean;
  pages?: number;
  // Customization
  spineTexture?: "leather" | "cloth" | "paper";
  foilStyle?: "gold" | "silver" | "none";
  coverSource?: "openlibrary" | "google" | "gutendex" | "internetarchive" | "librarything" | "wikipedia" | "uploaded" | "ai-generated" | "none";
}

export interface AppSettings {
  themeMode: "dark" | "light";
  readerName?: string;
}
