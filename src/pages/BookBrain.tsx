import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useLibrary } from "@/lib/storage";
import { getCurrentLang } from "@/lib/i18n";
import { RatingDial } from "@/components/RatingDial";
import { EmotionalArc } from "@/components/EmotionalArc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, BookOpen, Quote as QuoteIcon, Sparkles, Network as NetworkIcon, NotebookPen, Headphones, Tablet, Library as LibraryIcon, Loader2, Wand2, Plus, Trash2, RefreshCw, Globe, X } from "lucide-react";
import type { ResonanceTag, BookStatus } from "@/lib/types";
import { STATUS_LABEL } from "@/lib/seed";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { enrichBookMetadata } from "@/lib/openlibrary";
import { acquireCover } from "@/lib/covers";
import { AICoverDialog } from "@/components/AICoverDialog";
import { generateDossier, loadDossier, saveDossierRemote } from "@/lib/dossier";
import { ScrollText } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import {
  consumeEditionApply,
  editionToBookPatch,
  firstUnderlinedPrompt,
  useSavedRecs,
  type EditionApplyPayload,
} from "@/lib/savedRecs";

const RESONANCE: { v: ResonanceTag; l: string }[] = [
  { v: "beautiful-language", l: "Beautiful language" },
  { v: "philosophical-bomb", l: "Philosophical bomb" },
  { v: "character-truth", l: "Character truth" },
  { v: "funny", l: "Funny" },
  { v: "painful", l: "Painful" },
  { v: "i-needed-this", l: "I needed this" },
];

const STATUSES: BookStatus[] = ["want", "reading", "rereading", "finished", "abandoned"];

const FORMAT_ICON = {
  physical: BookOpen, ebook: Tablet, audiobook: Headphones, dual: LibraryIcon,
};

export default function BookBrain() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { books, setRating, addJournal, addQuote, setArc, setStatus, addConnection, updateBook, removeBook } = useLibrary();
  const book = books.find(b => b.id === id);

  const [journalDraft, setJournalDraft] = useState("");
  const [quoteText, setQuoteText] = useState("");
  const [quotePage, setQuotePage] = useState("");
  const [quoteNote, setQuoteNote] = useState("");
  const [quoteRes, setQuoteRes] = useState<ResonanceTag>("beautiful-language");
  const [connTarget, setConnTarget] = useState("");
  const [connType, setConnType] = useState("thematically-similar");

  const [dissection, setDissection] = useState<string>("");
  const [loadingDissection, setLoadingDissection] = useState(false);

  // AI-suggested famous quotes (5+) for this book
  const [suggested, setSuggested] = useState<Array<{ text: string; context: string; theme: string }>>([]);
  const [loadingSuggested, setLoadingSuggested] = useState(false);
  const [refreshingMeta, setRefreshingMeta] = useState(false);
  const [generatingSpine, setGeneratingSpine] = useState(false);
  const [aiCoverOpen, setAiCoverOpen] = useState(false);
  const [generatingDossier, setGeneratingDossier] = useState(false);
  const [hasDossier, setHasDossier] = useState(false);

  // Edition handoff from the Recommendations page (sessionStorage).
  const { recs } = useSavedRecs();
  const [pending, setPending] = useState<EditionApplyPayload | null>(null);
  useEffect(() => {
    if (!id) return;
    const payload = consumeEditionApply(id);
    if (payload) setPending(payload);
  }, [id]);

  // Saved recommendations that already exist for this book's title (handy when
  // the user wants to revisit edition data without bouncing back to the page).
  const linkedRecs = useMemo(() => {
    if (!book) return [];
    const t = book.title.toLowerCase();
    const a = book.author.toLowerCase();
    return recs.filter(
      (r) =>
        r.detected?.title.toLowerCase() === t ||
        r.query.toLowerCase().includes(t) ||
        (r.detected?.author?.toLowerCase() === a && r.detected?.title.toLowerCase().includes(t.split(" ")[0] ?? ""))
    ).slice(0, 4);
  }, [recs, book]);

  // Track whether this book already has a saved dossier
  useEffect(() => {
    if (!book?.id) return;
    let cancelled = false;
    loadDossier(book.id).then(d => { if (!cancelled) setHasDossier(!!d); });
    const refresh = () => loadDossier(book.id).then(d => !cancelled && setHasDossier(!!d));
    window.addEventListener("lexicon-dossier-change", refresh);
    return () => { cancelled = true; window.removeEventListener("lexicon-dossier-change", refresh); };
  }, [book?.id]);

  if (!book) {
    return (
      <div className="px-14 py-20">
        <p className="font-display text-2xl italic text-muted-foreground">This book has slipped from the shelf.</p>
        <Button onClick={() => navigate("/")} variant="ghost" className="mt-4"><ArrowLeft className="h-4 w-4 mr-2" /> Back to shelf</Button>
      </div>
    );
  }

  const instances = book.instances ?? [];
  const inst = instances[instances.length - 1];
  const FormatIcon = FORMAT_ICON[book.format];
  const otherBooks = books.filter(b => b.id !== book.id);
  const selectedConnTarget = connTarget || otherBooks[0]?.id || "";

  const requestDissection = async () => {
    setLoadingDissection(true);
    try {
      const { data, error } = await supabase.functions.invoke("oracle", {
        body: {
          mode: "dissection",
          language: getCurrentLang(),
          book: {
            title: book.title, author: book.author, year: book.year,
            tags: book.tags,
            rating: inst?.rating,
            firstUnderlined: inst?.firstUnderlined,
            quotes: inst?.quotes.map(q => ({ text: q.text, note: q.note, resonance: q.resonance })) ?? [],
            journal: inst?.journal.map(j => j.body) ?? [],
            arc: inst?.arc ?? [],
          },
        },
      });
      if (error) throw error;
      if (data?.error) {
        toast.error(data.error);
      } else {
        setDissection(data?.text ?? "");
      }
    } catch (e: any) {
      toast.error(e.message ?? "AI unavailable");
    } finally {
      setLoadingDissection(false);
    }
  };

  const requestSuggestedQuotes = async () => {
    setLoadingSuggested(true);
    try {
      const { data, error } = await supabase.functions.invoke("book-quotes", {
        body: { title: book.title, author: book.author, year: book.year, count: 6, language: getCurrentLang() },
      });
      if (error) throw error;
      if (data?.error) {
        toast.error(data.error);
      } else {
        setSuggested(data?.quotes ?? []);
        if ((data?.quotes ?? []).length === 0) toast.info("No quotes returned — try again.");
      }
    } catch (e: any) {
      toast.error(e.message ?? "AI unavailable");
    } finally {
      setLoadingSuggested(false);
    }
  };

  const refreshMetadata = async () => {
    setRefreshingMeta(true);
    try {
      const meta = await enrichBookMetadata({ title: book.title, author: book.author, isbn: book.isbn });
      const cover = await acquireCover({ title: meta?.title ?? book.title, author: meta?.author ?? book.author, isbn: meta?.isbn ?? book.isbn, openLibraryUrl: meta?.coverUrl });
      const { data: ai } = await supabase.functions.invoke("enrich-book", { body: { title: meta?.title ?? book.title, author: meta?.author ?? book.author, subjects: meta?.categories ?? book.tags } });
      updateBook(book.id, b => ({
        ...b,
        title: meta?.title ?? b.title,
        author: meta?.author ?? b.author,
        year: meta?.year ?? b.year,
        isbn: meta?.isbn ?? b.isbn,
        language: meta?.language ?? b.language,
        pages: meta?.pages ?? b.pages,
        isFiction: ai?.isFiction ?? meta?.isFiction ?? b.isFiction,
        coverUrl: cover?.url ?? meta?.coverUrl ?? b.coverUrl,
        coverSource: cover?.source ?? meta?.source ?? b.coverSource,
        tags: Array.from(new Set([...b.tags, ...((meta?.categories ?? []).slice(0, 3).map(t => t.toLowerCase())), ...((ai?.tags ?? []).slice(0, 5))])),
      }));
      toast.success("Book details refreshed");
    } catch (e: any) {
      toast.error(e.message ?? "Metadata refresh failed");
    } finally {
      setRefreshingMeta(false);
    }
  };

  const generateSpine = async () => {
    setGeneratingSpine(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-spine", {
        body: {
          bookId: book.id,
          title: book.title,
          author: book.author,
          pages: book.pages ?? 320,
          coverUrl: book.coverUrl,
        },
      });
      if (error) throw error;
      if (data?.url) {
        updateBook(book.id, b => ({ ...b, spineUrl: data.url, spineGeneratedAt: new Date().toISOString() }));
        toast.success("Spine artwork generated");
      } else {
        toast.error("Spine generation returned no image");
      }
    } catch (e: any) {
      toast.error(e.message ?? "Spine generation failed");
    } finally {
      setGeneratingSpine(false);
    }
  };

  // Apply a pending edition handed off from Recommendations.
  // Prefills language / original language / ISBN / cover / pages / year,
  // seeds a "first underlined" prompt, and offers to draw connections to
  // any other books from the same saved search that already exist on the shelf.
  const applyPendingEdition = (opts: { connect: boolean }) => {
    if (!pending) return;
    const patch = editionToBookPatch(pending);
    const seedPrompt = firstUnderlinedPrompt(pending);
    // Look across the user's library for books matching titles in the same saved search.
    const sameRec = recs.find((r) => r.id === pending.recId);
    const relatedTitles = (sameRec?.editions ?? []).map((e) => e.title.toLowerCase());
    const candidateConnections = opts.connect && sameRec
      ? books.filter(
          (b) =>
            b.id !== book.id &&
            relatedTitles.some((t) => b.title.toLowerCase().includes(t.split(":")[0].trim().slice(0, 12)))
        )
      : [];

    updateBook(book.id, (b) => {
      const bInstances = b.instances ?? [];
      const inst = bInstances[bInstances.length - 1];
      const updatedInst = inst && !inst.firstUnderlined
        ? { ...inst, firstUnderlined: seedPrompt }
        : inst;
      const instances = inst
        ? [...bInstances.slice(0, -1), updatedInst!]
        : bInstances;

      const existingConnIds = new Set(b.connections.map((c) => c.toBookId));
      const newConnections = candidateConnections
        .filter((c) => !existingConnIds.has(c.id))
        .map((c) => ({ toBookId: c.id, type: "thematically-similar" as const, note: `Same recommendation search · ${pending.edition.languageLabel}` }));

      return {
        ...b,
        language: patch.language ?? b.language,
        isbn: patch.isbn ?? b.isbn,
        coverUrl: patch.coverUrl ?? b.coverUrl,
        coverSource: patch.coverUrl ? "google" : b.coverSource,
        pages: patch.pages ?? b.pages,
        year: patch.year ?? b.year,
        // The detected book is in English by our pipeline; if user applied a
        // non-English edition, treat English as the original language.
        originalLanguage:
          b.originalLanguage ??
          (pending.edition.language !== "en" ? "English" : pending.detected ? "English" : b.originalLanguage),
        instances,
        connections: [...b.connections, ...newConnections],
      };
    });
    toast.success(
      candidateConnections.length
        ? `Edition applied · ${candidateConnections.length} connection${candidateConnections.length > 1 ? "s" : ""} drawn`
        : "Edition applied to this book"
    );
    setPending(null);
  };



  const generateAndSaveDossier = async () => {
    if (!book) return;
    if (hasDossier) {
      navigate(`/history?open=${book.id}`);
      return;
    }
    setGeneratingDossier(true);
    try {
      const { dossier, generatedAt } = await generateDossier({
        title: book.title, author: book.author, year: book.year, mode: "create",
      });
      await saveDossierRemote({
        bookId: book.id, title: book.title, author: book.author,
        dossier, generatedAt,
      });
      setHasDossier(true);
      toast.success("Dossier saved to your Memory Vault", {
        action: { label: "Open", onClick: () => navigate(`/history?open=${book.id}`) },
      });
    } catch (e: any) {
      toast.error(e?.message ?? "Could not generate dossier");
    } finally {
      setGeneratingDossier(false);
    }
  };

  return (
    <div className="min-h-screen pb-24">
      {/* Top bar */}
      <div className="px-4 sm:px-8 lg:px-14 pt-8 flex items-center justify-between">
        <Button onClick={() => navigate("/")} variant="ghost" size="sm" className="text-muted-foreground hover:text-primary -ml-3">
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to shelf
        </Button>
        <div className="flex items-center gap-2">
          <Button onClick={refreshMetadata} disabled={refreshingMeta} variant="outline" size="sm" className="border-primary/40 text-primary">
            {refreshingMeta ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-2" />} Improve details
          </Button>
          <Button
            onClick={generateAndSaveDossier}
            disabled={generatingDossier}
            variant="outline"
            size="sm"
            className="border-primary/40 text-primary"
            title={hasDossier ? "Open in the Memory Vault" : "Generate a full dossier and save it to the Memory Vault"}
          >
            {generatingDossier
              ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
              : <ScrollText className="h-3.5 w-3.5 mr-2" />}
            {hasDossier ? "Open dossier" : generatingDossier ? "Composing…" : "Generate dossier"}
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" className="border-destructive/50 text-destructive hover:bg-destructive/10"><Trash2 className="h-3.5 w-3.5 mr-2" /> Delete</Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="ink-card rounded-sm">
              <AlertDialogHeader>
                <AlertDialogTitle className="font-display text-2xl">Remove this volume?</AlertDialogTitle>
                <AlertDialogDescription>This deletes “{book.title}” and its notes from this shelf. This cannot be undone.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => { removeBook(book.id); toast.success("Book deleted"); navigate("/"); }}>Delete book</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <span className="stamp">Dossier · {book.id.slice(0, 6).toUpperCase()}</span>
        </div>
      </div>

      {pending && (
        <div className="px-4 sm:px-8 lg:px-14 mt-5">
          <div className="luxury-panel rounded-sm p-4 border border-primary/40 flex items-start gap-4 animate-fade-in">
            {pending.edition.coverUrl && (
              <img src={pending.edition.coverUrl} alt="" className="w-14 h-20 object-cover rounded-[2px] ring-1 ring-border/60 shrink-0" loading="lazy" decoding="async" />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <Globe className="h-3.5 w-3.5 text-primary" />
                <span className="mono text-[0.55rem] tracking-[0.25em] uppercase text-primary">Apply edition · {pending.edition.languageLabel}</span>
              </div>
              <p className="font-display text-base text-foreground mt-1" dir={pending.edition.language === "ar" ? "rtl" : "ltr"}>
                {pending.edition.title}
              </p>
              <p className="font-serif italic text-xs text-muted-foreground">
                Prefills language, ISBN, cover, page count, and seeds a first-underlined prompt. Optionally draws connections to other books from the same saved search.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" onClick={() => applyPendingEdition({ connect: true })} className="bg-primary text-primary-foreground hover:bg-primary-glow font-display tracking-wider">
                  Apply + suggest connections
                </Button>
                <Button size="sm" variant="outline" onClick={() => applyPendingEdition({ connect: false })} className="border-primary/40 text-primary">
                  Apply edition only
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setPending(null)} className="text-muted-foreground">
                  <X className="h-3.5 w-3.5 mr-1" /> Dismiss
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="px-4 sm:px-8 lg:px-14 mt-6 grid grid-cols-12 gap-8">
        {/* LEFT — Cover / metadata */}
        <aside className="col-span-12 lg:col-span-3 space-y-6">
          <div className="aspect-[2/3] w-full max-w-[260px] mx-auto relative">
            <div className="absolute inset-0 shadow-card" style={{ background: book.spineColor }} />
            {book.coverUrl ? (
              <img src={book.coverUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-parchment/60 font-display text-xl p-6 text-center">
                {book.title}
              </div>
            )}
            <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />
          </div>
          <div className="flex justify-center">
            <Button
              onClick={() => setAiCoverOpen(true)}
              variant="ghost"
              size="sm"
              className="h-7 text-[0.6rem] tracking-[0.2em] uppercase text-primary hover:text-primary-glow"
            >
              <Wand2 className="h-3 w-3 mr-1.5" />
              {book.coverSource === "ai-generated" ? "Regenerate AI cover" : "Generate AI cover"}
            </Button>
          </div>

          <div className="text-center space-y-2">
            <span className="eyebrow">{STATUS_LABEL[book.status]}</span>
            <select
              value={book.status}
              onChange={(e) => { setStatus(book.id, e.target.value as BookStatus); toast.success("Status updated"); }}
              className="block mx-auto bg-input border border-border-strong/40 rounded-sm px-3 py-1.5 text-xs font-mono uppercase tracking-wider focus:outline-none focus:border-primary"
            >
              {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
          </div>

          <div className="ink-card rounded-sm p-5 space-y-3">
            <p className="eyebrow">Rating</p>
            <RatingDial value={inst?.rating} onChange={(v) => setRating(book.id, v)} size={170} />
          </div>

          <div className="ink-card rounded-sm p-5 space-y-3">
            <div className="flex items-baseline justify-between gap-2">
              <p className="eyebrow">Spine artwork</p>
              <Button onClick={generateSpine} disabled={generatingSpine} variant="ghost" size="sm" className="h-7 text-[0.6rem] tracking-[0.2em] uppercase text-primary hover:text-primary-glow">
                {generatingSpine ? <Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> : <Wand2 className="h-3 w-3 mr-1.5" />}
                {book.spineUrl ? "Regenerate" : "Generate"}
              </Button>
            </div>
            <div className="flex items-end justify-center gap-2 min-h-[120px] py-2">
              {book.spineUrl ? (
                <img src={book.spineUrl} alt="Generated spine" className="h-28 w-auto object-contain rounded-[2px] ring-1 ring-border/50 shadow-card" />
              ) : (
                <p className="font-serif italic text-xs text-muted-foreground text-center px-2">
                  No custom spine yet. Generate one to see this book's unique spine on the shelf.
                </p>
              )}
            </div>
          </div>

          <div className="ink-card rounded-sm p-5 space-y-3">
            <p className="eyebrow">Sessions</p>
            <div className="space-y-2">
              {(inst?.sessions ?? []).slice(-5).reverse().map(s => (
                <div key={s.id} className="flex items-center gap-3 text-xs mono text-muted-foreground">
                  <span className="text-primary">●</span>
                  <span>{new Date(s.date).toLocaleDateString()}</span>
                  <span>·</span>
                  <span>{s.durationMin}m</span>
                </div>
              ))}
              {(!inst || (inst.sessions ?? []).length === 0) && (
                <p className="text-xs italic text-muted-foreground">No sessions logged yet.</p>
              )}
            </div>
          </div>
        </aside>

        {/* CENTER — Tabs */}
        <section className="col-span-12 lg:col-span-6">
          <header className="mb-6">
            <p className="eyebrow mb-2">{book.author}{book.year ? ` · ${book.year}` : ""}</p>
            <h1 className="font-display text-5xl text-foreground leading-[1.05]">{book.title}</h1>
            {inst?.firstUnderlined && (
              <blockquote className="mt-5 pl-4 border-l-2 border-primary/60 italic font-serif text-muted-foreground">
                "{inst.firstUnderlined}"
                <span className="block mt-1 mono text-[0.6rem] tracking-[0.25em] uppercase text-primary/70 not-italic">First sentence I underlined</span>
              </blockquote>
            )}
            <div className="mt-4 flex items-center gap-3 text-xs mono text-muted-foreground tracking-[0.18em] uppercase">
              <FormatIcon className="h-3.5 w-3.5 text-primary" />
              <span>{book.format}</span>
              {book.language && <><span>·</span><span>{book.language}</span></>}
              {book.pages && <><span>·</span><span>{book.pages} pp</span></>}
            </div>
            <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-2">
              <DossierStat label="Pages" value={book.pages ? String(book.pages) : "—"} />
              <DossierStat label="Quotes" value={String(inst?.quotes?.length ?? 0)} />
              <DossierStat label="Sessions" value={String(inst?.sessions?.length ?? 0)} />
              <DossierStat label="Source" value={book.coverSource === "none" || !book.coverSource ? "spine" : book.coverSource} />
            </div>
          </header>

          <Tabs defaultValue="journal" className="w-full">
            <TabsList className="bg-transparent border-b border-border/60 rounded-none p-0 h-auto w-full justify-start gap-6">
              {[
                { v: "journal", l: "Journal", i: NotebookPen },
                { v: "timeline", l: "Timeline", i: Sparkles },
                { v: "quotes", l: "Quotes", i: QuoteIcon },
                { v: "arc", l: "Emotional Arc", i: Sparkles },
                { v: "connections", l: "Connections", i: NetworkIcon },
                { v: "ai", l: "AI Dissection", i: Sparkles },
              ].map(t => (
                <TabsTrigger
                  key={t.v} value={t.v}
                  className="bg-transparent rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:bg-transparent text-muted-foreground font-display tracking-wider px-0 pb-3 hover:text-foreground"
                >
                  <t.i className="h-3.5 w-3.5 mr-2" /> {t.l}
                </TabsTrigger>
              ))}
            </TabsList>

            {/* JOURNAL */}
            <TabsContent value="journal" className="mt-6 space-y-4">
              <div className="space-y-3">
                <Textarea
                  rows={5}
                  placeholder="What did the page do to you today?"
                  value={journalDraft}
                  onChange={(e) => setJournalDraft(e.target.value)}
                  className="bg-input/40 border-border-strong/30 font-serif text-base italic placeholder:italic placeholder:text-muted-foreground/60 leading-relaxed"
                />
                <Button
                  onClick={() => { addJournal(book.id, journalDraft); setJournalDraft(""); toast.success("Entry saved"); }}
                  disabled={!journalDraft.trim()}
                  className="bg-primary text-primary-foreground hover:bg-primary-glow font-display tracking-wider"
                >
                  Inscribe
                </Button>
              </div>
              <div className="space-y-4 mt-8">
                {(inst?.journal ?? []).slice().reverse().map(j => (
                  <article key={j.id} className="ink-card rounded-sm p-5 ink-drop">
                    <p className="mono text-[0.6rem] tracking-[0.25em] uppercase text-primary/70 mb-2">
                      {new Date(j.date).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
                    </p>
                    <p className="font-serif leading-relaxed whitespace-pre-wrap">{j.body}</p>
                  </article>
                ))}
                {(!inst || (inst.journal ?? []).length === 0) && (
                  <p className="font-display italic text-muted-foreground">No marginalia yet.</p>
                )}
              </div>
            </TabsContent>

            {/* TIMELINE — chronological reading diary */}
            <TabsContent value="timeline" className="mt-6">
              {(() => {
                const events: { at: string; kind: "session" | "journal" | "quote"; node: React.ReactNode }[] = [];
                (book.instances ?? []).forEach(i => {
                  (i.sessions ?? []).forEach(s => events.push({
                    at: s.date, kind: "session",
                    node: (
                      <>
                        <p className="mono text-[0.55rem] tracking-[0.22em] uppercase text-primary/80">Reading session · {s.durationMin} min</p>
                        {(s.pagesStart || s.pagesEnd) && (
                          <p className="font-serif text-foreground mt-1">Pages {s.pagesStart ?? "—"} → {s.pagesEnd ?? "—"}</p>
                        )}
                        {s.note && <p className="font-serif italic text-muted-foreground mt-1 whitespace-pre-wrap">{s.note}</p>}
                      </>
                    )
                  }));
                  (i.journal ?? []).forEach(j => events.push({
                    at: j.date, kind: "journal",
                    node: (
                      <>
                        <p className="mono text-[0.55rem] tracking-[0.22em] uppercase text-primary/80">Journal entry</p>
                        <p className="font-serif text-foreground mt-1 whitespace-pre-wrap">{j.body}</p>
                      </>
                    )
                  }));
                  (i.quotes ?? []).forEach(q => events.push({
                    at: q.savedAt, kind: "quote",
                    node: (
                      <>
                        <p className="mono text-[0.55rem] tracking-[0.22em] uppercase text-primary/80">Quote saved{q.page ? ` · pg ${q.page}` : ""}</p>
                        <blockquote className="font-display italic text-lg text-foreground mt-1">"{q.text}"</blockquote>
                      </>
                    )
                  }));
                });
                events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
                if (!events.length) return <p className="font-display italic text-muted-foreground">No events yet. Start a ritual or save a quote.</p>;
                return (
                  <ol className="relative border-l border-border/60 ml-3 space-y-5">
                    {events.map((e, i) => (
                      <li key={i} className="pl-5 relative">
                        <span className="absolute -left-[5px] top-2 h-2 w-2 rounded-full bg-primary" />
                        <p className="mono text-[0.5rem] tracking-[0.22em] uppercase text-muted-foreground mb-1">
                          {new Date(e.at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
                        </p>
                        <div className="ink-card rounded-sm p-4">{e.node}</div>
                      </li>
                    ))}
                  </ol>
                );
              })()}
            </TabsContent>

            {/* QUOTES */}
            <TabsContent value="quotes" className="mt-6 space-y-6">
              <div className="ink-card p-5 rounded-sm space-y-3">
                <Textarea
                  rows={3}
                  placeholder="Paste the quote…"
                  value={quoteText}
                  onChange={(e) => setQuoteText(e.target.value)}
                  className="bg-input/40 border-border-strong/30 font-serif italic"
                />
                <div className="grid grid-cols-2 gap-3">
                  <Input value={quotePage} onChange={(e) => setQuotePage(e.target.value)} placeholder="Page" className="bg-input/40 border-border-strong/30 mono text-sm" />
                  <select value={quoteRes} onChange={(e) => setQuoteRes(e.target.value as ResonanceTag)}
                    className="bg-input/40 border border-border-strong/30 rounded-sm px-3 py-2 text-sm font-serif">
                    {RESONANCE.map(r => <option key={r.v} value={r.v}>{r.l}</option>)}
                  </select>
                </div>
                <Input value={quoteNote} onChange={(e) => setQuoteNote(e.target.value)} placeholder="A personal note (optional)…"
                  className="bg-input/40 border-border-strong/30 font-serif italic" />
                <Button
                  onClick={() => {
                    if (!quoteText.trim()) return;
                    addQuote(book.id, { text: quoteText, page: quotePage, resonance: quoteRes, note: quoteNote });
                    setQuoteText(""); setQuotePage(""); setQuoteNote("");
                    toast.success("Quote saved");
                  }}
                  className="bg-primary text-primary-foreground hover:bg-primary-glow font-display tracking-wider"
                >
                  Save Quote
                </Button>
              </div>

              {/* SUGGESTED QUOTES — AI fetches 5+ verbatim famous quotes from this book */}
              <div className="ink-card p-5 rounded-sm space-y-4">
                <div className="flex items-baseline justify-between flex-wrap gap-2">
                  <div>
                    <p className="eyebrow">Quote oracle</p>
                    <p className="font-serif italic text-muted-foreground text-sm mt-1">
                      Pull the most-cited verbatim lines from <span className="text-foreground not-italic">{book.title}</span>.
                    </p>
                  </div>
                  <Button
                    onClick={requestSuggestedQuotes}
                    disabled={loadingSuggested}
                    size="sm"
                    variant="outline"
                    className="border-primary/50 text-primary hover:bg-primary/10 font-display tracking-wider"
                  >
                    {loadingSuggested
                      ? <><Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> Summoning</>
                      : <><Wand2 className="h-3.5 w-3.5 mr-2" /> {suggested.length ? "Refresh" : "Find quotes"}</>}
                  </Button>
                </div>

                {suggested.length > 0 && (
                  <div className="space-y-3 pt-2">
                    {suggested.map((s, i) => (
                      <div key={i} className="border-l-2 border-primary/40 pl-4 group">
                        <p className="font-serif italic text-foreground leading-relaxed">"{s.text}"</p>
                        <div className="mt-2 flex items-center justify-between gap-3 flex-wrap">
                          <p className="mono text-[0.55rem] tracking-[0.25em] uppercase text-muted-foreground">
                            {s.theme}{s.context ? ` · ${s.context}` : ""}
                          </p>
                          <button
                            onClick={() => {
                              addQuote(book.id, { text: s.text, resonance: "beautiful-language", note: s.context });
                              toast.success("Saved to your vault");
                            }}
                            className="inline-flex items-center gap-1.5 mono text-[0.6rem] tracking-[0.25em] uppercase text-primary/70 hover:text-primary transition-colors"
                          >
                            <Plus className="h-3 w-3" /> Save
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-5">
                {(inst?.quotes ?? []).slice().reverse().map(q => (
                  <figure key={q.id} className="ink-drop">
                    <blockquote className="font-display text-2xl italic text-foreground leading-snug border-l-2 border-primary/60 pl-5">
                      "{q.text}"
                    </blockquote>
                    <figcaption className="mt-2 ml-5 mono text-[0.65rem] tracking-[0.25em] uppercase text-muted-foreground flex items-center gap-3 flex-wrap">
                      {q.page && <span>Pg {q.page}</span>}
                      {q.resonance && <span className="text-primary">· {RESONANCE.find(r => r.v === q.resonance)?.l}</span>}
                    </figcaption>
                    {q.note && <p className="ml-5 mt-2 italic font-serif text-muted-foreground">— {q.note}</p>}
                  </figure>
                ))}
                {(!inst || (inst.quotes ?? []).length === 0) && (
                  <p className="font-display italic text-muted-foreground">The vault is empty.</p>
                )}
              </div>
            </TabsContent>

            {/* ARC */}
            <TabsContent value="arc" className="mt-6">
              <div className="ink-card rounded-sm p-6">
                <EmotionalArc arc={inst?.arc ?? []} onTap={(p, m) => { setArc(book.id, p, m); toast.success(`${p}% logged`); }} />
              </div>
            </TabsContent>

            {/* CONNECTIONS */}
            <TabsContent value="connections" className="mt-6 space-y-4">
              <p className="eyebrow">Linked volumes</p>
              <div className="space-y-2">
                {book.connections.map(c => {
                  const target = books.find(b => b.id === c.toBookId);
                  if (!target) return null;
                  return (
                    <div key={c.toBookId} className="ink-card rounded-sm p-4 flex items-center gap-4">
                      <div className="w-2 h-12" style={{ background: target.spineColor }} />
                      <div className="flex-1">
                        <p className="font-display text-base">{target.title}</p>
                        <p className="mono text-[0.6rem] tracking-[0.2em] uppercase text-primary/80">{c.type.replace(/-/g, " ")}</p>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => navigate(`/book/${target.id}`)}>Open →</Button>
                    </div>
                  );
                })}
              </div>
              {otherBooks.length > 0 && (
                <div className="ink-card rounded-sm p-4 space-y-3">
                  <Label className="eyebrow">Add a connection</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <select value={selectedConnTarget} onChange={(e) => setConnTarget(e.target.value)} className="bg-input border border-border-strong/40 rounded-sm px-3 py-2 text-sm font-serif">
                      {otherBooks.map(b => <option key={b.id} value={b.id}>{b.title}</option>)}
                    </select>
                    <select value={connType} onChange={(e) => setConnType(e.target.value)} className="bg-input border border-border-strong/40 rounded-sm px-3 py-2 text-sm font-serif">
                      <option value="thematically-similar">Thematically similar</option>
                      <option value="contradicts">Contradicts</option>
                      <option value="continues">Continues</option>
                      <option value="influenced-by">Influenced by</option>
                      <option value="made-me-think-of">Made me think of</option>
                    </select>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => {
                      if (!selectedConnTarget) return;
                      addConnection(book.id, { toBookId: selectedConnTarget, type: connType as any });
                      toast.success("Connection drawn");
                    }}
                    className="bg-primary text-primary-foreground hover:bg-primary-glow font-display tracking-wider"
                  >
                    Draw connection
                  </Button>
                </div>
              )}
            </TabsContent>

            {/* AI */}
            <TabsContent value="ai" className="mt-6 space-y-4">
              <div className="ink-card rounded-sm p-6 space-y-4">
                <div>
                  <p className="eyebrow mb-2">AI Dissection</p>
                  <p className="font-serif italic text-muted-foreground">
                    A reflection of your particular reading — built from your notes, quotes, and emotional arc. Not Wikipedia.
                  </p>
                </div>
                <Button onClick={requestDissection} disabled={loadingDissection}
                  className="bg-primary text-primary-foreground hover:bg-primary-glow font-display tracking-wider">
                  {loadingDissection ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
                  Generate dissection
                </Button>
                {dissection && (
                  <div className="font-serif leading-relaxed text-foreground whitespace-pre-wrap pt-4 border-t border-border/40">
                    {dissection}
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </section>

        {/* RIGHT — meta + how I found + similar */}
        <aside className="col-span-12 lg:col-span-3 space-y-6">
          <div className="ink-card rounded-sm p-5 space-y-3">
            <p className="eyebrow">Tags</p>
            <div className="flex flex-wrap gap-1.5">
              {book.tags.map(t => (
                <span key={t} className="mono text-[0.6rem] tracking-[0.2em] uppercase px-2 py-1 border border-border-strong/40 text-muted-foreground rounded-sm">{t}</span>
              ))}
              {book.tags.length === 0 && <span className="italic text-xs text-muted-foreground">none</span>}
            </div>
            <Input
              placeholder="add tag, press enter"
              className="bg-input/40 border-border-strong/30 mono text-xs mt-2"
              onKeyDown={(e) => {
                const v = (e.target as HTMLInputElement).value.trim();
                if (e.key === "Enter" && v) {
                  updateBook(book.id, b => ({ ...b, tags: Array.from(new Set([...b.tags, v])) }));
                  (e.target as HTMLInputElement).value = "";
                }
              }}
            />
          </div>

          <div className="ink-card rounded-sm p-5 space-y-2">
            <p className="eyebrow">How I found it</p>
            <p className="font-serif italic text-foreground/90 leading-relaxed text-sm">
              {book.howIFound || <span className="text-muted-foreground">Lost to memory.</span>}
            </p>
          </div>

          <div className="ink-card rounded-sm p-5 space-y-3">
            <p className="eyebrow">Adjacent in my library</p>
            <div className="space-y-2">
              {books
                .filter(b => b.id !== book.id && b.tags.some(t => book.tags.includes(t)))
                .slice(0, 4)
                .map(b => (
                  <button key={b.id} onClick={() => navigate(`/book/${b.id}`)} className="w-full text-left flex items-center gap-3 group">
                    <div className="w-1.5 h-10" style={{ background: b.spineColor }} />
                    <div className="min-w-0">
                      <p className="font-display text-sm text-foreground truncate group-hover:text-primary">{b.title}</p>
                      <p className="mono text-[0.55rem] tracking-[0.2em] uppercase text-muted-foreground">{b.author}</p>
                    </div>
                  </button>
                ))}
              {books.filter(b => b.id !== book.id && b.tags.some(t => book.tags.includes(t))).length === 0 && (
                <p className="italic text-xs text-muted-foreground">Nothing yet.</p>
              )}
            </div>
          </div>

          {linkedRecs.length > 0 && (
            <div className="ink-card rounded-sm p-5 space-y-3">
              <div className="flex items-center justify-between">
                <p className="eyebrow">Saved searches for this book</p>
                <button
                  onClick={() => navigate("/recommendations")}
                  className="mono text-[0.55rem] tracking-[0.22em] uppercase text-primary hover:text-primary-glow"
                >
                  Open ↗
                </button>
              </div>
              <div className="space-y-2">
                {linkedRecs.map((r) => (
                  <div key={r.id} className="border border-border/40 rounded-sm p-2.5">
                    <p className="font-display text-xs text-foreground truncate">{r.detected?.title ?? r.query}</p>
                    <p className="mono text-[0.5rem] tracking-[0.2em] uppercase text-muted-foreground mt-1">
                      {r.editions.length} editions · {new Date(r.savedAt).toLocaleDateString()}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {r.editions.slice(0, 4).map((e) => (
                        <button
                          key={e.language}
                          onClick={() => {
                            // Re-stage the apply payload for this dossier and toggle the banner.
                            setPending({
                              bookId: book.id,
                              recId: r.id,
                              edition: e,
                              detected: r.detected,
                            });
                          }}
                          className="mono text-[0.5rem] tracking-[0.2em] uppercase px-1.5 py-0.5 border border-border/50 rounded-sm text-muted-foreground hover:text-primary hover:border-primary"
                        >
                          {e.languageLabel}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>
      <AICoverDialog
        open={aiCoverOpen}
        onOpenChange={setAiCoverOpen}
        title={book.title}
        author={book.author}
        year={book.year}
        hint={book.tags.join(", ")}
        onGenerated={(url) =>
          updateBook(book.id, (b) => ({ ...b, coverUrl: url, coverSource: "ai-generated" }))
        }
      />
    </div>
  );
}

function DossierStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="luxury-panel rounded-sm px-3 py-2">
      <p className="mono text-[0.5rem] tracking-[0.24em] uppercase text-muted-foreground">{label}</p>
      <p className="font-display text-lg text-foreground truncate capitalize">{value}</p>
    </div>
  );
}
