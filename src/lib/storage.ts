import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  Book, BookStatus, JournalEntry, Quote, ArcCheckin, ReadingSession, Connection
} from "./types";
import { newId, pickSpineColor } from "./seed";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./auth";
import { normalizeBookQuery, searchOpenLibrary } from "./openlibrary";
import { logHistory } from "./history";

const GUEST_KEY = "lexicon-guest-books";
const ORDER_KEY = "lexicon-book-order";

function applyStoredOrder(list: Book[]) {
  try {
    const order = JSON.parse(localStorage.getItem(ORDER_KEY) || "[]") as string[];
    if (!Array.isArray(order) || order.length === 0) return list;
    const rank = new Map(order.map((id, i) => [id, i]));
    return [...list].sort((a, b) => (rank.get(a.id) ?? 99999) - (rank.get(b.id) ?? 99999));
  } catch {
    return list;
  }
}

// =============== Mappers (DB row <-> Book) ===============
function rowToBook(r: any): Book {
  return {
    id: r.id,
    title: r.title,
    author: r.author,
    year: r.year ?? undefined,
    language: r.language ?? undefined,
    originalLanguage: r.original_language ?? undefined,
    isbn: r.isbn ?? undefined,
    coverUrl: r.cover_url ?? undefined,
    spineUrl: r.spine_url ?? undefined,
    spineGeneratedAt: r.spine_generated_at ?? undefined,
    spineColor: r.spine_color ?? undefined,
    spineTexture: r.spine_texture ?? "leather",
    spineWidth: r.spine_width ?? undefined,
    spineHeight: r.spine_height ?? undefined,
    foilStyle: r.foil_style ?? "gold",
    coverSource: r.cover_source ?? "none",
    status: r.status,
    format: r.format,
    tags: r.tags ?? [],
    aiTags: r.ai_tags ?? [],
    howIFound: r.how_i_found ?? "",
    connections: r.connections ?? [],
    instances: r.instances ?? [],
    isFiction: r.is_fiction ?? undefined,
    pages: r.pages ?? undefined,
    changedHowIThink: r.changed_how_i_think ?? undefined,
    addedAt: r.added_at,
    lastOpenedAt: r.last_opened_at ?? undefined,
  };
}

function bookToRow(b: Partial<Book>, userId: string) {
  return {
    user_id: userId,
    title: b.title,
    author: b.author,
    year: b.year ?? null,
    language: b.language ?? null,
    original_language: b.originalLanguage ?? null,
    isbn: b.isbn ?? null,
    cover_url: b.coverUrl ?? null,
    cover_source: b.coverSource ?? "none",
    spine_url: b.spineUrl ?? null,
    spine_generated_at: b.spineGeneratedAt ?? null,
    spine_color: b.spineColor ?? null,
    spine_texture: b.spineTexture ?? "leather",
    spine_width: b.spineWidth ?? null,
    spine_height: b.spineHeight ?? null,
    foil_style: b.foilStyle ?? "gold",
    status: b.status ?? "want",
    format: b.format ?? "physical",
    tags: b.tags ?? [],
    ai_tags: b.aiTags ?? [],
    how_i_found: b.howIFound ?? "",
    is_fiction: b.isFiction ?? null,
    pages: b.pages ?? null,
    changed_how_i_think: b.changedHowIThink ?? null,
    connections: b.connections ?? [],
    instances: b.instances ?? [],
    last_opened_at: b.lastOpenedAt ?? null,
  };
}

// =============== Hook ===============
export function useLibrary() {
  const { user } = useAuth();
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const channelId = useRef(newId());
  const isGuest = !user;

  const saveGuest = useCallback((next: Book[]) => {
    setBooks(next);
    localStorage.setItem(GUEST_KEY, JSON.stringify({ books: next }));
  }, []);

  const refresh = useCallback(async () => {
    if (!user) {
      try {
        const parsed = JSON.parse(localStorage.getItem(GUEST_KEY) || "{}");
        setBooks(Array.isArray(parsed.books) ? applyStoredOrder(parsed.books) : []);
      } catch {
        setBooks([]);
      }
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("books" as any)
      .select("*")
      .order("added_at", { ascending: false });
    if (error) {
      console.error("load books failed", error);
      setBooks([]);
    } else {
      setBooks(applyStoredOrder((data ?? []).map(rowToBook)));
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Realtime: keep shelf in sync across tabs/devices
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`books-${user.id}-${channelId.current}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "books", filter: `user_id=eq.${user.id}` },
        () => refresh()
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, refresh]);

  const addBook = useCallback(async (b: Partial<Book> & { title: string; author: string }) => {
    if (!user) {
      const book: Book = {
        id: newId(),
        title: b.title,
        author: b.author,
        year: b.year,
        language: b.language ?? "English",
        originalLanguage: b.originalLanguage,
        isbn: b.isbn,
        coverUrl: b.coverUrl,
        spineColor: b.spineColor ?? pickSpineColor(b.title + b.author),
        spineTexture: b.spineTexture ?? "leather",
        spineWidth: b.spineWidth,
        spineHeight: b.spineHeight,
        foilStyle: b.foilStyle ?? "gold",
        coverSource: b.coverSource ?? (b.coverUrl ? "openlibrary" : "none"),
        status: b.status ?? "want",
        format: b.format ?? "physical",
        tags: b.tags ?? [],
        aiTags: b.aiTags ?? [],
        howIFound: b.howIFound ?? "",
        connections: b.connections ?? [],
        instances: b.instances ?? [],
        isFiction: b.isFiction,
        pages: b.pages,
        changedHowIThink: b.changedHowIThink,
        addedAt: new Date().toISOString(),
        lastOpenedAt: b.lastOpenedAt,
      };
      saveGuest([book, ...books]);
      logHistory({ kind: "book", action: "Added book", detail: `${book.title} — ${book.author}`, editable: true });
      return book;
    }
    const row = bookToRow({
      ...b,
      language: b.language ?? "English",
      spineColor: b.spineColor ?? pickSpineColor(b.title + b.author),
      coverSource: b.coverSource ?? (b.coverUrl ? "openlibrary" : "none"),
    }, user.id);
    const { data, error } = await supabase.from("books" as any).insert(row).select().single();
    if (error) { console.error("addBook", error); return null; }
    const book = rowToBook(data);
    setBooks(prev => [book, ...prev]);
    logHistory({ kind: "book", action: "Added book", detail: `${book.title} — ${book.author}`, editable: true });
    return book;
  }, [books, saveGuest, user]);

  const updateBook = useCallback(async (id: string, updater: (b: Book) => Book) => {
    const current = books.find(b => b.id === id);
    if (!current) return;
    const next = updater(current);
    setBooks(prev => prev.map(b => b.id === id ? next : b));
    logHistory({ kind: "book", action: "Updated book", detail: next.title, editable: true });
    if (!user) {
      saveGuest(books.map(b => b.id === id ? next : b));
      return;
    }
    const row = bookToRow(next, user.id);
    const { error } = await supabase.from("books" as any).update(row).eq("id", id);
    if (error) console.error("updateBook", error);
  }, [books, saveGuest, user]);

  const removeBook = useCallback(async (id: string) => {
    const current = books.find(b => b.id === id);
    setBooks(prev => prev.filter(b => b.id !== id));
    if (current) logHistory({ kind: "book", action: "Removed book", detail: current.title, editable: false });
    if (!user) {
      saveGuest(books.filter(b => b.id !== id));
      return;
    }
    const { error } = await supabase.from("books" as any).delete().eq("id", id);
    if (error) console.error("removeBook", error);
  }, [books, saveGuest, user]);

  const reorderBooks = useCallback((fromId: string, toId: string) => {
    if (fromId === toId) return;
    const fromIndex = books.findIndex(b => b.id === fromId);
    const toIndex = books.findIndex(b => b.id === toId);
    if (fromIndex < 0 || toIndex < 0) return;
    const next = [...books];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    localStorage.setItem(ORDER_KEY, JSON.stringify(next.map(b => b.id)));
    setBooks(next);
    logHistory({ kind: "shelf", action: "Reordered shelf", detail: `${moved.title} moved before ${books[toIndex]?.title ?? "another book"}`, editable: false });
    if (!user) saveGuest(next);
  }, [books, saveGuest, user]);

  const moveBookToStatus = useCallback((id: string, status: BookStatus, beforeId?: string) => {
    const current = books.find(b => b.id === id);
    if (!current) return;
    const moved = { ...current, status };
    const rest = books.filter(b => b.id !== id);
    const targetIndex = beforeId ? rest.findIndex(b => b.id === beforeId) : -1;
    const lastInStatus = rest.reduce((last, b, index) => b.status === status ? index : last, -1);
    const insertAt = targetIndex >= 0 ? targetIndex : Math.max(0, lastInStatus + 1);
    const next = [...rest];
    next.splice(insertAt, 0, moved);
    localStorage.setItem(ORDER_KEY, JSON.stringify(next.map(b => b.id)));
    setBooks(next);
    logHistory({ kind: "shelf", action: "Moved between shelves", detail: `${moved.title} → ${status}`, editable: false });
    if (!user) {
      saveGuest(next);
      return;
    }
    const row = bookToRow(moved, user.id);
    supabase.from("books" as any).update(row).eq("id", id).then(({ error }) => {
      if (error) console.error("moveBookToStatus", error);
    });
  }, [books, saveGuest, user]);

  const setStatus = useCallback((id: string, status: BookStatus) => {
    updateBook(id, b => {
      const next = { ...b, status };
      if ((status === "reading" || status === "rereading") && b.instances.length === 0) {
        next.instances = [{
          id: newId(), startedAt: new Date().toISOString(),
          journal: [], quotes: [], arc: [], sessions: [],
        }];
      }
      if (status === "rereading") {
        next.instances = [...b.instances, {
          id: newId(), startedAt: new Date().toISOString(),
          journal: [], quotes: [], arc: [], sessions: [],
        }];
      }
      return next;
    });
  }, [updateBook]);

  const addJournal = useCallback((id: string, body: string) => {
    if (!body.trim()) return;
    updateBook(id, b => {
      const inst = b.instances[b.instances.length - 1] ?? {
        id: newId(), journal: [], quotes: [], arc: [], sessions: [],
      };
      const entry: JournalEntry = { id: newId(), date: new Date().toISOString(), body };
      const updatedInst = { ...inst, journal: [...inst.journal, entry] };
      const instances = b.instances.length ? [...b.instances.slice(0, -1), updatedInst] : [updatedInst];
      return { ...b, instances, lastOpenedAt: new Date().toISOString() };
    });
  }, [updateBook]);

  const addQuote = useCallback((id: string, q: Omit<Quote, "id" | "savedAt">) => {
    updateBook(id, b => {
      const inst = b.instances[b.instances.length - 1] ?? {
        id: newId(), journal: [], quotes: [], arc: [], sessions: [],
      };
      const quote: Quote = { ...q, id: newId(), savedAt: new Date().toISOString() };
      const updatedInst = { ...inst, quotes: [...inst.quotes, quote] };
      const instances = b.instances.length ? [...b.instances.slice(0, -1), updatedInst] : [updatedInst];
      return { ...b, instances };
    });
  }, [updateBook]);

  const setArc = useCallback((id: string, point: ArcCheckin["point"], mood: ArcCheckin["mood"]) => {
    updateBook(id, b => {
      const inst = b.instances[b.instances.length - 1];
      if (!inst) return b;
      const others = inst.arc.filter(a => a.point !== point);
      const arc = [...others, { point, mood, at: new Date().toISOString() }].sort((a, c) => a.point - c.point);
      const updated = { ...inst, arc };
      return { ...b, instances: [...b.instances.slice(0, -1), updated] };
    });
  }, [updateBook]);

  const setRating = useCallback((id: string, rating: number) => {
    updateBook(id, b => {
      const inst = b.instances[b.instances.length - 1] ?? {
        id: newId(), journal: [], quotes: [], arc: [], sessions: [],
      };
      const updated = { ...inst, rating };
      const instances = b.instances.length ? [...b.instances.slice(0, -1), updated] : [updated];
      return { ...b, instances };
    });
  }, [updateBook]);

  const addSession = useCallback((id: string, s: Omit<ReadingSession, "id">) => {
    updateBook(id, b => {
      const inst = b.instances[b.instances.length - 1] ?? {
        id: newId(), journal: [], quotes: [], arc: [], sessions: [],
      };
      const session: ReadingSession = { ...s, id: newId() };
      const updated = { ...inst, sessions: [...inst.sessions, session] };
      const instances = b.instances.length ? [...b.instances.slice(0, -1), updated] : [updated];
      return { ...b, instances };
    });
  }, [updateBook]);

  const addConnection = useCallback((fromId: string, conn: Connection) => {
    updateBook(fromId, b => ({
      ...b,
      connections: [...b.connections.filter(c => c.toBookId !== conn.toBookId), conn],
    }));
  }, [updateBook]);

  const searchAndAddBook = useCallback(async (query: string, status: BookStatus = "want") => {
    const cleaned = normalizeBookQuery(query);
    logHistory({ kind: "search", action: "Searched book", detail: cleaned, editable: true });
    const [hit] = await searchOpenLibrary(cleaned, 5);
    if (!hit) return null;
    const q = cleaned.toLowerCase();
    const reliable = q.split(/\s+/).some(w => w.length > 3 && hit.title.toLowerCase().includes(w));
    if (!reliable) return null;
    return addBook({
      title: hit.title,
      author: hit.author,
      year: hit.year,
      isbn: hit.isbn,
      coverUrl: hit.coverUrl,
      coverSource: hit.source ?? "openlibrary",
      pages: hit.pages,
      language: "English",
      status,
      tags: hit.categories?.slice(0, 3).map(t => t.toLowerCase()) ?? [],
      aiTags: hit.categories?.slice(0, 5).map(t => t.toLowerCase()) ?? [],
      isFiction: hit.isFiction,
    });
  }, [addBook]);

  const exportAll = useCallback(() => {
    const blob = new Blob([JSON.stringify({ books }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lexicon-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [books]);

  const importAll = useCallback(async (json: string) => {
    try {
      const parsed = JSON.parse(json);
      if (!Array.isArray(parsed.books)) return;
      if (!user) {
        saveGuest(parsed.books);
        return;
      }
      const rows = parsed.books.map((b: Book) => bookToRow(b, user.id));
      const { error } = await supabase.from("books" as any).insert(rows);
      if (error) console.error("import failed", error);
      else refresh();
    } catch (e) {
      console.error("import failed", e);
    }
  }, [saveGuest, user, refresh]);

  return {
    books, loading, isGuest,
    addBook, updateBook, removeBook, reorderBooks, moveBookToStatus,
    searchAndAddBook,
    setStatus, addJournal, addQuote, setArc, setRating, addSession, addConnection,
    exportAll, importAll,
  };
}

export function useBook(id: string | undefined) {
  const { books } = useLibrary();
  return books.find(b => b.id === id);
}
