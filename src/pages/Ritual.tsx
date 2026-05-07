import { useEffect, useMemo, useRef, useState } from "react";
import { useLibrary } from "@/lib/storage";
import { getCurrentLang } from "@/lib/i18n";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { BookOpen, Flame, Loader2, Maximize2, Minimize2, Pause, Play, Quote as QuoteIcon, Sparkles, Square, Target, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

function format(sec: number) {
  const m = Math.floor(sec / 60).toString().padStart(2, "0");
  const s = (sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

const MOODS = ["heavy", "wary", "even", "lifted", "elated"] as const;

export default function Ritual() {
  const { books, addSession, addQuote, addJournal } = useLibrary();
  const active = useMemo(
    () => books.filter(b => b.status === "reading" || b.status === "rereading"),
    [books]
  );

  const [bookId, setBookId] = useState(active[0]?.id ?? "");
  useEffect(() => { if (!bookId && active[0]) setBookId(active[0].id); }, [active, bookId]);

  const [running, setRunning] = useState(false);
  const [sec, setSec] = useState(0);
  const [pagesStart, setPagesStart] = useState("");
  const [pagesEnd, setPagesEnd] = useState("");
  const [quoteFlash, setQuoteFlash] = useState("");
  const [pulse, setPulse] = useState<number | null>(null);
  const [endNote, setEndNote] = useState("");
  const [intention, setIntention] = useState("notice the sentence that changes the room");
  const [focus, setFocus] = useState(false);
  const [moodPre, setMoodPre] = useState<string>("");
  const [planMin, setPlanMin] = useState(30);
  const [pickLoading, setPickLoading] = useState(false);
  const [nudge, setNudge] = useState<string>("");
  const [reflection, setReflection] = useState<string>("");
  const [reflectLoading, setReflectLoading] = useState(false);

  const interval = useRef<ReturnType<typeof setInterval>>();
  const lastNudgeAt = useRef<number>(0);
  const selectedBook = books.find(b => b.id === bookId);
  const pagesRead = Math.max(0, (Number(pagesEnd) || 0) - (Number(pagesStart) || 0));
  const pace = sec > 0 && pagesRead > 0 ? Math.round((pagesRead / Math.max(sec / 60, 1)) * 60) : 0;
  const goalSec = planMin * 60;
  const progress = Math.min(1, sec / goalSec);

  useEffect(() => {
    if (running) interval.current = setInterval(() => setSec(s => s + 1), 1000);
    return () => { if (interval.current) clearInterval(interval.current); };
  }, [running]);

  // Auto-nudge every ~7 minutes once running
  useEffect(() => {
    if (!running || !selectedBook) return;
    const now = Math.floor(sec / 60);
    if (now > 0 && now % 7 === 0 && now !== lastNudgeAt.current) {
      lastNudgeAt.current = now;
      fetchNudge(now);
    }
  }, [sec, running, selectedBook]);

  // ESC exits focus mode
  useEffect(() => {
    if (!focus) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setFocus(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focus]);

  const fetchNudge = async (minutes: number) => {
    if (!selectedBook) return;
    try {
      const { data } = await supabase.functions.invoke("ritual-coach", {
        body: {
          mode: "nudge",
          language: getCurrentLang(),
          input: {
            title: selectedBook.title, author: selectedBook.author,
            minutes, mood: pulse ? MOODS[pulse - 1] : undefined,
          },
        },
      });
      if (data?.text) setNudge(data.text.trim());
    } catch { /* silent */ }
  };

  const smartPick = async () => {
    if (active.length === 0) { toast.info("No books are marked Reading."); return; }
    setPickLoading(true);
    try {
      const payload = {
        mood: moodPre || undefined,
        minutes: planMin,
        active: active.slice(0, 12).map(b => {
          const inst = (b.instances ?? [])[(b.instances ?? []).length - 1];
          const sessions = (inst?.sessions ?? []).length;
          const lastNote = (inst?.journal ?? []).slice(-1)[0]?.body?.slice(0, 80);
          return { title: b.title, author: b.author, lastOpenedAt: b.lastOpenedAt, sessions, lastNote };
        }),
      };
      const { data } = await supabase.functions.invoke("ritual-coach", {
        body: { mode: "pick", input: payload, language: getCurrentLang() },
      });
      if (data?.error) { toast.error(data.error); return; }
      const txt = (data?.text || "").trim();
      const m = txt.match(/\{[\s\S]*\}/);
      if (!m) { toast.error("Couldn't parse the pick."); return; }
      const parsed = JSON.parse(m[0]);
      const found = active.find(b => b.title.toLowerCase() === String(parsed.bookTitle || "").toLowerCase())
        ?? active.find(b => String(parsed.bookTitle || "").toLowerCase().includes(b.title.toLowerCase()));
      if (found) {
        setBookId(found.id);
        if (parsed.reason) setIntention(String(parsed.reason));
        toast.success(`Tonight: ${found.title}`);
      } else {
        toast.info("Pick made, but couldn't match it to your shelf.");
      }
    } catch (e) {
      toast.error("Coach unavailable.");
    } finally {
      setPickLoading(false);
    }
  };

  const fetchReflection = async (durationMin: number) => {
    if (!selectedBook) return;
    setReflectLoading(true);
    try {
      const { data } = await supabase.functions.invoke("ritual-coach", {
        body: {
          mode: "reflect",
          language: getCurrentLang(),
          input: {
            title: selectedBook.title, author: selectedBook.author,
            minutes: durationMin,
            pagesStart: pagesStart || undefined, pagesEnd: pagesEnd || undefined, pagesRead,
            moodAfter: pulse ?? undefined,
            note: endNote || undefined,
            quote: quoteFlash || undefined,
          },
        },
      });
      if (data?.text) setReflection(data.text.trim());
    } catch { /* silent */ } finally { setReflectLoading(false); }
  };

  const stop = async () => {
    if (!bookId) { setRunning(false); setSec(0); return; }
    if (sec < 5) {
      setRunning(false);
      toast.info("Session too short to log.");
      return;
    }
    const durationMin = Math.max(1, Math.round(sec / 60));
    addSession(bookId, {
      date: new Date().toISOString(),
      durationMin,
      pagesStart: pagesStart ? Number(pagesStart) : undefined,
      pagesEnd: pagesEnd ? Number(pagesEnd) : undefined,
      moodAfter: pulse ?? undefined,
      note: [intention && `Intention: ${intention}`, endNote].filter(Boolean).join("\n") || undefined,
    });
    if (endNote) addJournal(bookId, endNote);
    toast.success(`Session logged — ${durationMin} min`);
    setRunning(false);
    await fetchReflection(durationMin);
  };

  const resetSession = () => {
    setSec(0); setPagesStart(""); setPagesEnd(""); setEndNote(""); setPulse(null);
    setNudge(""); setReflection(""); lastNudgeAt.current = 0;
  };

  // Heatmap last 12 weeks
  const heat = useMemo(() => {
    const days: { date: Date; count: number }[] = [];
    const today = new Date();
    for (let i = 83; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const key = d.toDateString();
      let c = 0;
      books.forEach(b => (b.instances ?? []).forEach(inst => (inst.sessions ?? []).forEach(s => {
        if (new Date(s.date).toDateString() === key) c += s.durationMin;
      })));
      days.push({ date: d, count: c });
    }
    return days;
  }, [books]);

  const totalThisWeek = heat.slice(-7).reduce((s, d) => s + d.count, 0);

  // ----- Focus (cinematic fullscreen) -----
  if (focus) {
    return (
      <div className="fixed inset-0 z-[100] bg-background overflow-hidden">
        {/* animated ambient gradient */}
        <div
          className="absolute inset-0 opacity-70"
          style={{
            background:
              "radial-gradient(60% 50% at 50% 35%, hsl(var(--primary) / 0.18) 0%, transparent 70%), radial-gradient(40% 40% at 80% 80%, hsl(var(--primary) / 0.08) 0%, transparent 70%), linear-gradient(180deg, hsl(var(--background)) 0%, hsl(var(--surface-2)) 100%)",
            animation: "gradientShift 18s ease-in-out infinite alternate",
          }}
        />
        <button
          onClick={() => setFocus(false)}
          className="absolute top-5 right-5 z-10 p-2 rounded-sm border border-border/40 text-muted-foreground hover:text-primary hover:border-primary/50"
          aria-label="Exit focus mode"
        >
          <Minimize2 className="h-4 w-4" />
        </button>

        <div className="relative z-[1] h-full flex flex-col items-center justify-center px-6">
          {/* Breathing orb with progress ring */}
          <div className="relative w-[min(60vh,520px)] aspect-square flex items-center justify-center">
            {/* Progress ring */}
            <svg className="absolute inset-0 -rotate-90" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="46" fill="none" stroke="hsl(var(--border))" strokeOpacity="0.25" strokeWidth="0.6" />
              <circle
                cx="50" cy="50" r="46" fill="none"
                stroke="hsl(var(--primary))" strokeWidth="0.8" strokeLinecap="round"
                strokeDasharray={`${progress * 289.03} 289.03`}
                style={{ transition: "stroke-dasharray 1s linear" }}
              />
            </svg>
            {/* Orb */}
            <div
              className="absolute inset-[10%] rounded-full"
              style={{
                background: "radial-gradient(circle at 35% 30%, hsl(var(--primary) / 0.55) 0%, hsl(var(--primary) / 0.18) 45%, transparent 75%)",
                filter: "blur(2px)",
                animation: running ? "breathe 6s ease-in-out infinite" : "none",
              }}
            />
            {/* Center content */}
            <div className="relative text-center">
              <div className="font-display text-[clamp(4rem,12vw,8rem)] text-primary tabular-nums tracking-wider leading-none">
                {format(sec)}
              </div>
              <div className="mt-2 mono text-[0.6rem] tracking-[0.3em] uppercase text-muted-foreground">
                {running ? "READING" : sec > 0 ? "PAUSED" : "READY"} · GOAL {planMin}M
              </div>
              {selectedBook && (
                <p className="mt-6 font-serif italic text-foreground/80 max-w-xs mx-auto">
                  {selectedBook.title} <span className="text-muted-foreground">— {selectedBook.author}</span>
                </p>
              )}
            </div>
          </div>

          {/* Intention */}
          {intention && (
            <p className="mt-6 max-w-md text-center font-serif italic text-muted-foreground text-sm animate-fade-in">
              {intention}
            </p>
          )}

          {/* Nudge */}
          {nudge && (
            <div key={nudge} className="mt-5 max-w-md text-center font-serif italic text-primary/90 animate-fade-in">
              <p className="eyebrow text-primary/60 mb-1 not-italic">Coach</p>
              <p>{nudge}</p>
            </div>
          )}

          {/* Controls */}
          <div className="mt-8 flex gap-3">
            {!running ? (
              <Button onClick={() => setRunning(true)} className="bg-primary text-primary-foreground hover:bg-primary-glow font-display tracking-wider">
                <Play className="h-4 w-4 mr-2" /> {sec > 0 ? "Resume" : "Begin"}
              </Button>
            ) : (
              <Button onClick={() => setRunning(false)} variant="outline" className="border-primary/60 text-primary">
                <Pause className="h-4 w-4 mr-2" /> Pause
              </Button>
            )}
            <Button onClick={stop} variant="outline" className="border-border-strong/60">
              <Square className="h-4 w-4 mr-2" /> Close
            </Button>
          </div>

          {/* Quick capture */}
          <div className="mt-6 w-[min(420px,90vw)] flex gap-2">
            <Input
              value={quoteFlash}
              onChange={(e) => setQuoteFlash(e.target.value)}
              placeholder="A line you must keep…"
              className="bg-background/60 backdrop-blur border-border/40 font-serif italic"
            />
            <Button
              onClick={() => {
                if (!quoteFlash.trim() || !bookId) return;
                addQuote(bookId, { text: quoteFlash, resonance: "beautiful-language" });
                setQuoteFlash("");
                toast.success("Quote saved");
              }}
              variant="outline" className="border-primary/60 text-primary"
            >
              <QuoteIcon className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <style>{`
          @keyframes breathe {
            0%, 100% { transform: scale(1); opacity: 0.85; }
            50% { transform: scale(1.06); opacity: 1; }
          }
          @keyframes gradientShift {
            0% { transform: translate(0,0) scale(1); }
            100% { transform: translate(-2%, 1%) scale(1.05); }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24">
      <PageHeader
        eyebrow="The Ritual"
        title=""
        titleMain="An hour,"
        titleEmphasis="at the desk"
        subtitle="Sit. Begin the timer. The page is enough."
      />

      <div className="px-4 sm:px-8 lg:px-14 mt-8 grid grid-cols-12 gap-8">
        {/* Timer */}
        <div className="col-span-12 lg:col-span-7 luxury-panel rounded-sm p-8 space-y-6">
          {active.length === 0 && (
            <p className="italic text-muted-foreground">No book is currently being read. Set one to "Reading" first.</p>
          )}
          {active.length > 0 && (
            <>
              {/* Smart pick row */}
              <div className="rounded-sm border border-primary/20 bg-primary/5 p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="eyebrow text-primary/70">Coach</p>
                    <p className="font-serif italic text-sm text-foreground/80">Tell me how you feel and how long you have.</p>
                  </div>
                  <Button onClick={smartPick} disabled={pickLoading} variant="outline" className="border-primary/60 text-primary">
                    {pickLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Wand2 className="h-4 w-4 mr-2" />}
                    Pick for me
                  </Button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-[1fr_140px] gap-3">
                  <Input
                    value={moodPre}
                    onChange={(e) => setMoodPre(e.target.value)}
                    placeholder="restless · curious · exhausted · in the mood for something heavy…"
                    className="bg-input/40 border-border-strong/30 font-serif italic"
                  />
                  <div className="flex items-center gap-2">
                    <Input
                      type="number" min={5} max={180} value={planMin}
                      onChange={(e) => setPlanMin(Math.max(5, Math.min(180, Number(e.target.value) || 30)))}
                      className="bg-input/40 border-border-strong/30 mono"
                    />
                    <span className="mono text-[0.55rem] tracking-[0.2em] uppercase text-muted-foreground">min</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-[120px_1fr] gap-5 items-end">
                {selectedBook?.coverUrl && <img src={selectedBook.coverUrl} alt={`${selectedBook.title} cover`} className="w-28 aspect-[3/4] object-cover rounded-sm shadow-card" referrerPolicy="no-referrer" />}
                <div>
                <p className="eyebrow mb-2">Volume</p>
                <select value={bookId} onChange={(e) => setBookId(e.target.value)}
                  className="w-full bg-input border border-border-strong/40 rounded-sm px-3 py-2 font-serif">
                  {active.map(b => <option key={b.id} value={b.id}>{b.title} — {b.author}</option>)}
                </select>
                <p className="mt-3 font-serif italic text-muted-foreground">Tonight: {intention}</p>
                </div>
              </div>

              {/* Timer + ring */}
              <div className="text-center py-6 relative">
                <div className="relative inline-block">
                  <svg className="absolute inset-0 -rotate-90" viewBox="0 0 100 100" style={{ width: "100%", height: "100%" }}>
                    <circle cx="50" cy="50" r="46" fill="none" stroke="hsl(var(--border))" strokeOpacity="0.3" strokeWidth="0.6" />
                    <circle
                      cx="50" cy="50" r="46" fill="none"
                      stroke="hsl(var(--primary))" strokeWidth="0.8" strokeLinecap="round"
                      strokeDasharray={`${progress * 289.03} 289.03`}
                      style={{ transition: "stroke-dasharray 1s linear" }}
                    />
                  </svg>
                  <div className="px-12 py-4">
                    <div className="font-display text-7xl text-primary tabular-nums tracking-wider">{format(sec)}</div>
                    <div className="mt-3 mono text-[0.6rem] tracking-[0.3em] uppercase text-muted-foreground">
                      {running ? "READING" : sec > 0 ? "PAUSED" : "READY"} · GOAL {planMin}M
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-center gap-3 flex-wrap">
                {!running ? (
                  <Button onClick={() => setRunning(true)} className="bg-primary text-primary-foreground hover:bg-primary-glow font-display tracking-wider">
                    <Play className="h-4 w-4 mr-2" /> {sec > 0 ? "Resume" : "Begin"}
                  </Button>
                ) : (
                  <Button onClick={() => setRunning(false)} variant="outline" className="border-primary/60 text-primary">
                    <Pause className="h-4 w-4 mr-2" /> Pause
                  </Button>
                )}
                <Button onClick={stop} variant="outline" className="border-border-strong/60">
                  <Square className="h-4 w-4 mr-2" /> Close session
                </Button>
                <Button onClick={() => setFocus(true)} variant="outline" className="border-border-strong/60">
                  <Maximize2 className="h-4 w-4 mr-2" /> Focus mode
                </Button>
              </div>

              {nudge && (
                <div key={nudge} className="rounded-sm border border-primary/30 bg-primary/5 p-4 animate-fade-in">
                  <p className="eyebrow text-primary/70 mb-1">Coach nudge</p>
                  <p className="font-serif italic text-foreground/90">{nudge}</p>
                </div>
              )}

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <RitualMetric icon={BookOpen} label="pages" value={pagesRead || "—"} />
                <RitualMetric icon={Target} label="pace/hr" value={pace || "—"} />
                <RitualMetric icon={Flame} label="focus" value={running ? "live" : "held"} />
                <RitualMetric icon={Sparkles} label="mood" value={pulse ? MOODS[pulse-1] : "—"} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="eyebrow mb-1">Page from</p>
                  <Input value={pagesStart} onChange={(e) => setPagesStart(e.target.value)} className="bg-input/40 mono" />
                </div>
                <div>
                  <p className="eyebrow mb-1">Page to</p>
                  <Input value={pagesEnd} onChange={(e) => setPagesEnd(e.target.value)} className="bg-input/40 mono" />
                </div>
              </div>

              <div className="space-y-2">
                <p className="eyebrow">Session intention</p>
                <Input value={intention} onChange={(e) => setIntention(e.target.value)} className="bg-input/40 border-border-strong/30 font-serif italic" />
              </div>

              <div className="space-y-2">
                <p className="eyebrow">Mid-session capture</p>
                <div className="flex gap-2">
                  <Input value={quoteFlash} onChange={(e) => setQuoteFlash(e.target.value)}
                    placeholder="A line you must keep…"
                    className="bg-input/40 border-border-strong/30 font-serif italic" />
                  <Button
                    onClick={() => {
                      if (!quoteFlash.trim() || !bookId) return;
                      addQuote(bookId, { text: quoteFlash, resonance: "beautiful-language" });
                      setQuoteFlash("");
                      toast.success("Quote saved");
                    }}
                    variant="outline" className="border-primary/60 text-primary"
                  >
                    <QuoteIcon className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <p className="eyebrow">Mood pulse</p>
                <div className="flex gap-2">
                  {[1,2,3,4,5].map(n => (
                    <button key={n} onClick={() => setPulse(n)}
                      className={cn("flex-1 py-2 rounded-sm border mono text-xs tracking-wider transition-colors",
                        pulse === n ? "border-primary text-primary bg-primary/5" : "border-border/40 text-muted-foreground hover:text-foreground")}>
                      {MOODS[n-1]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <p className="eyebrow">Closing thought (becomes a journal entry)</p>
                <Textarea rows={3} value={endNote} onChange={(e) => setEndNote(e.target.value)}
                  placeholder="What surprised you? What are you thinking about? Energy 1–5?"
                  className="bg-input/40 border-border-strong/30 font-serif italic" />
              </div>

              {(reflectLoading || reflection) && (
                <div className="rounded-sm border border-primary/30 bg-primary/5 p-5 animate-fade-in space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="eyebrow text-primary/70">Coach reflection</p>
                    {reflection && (
                      <Button size="sm" variant="ghost" className="text-primary" onClick={() => { addJournal(bookId, reflection); toast.success("Saved to journal"); }}>
                        Save to journal
                      </Button>
                    )}
                  </div>
                  {reflectLoading
                    ? <p className="font-serif italic text-muted-foreground flex items-center gap-2"><Loader2 className="h-3 w-3 animate-spin" /> Reading your session…</p>
                    : <p className="font-serif italic text-foreground/90 leading-relaxed">{reflection}</p>}
                  {reflection && (
                    <Button size="sm" variant="outline" className="border-border-strong/40" onClick={resetSession}>
                      Begin a new session
                    </Button>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Stats */}
        <div className="col-span-12 lg:col-span-5 space-y-6">
          <div className="ink-card rounded-sm p-6">
            <p className="eyebrow mb-4">Last 12 weeks</p>
            <div className="grid grid-cols-12 gap-1">
              {heat.map((d, i) => {
                const intensity = Math.min(1, d.count / 60);
                return (
                  <div key={i}
                    title={`${d.date.toDateString()} — ${d.count} min`}
                    className="aspect-square rounded-[2px] border border-border/30 transition-transform hover:scale-110"
                    style={{
                      backgroundColor: d.count
                        ? `hsl(var(--primary) / ${0.15 + intensity * 0.7})`
                        : "hsl(var(--surface-2))",
                    }}
                  />
                );
              })}
            </div>
          </div>

          <div className="ink-card rounded-sm p-6 grid grid-cols-2 gap-4">
            <Stat label="Minutes this week" value={totalThisWeek} />
            <Stat label="Sessions all-time" value={books.reduce((s, b) => s + (b.instances ?? []).reduce((ss, i) => ss + (i.sessions?.length ?? 0), 0), 0)} />
            <Stat label="Average session" value={(() => {
              const all = books.flatMap(b => (b.instances ?? []).flatMap(i => i.sessions ?? []));
              if (!all.length) return 0;
              return Math.round(all.reduce((s, x) => s + x.durationMin, 0) / all.length);
            })()} unit="m" />
            <Stat label="Active streak" value={(() => {
              const set = new Set<string>();
              books.forEach(b => (b.instances ?? []).forEach(i => (i.sessions ?? []).forEach(s => set.add(new Date(s.date).toDateString()))));
              let streak = 0;
              const today = new Date();
              for (let i = 0; i < 365; i++) {
                const d = new Date(today); d.setDate(today.getDate() - i);
                if (set.has(d.toDateString())) streak++; else break;
              }
              return streak;
            })()} unit="d" />
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, unit }: { label: string; value: number | string; unit?: string }) {
  return (
    <div>
      <p className="font-display text-3xl text-foreground tabular-nums">{value}<span className="text-base text-muted-foreground ml-1">{unit}</span></p>
      <p className="mono text-[0.55rem] tracking-[0.25em] uppercase text-muted-foreground mt-1">{label}</p>
    </div>
  );
}

function RitualMetric({ icon: Icon, label, value }: { icon: any; label: string; value: number | string }) {
  return (
    <div className="rounded-sm border border-border/40 bg-surface/40 p-3">
      <Icon className="h-4 w-4 text-primary mb-2" />
      <p className="font-display text-2xl leading-none text-foreground tabular-nums">{value}</p>
      <p className="mono text-[0.5rem] tracking-[0.22em] uppercase text-muted-foreground mt-1">{label}</p>
    </div>
  );
}
