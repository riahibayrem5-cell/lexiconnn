import { useMemo, useState } from "react";
import { useLibrary } from "@/lib/storage";
import { PageHeader } from "@/components/PageHeader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Download, Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { ResonanceTag } from "@/lib/types";
import { renderQuoteCard, quoteToMarkdown } from "@/lib/quoteCard";

const RESONANCE: { v: ResonanceTag; l: string }[] = [
  { v: "beautiful-language", l: "Beautiful language" },
  { v: "philosophical-bomb", l: "Philosophical bomb" },
  { v: "character-truth", l: "Character truth" },
  { v: "funny", l: "Funny" },
  { v: "painful", l: "Painful" },
  { v: "i-needed-this", l: "I needed this" },
];

export default function Quotes() {
  const { books } = useLibrary();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<ResonanceTag | "all">("all");
  const [generatingId, setGeneratingId] = useState<string | null>(null);

  const all = useMemo(() => {
    return books.flatMap(b =>
      b.instances.flatMap(i =>
        i.quotes.map(qu => ({ ...qu, book: b }))
      )
    ).sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime());
  }, [books]);

  const filtered = all.filter(x => {
    if (filter !== "all" && x.resonance !== filter) return false;
    if (!q.trim()) return true;
    const s = q.toLowerCase();
    return x.text.toLowerCase().includes(s) || x.book.title.toLowerCase().includes(s) || x.book.author.toLowerCase().includes(s);
  });

  const downloadCard = async (quoteId: string, text: string, author: string, title: string) => {
    setGeneratingId(quoteId);
    try {
      const blob = await renderQuoteCard({ text, author, title });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `lexicon-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}.png`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Card downloaded");
    } catch (e) {
      console.error(e);
      toast.error("Could not render card");
    } finally {
      setGeneratingId(null);
    }
  };

  const copyMarkdown = async (text: string, title: string, author: string, page?: string) => {
    try {
      await navigator.clipboard.writeText(quoteToMarkdown(text, title, author, page));
      toast.success("Copied as Markdown");
    } catch {
      toast.error("Clipboard blocked");
    }
  };

  return (
    <div className="min-h-screen pb-24">
      <PageHeader
        eyebrow="The Vault"
        title=""
        titleMain="What you"
        titleEmphasis="refused to forget"
        subtitle="Every line you saved, in one room. Search. Export. Re-read."
      />

      <div className="px-4 sm:px-8 lg:px-14 mt-8 space-y-6">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Search keywords, books, authors…"
              className="pl-10 bg-input/60 border-border-strong/40 font-serif" />
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setFilter("all")}
              className={cn("px-3 py-1.5 rounded-sm mono text-[0.6rem] tracking-[0.25em] uppercase border",
                filter === "all" ? "border-primary text-primary" : "border-border/40 text-muted-foreground")}>
              All
            </button>
            {RESONANCE.map(r => (
              <button key={r.v} onClick={() => setFilter(r.v)}
                className={cn("px-3 py-1.5 rounded-sm mono text-[0.6rem] tracking-[0.25em] uppercase border",
                  filter === r.v ? "border-primary text-primary" : "border-border/40 text-muted-foreground")}>
                {r.l}
              </button>
            ))}
          </div>
          <span className="ml-auto mono text-xs text-muted-foreground tracking-[0.2em]">{filtered.length} QUOTES</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filtered.map(qu => (
            <article key={qu.id} className="ink-card rounded-sm p-7 group relative">
              <blockquote className="font-display text-2xl italic text-foreground leading-snug">
                "{qu.text}"
              </blockquote>
              <div className="mt-5 flex items-center justify-between gap-4 border-t border-border/40 pt-4">
                <div className="min-w-0">
                  <p className="mono text-[0.6rem] tracking-[0.25em] uppercase text-primary/80 truncate">{qu.book.title}</p>
                  <p className="mono text-[0.55rem] tracking-[0.2em] uppercase text-muted-foreground">{qu.book.author}{qu.page ? ` · pg ${qu.page}` : ""}</p>
                </div>
                <div className="flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => copyMarkdown(qu.text, qu.book.title, qu.book.author, qu.page)}
                    className="text-muted-foreground hover:text-primary"
                    title="Copy as Markdown"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={generatingId === qu.id}
                    onClick={() => downloadCard(qu.id, qu.text, qu.book.author, qu.book.title)}
                    className="text-muted-foreground hover:text-primary"
                    title="Download share card"
                  >
                    {generatingId === qu.id
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <Download className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              </div>
              {qu.note && <p className="mt-3 italic font-serif text-muted-foreground text-sm">— {qu.note}</p>}
            </article>
          ))}
          {filtered.length === 0 && (
            <p className="font-display italic text-muted-foreground col-span-full">No quotes match.</p>
          )}
        </div>
      </div>
    </div>
  );
}
