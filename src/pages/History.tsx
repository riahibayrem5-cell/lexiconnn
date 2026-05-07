import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Loader2, Sparkles, RefreshCw, EyeOff, Eye, BookOpen, Search, Quote as QuoteIcon, Users, Lightbulb, MapPin, Tag, Skull, ListChecks, MessageCircle, Library, Plus, X, Download } from "lucide-react";
import { exportDossierPdf } from "@/lib/dossierPdf";
import { useLibrary } from "@/lib/storage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PageHeader } from "@/components/PageHeader";
import { toast } from "sonner";
import {
  generateDossier,
  loadDossier,
  loadAllDossiers,
  saveDossierRemote,
  extendDossier,
  type BookDossier,
  type CachedDossier,
} from "@/lib/dossier";
import { cn } from "@/lib/utils";

type SortMode = "recent" | "extended" | "author";

const SORTS: { key: SortMode; label: string }[] = [
  { key: "recent", label: "Recently composed" },
  { key: "extended", label: "Recently extended" },
  { key: "author", label: "By author" },
];

interface VaultCard {
  bookId: string;
  title: string;
  author: string;
  year?: number;
  coverUrl?: string;
  spineColor?: string;
  generatedAt: string;
  extendedAt?: string;
  extensionCount?: number;
}

export default function History() {
  const { books } = useLibrary();
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortMode>("recent");
  const [openId, setOpenId] = useState<string | null>(null);
  const [dossiers, setDossiers] = useState<CachedDossier[]>([]);
  const [loading, setLoading] = useState(true);

  const refreshList = async () => {
    setLoading(true);
    try {
      const all = await loadAllDossiers();
      setDossiers(all);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshList();
    const h = () => refreshList();
    window.addEventListener("lexicon-dossier-change", h);
    return () => window.removeEventListener("lexicon-dossier-change", h);
  }, []);

  // Auto-open via ?open=<bookId>
  useEffect(() => {
    const open = searchParams.get("open");
    if (open) {
      setOpenId(open);
      // Strip the param so re-mounts don't reopen
      const next = new URLSearchParams(searchParams);
      next.delete("open");
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cards: VaultCard[] = useMemo(() => {
    const byId = new Map(books.map(b => [b.id, b]));
    return dossiers.map(d => {
      const b = byId.get(d.bookId);
      return {
        bookId: d.bookId,
        title: b?.title ?? d.title ?? "Untitled",
        author: b?.author ?? d.author ?? "Unknown",
        year: b?.year,
        coverUrl: b?.coverUrl,
        spineColor: b?.spineColor,
        generatedAt: d.generatedAt,
        extendedAt: d.extendedAt,
        extensionCount: d.extensionCount,
      };
    });
  }, [dossiers, books]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = cards.filter(c => !q || c.title.toLowerCase().includes(q) || c.author.toLowerCase().includes(q));
    if (sort === "recent") list = [...list].sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
    else if (sort === "extended") list = [...list].sort((a, b) => (b.extendedAt ?? "").localeCompare(a.extendedAt ?? ""));
    else list = [...list].sort((a, b) => a.author.localeCompare(b.author));
    return list;
  }, [cards, query, sort]);

  const openCard = filtered.find(c => c.bookId === openId)
    ?? cards.find(c => c.bookId === openId)
    ?? null;

  return (
    <div className="min-h-screen bg-background">
      <PageHeader
        eyebrow="The Memory Vault"
        title=""
        titleMain=""
        titleEmphasis="Book History"
        subtitle="Every dossier you've composed, kept forever. Open a book on your shelf and tap Generate to add it here."
      />

      <div className="px-8 pb-12 space-y-6">
        <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
          <div className="relative flex-1 max-w-xl">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search your vault…"
              className="pl-9"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {SORTS.map(s => (
              <button
                key={s.key}
                onClick={() => setSort(s.key)}
                className={cn(
                  "px-3 py-1.5 text-xs font-display tracking-wide border rounded-sm transition-colors",
                  sort === s.key
                    ? "bg-primary/15 border-primary/50 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground"
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {loading && cards.length === 0 && (
          <Card className="p-12 text-center text-muted-foreground border-dashed">
            <Loader2 className="h-6 w-6 mx-auto mb-3 animate-spin" />
            <p className="font-display tracking-wide">Loading your vault…</p>
          </Card>
        )}

        {!loading && filtered.length === 0 && (
          <Card className="p-12 text-center text-muted-foreground border-dashed">
            <Library className="h-10 w-10 mx-auto mb-3 opacity-50" />
            <p className="font-display tracking-wide">
              {query ? "No dossiers match that search." : "No dossiers yet."}
            </p>
            <p className="text-xs mt-2">
              Open any book on your shelf and tap <span className="font-display text-primary">Generate dossier</span> — it lands here, saved forever.
            </p>
          </Card>
        )}

        {filtered.length > 0 && (
          <Grid cards={filtered} onOpen={(id) => setOpenId(id)} />
        )}
      </div>

      <Dialog open={!!openId} onOpenChange={(o) => !o && setOpenId(null)}>
        <DialogContent className="max-w-none w-screen h-screen p-0 rounded-none border-0 sm:rounded-none">
          {openCard && <DossierFullScreen card={openCard} onClose={() => setOpenId(null)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Grid({ cards, onOpen }: { cards: VaultCard[]; onOpen: (id: string) => void }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
      {cards.map(b => (
        <BookCard key={b.bookId} card={b} onClick={() => onOpen(b.bookId)} />
      ))}
    </div>
  );
}

function BookCard({ card, onClick }: { card: VaultCard; onClick: () => void }) {
  const [src, setSrc] = useState(card.coverUrl);
  const [failed, setFailed] = useState(false);
  useEffect(() => { setSrc(card.coverUrl); setFailed(false); }, [card.coverUrl]);
  const showImg = !!src && !failed;
  return (
    <button onClick={onClick} className="group text-left flex flex-col gap-2">
      <div className="relative aspect-[2/3] overflow-hidden border border-border bg-muted/30 rounded-sm shadow-sm group-hover:shadow-gold transition-all duration-300 group-hover:-translate-y-1">
        {showImg ? (
          <img
            src={src}
            alt={card.title}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            onError={() => setFailed(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center p-3 text-center" style={{ background: card.spineColor ?? "hsl(var(--muted))" }}>
            <span className="font-display text-xs text-foreground/80 leading-tight line-clamp-6">{card.title}</span>
          </div>
        )}
        <div className="absolute top-2 right-2 bg-primary/90 text-primary-foreground rounded-full p-1 shadow-gold" title="Dossier saved">
          <Sparkles className="h-3 w-3" />
        </div>
        {(card.extensionCount ?? 0) > 0 && (
          <div className="absolute bottom-2 right-2 bg-background/90 border border-primary/40 text-primary rounded-sm px-1.5 py-0.5 text-[0.55rem] mono tracking-[0.2em] uppercase">
            ×{card.extensionCount}
          </div>
        )}
      </div>
      <div className="px-1">
        <div className="font-display text-sm text-foreground truncate">{card.title}</div>
        <div className="text-[0.7rem] text-muted-foreground truncate">{card.author}{card.year ? ` · ${card.year}` : ""}</div>
      </div>
    </button>
  );
}

function DossierFullScreen({ card, onClose }: { card: VaultCard; onClose: () => void }) {
  const [cached, setCached] = useState<CachedDossier | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMode, setLoadingMode] = useState<"regenerate" | "extend" | null>(null);
  const [extendProgress, setExtendProgress] = useState<{ pass: number; total: number } | null>(null);
  const [revealSpoilers, setRevealSpoilers] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setHydrated(false);
    setRevealSpoilers(false);
    setCached(null);
    (async () => {
      const existing = await loadDossier(card.bookId);
      if (cancelled) return;
      setCached(existing);
      setHydrated(true);
    })();
    return () => { cancelled = true; };
  }, [card.bookId]);

  const regenerate = async () => {
    if (loading) return;
    setLoading(true);
    setLoadingMode("regenerate");
    try {
      const { dossier, generatedAt } = await generateDossier({
        title: card.title, author: card.author, year: card.year, mode: "create",
      });
      const saved = await saveDossierRemote({
        bookId: card.bookId, title: card.title, author: card.author,
        dossier, generatedAt,
      });
      setCached(saved);
      toast.success("Dossier regenerated");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not regenerate");
    } finally {
      setLoading(false);
      setLoadingMode(null);
    }
  };

  const extendN = async (passes: 1 | 2 | 3) => {
    if (loading || !cached) return;
    setLoading(true);
    setLoadingMode("extend");
    setExtendProgress({ pass: 0, total: passes });
    try {
      const saved = await extendDossier({
        bookId: card.bookId, title: card.title, author: card.author, year: card.year,
        starting: cached.dossier, passes,
        onProgress: (pass, total) => setExtendProgress({ pass, total }),
      });
      setCached(saved);
      toast.success(passes === 1 ? "Dossier extended" : `Extended ${passes}× — deeper than ever`);
    } catch (e: any) {
      const which = extendProgress?.pass ?? 1;
      toast.error(`Pass ${which} failed — kept previous version`);
    } finally {
      setLoading(false);
      setLoadingMode(null);
      setExtendProgress(null);
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-background">
      {/* Top bar */}
      <div className="flex items-start gap-5 px-6 lg:px-12 pt-6 pb-5 border-b border-border">
        <div className="w-24 lg:w-32 shrink-0 aspect-[2/3] overflow-hidden border border-border rounded-sm bg-muted/30 shadow-md">
          {card.coverUrl ? (
            <img src={card.coverUrl} alt={card.title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[0.6rem] font-display p-2 text-center" style={{ background: card.spineColor ?? "hsl(var(--muted))" }}>{card.title}</div>
          )}
        </div>
        <div className="flex-1 min-w-0 flex flex-col gap-3">
          <div>
            <p className="mono text-[0.6rem] tracking-[0.3em] uppercase text-primary/80 mb-1">Memory Vault</p>
            <h1 className="font-display text-2xl lg:text-4xl tracking-wide leading-tight">{card.title}</h1>
            <p className="text-sm lg:text-base text-muted-foreground mt-1">{card.author}{card.year ? ` · ${card.year}` : ""}</p>
          </div>
          {cached && (
            <div className="flex flex-wrap items-center gap-1.5">
              <Button size="sm" variant="ghost" className="h-7 px-2 text-[0.7rem] font-display tracking-wide" onClick={regenerate} disabled={loading}>
                {loadingMode === "regenerate" ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RefreshCw className="h-3 w-3 mr-1" />}
                Regenerate
              </Button>

              {/* Segmented Extend control */}
              <div className="inline-flex items-center border border-primary/40 rounded-sm overflow-hidden h-7">
                <span className="px-2 text-[0.65rem] font-display tracking-wide text-primary/80 inline-flex items-center gap-1 border-r border-primary/30">
                  {loadingMode === "extend"
                    ? <Loader2 className="h-3 w-3 animate-spin" />
                    : <Plus className="h-3 w-3" />}
                  Extend
                </span>
                {([1, 2, 3] as const).map(n => (
                  <button
                    key={n}
                    onClick={() => extendN(n)}
                    disabled={loading}
                    className={cn(
                      "px-2.5 h-full text-[0.7rem] font-display tracking-wide border-r border-primary/30 last:border-r-0 transition-colors",
                      "text-primary hover:bg-primary/15 disabled:opacity-50",
                    )}
                    title={n === 1 ? "One deeper pass" : n === 2 ? "Two passes — much richer" : "Three passes — deepest dive"}
                  >
                    {n}×
                  </button>
                ))}
              </div>

              <Button size="sm" variant="ghost" className="h-7 px-2 text-[0.7rem] font-display tracking-wide" onClick={() => setRevealSpoilers(v => !v)}>
                {revealSpoilers ? <Eye className="h-3 w-3 mr-1" /> : <EyeOff className="h-3 w-3 mr-1" />}
                {revealSpoilers ? "Spoilers on" : "Spoilers off"}
              </Button>
              <Button size="sm" variant="ghost" className="h-7 px-2 text-[0.7rem] font-display tracking-wide text-primary hover:text-primary"
                onClick={async () => {
                  try {
                    toast.message("Composing PDF…");
                    await exportDossierPdf({
                      title: card.title, author: card.author, year: card.year,
                      coverUrl: card.coverUrl,
                      dossier: cached.dossier,
                      generatedAt: cached.generatedAt,
                      extendedAt: cached.extendedAt,
                    });
                    toast.success("PDF exported");
                  } catch (e: any) {
                    toast.error(e?.message ?? "PDF export failed");
                  }
                }}
                title="Download a beautifully designed PDF of this dossier">
                <Download className="h-3 w-3 mr-1" /> PDF
              </Button>
              {(cached.extensionCount ?? 0) > 0 && (
                <Badge variant="outline" className="text-[0.6rem] tracking-wide self-center">extended ×{cached.extensionCount}</Badge>
              )}
              {extendProgress && extendProgress.total > 1 && (
                <span className="text-[0.65rem] mono tracking-[0.2em] uppercase text-primary">
                  Pass {Math.max(extendProgress.pass, 1)}/{extendProgress.total}…
                </span>
              )}
            </div>
          )}
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="shrink-0">
          <X className="h-5 w-5" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="px-6 lg:px-12 py-8 max-w-6xl mx-auto">
          {!hydrated && (
            <div className="text-center py-24 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mx-auto mb-3" />
              <p className="text-xs font-display tracking-wide">Loading dossier…</p>
            </div>
          )}
          {hydrated && !cached && (
            <Card className="p-10 text-center border-dashed max-w-md mx-auto">
              <Sparkles className="h-8 w-8 mx-auto mb-3 text-primary opacity-70" />
              <p className="font-display text-base mb-3">Dossier missing</p>
              <p className="text-xs text-muted-foreground mb-4">It may have been removed. Regenerate to bring it back.</p>
              <Button size="sm" onClick={regenerate} disabled={loading}>
                {loading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RefreshCw className="h-3 w-3 mr-1" />}
                Regenerate
              </Button>
            </Card>
          )}
          {cached && <DossierBody dossier={cached.dossier} revealSpoilers={revealSpoilers} generatedAt={cached.generatedAt} extendedAt={cached.extendedAt} extensionCount={cached.extensionCount} />}
        </div>
      </ScrollArea>
    </div>
  );
}

const SECTIONS: { id: string; label: string; icon: React.ReactNode }[] = [
  { id: "essence", label: "Essence", icon: <BookOpen className="h-3.5 w-3.5" /> },
  { id: "ideas", label: "Ideas", icon: <Lightbulb className="h-3.5 w-3.5" /> },
  { id: "people", label: "People", icon: <Users className="h-3.5 w-3.5" /> },
  { id: "quotes", label: "Quotes", icon: <QuoteIcon className="h-3.5 w-3.5" /> },
  { id: "lessons", label: "Lessons", icon: <ListChecks className="h-3.5 w-3.5" /> },
  { id: "plot", label: "Plot", icon: <Skull className="h-3.5 w-3.5" /> },
];

function DossierBody({
  dossier, revealSpoilers, generatedAt, extendedAt, extensionCount,
}: {
  dossier: BookDossier; revealSpoilers: boolean; generatedAt: string;
  extendedAt?: string; extensionCount?: number;
}) {
  const [activeSection, setActiveSection] = useState("essence");

  // Track which section is in view (sticky TOC highlight)
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter(e => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]) setActiveSection((visible[0].target as HTMLElement).dataset.section!);
      },
      { rootMargin: "-25% 0px -55% 0px", threshold: [0, 0.25, 0.5, 1] },
    );
    SECTIONS.forEach(s => {
      const el = document.querySelector(`[data-section="${s.id}"]`);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  const scrollTo = (id: string) => {
    const el = document.querySelector(`[data-section="${id}"]`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="grid grid-cols-12 gap-8">
      {/* Sticky TOC — desktop only */}
      <aside className="hidden lg:block lg:col-span-3">
        <nav className="sticky top-6 space-y-1">
          <p className="mono text-[0.55rem] tracking-[0.3em] uppercase text-muted-foreground mb-3">Contents</p>
          {SECTIONS.map(s => (
            <button
              key={s.id}
              onClick={() => scrollTo(s.id)}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-2 text-left text-xs font-display tracking-wide rounded-sm border-l-2 transition-all",
                activeSection === s.id
                  ? "border-primary text-primary bg-primary/5"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
              )}
            >
              {s.icon}
              <span>{s.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      <div className="col-span-12 lg:col-span-9 space-y-12">
        {/* Hero strip */}
        <header className="space-y-4 pb-6 border-b border-border">
          <p className="font-display text-2xl lg:text-3xl italic text-foreground/95 leading-snug">
            <span className="text-primary text-3xl lg:text-4xl mr-1 leading-none">“</span>
            {dossier.oneLiner}
            <span className="text-primary text-3xl lg:text-4xl ml-0.5 leading-none">”</span>
          </p>
          <div className="h-px w-24 bg-gradient-to-r from-primary/60 to-transparent" />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mono text-[0.65rem] tracking-[0.25em] uppercase text-muted-foreground">
            {dossier.genre && <span className="text-primary">{dossier.genre}</span>}
            {dossier.setting && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {dossier.setting}</span>}
            {dossier.moodTags && dossier.moodTags.length > 0 && (
              <span>{dossier.moodTags.slice(0, 4).join(" · ")}</span>
            )}
          </div>
        </header>

        {/* ESSENCE */}
        <Section id="essence" title="Essence" icon={<BookOpen className="h-4 w-4" />}>
          <p className="text-base lg:text-lg leading-relaxed text-foreground/90 first-letter:font-display first-letter:text-5xl first-letter:float-left first-letter:mr-2 first-letter:leading-none first-letter:text-primary first-letter:mt-1">
            {dossier.summary}
          </p>
          {dossier.themes.length > 0 && (
            <div className="space-y-4 pt-6">
              <SubHead icon={<Tag className="h-3.5 w-3.5" />} label="Themes" />
              <div className="grid sm:grid-cols-2 gap-4">
                {dossier.themes.map((t, i) => (
                  <Card key={i} className="p-4 bg-muted/10 border-l-2 border-l-primary/60">
                    <div className="font-display text-sm text-primary mb-1.5">{t.name}</div>
                    <p className="text-sm text-muted-foreground leading-relaxed">{t.description}</p>
                  </Card>
                ))}
              </div>
            </div>
          )}
          {dossier.symbols && dossier.symbols.length > 0 && (
            <div className="space-y-4 pt-6">
              <SubHead icon={<Sparkles className="h-3.5 w-3.5" />} label="Symbols & motifs" />
              <div className="grid sm:grid-cols-2 gap-3">
                {dossier.symbols.map((s, i) => (
                  <Card key={i} className="p-3 bg-muted/20">
                    <div className="font-display text-sm mb-1">{s.symbol}</div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{s.meaning}</p>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </Section>

        {/* IDEAS */}
        <Section id="ideas" title="Ideas to Remember" icon={<Lightbulb className="h-4 w-4" />}>
          <div className="space-y-4">
            {dossier.mainIdeas.map((idea, i) => (
              <Card key={i} className="p-5 border-l-4 border-l-primary shadow-sm">
                <div className="flex gap-4 items-start">
                  <div className="font-display text-3xl text-primary/60 leading-none tabular-nums">{String(i + 1).padStart(2, "0")}</div>
                  <div className="flex-1">
                    <div className="font-display text-base lg:text-lg mb-2">{idea.idea}</div>
                    <p className="text-sm lg:text-base text-foreground/90 leading-relaxed mb-3">{idea.explanation}</p>
                    <p className="text-xs lg:text-sm text-muted-foreground italic pl-3 border-l border-primary/30">
                      <span className="mono not-italic text-[0.6rem] tracking-[0.25em] uppercase text-primary/70 mr-1.5">Why it matters</span>
                      {idea.whyItMatters}
                    </p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </Section>

        {/* PEOPLE */}
        <Section id="people" title="People" icon={<Users className="h-4 w-4" />}>
          <div className="grid sm:grid-cols-2 gap-3">
            {dossier.characters.map((c, i) => (
              <Card key={i} className="p-4 flex flex-col">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="font-display text-base">{c.name}</div>
                  <Badge variant="outline" className="text-[0.55rem] tracking-[0.2em] uppercase shrink-0">{c.role}</Badge>
                </div>
                <p className="text-sm text-foreground/90 leading-relaxed flex-1">{c.description}</p>
                {c.arc && (
                  <div className="mt-3 pt-3 border-t border-border/60 text-xs text-muted-foreground italic flex gap-2">
                    <span className="text-primary not-italic">→</span>
                    <span>{c.arc}</span>
                  </div>
                )}
              </Card>
            ))}
          </div>
        </Section>

        {/* QUOTES */}
        <Section id="quotes" title="Key Quotes" icon={<QuoteIcon className="h-4 w-4" />}>
          <div className="space-y-6">
            {dossier.keyQuotes.map((q, i) => (
              <figure key={i} className="relative pl-10 pr-2">
                <span aria-hidden className="absolute left-0 top-0 font-display text-6xl text-primary/30 leading-none select-none">“</span>
                <blockquote className="font-display italic text-lg lg:text-xl leading-relaxed text-foreground/95">
                  {q.quote}
                </blockquote>
                {q.context && (
                  <figcaption className="mt-3 mono text-[0.6rem] tracking-[0.25em] uppercase text-muted-foreground border-t border-border/40 pt-2">
                    {q.context}
                  </figcaption>
                )}
              </figure>
            ))}
          </div>
        </Section>

        {/* LESSONS */}
        <Section id="lessons" title="Lessons to Carry" icon={<ListChecks className="h-4 w-4" />}>
          <ul className="space-y-3">
            {dossier.lessons.map((l, i) => (
              <li key={i} className="flex gap-3 text-sm lg:text-base leading-relaxed">
                <span className="text-primary font-display shrink-0 mt-0.5">◆</span>
                <span className="text-foreground/90">{l}</span>
              </li>
            ))}
          </ul>
          {dossier.discussionQuestions && dossier.discussionQuestions.length > 0 && (
            <div className="space-y-3 pt-8">
              <SubHead icon={<MessageCircle className="h-3.5 w-3.5" />} label="Questions to sit with" />
              <ul className="space-y-2">
                {dossier.discussionQuestions.map((q, i) => (
                  <li key={i} className="text-sm text-muted-foreground italic leading-relaxed">— {q}</li>
                ))}
              </ul>
            </div>
          )}
          {dossier.criticisms && dossier.criticisms.length > 0 && (
            <div className="space-y-3 pt-8">
              <SubHead icon={<ListChecks className="h-3.5 w-3.5" />} label="Honest critique" />
              <ul className="space-y-1.5">
                {dossier.criticisms.map((c, i) => (
                  <li key={i} className="text-sm text-muted-foreground">• {c}</li>
                ))}
              </ul>
            </div>
          )}
          {dossier.ifYouLiked && dossier.ifYouLiked.length > 0 && (
            <div className="space-y-3 pt-8">
              <SubHead icon={<Library className="h-3.5 w-3.5" />} label="If you liked this" />
              <div className="grid sm:grid-cols-2 gap-3">
                {dossier.ifYouLiked.map((r, i) => (
                  <Card key={i} className="p-3 bg-muted/20">
                    <div className="font-display text-sm">{r.title}</div>
                    <div className="text-xs text-muted-foreground">{r.author}</div>
                    <div className="text-xs mt-1.5 text-foreground/80 italic">{r.why}</div>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </Section>

        {/* PLOT */}
        <Section id="plot" title="Plot" icon={<Skull className="h-4 w-4" />}>
          <SpoilerWrap revealed={revealSpoilers}>
            <ol className="space-y-4 relative border-l border-border ml-2 pl-6">
              {dossier.timeline.map((b, i) => (
                <li key={i} className="relative">
                  <span className="absolute -left-[30px] top-1.5 w-3 h-3 rounded-full bg-primary/70 shadow-gold ring-2 ring-background" />
                  <div className="mono text-[0.6rem] tracking-[0.3em] uppercase text-primary mb-1">{b.act}</div>
                  <p className="text-sm lg:text-base text-foreground/90 leading-relaxed">{b.event}</p>
                </li>
              ))}
            </ol>
          </SpoilerWrap>
          {dossier.twists && dossier.twists.length > 0 && (
            <div className="pt-6">
              <SubHead icon={<Skull className="h-3.5 w-3.5" />} label="Major twists" />
              <SpoilerWrap revealed={revealSpoilers}>
                <div className="space-y-2 pt-2">
                  {dossier.twists.map((t, i) => (
                    <Card key={i} className="p-3 bg-destructive/5 border-l-2 border-l-destructive/60">
                      <p className="text-sm text-foreground/90 leading-relaxed">{t}</p>
                    </Card>
                  ))}
                </div>
              </SpoilerWrap>
            </div>
          )}
          {dossier.ending && (
            <div className="pt-6">
              <SubHead icon={<BookOpen className="h-3.5 w-3.5" />} label="The ending" />
              <SpoilerWrap revealed={revealSpoilers}>
                <p className="text-sm lg:text-base text-foreground/90 leading-relaxed pt-2">{dossier.ending}</p>
              </SpoilerWrap>
            </div>
          )}
        </Section>

        <div className="pt-8 border-t border-border mono text-[0.6rem] tracking-[0.25em] uppercase text-muted-foreground">
          Composed {new Date(generatedAt).toLocaleDateString()}
          {extendedAt ? ` · last extended ${new Date(extendedAt).toLocaleDateString()}` : ""}
          {(extensionCount ?? 0) > 0 ? ` · extended ×${extensionCount}` : ""}
          {" · AI-generated, verify before quoting"}
        </div>
      </div>
    </div>
  );
}

function Section({ id, title, icon, children }: { id: string; title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section data-section={id} className="space-y-5 scroll-mt-6">
      <div className="flex items-center gap-2 text-primary">
        {icon}
        <h2 className="font-display text-base tracking-[0.2em] uppercase">{title}</h2>
        <div className="flex-1 h-px bg-border/60 ml-2" />
      </div>
      {children}
    </section>
  );
}

function SubHead({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 text-muted-foreground">
      {icon}
      <h3 className="mono text-[0.6rem] tracking-[0.3em] uppercase">{label}</h3>
    </div>
  );
}

function SpoilerWrap({ revealed, children }: { revealed: boolean; children: React.ReactNode }) {
  if (revealed) return <div className="animate-in fade-in duration-300">{children}</div>;
  return (
    <div className="relative">
      <div className="blur-md select-none pointer-events-none opacity-60">{children}</div>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="bg-background/90 border border-border rounded-sm px-4 py-2 flex items-center gap-2 shadow-md">
          <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-display tracking-wide text-muted-foreground">Spoilers hidden — toggle to reveal</span>
        </div>
      </div>
    </div>
  );
}
