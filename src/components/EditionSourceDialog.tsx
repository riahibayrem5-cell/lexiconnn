import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Search, BookOpen, Globe, Library, Archive, Check } from "lucide-react";
import {
  searchEditionsBySource,
  SOURCE_LABELS,
  type EditionSource,
  type OLResult,
} from "@/lib/openlibrary";

const SOURCES: { v: EditionSource; icon: any }[] = [
  { v: "google", icon: BookOpen },
  { v: "openlibrary", icon: Library },
  { v: "gutendex", icon: Globe },
  { v: "internetarchive", icon: Archive },
];

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initialQuery: string;
  onApply: (edition: OLResult) => void;
}

export function EditionSourceDialog({ open, onOpenChange, initialQuery, onApply }: Props) {
  const [query, setQuery] = useState(initialQuery);
  const [source, setSource] = useState<EditionSource>("google");
  const [results, setResults] = useState<OLResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) setQuery(initialQuery);
  }, [open, initialQuery]);

  const runSearch = async (src: EditionSource = source, q: string = query) => {
    if (!q.trim()) return;
    setLoading(true);
    try {
      const r = await searchEditionsBySource(src, q, 12);
      setResults(r);
    } finally {
      setLoading(false);
    }
  };

  // Auto-search when opened or source changes
  useEffect(() => {
    if (open) runSearch(source, query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, source]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="ink-card max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Choose an edition</DialogTitle>
          <DialogDescription className="font-serif italic">
            Pick a source and an edition. Cover, ISBN, publisher, year and page count will replace this book's metadata.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => { e.preventDefault(); runSearch(); }}
          className="flex gap-2"
        >
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Title, author, or ISBN…"
            className="flex-1"
          />
          <Button type="submit" disabled={loading} variant="outline">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          </Button>
        </form>

        <Tabs value={source} onValueChange={(v) => setSource(v as EditionSource)} className="flex-1 flex flex-col min-h-0">
          <TabsList className="bg-transparent border-b border-border/60 rounded-none p-0 h-auto w-full justify-start gap-4">
            {SOURCES.map(({ v, icon: I }) => (
              <TabsTrigger
                key={v}
                value={v}
                className="data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-1 py-2 text-xs mono uppercase tracking-wider"
              >
                <I className="h-3.5 w-3.5 mr-1.5" />
                {SOURCE_LABELS[v]}
              </TabsTrigger>
            ))}
          </TabsList>

          {SOURCES.map(({ v }) => (
            <TabsContent key={v} value={v} className="flex-1 overflow-y-auto mt-4 pr-1">
              {loading ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Searching {SOURCE_LABELS[v]}…
                </div>
              ) : results.length === 0 ? (
                <p className="text-center py-12 text-sm italic font-serif text-muted-foreground">
                  No editions found in {SOURCE_LABELS[v]}. Try refining the query.
                </p>
              ) : (
                <ul className="space-y-3">
                  {results.map((r) => (
                    <li key={r.key} className="flex gap-3 p-3 border border-border/60 rounded-sm hover:border-primary/60 transition-colors">
                      {r.coverUrl ? (
                        <img src={r.coverUrl} alt="" className="w-14 h-20 object-cover rounded-[2px] ring-1 ring-border/50 shrink-0" loading="lazy" />
                      ) : (
                        <div className="w-14 h-20 bg-muted rounded-[2px] shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-display text-sm leading-tight truncate">{r.title}</p>
                        <p className="text-xs text-muted-foreground italic font-serif truncate">{r.author}</p>
                        <p className="mt-1 text-[0.6rem] mono uppercase tracking-wider text-muted-foreground/80">
                          {[r.year, r.publisher, r.pages ? `${r.pages}pp` : null, r.isbn].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => { onApply(r); onOpenChange(false); }}
                        className="self-center bg-primary text-primary-foreground hover:bg-primary-glow"
                      >
                        <Check className="h-3.5 w-3.5 mr-1" /> Apply
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
