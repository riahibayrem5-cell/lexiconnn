import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Loader2, Search, Globe, Wand2, ExternalLink, BookOpen, Copy,
  Bookmark, BookmarkCheck, Trash2, History, ArrowRight, X,
} from "lucide-react";
import { toast } from "sonner";
import {
  useSavedRecs,
  stageEditionApply,
  type SavedRec,
  type SavedEdition,
  type SavedToolRec,
} from "@/lib/savedRecs";
import { useLibrary } from "@/lib/storage";
import { useNavigate } from "react-router-dom";

interface Result {
  query: string;
  detected?: SavedRec["detected"];
  editions: SavedEdition[];
  tools: SavedToolRec[];
}

export default function Recommendations() {
  const navigate = useNavigate();
  const { recs, save, remove } = useSavedRecs();
  const { books } = useLibrary();

  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Result | null>(null);
  const [activeRecId, setActiveRecId] = useState<string | null>(null);
  const [picker, setPicker] = useState<{ edition: SavedEdition; recId: string } | null>(null);

  const isCurrentSaved = useMemo(() => {
    if (!data) return false;
    return recs.some((r) => r.query.trim().toLowerCase() === data.query.trim().toLowerCase());
  }, [data, recs]);

  const search = async (override?: string) => {
    const text = (override ?? q).trim();
    if (!text) return;
    setQ(text);
    setLoading(true);
    setData(null);
    setActiveRecId(null);
    try {
      const { data: res, error } = await supabase.functions.invoke("book-editions", { body: { query: text } });
      if (error) throw error;
      if ((res as any)?.error) throw new Error((res as any).error);
      setData(res as Result);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Search failed");
    } finally {
      setLoading(false);
    }
  };

  const openSavedRec = (rec: SavedRec) => {
    setQ(rec.query);
    setData({ query: rec.query, detected: rec.detected, editions: rec.editions, tools: rec.tools });
    setActiveRecId(rec.id);
  };

  const saveCurrent = () => {
    if (!data) return;
    const saved = save({
      query: data.query,
      detected: data.detected,
      editions: data.editions,
      tools: data.tools,
    });
    setActiveRecId(saved.id);
    toast.success("Saved to your recommendations");
  };

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => toast.success(`${label} copied`));
  };

  const startApply = (edition: SavedEdition) => {
    // Pick the saved-rec id this edition came from. If the current view is a
    // saved rec, use it; otherwise save first so we have a stable id to track.
    let recId = activeRecId;
    if (!recId && data) {
      const saved = save({
        query: data.query,
        detected: data.detected,
        editions: data.editions,
        tools: data.tools,
      });
      recId = saved.id;
      setActiveRecId(recId);
      toast.message("Search saved so we can re-apply it later");
    }
    if (!recId) return;
    setPicker({ edition, recId });
  };

  const applyToBook = (bookId: string) => {
    if (!picker || !data) return;
    stageEditionApply({
      bookId,
      recId: picker.recId,
      edition: picker.edition,
      detected: data.detected,
    });
    setPicker(null);
    navigate(`/book/${bookId}`);
  };

  return (
    <div className="min-h-screen">
      <PageHeader
        eyebrow="Smart Recommendations"
        title=""
        titleMain="Editions across the"
        titleEmphasis="tongues of the world"
        subtitle="Type a book, however roughly. We identify it, then surface the best editions in English, Arabic, French, and German — with ISBN and publisher — plus AI-powered companion tools."
      />

      <div className="px-4 sm:px-8 lg:px-14 py-8 max-w-5xl">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && search()}
              placeholder="e.g. crime and punishment, the prophet kahlil, sapiens harari…"
              className="pl-10 bg-input/60 border-border-strong/40 font-serif h-12 text-base"
            />
          </div>
          <Button onClick={() => search()} disabled={loading || !q.trim()} className="bg-primary text-primary-foreground hover:bg-primary-glow font-display tracking-wider h-12 px-6">
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Wand2 className="h-4 w-4 mr-2" />}
            Find editions
          </Button>
        </div>

        {/* SAVED SEARCHES PANEL */}
        {recs.length > 0 && (
          <section className="mt-8 luxury-panel rounded-sm p-4">
            <div className="flex items-baseline justify-between mb-3">
              <div className="flex items-center gap-2">
                <History className="h-4 w-4 text-primary" />
                <h3 className="font-display text-sm tracking-wider text-foreground">Saved recommendations</h3>
                <span className="mono text-[0.55rem] tracking-[0.25em] uppercase text-muted-foreground">{recs.length}</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {recs.map((r) => (
                <div
                  key={r.id}
                  className={`group flex items-center gap-1 border rounded-sm pr-1 transition-colors ${
                    activeRecId === r.id
                      ? "border-primary bg-primary/10"
                      : "border-border/50 hover:border-border-strong/70"
                  }`}
                >
                  <button
                    onClick={() => openSavedRec(r)}
                    className="px-3 py-1.5 mono text-[0.6rem] tracking-[0.22em] uppercase text-foreground/90"
                    title={`${r.editions.length} editions · saved ${new Date(r.savedAt).toLocaleDateString()}`}
                  >
                    {r.detected?.title ?? r.query}
                  </button>
                  <button
                    onClick={() => { remove(r.id); if (activeRecId === r.id) setActiveRecId(null); }}
                    className="text-muted-foreground hover:text-destructive p-1"
                    aria-label="Remove saved search"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {loading && (
          <div className="mt-12 text-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary mx-auto" />
            <p className="font-serif italic text-muted-foreground mt-3">Identifying the book and gathering its editions…</p>
          </div>
        )}

        {data && (
          <div className="mt-10 space-y-10 animate-fade-in">
            {data.detected && (
              <div className="luxury-panel rounded-sm p-5">
                <div className="flex items-baseline justify-between gap-4 flex-wrap">
                  <div>
                    <p className="mono text-[0.55rem] tracking-[0.3em] uppercase text-muted-foreground">Identified</p>
                    <h2 className="font-display text-2xl text-foreground mt-1">{data.detected.title}</h2>
                    <p className="font-serif italic text-muted-foreground">{data.detected.author}{data.detected.year ? ` · ${data.detected.year}` : ""}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="mono text-[0.6rem] tracking-[0.25em] uppercase text-primary">
                      {(data.detected.confidence * 100).toFixed(0)}% confidence
                    </span>
                    <Button
                      onClick={saveCurrent}
                      variant="outline"
                      size="sm"
                      className={`border-primary/40 ${isCurrentSaved ? "text-primary bg-primary/10" : "text-primary"}`}
                    >
                      {isCurrentSaved
                        ? <><BookmarkCheck className="h-3.5 w-3.5 mr-2" /> Saved</>
                        : <><Bookmark className="h-3.5 w-3.5 mr-2" /> Save search</>}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            <section>
              <div className="flex items-baseline gap-3 mb-4">
                <Globe className="h-4 w-4 text-primary" />
                <h3 className="font-display text-xl text-foreground">Best edition per language</h3>
                <div className="flex-1 h-px bg-border/60" />
              </div>
              {data.editions.length === 0 ? (
                <p className="font-serif italic text-muted-foreground">No editions surfaced. Try a more specific title.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {data.editions.map((e) => (
                    <article key={e.language} className="luxury-panel rounded-sm p-4 flex gap-4">
                      {e.coverUrl ? (
                        <img src={e.coverUrl} alt={e.title} className="w-24 h-36 object-cover rounded-[2px] ring-1 ring-border/60 shrink-0" loading="lazy" decoding="async" />
                      ) : (
                        <div className="w-24 h-36 grid place-items-center bg-muted rounded-[2px] shrink-0">
                          <BookOpen className="h-6 w-6 text-muted-foreground" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <span className="mono text-[0.55rem] tracking-[0.3em] uppercase text-primary">{e.languageLabel}</span>
                        <p className="font-display text-base text-foreground leading-tight mt-1" dir={e.language === "ar" ? "rtl" : "ltr"}>{e.title}</p>
                        <p className="font-serif italic text-sm text-muted-foreground" dir={e.language === "ar" ? "rtl" : "ltr"}>{e.author}</p>
                        <dl className="mt-3 space-y-1 mono text-[0.6rem] tracking-wide text-muted-foreground">
                          {e.publisher && <div><span className="text-foreground/80">Publisher:</span> {e.publisher}{e.publishedDate ? ` · ${e.publishedDate.slice(0, 4)}` : ""}</div>}
                          {e.pageCount && <div><span className="text-foreground/80">Pages:</span> {e.pageCount}</div>}
                          {e.isbn13 && (
                            <div className="flex items-center gap-1">
                              <span className="text-foreground/80">ISBN-13:</span> {e.isbn13}
                              <button onClick={() => copy(e.isbn13!, "ISBN-13")} className="text-primary hover:text-primary-glow" aria-label="Copy ISBN-13"><Copy className="h-3 w-3" /></button>
                            </div>
                          )}
                          {e.isbn10 && !e.isbn13 && (
                            <div className="flex items-center gap-1">
                              <span className="text-foreground/80">ISBN-10:</span> {e.isbn10}
                              <button onClick={() => copy(e.isbn10!, "ISBN-10")} className="text-primary hover:text-primary-glow" aria-label="Copy ISBN-10"><Copy className="h-3 w-3" /></button>
                            </div>
                          )}
                        </dl>
                        <div className="mt-3 flex flex-wrap gap-3 items-center text-xs">
                          {e.previewLink && (
                            <a href={e.previewLink} target="_blank" rel="noreferrer" className="text-primary hover:text-primary-glow inline-flex items-center gap-1 mono tracking-wider">
                              Preview <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                          {e.buyLink && (
                            <a href={e.buyLink} target="_blank" rel="noreferrer" className="text-primary hover:text-primary-glow inline-flex items-center gap-1 mono tracking-wider">
                              Buy <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                          <button
                            onClick={() => startApply(e)}
                            className="ml-auto inline-flex items-center gap-1 mono text-[0.6rem] tracking-[0.22em] uppercase text-primary hover:text-primary-glow border border-primary/40 hover:border-primary px-2.5 py-1 rounded-sm transition-colors"
                          >
                            Apply to a book <ArrowRight className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>

            {data.tools.length > 0 && (
              <section>
                <div className="flex items-baseline gap-3 mb-4">
                  <Wand2 className="h-4 w-4 text-primary" />
                  <h3 className="font-display text-xl text-foreground">AI-powered companion tools</h3>
                  <div className="flex-1 h-px bg-border/60" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {data.tools.map((t, i) => (
                    <div key={i} className="luxury-panel rounded-sm p-4">
                      <div className="flex items-baseline justify-between gap-2">
                        <h4 className="font-display text-foreground">{t.name}</h4>
                        <span className="mono text-[0.55rem] tracking-[0.25em] uppercase text-primary">{t.category}</span>
                      </div>
                      <p className="font-serif italic text-sm text-muted-foreground mt-2">{t.why}</p>
                      {t.url && (
                        <a href={t.url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs mono text-primary hover:text-primary-glow tracking-wider">
                          Visit <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}

        {!loading && !data && recs.length === 0 && (
          <p className="mt-10 font-serif italic text-muted-foreground">
            Try “Sapiens”, “الكيمياء باولو كويلو”, “Le Petit Prince”, or just an author name.
          </p>
        )}
      </div>

      {/* APPLY-TO-BOOK PICKER */}
      {picker && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-background/70 backdrop-blur-sm p-4 animate-fade-in"
          onClick={() => setPicker(null)}
        >
          <div
            className="luxury-panel rounded-sm w-full max-w-lg p-5 max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-baseline justify-between mb-3">
              <div>
                <p className="mono text-[0.55rem] tracking-[0.25em] uppercase text-muted-foreground">Apply edition</p>
                <h3 className="font-display text-xl text-foreground" dir={picker.edition.language === "ar" ? "rtl" : "ltr"}>
                  {picker.edition.title}
                </h3>
                <p className="font-serif italic text-sm text-muted-foreground">
                  {picker.edition.languageLabel}{picker.edition.publisher ? ` · ${picker.edition.publisher}` : ""}
                </p>
              </div>
              <button onClick={() => setPicker(null)} className="text-muted-foreground hover:text-foreground" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="font-serif italic text-sm text-muted-foreground mb-3">
              Choose which Book Brain entry should receive this edition's language, ISBN, cover, and a first-underlined prompt.
            </p>

            <div className="overflow-y-auto -mx-2 px-2 space-y-1">
              {books.length === 0 && (
                <p className="font-serif italic text-muted-foreground text-sm py-6 text-center">
                  Your shelf is empty. Add a book first, then return here to apply the edition.
                </p>
              )}
              {books.map((b) => (
                <button
                  key={b.id}
                  onClick={() => applyToBook(b.id)}
                  className="w-full flex items-center gap-3 p-2 rounded-sm hover:bg-sidebar-accent/40 text-left transition-colors"
                >
                  <div className="w-1.5 h-12 shrink-0" style={{ background: b.spineColor ?? "hsl(30 35% 22%)" }} />
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-sm text-foreground truncate">{b.title}</p>
                    <p className="mono text-[0.55rem] tracking-[0.22em] uppercase text-muted-foreground truncate">
                      {b.author}{b.language ? ` · ${b.language}` : ""}
                    </p>
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 text-primary shrink-0" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
