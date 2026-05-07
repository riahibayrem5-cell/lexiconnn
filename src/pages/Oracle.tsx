import { useEffect, useMemo, useRef, useState } from "react";
import { useLibrary } from "@/lib/storage";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Sparkles, Wand2, Send, MessageCircle, RotateCcw, Settings2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { searchOpenLibrary, OLResult } from "@/lib/openlibrary";
import { useAdminSettings } from "@/lib/adminSettings";
import { useLang } from "@/lib/i18n";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const MODES = [
  { v: "chat", l: "Chat", d: "Free conversation with full library context." },
  { v: "what-next", l: "What Next", d: "A recommendation rooted in your history." },
  { v: "thematic", l: "Thematic Threads", d: "Patterns across your reading." },
  { v: "author", l: "Author Universe", d: "Influences, lineages, reading paths." },
  { v: "compare", l: "Book vs Book", d: "Two volumes in parallel dossier." },
] as const;

const MOODS = [
  "I want to feel small in a good way",
  "I need something that argues with me",
  "I want prose that sounds like music",
  "I want to be wrecked",
  "I need a clean line of thought",
  "I want to disappear into a world",
  "I want to laugh and feel intelligent",
  "I need consolation",
  "I want history to come close",
  "I want to think about how I think",
  "I want a slow, patient unfolding",
  "I want danger",
];

const TIMES = ["Sprint (a weekend)", "Season (a month or more)"];
const KINDS = ["Fiction", "Non-fiction", "Either"];

const PERSONAS = [
  { v: "editor", l: "Dry editor", d: "Literate, exacting, allergic to clichés" },
  { v: "mentor", l: "Warm mentor", d: "Patient, encouraging, gently challenging" },
  { v: "critic", l: "Brutalist critic", d: "Honest, unflinching, evidence-based" },
  { v: "scholar", l: "Polymath scholar", d: "Comparative literature & philosophy" },
  { v: "poet", l: "Poet", d: "Lyrical, brief, musical" },
] as const;

const LENSES = [
  { v: "literary", l: "Literary craft" },
  { v: "philosophical", l: "Philosophical" },
  { v: "emotional", l: "Emotional truth" },
  { v: "historical", l: "Historical & cultural" },
  { v: "escapist", l: "Immersive" },
] as const;

const MODELS = [
  { v: "google/gemini-3-flash-preview", l: "Flash", d: "Fast & balanced" },
  { v: "google/gemini-2.5-pro", l: "Pro", d: "Deep reasoning" },
  { v: "openai/gpt-5", l: "GPT-5", d: "Heaviest, most precise" },
  { v: "openai/gpt-5-mini", l: "GPT-5 mini", d: "Cheaper, still strong" },
] as const;

const REASONING = [
  { v: "minimal", l: "Quick" },
  { v: "low", l: "Light" },
  { v: "medium", l: "Balanced" },
  { v: "high", l: "Deep" },
] as const;

type Mode = typeof MODES[number]["v"];
type ChatMsg = { role: "user" | "assistant"; content: string };
type OracleRec = { title: string; author: string; year?: number; description: string; searchQuery?: string; qualitySignal?: string; coverUrl?: string; pages?: number; categories?: string[] };

const sameBook = (a: { title: string; author: string }, b: { title: string; author: string }) =>
  `${a.title} ${a.author}`.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() === `${b.title} ${b.author}`.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const trimDescription = (text: string, maxWords = 42) => {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  return words.length <= maxWords ? text : `${words.slice(0, maxWords).join(" ").replace(/[,.!?;:]?$/, "")}…`;
};

function parseRecommendations(text: string): OracleRec[] {
  try {
    const cleaned = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    return Array.isArray(parsed?.recommendations) ? parsed.recommendations.slice(0, 5) : [];
  } catch {
    return [];
  }
}

const CHAT_KEY = "lexicon-oracle-chat";
const PREFS_KEY = "lexicon-oracle-prefs";

export default function Oracle() {
  const { books, addBook } = useLibrary();
  const { settings } = useAdminSettings();
  const { lang } = useLang();
  const [mode, setMode] = useState<Mode>("chat");
  const [loading, setLoading] = useState(false);
  const [output, setOutput] = useState<string>("");
  const [recommendations, setRecommendations] = useState<OracleRec[]>([]);
  const [agentInput, setAgentInput] = useState("");
  const [agentLoading, setAgentLoading] = useState(false);
  const [agentResults, setAgentResults] = useState<OLResult[]>([]);

  // Chat state
  const [chat, setChat] = useState<ChatMsg[]>(() => {
    try { return JSON.parse(localStorage.getItem(CHAT_KEY) || "[]"); } catch { return []; }
  });
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Customization
  const initialPrefs = (() => {
    try { return JSON.parse(localStorage.getItem(PREFS_KEY) || "{}"); } catch { return {}; }
  })();
  const [persona, setPersona] = useState<string>(initialPrefs.persona ?? "editor");
  const [lens, setLens] = useState<string>(initialPrefs.lens ?? "literary");
  const [model, setModel] = useState<string>(initialPrefs.model ?? MODELS[0].v);
  const [reasoning, setReasoning] = useState<string>(initialPrefs.reasoning ?? "medium");
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ persona, lens, model, reasoning }));
  }, [persona, lens, model, reasoning]);

  useEffect(() => {
    localStorage.setItem(CHAT_KEY, JSON.stringify(chat.slice(-40)));
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat]);

  // What Next state
  const [mood, setMood] = useState(MOODS[0]);
  const [time, setTime] = useState(TIMES[0]);
  const [kind, setKind] = useState(KINDS[2]);

  const [theme, setTheme] = useState("solitude");
  const [author, setAuthor] = useState(books[0]?.author ?? "");
  const [bookA, setBookA] = useState(books[0]?.id ?? "");
  const [bookB, setBookB] = useState(books[1]?.id ?? "");

  useEffect(() => {
    if (!author && books[0]) setAuthor(books[0].author);
    if (!bookA && books[0]) setBookA(books[0].id);
    if (!bookB && books[1]) setBookB(books[1].id);
  }, [author, bookA, bookB, books]);

  const finished = books.filter(b => b.status === "finished" || b.status === "rereading");
  const last3 = finished
    .slice()
    .sort((a, b) => {
      const da = new Date(a.instances[a.instances.length - 1]?.finishedAt ?? a.addedAt).getTime();
      const db = new Date(b.instances[b.instances.length - 1]?.finishedAt ?? b.addedAt).getTime();
      return db - da;
    })
    .slice(0, 3);
  const favorites = finished
    .slice()
    .sort((a, b) => (b.instances[b.instances.length - 1]?.rating ?? 0) - (a.instances[a.instances.length - 1]?.rating ?? 0))
    .slice(0, 8);
  const wantList = books.filter(b => b.status === "want");
  const abandoned = books.filter(b => b.status === "abandoned");
  const reading = books.filter(b => b.status === "reading");

  // Smart context pack — used by chat mode for full-library awareness
  const contextPack = useMemo(() => {
    const summarize = (b: any, deep = false) => ({
      title: b.title,
      author: b.author,
      year: b.year,
      rating: b.instances?.[b.instances.length - 1]?.rating,
      tags: (b.tags ?? []).slice(0, 6),
      fiction: b.isFiction,
      ...(deep ? {
        quotes: (b.instances?.[b.instances.length - 1]?.quotes ?? []).slice(0, 2).map((q: any) => q.text?.slice(0, 200)),
      } : {}),
    });
    return {
      totals: { books: books.length, finished: finished.length, reading: reading.length, want: wantList.length, abandoned: abandoned.length },
      favorites: favorites.map(b => summarize(b, true)),
      recent: last3.map(b => summarize(b, true)),
      reading: reading.map(b => summarize(b)),
      want: wantList.slice(0, 30).map(b => summarize(b)),
      abandoned: abandoned.slice(0, 10).map(b => summarize(b)),
      shelf: books.map(b => ({ title: b.title, author: b.author })),
    };
  }, [books, finished, last3, favorites, wantList, reading, abandoned]);

  const runAgent = async () => {
    const raw = agentInput.trim();
    if (!raw) return;
    setAgentLoading(true);
    try {
      const addMatch = raw.match(/^(add|shelve|save)\s+(.+)/i);
      const query = addMatch ? addMatch[2] : raw.replace(/^(search|find|look for)\s+/i, "");
      const results = await searchOpenLibrary(query, 5);
      setAgentResults(results);
      if (addMatch) {
        toast.message(results[0] ? `Found ${results[0].title}. Confirm below before adding.` : "No reliable edition found.");
      }
    } catch (e: any) {
      toast.error(e.message ?? "Agent failed");
    } finally {
      setAgentLoading(false);
    }
  };

  // ---------- Streaming chat ----------
  const sendChat = async () => {
    const text = draft.trim();
    if (!text || streaming) return;
    const userMsg: ChatMsg = { role: "user", content: text };
    const next = [...chat, userMsg];
    setChat(next);
    setDraft("");
    setStreaming(true);

    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/oracle-chat`;
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          messages: next,
          context: contextPack,
          persona, lens, model, reasoning,
          language: lang,
        }),
      });

      if (resp.status === 429) { toast.error("Rate limit reached. Try again in a moment."); setStreaming(false); return; }
      if (resp.status === 402) { toast.error("AI credits exhausted. Add credits in Settings → Workspace → Usage."); setStreaming(false); return; }
      if (!resp.ok || !resp.body) { toast.error("The Oracle is silent."); setStreaming(false); return; }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let so_far = "";
      let done = false;

      // Insert empty assistant placeholder
      setChat(prev => [...prev, { role: "assistant", content: "" }]);

      while (!done) {
        const { done: d, value } = await reader.read();
        if (d) break;
        buf += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buf.indexOf("\n")) !== -1) {
          let line = buf.slice(0, idx);
          buf = buf.slice(idx + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6).trim();
          if (json === "[DONE]") { done = true; break; }
          try {
            const parsed = JSON.parse(json);
            const delta: string | undefined = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              so_far += delta;
              setChat(prev => {
                const copy = [...prev];
                copy[copy.length - 1] = { role: "assistant", content: so_far };
                return copy;
              });
            }
          } catch {
            buf = line + "\n" + buf;
            break;
          }
        }
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Chat failed");
    } finally {
      setStreaming(false);
    }
  };

  const resetChat = () => {
    setChat([]);
    localStorage.removeItem(CHAT_KEY);
  };

  // ---------- Existing structured modes ----------
  const ask = async () => {
    setLoading(true);
    setOutput("");
    setRecommendations([]);
    try {
      const payload: any = { mode };
      if (mode === "what-next") {
        payload.input = {
          mood, time, kind,
          last3: last3.map(b => ({ title: b.title, author: b.author, rating: b.instances[b.instances.length - 1]?.rating, tags: b.tags })),
          favorites: favorites.map(b => ({ title: b.title, author: b.author, rating: b.instances[b.instances.length - 1]?.rating, tags: b.tags, fiction: b.isFiction })),
          want: wantList.map(b => ({ title: b.title, author: b.author, tags: b.tags, fiction: b.isFiction })),
          shelved: books.map(b => ({ title: b.title, author: b.author })),
        };
      } else if (mode === "thematic") {
        payload.input = {
          theme,
          finished: finished.map(b => ({
            title: b.title, author: b.author, tags: b.tags,
            rating: b.instances[b.instances.length - 1]?.rating,
            quotes: b.instances[b.instances.length - 1]?.quotes.map(q => q.text).slice(0, 3) ?? [],
          })),
        };
      } else if (mode === "author") {
        payload.input = {
          author,
          owned: books.filter(b => b.author === author).map(b => b.title),
          want: wantList.map(b => ({ title: b.title, author: b.author })),
        };
      } else if (mode === "compare") {
        const a = books.find(b => b.id === bookA);
        const b = books.find(bb => bb.id === bookB);
        if (!a || !b) { toast.error("Pick two books"); setLoading(false); return; }
        payload.input = {
          a: { title: a.title, author: a.author, rating: a.instances[a.instances.length - 1]?.rating, tags: a.tags, quotes: a.instances[a.instances.length - 1]?.quotes.map(q => q.text).slice(0, 3) ?? [] },
          b: { title: b.title, author: b.author, rating: b.instances[b.instances.length - 1]?.rating, tags: b.tags, quotes: b.instances[b.instances.length - 1]?.quotes.map(q => q.text).slice(0, 3) ?? [] },
        };
      }

      const { data, error } = await supabase.functions.invoke("oracle", { body: { ...payload, language: lang } });
      if (error) throw error;
      if (data?.error) toast.error(data.error);
      else {
        const text = data?.text ?? "";
        setOutput(text);
        if (mode === "what-next") {
          const parsed = parseRecommendations(text).filter(r => !books.some(b => sameBook(r, b))).slice(0, settings.oracleCards);
          const enriched = await Promise.all(parsed.map(async (rec) => {
            const [hit] = await searchOpenLibrary(rec.searchQuery || `${rec.title} ${rec.author}`, 1);
            return { ...rec, description: trimDescription(rec.description, settings.oracleDescriptionWords), coverUrl: hit?.coverUrl, pages: hit?.pages, categories: hit?.categories, year: rec.year ?? hit?.year };
          }));
          setRecommendations(enriched);
        }
      }
    } catch (e: any) {
      toast.error(e.message ?? "Oracle silent");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen pb-24">
      <PageHeader
        eyebrow="The Concierge"
        title=""
        titleMain="Ask,"
        titleEmphasis="earnestly"
        subtitle="An AI fluent in your library. Tune voice, lens, model and depth — then converse."
      />

      <div className="px-4 sm:px-8 lg:px-14 mt-8 grid grid-cols-12 gap-8">
        <aside className="col-span-12 lg:col-span-3 space-y-2">
          <div className="luxury-panel rounded-sm p-4 space-y-3 mb-4">
            <p className="eyebrow">Librarian agent</p>
            <div className="flex gap-2">
              <Input value={agentInput} onChange={(e) => setAgentInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && runAgent()}
                placeholder="Search or add a book…" className="bg-input/50 font-serif" />
              <Button onClick={runAgent} disabled={agentLoading} variant="outline" className="border-primary/60 text-primary">
                {agentLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
              </Button>
            </div>
            {agentResults.length > 0 && (
              <div className="space-y-2 pt-2">
                {agentResults.slice(0, 3).map(r => (
                  <div key={r.key} className="flex gap-3 border-t border-border/40 pt-2">
                    {r.coverUrl && <img src={r.coverUrl} alt={`${r.title} cover`} className="h-16 w-11 object-cover rounded-[2px] shadow-card" />}
                    <div className="min-w-0 flex-1">
                      <p className="font-display text-sm text-foreground truncate">{r.title}</p>
                      <p className="mono text-[0.55rem] tracking-[0.16em] uppercase text-muted-foreground truncate">{r.author}</p>
                      <button
                        onClick={async () => {
                          const added = await addBook({ title: r.title, author: r.author, year: r.year, isbn: r.isbn, coverUrl: r.coverUrl, coverSource: r.source ?? "openlibrary", pages: r.pages, language: "English", status: "want", tags: r.categories?.slice(0, 3).map(t => t.toLowerCase()) ?? [], aiTags: r.categories?.slice(0, 5).map(t => t.toLowerCase()) ?? [], isFiction: r.isFiction });
                          if (added) toast.success(`Shelved ${added.title}`);
                        }}
                        className="mt-1 mono text-[0.5rem] tracking-[0.2em] uppercase text-primary hover:text-primary-glow transition-colors"
                      >
                        Confirm add
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          {MODES.map(m => (
            <button
              key={m.v}
              onClick={() => { setMode(m.v); setOutput(""); }}
              className={cn(
                "w-full text-left p-4 rounded-sm border transition-all",
                mode === m.v
                  ? "border-primary bg-primary/5 shadow-foil"
                  : "border-border/40 hover:border-border-strong/60"
              )}
            >
              <p className="font-display text-lg text-foreground flex items-center gap-2">
                {m.v === "chat" && <MessageCircle className="h-4 w-4 text-primary" />}
                {m.l}
              </p>
              <p className="mono text-[0.55rem] tracking-[0.2em] uppercase text-muted-foreground mt-1">{m.d}</p>
            </button>
          ))}
        </aside>

        <section className="col-span-12 lg:col-span-9 space-y-6">
          {/* Tuning bar — applies to all modes, especially chat */}
          <div className="luxury-panel rounded-sm p-4 space-y-3">
            <button
              onClick={() => setShowSettings(s => !s)}
              className="flex items-center gap-2 text-xs mono uppercase tracking-[0.2em] text-primary hover:text-primary-glow"
            >
              <Settings2 className="h-3.5 w-3.5" /> Voice · Lens · Model · Depth
              <span className="ml-auto text-muted-foreground normal-case tracking-normal font-serif italic">
                {PERSONAS.find(p => p.v === persona)?.l} · {LENSES.find(l => l.v === lens)?.l} · {MODELS.find(m => m.v === model)?.l} · {REASONING.find(r => r.v === reasoning)?.l}
              </span>
            </button>
            {showSettings && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-border/40">
                <div>
                  <p className="eyebrow mb-2">Voice</p>
                  <div className="flex flex-wrap gap-1.5">
                    {PERSONAS.map(p => (
                      <button key={p.v} onClick={() => setPersona(p.v)} title={p.d}
                        className={cn("px-2.5 py-1 rounded-sm border text-xs font-display tracking-wide",
                          persona === p.v ? "border-primary text-primary bg-primary/5" : "border-border/40 text-muted-foreground hover:text-foreground")}>
                        {p.l}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="eyebrow mb-2">Lens</p>
                  <div className="flex flex-wrap gap-1.5">
                    {LENSES.map(l => (
                      <button key={l.v} onClick={() => setLens(l.v)}
                        className={cn("px-2.5 py-1 rounded-sm border text-xs font-display tracking-wide",
                          lens === l.v ? "border-primary text-primary bg-primary/5" : "border-border/40 text-muted-foreground hover:text-foreground")}>
                        {l.l}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="eyebrow mb-2">Model</p>
                  <div className="flex flex-wrap gap-1.5">
                    {MODELS.map(m => (
                      <button key={m.v} onClick={() => setModel(m.v)} title={m.d}
                        className={cn("px-2.5 py-1 rounded-sm border text-xs font-display tracking-wide",
                          model === m.v ? "border-primary text-primary bg-primary/5" : "border-border/40 text-muted-foreground hover:text-foreground")}>
                        {m.l}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="eyebrow mb-2">Reasoning depth</p>
                  <div className="flex flex-wrap gap-1.5">
                    {REASONING.map(r => (
                      <button key={r.v} onClick={() => setReasoning(r.v)}
                        className={cn("px-2.5 py-1 rounded-sm border text-xs font-display tracking-wide",
                          reasoning === r.v ? "border-primary text-primary bg-primary/5" : "border-border/40 text-muted-foreground hover:text-foreground")}>
                        {r.l}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {mode === "chat" ? (
            <div className="ink-card rounded-sm p-6 space-y-5 flex flex-col" style={{ minHeight: "60vh" }}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="eyebrow">Conversation</p>
                  <p className="font-serif italic text-muted-foreground text-sm mt-1">
                    The Oracle sees your full library — {books.length} volumes — and remembers the thread.
                  </p>
                </div>
                {chat.length > 0 && (
                  <Button onClick={resetChat} variant="ghost" size="sm" className="text-muted-foreground">
                    <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Reset
                  </Button>
                )}
              </div>

              <div className="flex-1 space-y-4 overflow-y-auto max-h-[55vh] pr-2">
                {chat.length === 0 && (
                  <div className="text-center py-10 text-muted-foreground">
                    <Sparkles className="h-6 w-6 mx-auto mb-3 text-primary/60" />
                    <p className="font-display italic">Begin where you like — a book, a mood, an argument.</p>
                    <div className="mt-4 flex flex-wrap gap-2 justify-center">
                      {[
                        "What pattern do you see across my favorites?",
                        "Why did I abandon what I abandoned?",
                        "Give me one book to break a slump.",
                        "Argue with my taste.",
                      ].map(s => (
                        <button key={s} onClick={() => setDraft(s)}
                          className="px-3 py-1.5 rounded-sm border border-border/40 text-xs font-serif italic text-muted-foreground hover:text-primary hover:border-primary/40">
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {chat.map((m, i) => (
                  <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                    <div className={cn(
                      "max-w-[85%] rounded-sm px-4 py-3",
                      m.role === "user"
                        ? "bg-primary/10 border border-primary/30 text-foreground"
                        : "bg-surface-2 border border-border/40 text-foreground"
                    )}>
                      {m.role === "assistant" ? (
                        <div className="prose prose-sm max-w-none font-serif prose-p:my-2 prose-headings:font-display prose-headings:tracking-wide prose-strong:text-primary dark:prose-invert">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content || "…"}</ReactMarkdown>
                        </div>
                      ) : (
                        <p className="font-serif whitespace-pre-wrap leading-relaxed">{m.content}</p>
                      )}
                    </div>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>

              <div className="flex gap-2 pt-3 border-t border-border/40">
                <Textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); }
                  }}
                  placeholder="Ask the Oracle…"
                  rows={2}
                  className="bg-input/40 border-border-strong/30 font-serif resize-none"
                />
                <Button onClick={sendChat} disabled={streaming || !draft.trim()}
                  className="bg-primary text-primary-foreground hover:bg-primary-glow self-end">
                  {streaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          ) : (
            <div className="ink-card rounded-sm p-6 space-y-5">
              {mode === "what-next" && (
                <>
                  <div>
                    <p className="eyebrow mb-2">Mood</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {MOODS.map(m => (
                        <button key={m} onClick={() => setMood(m)}
                          className={cn(
                            "text-left p-2.5 rounded-sm border text-sm font-serif italic transition-colors",
                            mood === m ? "border-primary text-primary bg-primary/5" : "border-border/40 text-muted-foreground hover:text-foreground hover:border-border-strong/60"
                          )}>
                          {m}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="eyebrow mb-2">Time</p>
                      <div className="flex gap-2">
                        {TIMES.map(t => (
                          <button key={t} onClick={() => setTime(t)}
                            className={cn("flex-1 p-2 rounded-sm border text-xs mono uppercase tracking-wider", time === t ? "border-primary text-primary" : "border-border/40 text-muted-foreground")}>
                            {t}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="eyebrow mb-2">Kind</p>
                      <div className="flex gap-2">
                        {KINDS.map(k => (
                          <button key={k} onClick={() => setKind(k)}
                            className={cn("flex-1 p-2 rounded-sm border text-xs mono uppercase tracking-wider", kind === k ? "border-primary text-primary" : "border-border/40 text-muted-foreground")}>
                            {k}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </>
              )}

              {mode === "thematic" && (
                <div>
                  <p className="eyebrow mb-2">Theme</p>
                  <div className="flex flex-wrap gap-2">
                    {["solitude","identity","time","power","grief","rebellion","consciousness","faith","desire","memory"].map(t => (
                      <button key={t} onClick={() => setTheme(t)}
                        className={cn("px-3 py-1.5 rounded-sm border text-sm font-display tracking-wide capitalize",
                          theme === t ? "border-primary text-primary bg-primary/5" : "border-border/40 text-muted-foreground hover:text-foreground")}>
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {mode === "author" && (
                <div>
                  <p className="eyebrow mb-2">Author</p>
                  {books.length > 0 ? (
                    <select value={author} onChange={(e) => setAuthor(e.target.value)}
                      className="w-full bg-input border border-border-strong/40 rounded-sm px-3 py-2 font-serif">
                      {Array.from(new Set(books.map(b => b.author))).map(a => <option key={a}>{a}</option>)}
                    </select>
                  ) : <p className="font-display italic text-muted-foreground">Add books first, then the author map opens.</p>}
                </div>
              )}

              {mode === "compare" && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="eyebrow mb-2">Book A</p>
                    <select value={bookA} onChange={(e) => setBookA(e.target.value)}
                      className="w-full bg-input border border-border-strong/40 rounded-sm px-3 py-2 font-serif">
                      {books.map(b => <option key={b.id} value={b.id}>{b.title}</option>)}
                    </select>
                  </div>
                  <div>
                    <p className="eyebrow mb-2">Book B</p>
                    <select value={bookB} onChange={(e) => setBookB(e.target.value)}
                      className="w-full bg-input border border-border-strong/40 rounded-sm px-3 py-2 font-serif">
                      {books.map(b => <option key={b.id} value={b.id}>{b.title}</option>)}
                    </select>
                  </div>
                </div>
              )}

              <Button onClick={ask} disabled={loading || (mode === "compare" && books.length < 2) || (mode === "author" && books.length === 0)}
                className="bg-primary text-primary-foreground hover:bg-primary-glow font-display tracking-wider">
                {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
                Consult the Oracle
              </Button>
            </div>
          )}

          {output && mode === "what-next" && recommendations.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4 animate-fade-in">
              {recommendations.map((book) => (
                <article key={`${book.title}-${book.author}`} className="luxury-panel rounded-sm overflow-hidden group flex flex-col">
                  <div className="aspect-[3/4] bg-surface-2 overflow-hidden">
                    {book.coverUrl ? <img src={book.coverUrl} alt={`${book.title} cover`} className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" /> : <div className="h-full w-full grid place-items-center text-primary font-display text-5xl">{book.title.slice(0,1)}</div>}
                  </div>
                  <div className="p-4 space-y-3 flex-1 flex flex-col">
                    <div>
                      <p className="font-display text-xl leading-none text-foreground">{book.title}</p>
                      <p className="mono text-[0.58rem] tracking-[0.22em] uppercase text-muted-foreground mt-2">{book.author}</p>
                    </div>
                    <p className="font-serif text-sm leading-snug text-muted-foreground line-clamp-4">{book.description}</p>
                    {book.qualitySignal && <p className="mono text-[0.5rem] tracking-[0.18em] uppercase text-primary/80 line-clamp-2">{book.qualitySignal}</p>}
                    <div className="flex flex-wrap gap-1.5">
                      {[book.year, book.pages ? `${book.pages} pages` : undefined, ...(book.categories ?? []).slice(0, 2)].filter(Boolean).map(x => <span key={String(x)} className="rounded-sm border border-border/50 px-2 py-1 mono text-[0.52rem] uppercase tracking-wider text-muted-foreground">{x}</span>)}
                    </div>
                    <Button onClick={async () => {
                      const added = await addBook({ title: book.title, author: book.author, year: book.year, coverUrl: book.coverUrl, coverSource: book.coverUrl ? "openlibrary" : "none", pages: book.pages, language: "English", status: "want", tags: book.categories?.slice(0, 3).map(t => t.toLowerCase()) ?? [], aiTags: book.categories?.slice(0, 5).map(t => t.toLowerCase()) ?? [] });
                      if (added) toast.success(`Shelved ${added.title}`);
                    }} variant="outline" className="mt-auto border-primary/50 text-primary hover:bg-primary/10">Confirm add</Button>
                  </div>
                </article>
              ))}
            </div>
          )}

          {output && mode !== "what-next" && mode !== "chat" && (
            <article className="ink-card rounded-sm p-8 animate-fade-in">
              <p className="eyebrow mb-4">Response</p>
              <div className="prose prose-sm max-w-none font-serif prose-p:my-2 prose-headings:font-display dark:prose-invert text-foreground">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{output}</ReactMarkdown>
              </div>
            </article>
          )}
        </section>
      </div>
    </div>
  );
}
