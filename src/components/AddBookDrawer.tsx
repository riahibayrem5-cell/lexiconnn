import { useEffect, useRef, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { searchOpenLibrary, OLResult } from "@/lib/openlibrary";
import { acquireCover, uploadCustomCover } from "@/lib/covers";
import { useLibrary } from "@/lib/storage";
import { BookStatus, BookFormat, Book } from "@/lib/types";
import { Loader2, Search, BookOpen, Upload, Wand2, Sparkles } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { logHistory } from "@/lib/history";
import { AICoverDialog } from "@/components/AICoverDialog";

interface Props { open: boolean; onOpenChange: (o: boolean) => void; }

const STATUSES: { v: BookStatus; l: string }[] = [
  { v: "want", l: "Want to Read" },
  { v: "reading", l: "Reading" },
  { v: "finished", l: "Finished" },
  { v: "rereading", l: "Re-reading" },
  { v: "abandoned", l: "Abandoned" },
];
const FORMATS: { v: BookFormat; l: string }[] = [
  { v: "physical", l: "Physical" },
  { v: "ebook", l: "Ebook" },
  { v: "audiobook", l: "Audiobook" },
  { v: "dual", l: "Dual" },
];

const SPINE_PALETTE = [
  "hsl(15 35% 22%)", "hsl(30 35% 22%)", "hsl(0 30% 28%)",
  "hsl(140 20% 18%)", "hsl(210 25% 20%)", "hsl(45 35% 30%)",
  "hsl(280 15% 22%)", "hsl(20 50% 35%)", "hsl(0 0% 12%)",
  "hsl(35 45% 45%)",
];

const TEXTURES: { v: NonNullable<Book["spineTexture"]>; l: string }[] = [
  { v: "leather", l: "Leather" },
  { v: "cloth", l: "Cloth" },
  { v: "paper", l: "Paper" },
];
const FOILS: { v: NonNullable<Book["foilStyle"]>; l: string }[] = [
  { v: "gold", l: "Gold" },
  { v: "silver", l: "Silver" },
  { v: "none", l: "None" },
];

export function AddBookDrawer({ open, onOpenChange }: Props) {
  const { addBook } = useLibrary();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<OLResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [picked, setPicked] = useState<OLResult | null>(null);

  // Personal fields
  const [status, setStatus] = useState<BookStatus>("want");
  const [format, setFormat] = useState<BookFormat>("physical");
  const [howIFound, setHowIFound] = useState("");
  const [tagsRaw, setTagsRaw] = useState("");
  const [copies, setCopies] = useState(1);
  // User-controlled page count (drives spine thickness in real-time).
  // Initialised from the picked book's metadata.
  const [pageCount, setPageCount] = useState<number>(320);
  const [generateSpine, setGenerateSpine] = useState<boolean>(true);

  // Customization
  const [spineColor, setSpineColor] = useState<string>(SPINE_PALETTE[1]);
  const [spineTexture, setSpineTexture] = useState<NonNullable<Book["spineTexture"]>>("leather");
  const [foilStyle, setFoilStyle] = useState<NonNullable<Book["foilStyle"]>>("gold");
  const [coverPreview, setCoverPreview] = useState<string | undefined>();
  const [coverSource, setCoverSource] = useState<NonNullable<Book["coverSource"]>>("none");
  const [acquiring, setAcquiring] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [aiCoverOpen, setAiCoverOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setQ(""); setResults([]); setPicked(null);
      setStatus("want"); setFormat("physical"); setHowIFound(""); setTagsRaw("");
      setCopies(1); setPageCount(320); setGenerateSpine(true);
      setSpineColor(SPINE_PALETTE[1]); setSpineTexture("leather"); setFoilStyle("gold");
      setCoverPreview(undefined); setCoverSource("none");
    }
  }, [open]);

  // When picked changes (or its enrich completes), seed the slider with real pages.
  useEffect(() => {
    if (picked?.pages && picked.pages >= 48 && picked.pages <= 1400) {
      setPageCount(picked.pages);
    }
  }, [picked?.key, picked?.pages]);

  useEffect(() => {
    const t = setTimeout(async () => {
      if (q.trim().length < 3) { setResults([]); return; }
      setLoading(true);
      logHistory({ kind: "search", action: "Searched book drawer", detail: q.trim(), editable: true });
      const r = await searchOpenLibrary(q);
      setResults(r);
      setLoading(false);
    }, 350);
    return () => clearTimeout(t);
  }, [q]);

  // When a search result is picked, auto-acquire a real cover only.
  // If no verified source exists, the shelf falls back to a designed spine.
  useEffect(() => {
    if (!picked) return;
    let cancelled = false;
    (async () => {
      setAcquiring(true);
      const acquired = await acquireCover({
        title: picked.title,
        author: picked.author,
        year: picked.year,
        isbn: picked.isbn,
        openLibraryUrl: picked.coverUrl,
        hint: tagsRaw,
      });
      if (cancelled) return;
      if (acquired) {
        setCoverPreview(acquired.url);
        setCoverSource(acquired.source);
      } else {
        setCoverPreview(undefined);
        setCoverSource("none");
        toast("No verified cover found — a designed shelf spine will be used.", {
          description: "You can upload a custom cover anytime.",
        });
      }
      setAcquiring(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picked]);

  useEffect(() => {
    if (!picked) return;
    let cancelled = false;
    (async () => {
      if (picked.pages && picked.categories?.length) return;
      setEnriching(true);
      const { data } = await supabase.functions.invoke("enrich-book", {
        body: { title: picked.title, author: picked.author, isbn: picked.isbn, year: picked.year, format, subjects: picked.categories ?? [] },
      });
      if (!cancelled && data && !data.error) {
        setPicked(prev => prev ? {
          ...prev,
          pages: prev.pages ?? data.estimatedPages ?? undefined,
          categories: Array.from(new Set([...(prev.categories ?? []), ...((data.tags ?? []) as string[])])),
          isFiction: prev.isFiction ?? data.isFiction,
        } : prev);
      }
      if (!cancelled) setEnriching(false);
    })();
    return () => { cancelled = true; };
  }, [picked?.key, format]);

  const onFilePick = async (f: File | null) => {
    if (!f) return;
    setAcquiring(true);
    const url = await uploadCustomCover(f);
    if (url) {
      setCoverPreview(url);
      setCoverSource("uploaded");
      toast.success("Custom cover uploaded");
    } else {
      toast.error("Upload failed");
    }
    setAcquiring(false);
  };

  const retryRealCover = async () => {
    if (!picked) return;
    setAcquiring(true);
    const acquired = await acquireCover({
      title: picked.title,
      author: picked.author,
      year: picked.year,
      isbn: picked.isbn,
      // intentionally no openLibraryUrl so it tries fresh searches
    });
    if (acquired) {
      setCoverPreview(acquired.url);
      setCoverSource(acquired.source);
      toast.success("Cover found");
    } else toast.error("Still no real cover — try uploading one");
    setAcquiring(false);
  };

  const submit = async () => {
    if (!picked) {
      toast.error("Pick a book from the search first");
      return;
    }
    const count = Math.max(1, Math.min(20, copies));
    const created: { id: string; title: string }[] = [];
    for (let i = 0; i < count; i++) {
      const b = await addBook({
        title: picked.title,
        author: picked.author,
        year: picked.year,
        isbn: picked.isbn,
        coverUrl: coverPreview,
        language: picked.language,
        pages: pageCount,
        isFiction: picked.isFiction,
        status, format,
        howIFound,
        tags: tagsRaw.split(",").map(t => t.trim()).filter(Boolean).concat((picked.categories ?? []).slice(0, 2).map(t => t.toLowerCase())),
        spineColor,
        spineTexture,
        foilStyle,
        coverSource,
      });
      if (b) created.push({ id: b.id, title: b.title });
    }
    toast.success(`${count} × "${picked.title}" added to your library`);
    onOpenChange(false);

    // Fire-and-forget spine generation. Each generated image is linked to its book
    // and saved to cloud storage by the edge function.
    if (generateSpine) {
      for (const b of created) {
        supabase.functions
          .invoke("generate-spine", {
            body: {
              bookId: b.id,
              title: picked.title,
              author: picked.author,
              pages: pageCount,
              coverUrl: coverPreview,
            },
          })
          .then(({ data, error }) => {
            if (error) console.warn("spine generation failed", error);
            else if (data?.url) toast.success(`Spine artwork ready · ${b.title}`);
          });
      }
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl bg-surface border-l border-border-strong/40 overflow-y-auto p-0">
        <div className="px-8 pt-8 pb-6 border-b border-border/60">
          <SheetHeader className="space-y-2">
            <span className="eyebrow">Acquisition</span>
            <SheetTitle className="font-display text-3xl text-foreground">
              Check in a new volume
            </SheetTitle>
          </SheetHeader>
          <p className="mt-2 italic text-muted-foreground text-sm">
            Search Open Library, then complete the personal record.
          </p>
        </div>

        <div className="px-8 py-6 space-y-6">
          {!picked && (
            <>
              <div className="space-y-2">
                <Label className="eyebrow">Search</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    autoFocus
                    placeholder="Title, author, or ISBN…"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    className="pl-10 bg-input border-border-strong/40 font-serif"
                  />
                  {loading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-primary" />}
                </div>
              </div>

              <div className="space-y-2">
                {results.map(r => (
                  <button
                    key={r.key}
                    onClick={() => setPicked(r)}
                    className="w-full flex gap-4 p-3 rounded-sm border border-border/40 hover:border-primary/60 hover:bg-surface-2 transition-all text-left group"
                  >
                    <div className="w-14 h-20 shrink-0 bg-surface-3 overflow-hidden rounded-[2px] ring-1 ring-border/40">
                      {r.coverUrl ? (
                        <img src={r.coverUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-muted-foreground"><BookOpen className="h-4 w-4" /></div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-display text-base text-foreground truncate group-hover:text-primary transition-colors">
                        {r.title}
                      </div>
                      <div className="mono text-[0.65rem] tracking-[0.2em] uppercase text-muted-foreground mt-1 truncate">
                        {r.author}{r.year ? ` · ${r.year}` : ""}
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 mono text-[0.55rem] tracking-[0.15em] uppercase text-muted-foreground/80">
                        {r.pages ? <span className="text-primary/80">{r.pages} pp</span> : null}
                        {r.isFiction !== undefined ? <span>· {r.isFiction ? "fiction" : "non-fiction"}</span> : null}
                        {r.source ? <span>· {r.source === "google" ? "Google" : r.source === "openlibrary" ? "OpenLib" : r.source === "gutendex" ? "Gutenberg" : r.source}</span> : null}
                      </div>
                      {r.categories && r.categories.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {r.categories.slice(0, 4).map(cat => (
                            <span key={cat} className="px-1.5 py-0.5 rounded-sm border border-border/40 text-[0.55rem] font-serif italic text-muted-foreground bg-surface/40 truncate max-w-[140px]">
                              {cat}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </button>
                ))}
                {!loading && q.length >= 3 && results.length === 0 && (
                  <p className="text-sm text-muted-foreground italic px-1">No results — try different spelling.</p>
                )}
              </div>
            </>
          )}

          {picked && (
            <div className="space-y-6 animate-fade-in">
              <div className="flex gap-4 p-4 ink-card rounded-sm">
                <div className="relative w-24 h-36 shrink-0 bg-surface-3 overflow-hidden ring-1 ring-border/60">
                  {acquiring && (
                    <div className="absolute inset-0 flex items-center justify-center bg-background/70 z-10">
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    </div>
                  )}
                  {coverPreview ? (
                    <img src={coverPreview} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center"><BookOpen className="h-5 w-5 text-muted-foreground" /></div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-display text-xl text-foreground leading-tight">{picked.title}</div>
                  <div className="mono text-[0.65rem] tracking-[0.2em] uppercase text-muted-foreground mt-1">
                    {picked.author}{picked.year ? ` · ${picked.year}` : ""}
                  </div>
                  <div className="mt-2 mono text-[0.55rem] tracking-[0.2em] uppercase text-muted-foreground">
                    {enriching ? "AI checking metadata…" : picked.pages ? `${picked.pages} pages · spine ready` : "Page count unknown"}
                  </div>
                  {coverSource !== "none" && (
                    <div className="mt-2 mono text-[0.55rem] tracking-[0.25em] uppercase text-primary/80">
                      Cover · {coverSource === "openlibrary" ? "Open Library"
                              : coverSource === "google" ? "Google Books"
                              : coverSource === "gutendex" ? "Project Gutenberg"
                              : coverSource === "internetarchive" ? "Internet Archive"
                              : coverSource === "librarything" ? "LibraryThing"
                              : coverSource === "wikipedia" ? "Wikipedia"
                              : coverSource === "ai-generated" ? "AI generated"
                              : "Uploaded"}
                    </div>
                  )}
                  {coverSource === "none" && !acquiring && (
                    <div className="mt-2 mono text-[0.55rem] tracking-[0.25em] uppercase text-muted-foreground">
                      No verified cover · shelf spine fallback
                    </div>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      onClick={() => fileRef.current?.click()}
                      disabled={acquiring}
                      className="inline-flex items-center gap-1.5 text-[0.65rem] mono uppercase tracking-[0.2em] text-muted-foreground hover:text-primary transition-colors"
                    >
                      <Upload className="h-3 w-3" /> Upload
                    </button>
                    <button
                      onClick={retryRealCover}
                      disabled={acquiring}
                      className="inline-flex items-center gap-1.5 text-[0.65rem] mono uppercase tracking-[0.2em] text-muted-foreground hover:text-primary transition-colors"
                    >
                      <Search className="h-3 w-3" /> Retry search
                    </button>
                    {coverSource === "none" && !acquiring && (
                      <button
                        onClick={() => setAiCoverOpen(true)}
                        className="inline-flex items-center gap-1.5 text-[0.65rem] mono uppercase tracking-[0.2em] text-primary hover:text-primary-glow transition-colors"
                      >
                        <Sparkles className="h-3 w-3" /> AI cover
                      </button>
                    )}
                    <button onClick={() => setPicked(null)} className="text-[0.65rem] mono uppercase tracking-[0.2em] text-muted-foreground hover:text-primary transition-colors">
                      ← Search again
                    </button>
                  </div>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => onFilePick(e.target.files?.[0] ?? null)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="eyebrow">Status</Label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as BookStatus)}
                    className="w-full bg-input border border-border-strong/40 rounded-sm px-3 py-2 font-serif text-sm focus:outline-none focus:border-primary"
                  >
                    {STATUSES.map(s => <option key={s.v} value={s.v}>{s.l}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label className="eyebrow">Format</Label>
                  <select
                    value={format}
                    onChange={(e) => setFormat(e.target.value as BookFormat)}
                    className="w-full bg-input border border-border-strong/40 rounded-sm px-3 py-2 font-serif text-sm focus:outline-none focus:border-primary"
                  >
                    {FORMATS.map(f => <option key={f.v} value={f.v}>{f.l}</option>)}
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="eyebrow">Copies to add</Label>
                <Input
                  type="number"
                  min={1}
                  max={20}
                  value={copies}
                  onChange={(e) => setCopies(Number(e.target.value) || 1)}
                  className="bg-input border-border-strong/40 font-serif"
                />
              </div>

              {/* PAGES — slider drives 3D thickness in real time */}
              <div className="space-y-3 p-4 ink-card rounded-sm">
                <div className="flex items-baseline justify-between">
                  <Label className="eyebrow">Page count · spine thickness</Label>
                  <span className="mono text-[0.7rem] text-primary">
                    {pageCount} pp · {(pageCount / 400).toFixed(2)}″
                  </span>
                </div>
                <Slider
                  min={48}
                  max={1400}
                  step={4}
                  value={[pageCount]}
                  onValueChange={([v]) => setPageCount(v)}
                />
                <div className="flex items-end gap-3 pt-2">
                  {/* Live thickness preview */}
                  <div
                    className="rounded-[2px] shadow-[inset_-3px_0_6px_hsl(0_0%_0%_/_0.35),inset_3px_0_4px_hsl(0_0%_100%_/_0.05)] transition-[width] duration-200"
                    style={{
                      width: `${Math.max(20, Math.min(110, Math.round(22 + (pageCount / 400) * 28)))}px`,
                      height: "120px",
                      backgroundColor: spineColor,
                      backgroundImage:
                        spineTexture === "leather"
                          ? "radial-gradient(ellipse at 30% 20%, hsl(0 0% 100% / 0.08), transparent 60%), radial-gradient(ellipse at 70% 80%, hsl(0 0% 0% / 0.25), transparent 60%)"
                          : spineTexture === "cloth"
                          ? "repeating-linear-gradient(45deg, hsl(0 0% 100% / 0.04) 0 2px, transparent 2px 4px)"
                          : "repeating-linear-gradient(0deg, hsl(0 0% 100% / 0.03) 0 1px, transparent 1px 3px)",
                    }}
                    aria-label="Live thickness preview"
                  />
                  <p className="text-xs font-serif italic text-muted-foreground">
                    Drag the slider to feel the weight of this volume on your shelf.
                  </p>
                </div>
                <label className="flex items-center gap-2 text-xs font-serif text-muted-foreground pt-1">
                  <input
                    type="checkbox"
                    checked={generateSpine}
                    onChange={(e) => setGenerateSpine(e.target.checked)}
                    className="accent-primary"
                  />
                  <Wand2 className="h-3 w-3 text-primary" />
                  Generate a custom 2D spine artwork that matches this cover
                </label>
              </div>

              <div className="space-y-2">
                <Label className="eyebrow">How I found this book</Label>
                <Input
                  placeholder="A friend, a footnote, a 3am rabbit hole…"
                  value={howIFound}
                  onChange={(e) => setHowIFound(e.target.value)}
                  className="bg-input border-border-strong/40 font-serif italic"
                />
              </div>

              <div className="space-y-2">
                <Label className="eyebrow">Tags <span className="opacity-60">(comma-separated)</span></Label>
                <Input
                  placeholder="solitude, time, prose"
                  value={tagsRaw}
                  onChange={(e) => setTagsRaw(e.target.value)}
                  className="bg-input border-border-strong/40 font-serif"
                />
              </div>

              {/* Customization */}
              <div className="space-y-4 pt-2 border-t border-border/40">
                <Label className="eyebrow">Spine binding</Label>

                <div className="space-y-2">
                  <div className="mono text-[0.6rem] tracking-[0.25em] uppercase text-muted-foreground">Color</div>
                  <div className="flex flex-wrap gap-2">
                    {SPINE_PALETTE.map(c => (
                      <button
                        key={c}
                        onClick={() => setSpineColor(c)}
                        className={cn(
                          "h-7 w-7 rounded-sm ring-1 ring-border/60 transition-all",
                          spineColor === c && "ring-2 ring-primary scale-110"
                        )}
                        style={{ backgroundColor: c }}
                        aria-label={`Spine ${c}`}
                      />
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <div className="mono text-[0.6rem] tracking-[0.25em] uppercase text-muted-foreground">Texture</div>
                    <div className="flex gap-1">
                      {TEXTURES.map(t => (
                        <button
                          key={t.v}
                          onClick={() => setSpineTexture(t.v)}
                          className={cn(
                            "flex-1 px-2 py-1.5 rounded-sm text-xs font-display tracking-wide border transition-colors",
                            spineTexture === t.v
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border/40 text-muted-foreground hover:border-border-strong/60"
                          )}
                        >{t.l}</button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="mono text-[0.6rem] tracking-[0.25em] uppercase text-muted-foreground">Foil</div>
                    <div className="flex gap-1">
                      {FOILS.map(f => (
                        <button
                          key={f.v}
                          onClick={() => setFoilStyle(f.v)}
                          className={cn(
                            "flex-1 px-2 py-1.5 rounded-sm text-xs font-display tracking-wide border transition-colors",
                            foilStyle === f.v
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border/40 text-muted-foreground hover:border-border-strong/60"
                          )}
                        >{f.l}</button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <Button
                  onClick={submit}
                  disabled={acquiring}
                  className="bg-primary text-primary-foreground hover:bg-primary-glow font-display tracking-wider"
                >
                  Check In
                </Button>
                <Button onClick={() => onOpenChange(false)} variant="ghost" className="text-muted-foreground">
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      </SheetContent>
      {picked && (
        <AICoverDialog
          open={aiCoverOpen}
          onOpenChange={setAiCoverOpen}
          title={picked.title}
          author={picked.author}
          year={picked.year}
          hint={tagsRaw}
          onGenerated={(url) => {
            setCoverPreview(url);
            setCoverSource("ai-generated");
          }}
        />
      )}
    </Sheet>
  );
}
