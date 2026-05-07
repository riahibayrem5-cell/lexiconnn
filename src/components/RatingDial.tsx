import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface Props {
  value?: number;       // 1..10
  onChange: (v: number) => void;
  size?: number;
}

export function RatingDial({ value, onChange, size = 180 }: Props) {
  const [v, setV] = useState(value ?? 0);
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  useEffect(() => { setV(value ?? 0); }, [value]);

  const setFromEvent = (e: PointerEvent | React.PointerEvent) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = (e as PointerEvent).clientX - cx;
    const dy = (e as PointerEvent).clientY - cy;
    // Angle: 0 at top, clockwise
    let ang = Math.atan2(dx, -dy);            // -PI..PI
    if (ang < 0) ang += Math.PI * 2;          // 0..2PI
    const frac = ang / (Math.PI * 2);
    const next = Math.round(frac * 10);
    const clamped = next === 0 ? 0 : Math.max(1, Math.min(10, next));
    if (clamped !== v) {
      setV(clamped);
      onChange(clamped);
      // tactile feedback
      if (navigator.vibrate) navigator.vibrate(2);
    }
  };

  useEffect(() => {
    const move = (e: PointerEvent) => { if (dragging.current) setFromEvent(e); };
    const up = () => { dragging.current = false; };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  });

  const r = size / 2 - 14;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - (v / 10));
  const cx = size / 2;
  const cy = size / 2;

  // Tick marks
  const ticks = Array.from({ length: 10 }, (_, i) => {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const x1 = cx + (r - 6) * Math.cos(a);
    const y1 = cy + (r - 6) * Math.sin(a);
    const x2 = cx + (r + 4) * Math.cos(a);
    const y2 = cy + (r + 4) * Math.sin(a);
    return { x1, y1, x2, y2, on: i < v };
  });

  return (
    <div
      ref={ref}
      className="relative select-none touch-none cursor-pointer mx-auto"
      style={{ width: size, height: size }}
      onPointerDown={(e) => { dragging.current = true; setFromEvent(e); }}
    >
      <svg width={size} height={size} className="absolute inset-0">
        {/* Outer hairline */}
        <circle cx={cx} cy={cy} r={r + 8} fill="none" stroke="hsl(var(--border))" strokeWidth="1" />
        {/* Track */}
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="hsl(var(--surface-3))" strokeWidth="2" />
        {/* Ticks */}
        {ticks.map((t, i) => (
          <line
            key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2}
            stroke={t.on ? "hsl(var(--primary))" : "hsl(var(--border-strong))"}
            strokeWidth={t.on ? 2 : 1}
            strokeLinecap="round"
          />
        ))}
        {/* Active arc */}
        <circle
          cx={cx} cy={cy} r={r}
          fill="none"
          stroke="hsl(var(--primary))"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${cx} ${cy})`}
          style={{ filter: "drop-shadow(0 0 6px hsl(var(--primary) / 0.5))", transition: "stroke-dashoffset 200ms" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <div className={cn("font-display text-6xl leading-none", v ? "text-primary" : "text-muted-foreground/40")}>
          {v || "—"}
        </div>
        <div className="mono text-[0.6rem] tracking-[0.3em] text-muted-foreground mt-2">/ 10</div>
      </div>
    </div>
  );
}
