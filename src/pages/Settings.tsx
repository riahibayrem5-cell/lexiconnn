import { useEffect, useRef, useState } from "react";
import { useLibrary } from "@/lib/storage";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Download, Upload, Check, Bot, BookMarked, Loader2, RefreshCw, FileText, ChevronDown } from "lucide-react";
import { exportLibraryMarkdown } from "@/lib/markdownExport";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import AdminPanel from "@/pages/AdminPanel";
import { toast } from "sonner";
import { useTheme, THEMES } from "@/lib/theme";
import { useShelfSettings } from "@/lib/shelfSettings";
import { cn } from "@/lib/utils";
import { readHistory, writeHistory, type HistoryEntry } from "@/lib/history";
import { supabase } from "@/integrations/supabase/client";
import { importGoodreadsCsv } from "@/lib/goodreadsImport";
import { useReadingGoals } from "@/lib/goals";
import { Target } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { Languages } from "lucide-react";

export default function Settings() {
  const { exportAll, importAll, books, isGuest, addBook } = useLibrary();
  const { lang, setLang, t } = useLang();
  const fileRef = useRef<HTMLInputElement>(null);
  const grCsvRef = useRef<HTMLInputElement>(null);
  const [grCsvBusy, setGrCsvBusy] = useState(false);
  const { theme, setTheme } = useTheme();
  const { scaleMode, setScaleMode, viewMode, setViewMode } = useShelfSettings();
  const { goals, setGoals } = useReadingGoals();
  const [history, setHistory] = useState<HistoryEntry[]>(() => readHistory());

  // ── Goodreads sync state ─────────────────────────────────────────────────
  const [grUrl, setGrUrl] = useState("");
  const [grEnabled, setGrEnabled] = useState(true);
  const [grLastSync, setGrLastSync] = useState<string | null>(null);
  const [grSyncing, setGrSyncing] = useState(false);

  useEffect(() => {
    if (isGuest) return;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("goodreads_url, goodreads_sync_enabled, goodreads_last_synced_at")
        .maybeSingle();
      if (data) {
        setGrUrl(data.goodreads_url ?? "");
        setGrEnabled(data.goodreads_sync_enabled ?? true);
        setGrLastSync(data.goodreads_last_synced_at ?? null);
      }
    })();
  }, [isGuest]);

  const runGoodreadsSync = async (saveUrl?: string) => {
    setGrSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("goodreads-sync", {
        body: saveUrl ? { goodreads_url: saveUrl } : {},
      });
      if (error) throw error;
      const payload = data as { error?: string; added?: number; updated?: number; errors?: string[] } | null;
      if (payload?.error) throw new Error(payload.error);
      const added = payload?.added ?? 0;
      const updated = payload?.updated ?? 0;
      const errors = payload?.errors ?? [];
      setGrLastSync(new Date().toISOString());
      if (errors.length) toast.warning(`Synced with ${errors.length} warning(s) · +${added} new, ${updated} updated`);
      else toast.success(`Goodreads synced · +${added} new, ${updated} updated`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setGrSyncing(false);
    }
  };

  const toggleGrEnabled = async (next: boolean) => {
    setGrEnabled(next);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) await supabase.from("profiles").update({ goodreads_sync_enabled: next }).eq("user_id", user.id);
  };
  const agentCommands = [
    "add / search / remove books",
    "mark books want, reading, finished, abandoned, rereading",
    "rate a book from 1–10",
    "add tags, journal notes, and saved quotes",
    "move one book before another on the shelf",
    "open Shelf, Oracle, Ritual, Quotes, Archive, Review Desk, Brain, or Settings",
    "export a backup",
    "open recommendations in Oracle",
    "show real metadata search results with covers",
    "add any search result directly to the shelf",
  ];

  const onImport = (f: File) => {
    const r = new FileReader();
    r.onload = () => { importAll(String(r.result)); toast.success("Library imported"); };
    r.readAsText(f);
  };

  useEffect(() => {
    const sync = () => setHistory(readHistory());
    window.addEventListener("lexicon-history-change", sync);
    return () => window.removeEventListener("lexicon-history-change", sync);
  }, []);

  const editHistory = (id: string, detail: string) => {
    const next = history.map(entry => entry.id === id ? { ...entry, detail } : entry);
    setHistory(next);
    writeHistory(next);
  };

  return (
    <div className="min-h-screen pb-24">
      <PageHeader
        eyebrow="The Workshop"
        title=""
        titleMain="House"
        titleEmphasis="keeping"
        subtitle="Backup, import, choose a binding for your library."
      />

      <div className="px-4 sm:px-8 lg:px-14 mt-8 max-w-4xl space-y-6">

        {/* LANGUAGE */}
        <section className="ink-card rounded-sm p-6 space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="eyebrow">{t("Language")}</p>
              <p className="font-serif italic text-muted-foreground mt-1">
                {t("Choose your preferred language. The interface, brand, and AI responses will all switch.")}
              </p>
            </div>
            <div className="h-11 w-11 rounded-full border border-primary/50 text-primary grid place-items-center shadow-foil">
              <Languages className="h-5 w-5" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => { setLang("en"); toast.success("Language · English"); }}
              className={cn(
                "rounded-sm border p-4 text-left transition-all",
                lang === "en" ? "border-primary bg-primary/10 shadow-foil" : "border-border/60 hover:border-border-strong/60"
              )}
            >
              <p className="font-display text-xl text-foreground">English</p>
              <p className="font-serif italic text-sm text-muted-foreground mt-1">Default · LTR</p>
            </button>
            <button
              onClick={() => { setLang("ar"); toast.success("اللغة · العربية"); }}
              className={cn(
                "rounded-sm border p-4 text-left transition-all",
                lang === "ar" ? "border-primary bg-primary/10 shadow-foil" : "border-border/60 hover:border-border-strong/60"
              )}
              dir="rtl"
            >
              <p className="font-display text-2xl text-foreground" style={{ fontFamily: '"Amiri", "Noto Naskh Arabic", serif' }}>العربية</p>
              <p className="font-serif text-sm text-muted-foreground mt-1" style={{ fontFamily: '"Noto Naskh Arabic", serif' }}>اتجاه النص من اليمين إلى اليسار</p>
            </button>
          </div>
        </section>

        {/* THEMES */}
        <section className="ink-card rounded-sm p-6 space-y-5">
          <div className="flex items-baseline justify-between flex-wrap gap-2">
            <p className="eyebrow">Binding · Theme</p>
            <p className="mono text-[0.6rem] tracking-[0.25em] uppercase text-muted-foreground">
              Current · {THEMES.find(t => t.id === theme)?.name}
            </p>
          </div>
          <p className="font-serif italic text-muted-foreground">
            Choose the dressing for the entire library. Applies instantly, persists across sessions.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {THEMES.map(t => {
              const active = t.id === theme;
              return (
                <button
                  key={t.id}
                  onClick={() => { setTheme(t.id); toast.success(`Theme · ${t.name}`); }}
                  className={cn(
                    "group relative overflow-hidden rounded-sm border p-4 text-left transition-all",
                    "hover:-translate-y-0.5 hover:shadow-card",
                    active
                      ? "border-primary ring-2 ring-primary/40"
                      : "border-border/60 hover:border-border-strong/60"
                  )}
                >
                  {/* Live mini preview using the theme's actual swatch colors */}
                  <div
                    className="h-20 rounded-sm relative overflow-hidden ring-1 ring-border/40"
                    style={{ background: t.swatch[0] }}
                  >
                    <div
                      className="absolute inset-x-0 bottom-0 h-10"
                      style={{ background: t.swatch[1] }}
                    />
                    {/* Three book spines preview */}
                    <div className="absolute left-3 bottom-2 flex gap-1.5 items-end">
                      <div className="w-3 h-12 rounded-[1px]" style={{ background: t.swatch[2] }} />
                      <div className="w-3 h-10 rounded-[1px]" style={{ background: t.swatch[2], opacity: 0.7 }} />
                      <div className="w-3 h-14 rounded-[1px]" style={{ background: t.swatch[2], opacity: 0.85 }} />
                    </div>
                    {active && (
                      <div className="absolute top-2 right-2 h-5 w-5 rounded-full bg-primary flex items-center justify-center">
                        <Check className="h-3 w-3 text-primary-foreground" />
                      </div>
                    )}
                  </div>
                  <div className="mt-3">
                    <p className="font-display text-base text-foreground leading-tight">{t.name}</p>
                    <p className="mono text-[0.55rem] tracking-[0.2em] uppercase text-muted-foreground mt-1">
                      {t.mood === "light" ? "Light" : "Dark"} binding
                    </p>
                    <p className="font-serif italic text-xs text-muted-foreground mt-2 leading-snug">
                      {t.tagline}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* READING GOALS */}
        <section className="ink-card rounded-sm p-6 space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="eyebrow">Reading goals</p>
              <p className="font-serif italic text-muted-foreground mt-1">
                Soft targets shown on your shelf and ritual. No alarms, no nags.
              </p>
            </div>
            <div className="h-11 w-11 rounded-full border border-primary/50 text-primary grid place-items-center shadow-foil">
              <Target className="h-5 w-5" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block space-y-2">
              <span className="mono text-[0.58rem] tracking-[0.22em] uppercase text-muted-foreground">Books this year</span>
              <Input
                type="number" min={0} max={500}
                value={goals.booksThisYear}
                onChange={(e) => setGoals({ booksThisYear: Math.max(0, Number(e.target.value) || 0) })}
                className="bg-input/60 font-display text-2xl"
              />
            </label>
            <label className="block space-y-2">
              <span className="mono text-[0.58rem] tracking-[0.22em] uppercase text-muted-foreground">Minutes per week</span>
              <Input
                type="number" min={0} max={5000}
                value={goals.minutesPerWeek}
                onChange={(e) => setGoals({ minutesPerWeek: Math.max(0, Number(e.target.value) || 0) })}
                className="bg-input/60 font-display text-2xl"
              />
            </label>
          </div>
        </section>

        {/* GOODREADS SYNC */}
        <section className="ink-card rounded-sm p-6 space-y-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <p className="eyebrow">Goodreads · Auto-sync</p>
              <p className="font-serif italic text-muted-foreground mt-1">
                Paste your public Goodreads profile URL. Your <em>read</em>, <em>currently-reading</em>, and <em>want-to-read</em> shelves sync to Lexicon every hour.
              </p>
            </div>
            <div className="h-11 w-11 rounded-full border border-primary/50 text-primary grid place-items-center shadow-foil">
              <BookMarked className="h-5 w-5" />
            </div>
          </div>

          {isGuest ? (
            <p className="font-serif italic text-sm text-muted-foreground">Sign in to enable Goodreads sync.</p>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                <Input
                  value={grUrl}
                  onChange={(e) => setGrUrl(e.target.value)}
                  placeholder="https://www.goodreads.com/user/show/12345-your-name"
                  className="bg-input/60 font-serif"
                />
                <Button
                  onClick={() => runGoodreadsSync(grUrl)}
                  disabled={grSyncing || !grUrl.trim()}
                  className="bg-primary text-primary-foreground hover:bg-primary-glow font-display tracking-wider"
                >
                  {grSyncing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                  Save & sync now
                </Button>
              </div>

              <div className="flex items-center justify-between gap-4 rounded-sm border border-border/50 px-4 py-3">
                <div>
                  <p className="font-display text-sm text-foreground">Hourly auto-sync</p>
                  <p className="font-serif italic text-xs text-muted-foreground">A background job pulls new shelf changes every hour.</p>
                </div>
                <Switch checked={grEnabled} onCheckedChange={toggleGrEnabled} />
              </div>

              {/* CSV upload (Goodreads export) */}
              <div className="flex items-center justify-between gap-4 rounded-sm border border-border/50 px-4 py-3">
                <div>
                  <p className="font-display text-sm text-foreground">Import from CSV export</p>
                  <p className="font-serif italic text-xs text-muted-foreground">
                    Upload your Goodreads CSV export (Settings → Export Library on Goodreads).
                  </p>
                </div>
                <input
                  ref={grCsvRef}
                  type="file"
                  accept=".csv,text/csv"
                  hidden
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (!f) return;
                    setGrCsvBusy(true);
                    try {
                      const { added } = await importGoodreadsCsv(f, addBook as never);
                      toast.success(`Imported ${added} books from Goodreads`);
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Import failed");
                    } finally {
                      setGrCsvBusy(false);
                    }
                  }}
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="border-border-strong/60"
                  disabled={grCsvBusy}
                  onClick={() => grCsvRef.current?.click()}
                >
                  {grCsvBusy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                  Upload CSV
                </Button>
              </div>

              <p className="mono text-[0.55rem] tracking-[0.22em] uppercase text-muted-foreground">
                Last sync · {grLastSync ? new Date(grLastSync).toLocaleString() : "never"}
              </p>
              <p className="font-serif italic text-xs text-muted-foreground">
                Your Goodreads profile must be set to <strong>public</strong>. Books are de-duplicated by Goodreads ID, so re-syncing is safe.
              </p>
            </>
          )}
        </section>

        <section className="ink-card rounded-sm p-6 space-y-5">
          <div className="flex items-baseline justify-between flex-wrap gap-2">
            <p className="eyebrow">Shelf style</p>
            <p className="mono text-[0.6rem] tracking-[0.25em] uppercase text-muted-foreground">
              Side-scrollable · unlimited
            </p>
          </div>
          <p className="font-serif italic text-muted-foreground">
            Pick how the library is displayed. Flat covers are far lighter on GPU/CPU/RAM for big libraries.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button onClick={() => setViewMode("3d")} className={cn("rounded-sm border p-4 text-left transition-all", viewMode === "3d" ? "border-primary bg-primary/10 shadow-foil" : "border-border/60 hover:border-border-strong/60")}>
              <p className="font-display text-xl text-foreground">3D Spines</p>
              <p className="font-serif italic text-sm text-muted-foreground mt-1">Realistic standing books with thickness, foil, textures. Heaviest on hardware.</p>
            </button>
            <button onClick={() => setViewMode("flat")} className={cn("rounded-sm border p-4 text-left transition-all", viewMode === "flat" ? "border-primary bg-primary/10 shadow-foil" : "border-border/60 hover:border-border-strong/60")}>
              <p className="font-display text-xl text-foreground">Flat Covers</p>
              <p className="font-serif italic text-sm text-muted-foreground mt-1">Goodreads-style 2D cover grid. Lazy-loaded, side-scrollable, unlimited size, GPU-friendly.</p>
            </button>
          </div>

          {viewMode === "3d" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-border/40">
              <button onClick={() => setScaleMode("compact")} className={cn("rounded-sm border p-4 text-left transition-all", scaleMode === "compact" ? "border-primary bg-primary/10 shadow-foil" : "border-border/60 hover:border-border-strong/60")}>
                <p className="font-display text-base text-foreground">Compact spines</p>
                <p className="font-serif italic text-xs text-muted-foreground mt-1">Compresses very long books so rows stay dense.</p>
              </button>
              <button onClick={() => setScaleMode("true")} className={cn("rounded-sm border p-4 text-left transition-all", scaleMode === "true" ? "border-primary bg-primary/10 shadow-foil" : "border-border/60 hover:border-border-strong/60")}>
                <p className="font-display text-base text-foreground">True-to-pages</p>
                <p className="font-serif italic text-xs text-muted-foreground mt-1">Maps spine thickness to stored page counts.</p>
              </button>
            </div>
          )}
        </section>

        <section className="ink-card rounded-sm p-6 space-y-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="eyebrow">Librarian agent</p>
              <p className="font-serif italic text-muted-foreground mt-1">The floating bot can operate across the whole website from any page.</p>
            </div>
            <div className="h-11 w-11 rounded-full border border-primary/50 text-primary grid place-items-center shadow-foil">
              <Bot className="h-5 w-5" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {agentCommands.map(command => (
              <div key={command} className="rounded-sm border border-border/50 px-3 py-2 font-serif text-sm text-muted-foreground">
                {command}
              </div>
            ))}
          </div>
          <p className="mono text-[0.56rem] tracking-[0.22em] uppercase text-muted-foreground">Try: “add Dune”, “remove Dune”, “finish Dune”, “rate Dune 9”, “go to oracle”, “quote Dune: Fear is the mind-killer”.</p>
        </section>

        <section className="ink-card rounded-sm p-6 space-y-4">
          <div className="flex items-baseline justify-between gap-3">
            <p className="eyebrow">History log</p>
            <button onClick={() => { setHistory([]); writeHistory([]); }} className="mono text-[0.55rem] tracking-[0.22em] uppercase text-muted-foreground hover:text-primary">Clear</button>
          </div>
          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
            {history.length === 0 && <p className="font-serif italic text-sm text-muted-foreground">No actions recorded yet.</p>}
            {history.slice(0, 80).map(entry => (
              <div key={entry.id} className="rounded-sm border border-border/50 p-3 grid gap-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-display text-sm text-foreground">{entry.action}</span>
                  <span className="mono text-[0.5rem] tracking-[0.18em] uppercase text-muted-foreground">{new Date(entry.at).toLocaleString()}</span>
                </div>
                <input
                  value={entry.detail}
                  disabled={!entry.editable}
                  onChange={(e) => editHistory(entry.id, e.target.value)}
                  className="bg-input/60 border border-border/50 rounded-sm px-2 py-1 text-sm font-serif disabled:opacity-70"
                />
              </div>
            ))}
          </div>
        </section>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <section className="ink-card rounded-sm p-6 space-y-4">
            <p className="eyebrow">Export</p>
            <p className="font-serif italic text-muted-foreground">JSON for backup, Markdown for Notion / Obsidian.</p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={exportAll} className="bg-primary text-primary-foreground hover:bg-primary-glow font-display tracking-wider">
                <Download className="h-4 w-4 mr-2" /> JSON backup
              </Button>
              <Button
                onClick={() => { exportLibraryMarkdown(books); toast.success("Markdown exported"); }}
                variant="outline"
                className="border-border-strong/60"
              >
                <FileText className="h-4 w-4 mr-2" /> Markdown
              </Button>
            </div>
          </section>
          <section className="ink-card rounded-sm p-6 space-y-4">
            <p className="eyebrow">Import</p>
            <p className="font-serif italic text-muted-foreground">Replace your library from a previous export.</p>
            <input ref={fileRef} type="file" accept="application/json" hidden
              onChange={(e) => e.target.files?.[0] && onImport(e.target.files[0])} />
            <Button onClick={() => fileRef.current?.click()} variant="outline" className="border-border-strong/60">
              <Upload className="h-4 w-4 mr-2" /> Choose file
            </Button>
          </section>
        </div>

        <section className="ink-card rounded-sm p-6">
          <p className="eyebrow mb-3">Library</p>
          <div className="grid grid-cols-3 gap-6">
            <div>
              <p className="font-display text-4xl text-primary">{books.length}</p>
              <p className="mono text-[0.55rem] tracking-[0.25em] uppercase text-muted-foreground mt-1">Volumes</p>
            </div>
            <div>
              <p className="font-display text-4xl text-primary">
                {books.reduce((s, b) => s + (b.instances ?? []).reduce((ss, i) => ss + (i.quotes?.length ?? 0), 0), 0)}
              </p>
              <p className="mono text-[0.55rem] tracking-[0.25em] uppercase text-muted-foreground mt-1">Quotes</p>
            </div>
            <div>
              <p className="font-display text-4xl text-primary">
                {books.reduce((s, b) => s + (b.instances ?? []).reduce((ss, i) => ss + (i.journal?.length ?? 0), 0), 0)}
              </p>
              <p className="mono text-[0.55rem] tracking-[0.25em] uppercase text-muted-foreground mt-1">Journal entries</p>
            </div>
          </div>
        </section>

        {/* ADVANCED — folded-in admin panel */}
        <Collapsible className="ink-card rounded-sm">
          <CollapsibleTrigger className="w-full flex items-center justify-between p-6 group">
            <div className="text-left">
              <p className="eyebrow">Advanced</p>
              <p className="font-serif italic text-muted-foreground mt-1">
                Brand identity, navigation labels, page copy, oracle tuning. Power-user only.
              </p>
            </div>
            <ChevronDown className="h-5 w-5 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="border-t border-border/40">
              <AdminPanel embedded />
            </div>
          </CollapsibleContent>
        </Collapsible>

        <section className="text-center mono text-[0.6rem] tracking-[0.3em] text-muted-foreground/60 pt-8">
          LEXICON · {isGuest ? "GUEST SHELF · LOCAL" : "SYNCED SHELF · PRIVATE"}
        </section>
      </div>
    </div>
  );
}
