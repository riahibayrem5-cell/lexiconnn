import { useNavigate } from "react-router-dom";
import { useLibrary } from "@/lib/storage";
import { useReadingGoals } from "@/lib/goals";
import { bookProgress, minutesToday, minutesThisWeek, readingStreak } from "@/lib/progress";
import { Button } from "@/components/ui/button";
import { Flame, Play, Target, Timer } from "lucide-react";

export function TodayBar() {
  const { books } = useLibrary();
  const { goals } = useReadingGoals();
  const navigate = useNavigate();

  const reading = books.filter(b => b.status === "reading" || b.status === "rereading").slice(0, 3);
  const today = minutesToday(books);
  const week = minutesThisWeek(books);
  const streak = readingStreak(books);
  const weekPct = Math.min(100, Math.round((week / Math.max(goals.minutesPerWeek, 1)) * 100));

  if (books.length === 0) return null;

  return (
    <section className="px-4 sm:px-8 lg:px-14 mt-4">
      <div className="luxury-panel rounded-sm p-5 grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-6 items-stretch">
        {/* Currently reading */}
        <div>
          <p className="eyebrow mb-3">At the desk</p>
          {reading.length === 0 ? (
            <p className="font-serif italic text-muted-foreground">
              No active read. Set a book to "Reading" to begin a session.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {reading.map(b => {
                const p = bookProgress(b);
                return (
                  <button
                    key={b.id}
                    onClick={() => navigate(`/book/${b.id}`)}
                    className="text-left rounded-sm border border-border/50 hover:border-primary/50 transition-all p-3 flex gap-3 group"
                  >
                    {b.coverUrl ? (
                      <img src={b.coverUrl} alt="" loading="lazy" className="w-12 h-[68px] object-cover rounded-[2px] shrink-0" />
                    ) : (
                      <div className="w-12 h-[68px] rounded-[2px] shrink-0" style={{ background: b.spineColor }} />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-display text-sm text-foreground truncate group-hover:text-primary transition-colors">{b.title}</p>
                      <p className="mono text-[0.55rem] tracking-[0.2em] uppercase text-muted-foreground truncate">{b.author}</p>
                      {p !== undefined && (
                        <div className="mt-2 h-1 rounded-full bg-border/40 overflow-hidden">
                          <div className="h-full bg-primary" style={{ width: `${Math.round(p * 100)}%` }} />
                        </div>
                      )}
                      {p !== undefined && (
                        <p className="mono text-[0.5rem] tracking-[0.18em] uppercase text-primary/80 mt-1">{Math.round(p * 100)}% read</p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Today / week / streak */}
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-3 gap-3">
            <Stat icon={Timer} label="today" value={today} unit="min" />
            <Stat icon={Target} label="this week" value={week} unit={`/ ${goals.minutesPerWeek}`} />
            <Stat icon={Flame} label="streak" value={streak} unit="d" />
          </div>
          <div>
            <div className="h-1.5 rounded-full bg-border/40 overflow-hidden">
              <div className="h-full bg-primary transition-all" style={{ width: `${weekPct}%` }} />
            </div>
            <p className="mono text-[0.5rem] tracking-[0.22em] uppercase text-muted-foreground mt-2">Weekly goal · {weekPct}%</p>
          </div>
          <Button onClick={() => navigate("/ritual")} className="bg-primary text-primary-foreground hover:bg-primary-glow font-display tracking-wider">
            <Play className="h-4 w-4 mr-2" /> Begin a ritual
          </Button>
        </div>
      </div>
    </section>
  );
}

function Stat({ icon: Icon, label, value, unit }: { icon: typeof Flame; label: string; value: number | string; unit?: string }) {
  return (
    <div className="rounded-sm border border-border/40 bg-surface/40 p-3">
      <Icon className="h-3.5 w-3.5 text-primary mb-1.5" />
      <p className="font-display text-2xl leading-none text-foreground tabular-nums">{value}<span className="text-xs ml-1 text-muted-foreground">{unit}</span></p>
      <p className="mono text-[0.5rem] tracking-[0.22em] uppercase text-muted-foreground mt-1">{label}</p>
    </div>
  );
}
