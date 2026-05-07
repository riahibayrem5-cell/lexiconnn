import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { Bot, Loader2, Plus, Send, Sparkles, X, MessageSquare, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { normalizeBookQuery, searchOpenLibrary, type OLResult } from "@/lib/openlibrary";
import { useLibrary } from "@/lib/storage";
import { toast } from "sonner";
import type { Book, BookStatus } from "@/lib/types";
import { supabase } from "@/integrations/supabase/client";
import { logHistory } from "@/lib/history";
import { cn } from "@/lib/utils";

const routes: Record<string, string> = {
  shelf: "/", oracle: "/oracle", review: "/review", ritual: "/ritual",
  quotes: "/quotes", archive: "/archive", settings: "/settings",
  history: "/history", recommendations: "/recommendations",
};

type Action = {
  action: "add_book" | "search_book" | "remove_book" | "set_status" | "rate_book" | "tag_book" | "add_note" | "add_quote" | "navigate" | "recommend" | "export_library" | "qa" | "unknown";
  title?: string | null;
  author?: string | null;
  query?: string | null;
  route?: keyof typeof routes | "brain" | null;
  status?: BookStatus | null;
  rating?: number | null;
  tag?: string | null;
  text?: string | null;
};

type Plan = { actions: Action[]; confidence: number };

type ChatMsg = { role: "user" | "agent"; text: string };

export function LibrarianAgent() {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  const { books, addBook, removeBook, setStatus, setRating, addJournal, addQuote, updateBook, exportAll } = useLibrary();

  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"do" | "ask">("do");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<OLResult[]>([]);
  const [chat, setChat] = useState<ChatMsg[]>([]);

  // Context awareness — what book is the user looking at right now?
  const contextBook = useMemo<Book | undefined>(() => {
    if (location.pathname.startsWith("/book/") && params.id) {
      return books.find(b => b.id === params.id);
    }
    return undefined;
  }, [location.pathname, params.id, books]);

  // ---------- Proactive nudges ----------
  const nudge = useMemo(() => {
    const reading = books.filter(b => b.status === "reading" || b.status === "rereading");
    if (reading.length === 0) return null;
    const now = Date.now();
    const stalest = reading
      .map(b => {
        const lastSession = (b.instances ?? []).flatMap(i => i.sessions ?? []).sort((a, z) => +new Date(z.date) - +new Date(a.date))[0];
        const ref = lastSession ? +new Date(lastSession.date) : (b.lastOpenedAt ? +new Date(b.lastOpenedAt) : +new Date(b.addedAt));
        return { book: b, days: Math.floor((now - ref) / 86_400_000) };
      })
      .sort((a, z) => z.days - a.days)[0];
    if (stalest && stalest.days >= 7) {
      return `You haven't opened ${stalest.book.title} in ${stalest.days} days.`;
    }
    return null;
  }, [books]);

  const findBook = (query: string): Book | undefined => {
    if (!query) return undefined;
    const q = query.toLowerCase().trim();
    if (["this", "this book", "this one", "current", "it"].includes(q) && contextBook) return contextBook;
    return books.find(b => b.title.toLowerCase() === q)
      ?? books.find(b => `${b.title} ${b.author}`.toLowerCase().includes(q))
      ?? books.find(b => q.includes(b.title.toLowerCase()));
  };

  // ---------- Library digest for Q&A ----------
  const buildDigest = () => {
    const lines: string[] = [];
    lines.push(`Total books: ${books.length}.`);
    const byStatus = books.reduce<Record<string, number>>((m, b) => { m[b.status] = (m[b.status] ?? 0) + 1; return m; }, {});
    lines.push(`By status: ${Object.entries(byStatus).map(([k,v]) => `${k}=${v}`).join(", ")}.`);
    lines.push("");
    lines.push("Books:");
    for (const b of books.slice(0, 200)) {
      const inst = (b.instances ?? [])[(b.instances ?? []).length - 1];
      const sessions = (b.instances ?? []).flatMap(i => i.sessions ?? []);
      const totalMin = sessions.reduce((s, x) => s + (x.durationMin ?? 0), 0);
      const quotes = (b.instances ?? []).flatMap(i => (i.quotes ?? []).map(q => q.text)).slice(0, 2);
      lines.push(`- "${b.title}" by ${b.author}${b.year ? ` (${b.year})` : ""} | status:${b.status} | rating:${inst?.rating ?? "—"}/10 | finished:${inst?.finishedAt ? new Date(inst.finishedAt).toISOString().slice(0,10) : "—"} | tags:${(b.tags ?? []).slice(0,4).join(",")} | minutes:${totalMin} | quotes:${quotes.length ? quotes.map(q => `"${q.slice(0,60)}"`).join(" / ") : "—"}`);
    }
    return lines.join("\n");
  };

  // ---------- Execute one action ----------
  const execAction = async (a: Action, raw: string): Promise<boolean> => {
    if (a.action === "navigate") {
      if (a.route === "brain") {
        const target = (a.title && findBook(a.title)) ?? contextBook ?? books[0];
        if (target) navigate(`/book/${target.id}`);
        return true;
      }
      const path = routes[a.route as string] ?? "/";
      navigate(path);
      return true;
    }
    if (a.action === "export_library") { exportAll(); toast.success("Library backup downloaded"); return true; }
    if (a.action === "recommend") { navigate("/oracle"); return true; }
    if (a.action === "add_book" || a.action === "search_book") {
      const query = normalizeBookQuery([a.title, a.author].filter(Boolean).join(" ") || a.query || raw);
      const hits = await searchOpenLibrary(query, 6);
      setResults(hits);
      if (a.action === "add_book" && hits[0]) {
        const r = hits[0];
        const added = await addBook({
          title: r.title, author: r.author, year: r.year, isbn: r.isbn,
          coverUrl: r.coverUrl, coverSource: r.source ?? "openlibrary", pages: r.pages,
          language: "English", status: "want",
          tags: r.categories?.slice(0, 3).map(t => t.toLowerCase()) ?? [],
          aiTags: r.categories?.slice(0, 5).map(t => t.toLowerCase()) ?? [],
          isFiction: r.isFiction,
        });
        if (added) toast.success(`Shelved ${added.title}`);
      } else if (a.action === "add_book") {
        toast.error("No reliable match found.");
      }
      return true;
    }

    const target = (a.title && findBook(a.title)) ?? (["this","this book","this one","current","it"].includes((a.title ?? "").toLowerCase()) ? contextBook : undefined);
    if (!target) { toast.error(`Couldn't find "${a.title ?? "that book"}" on your shelf.`); return false; }

    if (a.action === "remove_book") { await removeBook(target.id); toast.success(`Removed ${target.title}`); return true; }
    if (a.action === "set_status" && a.status) { setStatus(target.id, a.status); toast.success(`${target.title} → ${a.status}`); return true; }
    if (a.action === "rate_book" && a.rating) { setRating(target.id, a.rating); toast.success(`Rated ${target.title} ${a.rating}/10`); return true; }
    if (a.action === "tag_book" && a.tag) { updateBook(target.id, b => ({ ...b, tags: Array.from(new Set([...b.tags, a.tag!.toLowerCase()])) })); toast.success(`Tagged ${target.title}`); return true; }
    if (a.action === "add_note" && a.text) { addJournal(target.id, a.text); toast.success(`Note added to ${target.title}`); return true; }
    if (a.action === "add_quote" && a.text) { addQuote(target.id, { text: a.text, resonance: "beautiful-language" }); toast.success(`Quote saved from ${target.title}`); return true; }
    return false;
  };

  // ---------- Run user input ----------
  const run = async () => {
    const raw = input.trim();
    if (!raw) return;
    setLoading(true);
    setInput("");
    logHistory({ kind: "agent", action: tab === "ask" ? "Agent question" : "Agent command", detail: raw, editable: true });

    try {
      if (tab === "ask") {
        setChat(c => [...c, { role: "user", text: raw }]);
        const { data } = await supabase.functions.invoke("agent-brain", {
          body: { mode: "qa", message: raw, libraryDigest: buildDigest() },
        });
        if (data?.error) { toast.error(data.error); setChat(c => [...c, { role: "agent", text: data.error }]); return; }
        setChat(c => [...c, { role: "agent", text: data?.answer ?? "No answer." }]);
        return;
      }

      // do tab — plan + execute
      const { data } = await supabase.functions.invoke("agent-brain", {
        body: {
          mode: "plan", message: raw,
          contextBookTitle: contextBook?.title ?? null,
          shelf: books.slice(0, 200).map(b => b.title).join(" | "),
        },
      });
      if (data?.error) { toast.error(data.error); return; }
      const plan = data as Plan;
      if (!plan?.actions?.length) { toast.error("I didn't understand that."); return; }
      for (const a of plan.actions) {
        await execAction(a, raw);
      }
    } catch (e) {
      console.error(e);
      toast.error("Agent error.");
    } finally {
      setLoading(false);
    }
  };

  const examplesDo = ["add Dune, mark reading, tag sci-fi", "rate this 9", "finish Crime and Punishment", "note this: brilliant final act", "go to ritual"];
  const examplesAsk = ["what did I read this year?", "most quoted author?", "books I rated 9 or higher", "which book has been on my shelf longest?"];

  return (
    <div className="fixed bottom-5 right-5 z-50">
      {open && (
        <div className="mb-3 w-[min(400px,calc(100vw-2rem))] luxury-panel rounded-sm p-4 shadow-card animate-scale-in">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <p className="eyebrow flex items-center gap-2"><Sparkles className="h-3 w-3 text-primary" /> Librarian</p>
              <p className="font-serif italic text-xs text-muted-foreground">
                {contextBook ? <>On: <span className="text-primary">{contextBook.title}</span></> : "Commands or questions about your library."}
              </p>
            </div>
            <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-primary"><X className="h-4 w-4" /></button>
          </div>

          {nudge && (
            <div className="mb-3 rounded-sm border border-primary/30 bg-primary/5 p-2.5 font-serif italic text-xs text-foreground/85">
              {nudge}
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-1 mb-3 rounded-sm border border-border/40 p-0.5">
            <button onClick={() => setTab("do")} className={cn("flex-1 py-1.5 mono text-[0.55rem] tracking-[0.22em] uppercase rounded-[2px] flex items-center justify-center gap-1.5", tab === "do" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground")}>
              <Wand2 className="h-3 w-3" /> Do
            </button>
            <button onClick={() => setTab("ask")} className={cn("flex-1 py-1.5 mono text-[0.55rem] tracking-[0.22em] uppercase rounded-[2px] flex items-center justify-center gap-1.5", tab === "ask" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground")}>
              <MessageSquare className="h-3 w-3" /> Ask
            </button>
          </div>

          {tab === "ask" && chat.length > 0 && (
            <div className="mb-3 max-h-56 overflow-y-auto space-y-2 pr-1">
              {chat.map((m, i) => (
                <div key={i} className={cn("text-xs", m.role === "user" ? "text-foreground" : "text-foreground/85 font-serif italic")}>
                  <p className="mono text-[0.5rem] tracking-[0.2em] uppercase text-muted-foreground mb-0.5">{m.role === "user" ? "You" : "Librarian"}</p>
                  <p className="leading-relaxed">{m.text}</p>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !loading && run()}
              placeholder={tab === "do" ? "Ask the shelf… (chain: add X, mark reading, tag Y)" : "Ask anything about your library…"}
              className="bg-input/60 font-serif"
              autoFocus
            />
            <Button onClick={run} disabled={loading} variant="outline" className="border-primary/60 text-primary">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>

          <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
            {(tab === "do" ? examplesDo : examplesAsk).map(ex => (
              <button key={ex} onClick={() => setInput(ex)} className="shrink-0 rounded-sm border border-border/50 px-2 py-1 mono text-[0.5rem] uppercase tracking-wider text-muted-foreground hover:text-primary hover:border-primary/50">
                {ex}
              </button>
            ))}
          </div>

          {results.length > 0 && tab === "do" && (
            <div className="mt-3 space-y-2 max-h-72 overflow-y-auto">
              {results.map(r => (
                <div key={r.key} className="flex gap-3 border-t border-border/40 pt-2">
                  {r.coverUrl && <img src={r.coverUrl} alt={`${r.title} cover`} className="h-16 w-11 object-cover rounded-[2px] shadow-card" referrerPolicy="no-referrer" />}
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-sm text-foreground truncate">{r.title}</p>
                    <p className="mono text-[0.52rem] tracking-[0.16em] uppercase text-muted-foreground truncate">{r.author}</p>
                    <button onClick={async () => {
                      const added = await addBook({ title: r.title, author: r.author, year: r.year, isbn: r.isbn, coverUrl: r.coverUrl, coverSource: r.source ?? "openlibrary", pages: r.pages, language: "English", status: "want", tags: r.categories?.slice(0, 3).map(t => t.toLowerCase()) ?? [], aiTags: r.categories?.slice(0, 5).map(t => t.toLowerCase()) ?? [], isFiction: r.isFiction });
                      if (added) toast.success(`Shelved ${added.title}`);
                    }} className="mt-1 inline-flex items-center gap-1 mono text-[0.5rem] tracking-[0.2em] uppercase text-primary hover:text-primary-glow">
                      <Plus className="h-3 w-3" /> Confirm add
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <Button onClick={() => setOpen(v => !v)} className="h-12 w-12 rounded-full bg-primary text-primary-foreground hover:bg-primary-glow shadow-gold p-0 relative" aria-label="Open librarian agent">
        <Bot className="h-5 w-5" />
        {nudge && !open && <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-primary-glow ring-2 ring-background animate-pulse" />}
      </Button>
    </div>
  );
}
