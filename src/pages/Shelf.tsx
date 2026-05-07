import { useEffect, useMemo, useRef, useState, type DragEvent, type PointerEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useLibrary } from "@/lib/storage";
import { enrichBookMetadata } from "@/lib/openlibrary";
import { useShelfSettings, hasPageCountIssue } from "@/lib/shelfSettings";
import { STATUS_LABEL, STATUS_ORDER } from "@/lib/seed";
import { BookSpine } from "@/components/BookSpine";
import { FlatBookCover } from "@/components/FlatBookCover";
import { PageHeader } from "@/components/PageHeader";
import { AddBookDrawer } from "@/components/AddBookDrawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Shuffle, Search, ArrowDownUp, BookOpen, Quote, Timer, Loader2 } from "lucide-react";
import type { BookStatus } from "@/lib/types";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

import { TodayBar } from "@/components/TodayBar";

const SORTS = [
  { v: "added", l: "Recently Added" },
  { v: "title", l: "Title" },
  { v: "author", l: "Author" },
  { v: "rating", l: "Rating" },
  { v: "dormant", l: "Time since I thought about this" },
] as const;

export default function Shelf() {
  const navigate = useNavigate();
  const { books, isGuest, updateBook, moveBookToStatus } = useLibrary();
  const { scaleMode, viewMode } = useShelfSettings();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<typeof SORTS[number]["v"]>("added");
  const [statusFilter, setStatusFilter] = useState<BookStatus | "all">("all");
  const [tagFilter, setTagFilter] = useState<string>("all");
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [moveReadyId, setMoveReadyId] = useState<string | null>(null);
  const [dropMarker, setDropMarker] = useState<{ id: string; side: "before" | "after" } | null>(null);
  const holdTimer = useRef<number | null>(null);
  const autoRepairRan = useRef(false);

  const clearHold = () => {
    if (holdTimer.current) window.clearTimeout(holdTimer.current);
    holdTimer.current = null;
  };

  const beginHold = (id: string, e: PointerEvent<HTMLButtonElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    clearHold();
    holdTimer.current = window.setTimeout(() => setMoveReadyId(id), 280);
  };

  const dropBook = (status: BookStatus, visibleIds: string[], targetId?: string, side: "before" | "after" = "before") => {
    if (!draggedId) return;
    const beforeId = targetId && side === "after"
      ? visibleIds.filter(id => id !== draggedId)[visibleIds.filter(id => id !== draggedId).indexOf(targetId) + 1]
      : targetId;
    moveBookToStatus(draggedId, status, beforeId);
    setDraggedId(null);
    setMoveReadyId(null);
    setDropMarker(null);
  };

  const markDropSide = (e: DragEvent<HTMLElement>, id: string) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setDropMarker({ id, side: e.clientX > rect.left + rect.width / 2 ? "after" : "before" });
  };

  // Single tap → enter dossier. (Spine rotation removed: it was finicky.)
  const handleSpineTap = (id: string) => {
    if (draggedId || moveReadyId === id) return;
    navigate(`/book/${id}`);
  };

  const grouped = useMemo(() => {
    const filter = (b: typeof books[number]) =>
      !q.trim() ||
      b.title.toLowerCase().includes(q.toLowerCase()) ||
      b.author.toLowerCase().includes(q.toLowerCase()) ||
      b.tags.some(t => t.toLowerCase().includes(q.toLowerCase()));
    const scoped = books.filter(b =>
      (statusFilter === "all" || b.status === statusFilter) &&
      (tagFilter === "all" || b.tags.includes(tagFilter))
    );

    const sorter = (a: typeof books[number], b: typeof books[number]) => {
      switch (sort) {
        case "title": return a.title.localeCompare(b.title);
        case "author": return a.author.localeCompare(b.author);
        case "rating": {
          const ra = a.instances[a.instances.length - 1]?.rating ?? 0;
          const rb = b.instances[b.instances.length - 1]?.rating ?? 0;
          return rb - ra;
        }
        case "dormant": {
          const da = new Date(a.lastOpenedAt ?? a.addedAt).getTime();
          const db = new Date(b.lastOpenedAt ?? b.addedAt).getTime();
          return da - db;
        }
        default:
          return new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime();
      }
    };

    return STATUS_ORDER.map(status => ({
      status,
      books: scoped.filter(b => b.status === status).filter(filter).sort(sorter),
    }));
  }, [books, q, sort, statusFilter, tagFilter]);

  const random = () => {
    const candidates = books.filter(b => {
      if (b.status !== "finished") return false;
      const last = new Date(b.lastOpenedAt ?? b.addedAt).getTime();
      return Date.now() - last > 1000 * 60 * 60 * 24 * 90;
    });
    const pool = candidates.length ? candidates : books.filter(b => b.status === "finished");
    if (!pool.length) return;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    navigate(`/book/${pick.id}`);
  };

  const totals = useMemo(() => {
    const quotes = books.reduce((sum, b) => sum + b.instances.reduce((s, i) => s + i.quotes.length, 0), 0);
    const minutes = books.reduce((sum, b) => sum + b.instances.reduce((s, i) => s + i.sessions.reduce((ss, x) => ss + x.durationMin, 0), 0), 0);
    return { quotes, minutes };
  }, [books]);
  const tags = useMemo(() => Array.from(new Set(books.flatMap(b => b.tags))).slice(0, 10), [books]);
  const pageIssues = useMemo(() => books.filter(b => hasPageCountIssue(b.pages)), [books]);

  const backfillPages = async (silent = false) => {
    if (!pageIssues.length) return 0;
    setFixing(true);
    let fixed = 0;
    for (const book of pageIssues.slice(0, 12)) {
      const api = await enrichBookMetadata({ title: book.title, author: book.author, isbn: book.isbn });
      let pages = api?.pages;
      if (!pages) {
        const { data } = await supabase.functions.invoke("enrich-book", {
          body: { title: book.title, author: book.author, isbn: book.isbn, year: book.year, format: book.format, subjects: [...book.tags, ...(book.aiTags ?? [])] },
        });
        pages = data?.estimatedPages;
      }
      if (pages && pages >= 48 && pages <= 1400) {
        updateBook(book.id, b => ({ ...b, pages, aiTags: Array.from(new Set([...(b.aiTags ?? []), "pages-estimated"])) }));
        fixed++;
      }
    }
    setFixing(false);
    if (!silent) toast.success(fixed ? `Backfilled ${fixed} page counts` : "No reliable page estimates found");
    return fixed;
  };

  // Auto-repair page counts once per session when the shelf loads.
  useEffect(() => {
    if (autoRepairRan.current) return;
    if (!books.length) return;
    if (pageIssues.length === 0) return;
    autoRepairRan.current = true;
    backfillPages(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [books.length, pageIssues.length]);


  return (
    <div className="min-h-screen">
      <PageHeader
        eyebrow="The Shelf"
        title=""
        titleMain="The library,"
        titleEmphasis="in spines"
        subtitle="Your collection. Hover a spine for the marrow. Click to enter the dossier."
        right={
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={random} className="text-muted-foreground hover:text-primary">
              <Shuffle className="h-4 w-4 mr-2" /> Surprise me
            </Button>
            <Button onClick={() => setDrawerOpen(true)} className="bg-primary text-primary-foreground hover:bg-primary-glow font-display tracking-wider">
              <Plus className="h-4 w-4 mr-2" /> Add Book
            </Button>
          </div>
        }
      />

      <div className="px-4 sm:px-8 lg:px-14 pt-4">
        <span className="stamp">{isGuest ? "Guest shelf · local" : "Synced shelf · private"}</span>
      </div>

      <TodayBar />

      <div className="px-4 sm:px-8 lg:px-14 py-6 flex flex-wrap items-center gap-4 border-b border-border/40">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search title, author, tag…"
            className="pl-10 bg-input/60 border-border-strong/40 font-serif"
          />
        </div>
        <div className="flex items-center gap-2">
          <ArrowDownUp className="h-4 w-4 text-muted-foreground" />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as typeof sort)}
            className="bg-input/60 border border-border-strong/40 rounded-sm px-3 py-2 text-sm font-serif focus:outline-none focus:border-primary"
          >
            {SORTS.map(s => <option key={s.v} value={s.v}>{s.l}</option>)}
          </select>
        </div>
        <div className="ml-auto mono text-xs text-muted-foreground tracking-[0.2em]">
          {viewMode === "flat" ? "FLAT COVERS" : (scaleMode === "compact" ? "COMPACT 3D" : "TRUE-TO-PAGES 3D")} · {books.length} VOLUMES
        </div>
      </div>


      <div className="px-4 sm:px-8 lg:px-14 pt-5 flex flex-wrap gap-2">
        <FilterChip active={statusFilter === "all"} onClick={() => setStatusFilter("all")}>All</FilterChip>
        {STATUS_ORDER.map(s => <FilterChip key={s} active={statusFilter === s} onClick={() => setStatusFilter(s)}>{STATUS_LABEL[s]}</FilterChip>)}
        {tags.length > 0 && <span className="mx-1 h-7 w-px bg-border/60" />}
        {tags.map(t => <FilterChip key={t} active={tagFilter === t} onClick={() => setTagFilter(tagFilter === t ? "all" : t)}>{t}</FilterChip>)}
      </div>

      {books.length > 0 && (
        <div className="px-4 sm:px-8 lg:px-14 pt-8 grid grid-cols-1 sm:grid-cols-3 gap-3 animate-fade-in">
          <LibraryMetric icon={BookOpen} label="Library weight" value={`${books.length}`} detail="volumes catalogued" />
          <LibraryMetric icon={Quote} label="Lines kept" value={`${totals.quotes}`} detail="saved fragments" />
          <LibraryMetric icon={Timer} label="Reading time" value={`${totals.minutes}`} detail="minutes logged" />
        </div>
      )}

      <div className="px-4 sm:px-8 lg:px-14 py-10 space-y-16">
        {grouped.filter(g => g.books.length > 0 || statusFilter === g.status).map(({ status, books }) => {
          const visibleIds = books.map(b => b.id);
          return (
          <section
            key={status}
            className="space-y-4 shelf-drop-zone"
            onDragOver={(e: DragEvent<HTMLElement>) => e.preventDefault()}
            onDrop={() => dropBook(status, visibleIds)}
          >
            <div className="flex items-baseline gap-4">
              <span className="mono text-[0.6rem] tracking-[0.3em] uppercase text-primary/80">
                {String(books.length).padStart(2, "0")}
              </span>
              <h2 className="font-display text-2xl text-foreground">{STATUS_LABEL[status]}</h2>
              <div className="flex-1 h-px bg-border/60" />
            </div>

            {books.length === 0 ? (
              <p className="font-serif italic text-sm text-muted-foreground pl-2">
                Drop a book here, or change a book's status to <span className="text-foreground not-italic">{STATUS_LABEL[status]}</span>.
              </p>
            ) : viewMode === "flat" ? (
              <div className="flex items-start gap-4 pb-2 overflow-x-auto pl-2 pr-2 animate-fade-in">
                {books.map((b, i) => (
                  <FlatBookCover key={b.id} book={b} index={i} onClick={() => handleSpineTap(b.id)} />
                ))}
              </div>
            ) : (
              <div className="shelf-row animate-fade-in">
                <div className="shelf-stage flex items-end gap-1.5 min-h-[300px] pb-1 overflow-x-auto pl-2">
                  {books.map((b, i) => (
                    <div key={b.id} className="relative flex items-end">
                      {draggedId && dropMarker?.id === b.id && dropMarker.side === "before" && <span className="shelf-drop-marker -left-1" />}
                      <BookSpine
                        book={b}
                        index={i}
                        scaleMode={scaleMode}
                        qa={false}
                        draggable={moveReadyId === b.id}
                        moving={moveReadyId === b.id || draggedId === b.id}
                        state="spine"
                        onClick={() => handleSpineTap(b.id)}
                        onPointerDown={(e) => beginHold(b.id, e)}
                        onPointerUp={() => { clearHold(); if (!draggedId) setMoveReadyId(null); }}
                        onPointerLeave={clearHold}
                        onDragStart={(e) => { if (moveReadyId !== b.id) { e.preventDefault(); return; } setDraggedId(b.id); e.dataTransfer.effectAllowed = "move"; }}
                        onDragOver={(e) => { e.preventDefault(); markDropSide(e, b.id); }}
                        onDrop={(e) => { e.stopPropagation(); dropBook(status, visibleIds, b.id, dropMarker?.id === b.id ? dropMarker.side : "before"); }}
                        onDragEnd={() => { setDraggedId(null); setMoveReadyId(null); setDropMarker(null); }}
                      />
                      {draggedId && dropMarker?.id === b.id && dropMarker.side === "after" && <span className="shelf-drop-marker -right-1" />}
                    </div>
                  ))}
                </div>
                <div className="shelf-board" />
              </div>
            )}
          </section>
        );})}

        {books.length > 0 && grouped.every(s => s.books.length === 0) && (
          <div className="text-center py-24 luxury-panel rounded-sm">
            <p className="font-display italic text-2xl text-muted-foreground">No volumes match this arrangement.</p>
            <Button onClick={() => { setQ(""); setStatusFilter("all"); setTagFilter("all"); }} variant="ghost" className="mt-4 text-primary">Clear filters</Button>
          </div>
        )}

        {books.length === 0 && (
          <div className="text-center py-32">
            <p className="font-display italic text-2xl text-muted-foreground">An empty shelf is a kind of patience.</p>
            <Button onClick={() => setDrawerOpen(true)} className="mt-6 bg-primary text-primary-foreground hover:bg-primary-glow font-display tracking-wider">
              <Plus className="h-4 w-4 mr-2" /> Add your first volume
            </Button>
          </div>
        )}
      </div>

      <AddBookDrawer open={drawerOpen} onOpenChange={setDrawerOpen} />
    </div>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} className={`px-3 py-1.5 rounded-sm border mono text-[0.58rem] tracking-[0.22em] uppercase transition-all ${active ? "border-primary text-primary bg-primary/10 shadow-foil" : "border-border/50 text-muted-foreground hover:text-foreground hover:border-border-strong/70"}`}>{children}</button>;
}

function LibraryMetric({ icon: Icon, label, value, detail }: { icon: typeof BookOpen; label: string; value: string; detail: string }) {
  return (
    <div className="luxury-panel rounded-sm p-4 flex items-center gap-4">
      <div className="h-10 w-10 rounded-sm border border-primary/30 bg-primary/10 grid place-items-center text-primary">
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <p className="mono text-[0.55rem] tracking-[0.25em] uppercase text-muted-foreground">{label}</p>
        <p className="font-display text-2xl text-foreground leading-none mt-1">{value}<span className="ml-2 text-sm italic text-muted-foreground font-serif">{detail}</span></p>
      </div>
    </div>
  );
}
