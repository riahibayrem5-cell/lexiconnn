import { ArcCheckin } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Props { arc: ArcCheckin[]; onTap?: (point: ArcCheckin["point"], mood: ArcCheckin["mood"]) => void; }

const POINTS: ArcCheckin["point"][] = [0, 25, 50, 75, 100];
const MOODS: ArcCheckin["mood"][] = [1, 2, 3, 4, 5];
const MOOD_LABEL = ["", "Heavy", "Wary", "Even", "Lifted", "Elated"];

export function EmotionalArc({ arc, onTap }: Props) {
  const w = 600, h = 200, padX = 30, padY = 30;
  const xFor = (p: number) => padX + ((w - padX * 2) * p) / 100;
  const yFor = (m: number) => padY + ((h - padY * 2) * (5 - m)) / 4;

  // Smooth path through given points
  const data = POINTS.map(p => arc.find(a => a.point === p)).filter(Boolean) as ArcCheckin[];
  let path = "";
  if (data.length >= 2) {
    path = `M ${xFor(data[0].point)} ${yFor(data[0].mood)} `;
    for (let i = 1; i < data.length; i++) {
      const prev = data[i - 1];
      const cur = data[i];
      const cx = (xFor(prev.point) + xFor(cur.point)) / 2;
      path += `Q ${cx} ${yFor(prev.mood)}, ${xFor(cur.point)} ${yFor(cur.mood)} `;
    }
  }

  return (
    <div className="space-y-4">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto">
        {/* Horizontal grid */}
        {[1, 2, 3, 4, 5].map(m => (
          <line key={m} x1={padX} y1={yFor(m)} x2={w - padX} y2={yFor(m)} stroke="hsl(var(--border) / 0.5)" strokeDasharray="2 4" />
        ))}
        {/* Vertical reference */}
        {POINTS.map(p => (
          <line key={p} x1={xFor(p)} y1={padY} x2={xFor(p)} y2={h - padY} stroke="hsl(var(--border) / 0.3)" />
        ))}

        {path && (
          <>
            <path d={path} fill="none" stroke="hsl(var(--primary))" strokeWidth="2.4" strokeLinecap="round"
              style={{ filter: "drop-shadow(0 0 8px hsl(var(--primary) / 0.4))" }} />
            <path d={path + ` L ${xFor(data[data.length - 1].point)} ${h - padY} L ${xFor(data[0].point)} ${h - padY} Z`}
              fill="hsl(var(--primary) / 0.08)" />
          </>
        )}

        {data.map((d, i) => (
          <circle key={i} cx={xFor(d.point)} cy={yFor(d.mood)} r="4.5" fill="hsl(var(--primary))" stroke="hsl(var(--background))" strokeWidth="2" />
        ))}

        {POINTS.map(p => (
          <text key={p} x={xFor(p)} y={h - 8} textAnchor="middle" className="mono"
            fontSize="9" fill="hsl(var(--muted-foreground))" letterSpacing="2">
            {p === 0 ? "OPEN" : p === 100 ? "CLOSE" : `${p}%`}
          </text>
        ))}
      </svg>

      {onTap && (
        <div className="space-y-3">
          <p className="eyebrow">Log a check-in</p>
          <div className="grid grid-cols-5 gap-2">
            {POINTS.map(p => {
              const cur = arc.find(a => a.point === p);
              return (
                <div key={p} className="flex flex-col items-center gap-2 p-3 rounded-sm border border-border/50 bg-surface-2/50">
                  <span className="mono text-[0.55rem] tracking-[0.25em] text-muted-foreground">
                    {p === 0 ? "OPEN" : p === 100 ? "CLOSE" : `${p}%`}
                  </span>
                  <div className="flex flex-col gap-1">
                    {MOODS.slice().reverse().map(m => (
                      <button
                        key={m}
                        onClick={() => onTap(p, m)}
                        title={MOOD_LABEL[m]}
                        className={cn(
                          "w-6 h-2 rounded-full transition-all",
                          cur?.mood === m
                            ? "bg-primary shadow-gold"
                            : "bg-surface-3 hover:bg-primary/40"
                        )}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
