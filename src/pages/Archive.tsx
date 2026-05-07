import { useMemo, useState } from "react";
import { useLibrary } from "@/lib/storage";
import { getCurrentLang } from "@/lib/i18n";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Loader2, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export default function Archive() {
  const { books } = useLibrary();
  const [year, setYear] = useState(new Date().getFullYear());
  const [paragraph, setParagraph] = useState("");
  const [loading, setLoading] = useState(false);

  const yearBooks = useMemo(() => books.filter(b => {
    const inst = b.instances[b.instances.length - 1];
    const d = inst?.finishedAt ?? inst?.startedAt;
    return d && new Date(d).getFullYear() === year;
  }), [books, year]);

  const totalPages = yearBooks.reduce((s, b) => s + (b.pages ?? 0), 0);
  const loggedMinutes = yearBooks.reduce((s, b) => s + b.instances.reduce((ss, i) => ss + i.sessions.reduce((sss, x) => sss + x.durationMin, 0), 0), 0);
  // Use real session time when we have it, otherwise estimate ~2 minutes per page.
  const hours = Math.round((loggedMinutes > 0 ? loggedMinutes : totalPages * 2) / 60);

  const arcs = yearBooks.reduce((acc, b) => {
    const a = b.instances[b.instances.length - 1]?.arcOutcome;
    if (a) acc[a] = (acc[a] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const dominantArc = Object.entries(arcs).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";

  const allQuotes = yearBooks.flatMap(b => b.instances.flatMap(i => i.quotes.map(q => ({ ...q, book: b }))));
  const hardestHit = allQuotes.find(q => q.resonance === "philosophical-bomb" || q.resonance === "i-needed-this") ?? allQuotes[0];

  const authorCount = yearBooks.reduce((acc, b) => { acc[b.author] = (acc[b.author] ?? 0) + 1; return acc; }, {} as Record<string, number>);
  const mostQuoted = Object.entries(authorCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";

  const top = yearBooks.slice().sort((a, b) =>
    (b.instances[b.instances.length - 1]?.rating ?? 0) - (a.instances[a.instances.length - 1]?.rating ?? 0)
  )[0];

  const generateParagraph = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("oracle", {
        body: {
          mode: "wrapped",
          language: getCurrentLang(),
          input: {
            year,
            books: yearBooks.map(b => ({
              title: b.title, author: b.author, tags: b.tags,
              rating: b.instances[b.instances.length - 1]?.rating,
              arc: b.instances[b.instances.length - 1]?.arcOutcome,
            })),
          },
        },
      });
      if (error) throw error;
      if (data?.error) toast.error(data.error);
      else setParagraph(data?.text ?? "");
    } catch (e: any) { toast.error(e.message ?? "Oracle silent"); }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen pb-24">
      <PageHeader
        eyebrow="The Archive"
        title=""
        titleMain="Year of"
        titleEmphasis={String(year)}
        subtitle="A retrospective. Your reading life with a body."
        right={
          <select value={year} onChange={(e) => setYear(Number(e.target.value))}
            className="bg-input border border-border-strong/40 rounded-sm px-3 py-2 font-display">
            {Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - i).map(y => <option key={y}>{y}</option>)}
          </select>
        }
      />

      <div className="px-4 sm:px-8 lg:px-14 mt-10 space-y-12">
        {/* Spine parade */}
        <section>
          <p className="eyebrow mb-4">Volumes finished</p>
          <div className="shelf-row">
            <div className="flex items-end gap-1.5 min-h-[260px] pb-1 overflow-x-auto">
              {yearBooks.map((b, i) => (
                <div key={b.id} className="spine rounded-[2px] shrink-0"
                  style={{
                    background: b.spineColor,
                    width: 38 + (i % 4) * 6,
                    height: 200 + (i % 7) * 14,
                  }}>
                  <div className="h-full flex items-center justify-center px-1"
                    style={{ writingMode: "vertical-rl" }}>
                    <span className="font-display text-[0.78rem] text-parchment/90">{b.title}</span>
                  </div>
                </div>
              ))}
              {yearBooks.length === 0 && <p className="font-display italic text-muted-foreground">No volumes closed this year.</p>}
            </div>
            <div className="shelf-board" />
          </div>
        </section>

        {/* Stats grid */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Stat label="Books" value={yearBooks.length} />
          <Stat label="Pages" value={totalPages} />
          <Stat label="Hours (est.)" value={hours} />
          <Stat label="Dominant arc" value={dominantArc} />
        </section>

        {/* Top + paragraph */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="ink-card rounded-sm p-6">
            <p className="eyebrow mb-2">Highest rated</p>
            {top ? (
              <>
                <p className="font-display text-3xl text-foreground">{top.title}</p>
                <p className="mono text-xs tracking-[0.2em] uppercase text-primary mt-2">{top.author} · {top.instances[top.instances.length - 1]?.rating}/10</p>
              </>
            ) : <p className="italic text-muted-foreground">—</p>}
          </div>
          <div className="ink-card rounded-sm p-6">
            <p className="eyebrow mb-2">Most-quoted author</p>
            <p className="font-display text-3xl text-foreground">{mostQuoted}</p>
          </div>
        </section>

        {hardestHit && (
          <section className="ink-card rounded-sm p-8">
            <p className="eyebrow mb-3">The line that hit hardest</p>
            <blockquote className="font-display text-3xl italic leading-snug text-foreground">"{hardestHit.text}"</blockquote>
            <p className="mt-4 mono text-[0.6rem] tracking-[0.25em] uppercase text-primary/80">
              {hardestHit.book.title} · {hardestHit.book.author}
            </p>
          </section>
        )}

        <section className="ink-card rounded-sm p-8 space-y-4">
          <p className="eyebrow">Your reading identity, this year</p>
          <Button onClick={generateParagraph} disabled={loading}
            className="bg-primary text-primary-foreground hover:bg-primary-glow font-display tracking-wider">
            {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
            Generate
          </Button>
          {paragraph && (
            <p className="font-serif text-lg leading-relaxed text-foreground italic whitespace-pre-wrap">{paragraph}</p>
          )}
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="ink-card rounded-sm p-5">
      <p className="font-display text-4xl text-primary tabular-nums">{value}</p>
      <p className="mono text-[0.55rem] tracking-[0.25em] uppercase text-muted-foreground mt-2">{label}</p>
    </div>
  );
}
