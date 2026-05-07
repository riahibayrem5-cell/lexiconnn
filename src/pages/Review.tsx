import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { useLibrary } from "@/lib/storage";
import { STATUS_LABEL } from "@/lib/seed";
import { CalendarCheck, NotebookPen, Target } from "lucide-react";

export default function Review() {
  const navigate = useNavigate();
  const { books } = useLibrary();
  const review = useMemo(() => {
    return [...books]
      .map(book => ({
        book,
        last: new Date(book.lastOpenedAt ?? book.addedAt).getTime(),
        notes: book.instances.reduce((sum, inst) => sum + inst.journal.length + inst.quotes.length, 0),
      }))
      .sort((a, b) => a.last - b.last || a.notes - b.notes)
      .slice(0, 12);
  }, [books]);

  return (
    <div className="min-h-screen pb-24">
      <PageHeader
        eyebrow="Review Desk"
        title=""
        titleMain="Turn the shelf into"
        titleEmphasis="action"
        subtitle="A productive queue for neglected books, missing notes, and next reading decisions."
      />

      <div className="px-4 sm:px-8 lg:px-14 mt-8 grid grid-cols-1 lg:grid-cols-[1.2fr_0.8fr] gap-6">
        <section className="ink-card rounded-sm p-6 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <p className="eyebrow">Priority queue</p>
            <CalendarCheck className="h-5 w-5 text-primary" />
          </div>
          <div className="space-y-3">
            {review.map(({ book, notes }) => (
              <button key={book.id} onClick={() => navigate(`/book/${book.id}`)} className="w-full rounded-sm border border-border/50 p-4 text-left transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:bg-surface-2">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-display text-xl text-foreground truncate">{book.title}</p>
                    <p className="mono text-[0.58rem] tracking-[0.22em] uppercase text-muted-foreground mt-1">{book.author} · {STATUS_LABEL[book.status]}</p>
                  </div>
                  <span className="mono text-[0.55rem] tracking-[0.18em] uppercase text-primary shrink-0">{notes} notes</span>
                </div>
              </button>
            ))}
            {review.length === 0 && <p className="font-serif italic text-muted-foreground">Add books to build a review queue.</p>}
          </div>
        </section>

        <section className="space-y-6">
          <div className="luxury-panel rounded-sm p-6">
            <Target className="h-5 w-5 text-primary mb-4" />
            <p className="font-display text-3xl text-foreground">{books.filter(b => b.status === "reading" || b.status === "rereading").length}</p>
            <p className="mono text-[0.58rem] tracking-[0.24em] uppercase text-muted-foreground mt-1">Active reads</p>
          </div>
          <div className="luxury-panel rounded-sm p-6">
            <NotebookPen className="h-5 w-5 text-primary mb-4" />
            <p className="font-display text-3xl text-foreground">{books.reduce((sum, b) => sum + b.instances.reduce((s, i) => s + i.journal.length + i.quotes.length, 0), 0)}</p>
            <p className="mono text-[0.58rem] tracking-[0.24em] uppercase text-muted-foreground mt-1">Captured thoughts</p>
          </div>
          <Button onClick={() => navigate("/")} className="w-full bg-primary text-primary-foreground hover:bg-primary-glow font-display tracking-wider">Back to shelf</Button>
        </section>
      </div>
    </div>
  );
}