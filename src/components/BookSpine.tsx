import { memo, useEffect, useRef, useState } from "react";
import { Book } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { ShelfScaleMode } from "@/lib/shelfSettings";
import type { DragEvent, PointerEvent } from "react";

export type SpineState = "spine" | "cover" | "open";

interface Props {
  book: Book;
  onClick?: () => void;
  index?: number;
  scaleMode?: ShelfScaleMode;
  qa?: boolean;
  draggable?: boolean;
  onDragStart?: (e: DragEvent<HTMLButtonElement>) => void;
  onDragOver?: (e: DragEvent<HTMLButtonElement>) => void;
  onDrop?: (e: DragEvent<HTMLButtonElement>) => void;
  onDragEnd?: () => void;
  onPointerDown?: (e: PointerEvent<HTMLButtonElement>) => void;
  onPointerUp?: () => void;
  onPointerLeave?: () => void;
  moving?: boolean;
  /** Visual state machine: spine → cover → open. Driven by parent. */
  state?: SpineState;
  /** Legacy prop: equivalent to state="cover" when true. */
  revealed?: boolean;
}

const ARC_DOT: Record<string, string> = {
  positive: "bg-arc-positive",
  complex: "bg-arc-complex",
  difficult: "bg-arc-difficult",
};

const FOIL_COLOR: Record<string, string> = {
  gold: "hsl(45 70% 55% / 0.55)",
  silver: "hsl(0 0% 80% / 0.5)",
  none: "transparent",
};

const TEXTURE_BG: Record<string, string> = {
  leather:
    "radial-gradient(ellipse at 30% 20%, hsl(0 0% 100% / 0.08), transparent 60%), radial-gradient(ellipse at 70% 80%, hsl(0 0% 0% / 0.25), transparent 60%)",
  cloth:
    "repeating-linear-gradient(45deg, hsl(0 0% 100% / 0.04) 0 2px, transparent 2px 4px), repeating-linear-gradient(-45deg, hsl(0 0% 0% / 0.08) 0 2px, transparent 2px 4px)",
  paper:
    "repeating-linear-gradient(0deg, hsl(0 0% 100% / 0.03) 0 1px, transparent 1px 3px), radial-gradient(ellipse at 50% 50%, hsl(0 0% 0% / 0.15), transparent 70%)",
};

const clamp = (min: number, value: number, max: number) => Math.max(min, Math.min(max, value));

function spineDimensions(book: Book, scaleMode: ShelfScaleMode) {
  const pages = Number.isFinite(book.pages) && book.pages ? clamp(48, book.pages, 1400) : 320;
  // True-to-pages: ~250 pages/inch for trade paperbacks, rendered at ~70px/inch on screen
  // so a 250pp book ≈ 28px, a 600pp book ≈ 50px, a 1000pp book ≈ 75px.
  const inchWidth = (pages / 250) * 26;
  const compactWidth = 26 + Math.sqrt(pages) * 1.9;
  const pageWidth = scaleMode === "compact"
    ? Math.round(compactWidth)
    : Math.round(18 + inchWidth);
  return {
    pages,
    width: book.spineWidth ?? clamp(22, pageWidth, 96),
    height: book.spineHeight ?? 276,
  };
}

function BookSpineImpl({
  book, onClick, index = 0, scaleMode = "true", qa = false,
  draggable, onDragStart, onDragOver, onDrop, onDragEnd,
  onPointerDown, onPointerUp, onPointerLeave,
  moving = false, state, revealed = false,
}: Props) {
  // Resolve effective state. `revealed` legacy prop maps to "cover".
  const effectiveState: SpineState = state ?? (revealed ? "cover" : "spine");
  const [hovered, setHovered] = useState(false);
  // Virtualization: only spines near the viewport mount heavy 3D layers.
  // Saves dozens of decoded bitmaps + GPU layers on long shelves.
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = btnRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") { setNear(true); return; }
    const io = new IntersectionObserver(
      (entries) => { for (const e of entries) if (e.isIntersecting) { setNear(true); io.disconnect(); break; } },
      { root: null, rootMargin: "600px 800px", threshold: 0.01 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const seed = (book.id.charCodeAt(0) ?? 0) + (book.id.charCodeAt(1) ?? 0) + (book.id.charCodeAt(2) ?? 0);
  const { pages, width, height } = spineDimensions(book, scaleMode);
  const pageIssue = !Number.isFinite(book.pages) || !book.pages || book.pages < 48 || book.pages > 1400;
  const tilt = ((seed % 7) - 3) * 0.35;
  const depth = 10 + (seed % 5) * 2;
  const lastInst = book.instances[book.instances.length - 1];
  const arc = lastInst?.arcOutcome;
  const rating = lastInst?.rating;
  const abandoned = book.status === "abandoned";

  const texture = book.spineTexture ?? "leather";
  const foil = book.foilStyle ?? "gold";
  const foilColor = FOIL_COLOR[foil];
  const hasFoil = foil !== "none";

  const hasCover = !!book.coverUrl;
  const hasGeneratedSpine = !!book.spineUrl;
  const edgeWidth = clamp(3, Math.round(width * 0.16), 10);
  const pageLineGap = width > 70 ? 3 : 4;

  // Cover-state width: render the front cover proportions when displayed.
  const coverWidth = clamp(110, Math.round(height * 0.66), 168);
  // Lazy-mount heavy elements: cover image + hover preview only when needed,
  // and ONLY for spines near the viewport (virtualization).
  const isActive = effectiveState !== "spine";
  const showCoverFace = isActive || (near && hovered);
  const showPages = effectiveState === "open";
  // Cheap spine art is fine even off-screen if a generated spine exists,
  // but we skip the cover-cropped fallback bitmap until near.
  const renderSpineCoverFallback = near && !hasGeneratedSpine && hasCover;
  const renderGeneratedSpine = near && hasGeneratedSpine;

  return (
    <button
      ref={btnRef}
      onClick={onClick}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className={cn(
        "book3d group relative cursor-grab active:cursor-grabbing text-left rounded-[2px] animate-shelf-arrival",
        "shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
        "transition-[width,transform,box-shadow,filter] duration-500 ease-out",
        qa && pageIssue && "ring-2 ring-primary/70 ring-offset-2 ring-offset-background",
        abandoned && "opacity-60",
        moving && "spine-moving",
        effectiveState === "cover" && "book3d-cover",
        effectiveState === "open" && "book3d-open"
      )}
      style={{
        width: effectiveState === "spine" ? `${width}px` : `${coverWidth}px`,
        height: `${height}px`,
        transform: `rotate(${tilt}deg) translateZ(${depth}px)`,
        transformOrigin: "bottom center",
        animationDelay: `${index * 52}ms`,
        transitionDelay: `${index * 12}ms`,
        ["--spine-tilt" as string]: `${tilt}deg`,
        ["--spine-depth" as string]: `${depth}px`,
        ["--edge-width" as string]: `${edgeWidth}px`,
        ["--page-line-gap" as string]: `${pageLineGap}px`,
        ["--spine-w" as string]: `${width}px`,
        ["--cover-w" as string]: `${coverWidth}px`,
      }}
      aria-label={`${book.title} by ${book.author}${book.pages ? `, ${book.pages} pages` : ""}`}
      title={book.pages ? `${book.title} · ${book.pages} pages` : book.title}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerLeave={() => { setHovered(false); onPointerLeave?.(); }}
      onMouseEnter={() => setHovered(true)}
    >
      {/* 3D STAGE — flips between spine, cover, and opened states */}
      <div className="book3d-stage">
        {/* SPINE FACE */}
        <div
          className="book3d-face book3d-face-spine"
          style={{
            backgroundColor: book.spineColor ?? "hsl(30 35% 22%)",
            backgroundImage: TEXTURE_BG[texture],
          }}
        >
          {/* AI-generated spine artwork (only mounted when near viewport) */}
          {renderGeneratedSpine && (
            <img
              src={book.spineUrl}
              alt=""
              className="absolute inset-0 z-10 h-full w-full object-cover rounded-[2px]"
              loading="lazy"
              decoding="async"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
            />
          )}
          {/* Cover-cropped fallback spine — virtualized */}
          {renderSpineCoverFallback && (
            <img
              src={book.coverUrl}
              alt=""
              className="absolute inset-0 w-full h-full object-cover scale-125 blur-[1.5px] opacity-85"
              style={{
                filter: "saturate(1.18) contrast(1.12)",
                objectPosition: `${38 + (seed % 24)}% center`,
              }}
              loading="lazy"
              decoding="async"
            />
          )}
          {/* Vertical lighting + paper texture */}
          <div
            className="absolute inset-0 pointer-events-none z-20"
            style={{
              background:
                "linear-gradient(90deg, hsl(0 0% 100% / 0.10) 0%, transparent 12%, transparent 78%, hsl(0 0% 0% / 0.45) 100%)",
            }}
          />
          {!hasGeneratedSpine && (
            <div
              className="absolute inset-0 pointer-events-none mix-blend-overlay opacity-30"
              style={{ backgroundImage: TEXTURE_BG[texture] }}
            />
          )}
          {hasFoil && <div className="absolute inset-y-[10%] left-1/2 w-px -translate-x-1/2 opacity-35 z-20" style={{ backgroundColor: foilColor }} />}
          <div className="spine-page-edge spine-page-edge-left" />
          <div className="spine-page-edge spine-page-edge-right" />
          <div className="spine-board-lip spine-board-lip-top" />
          <div className="spine-board-lip spine-board-lip-bottom" />
        </div>

        {/* PAGE-BLOCK — gives the book real thickness behind the cover */}
        {showCoverFace && <div className="book3d-block" aria-hidden />}

        {/* COVER FACE — only mount when needed (lazy) so we don't decode every cover at rest */}
        {showCoverFace && (
          <div className="book3d-face book3d-face-cover">
            {hasCover ? (
              <img
                src={book.coverUrl}
                alt={`${book.title} cover`}
                className="absolute inset-0 h-full w-full object-cover rounded-[2px]"
                loading="lazy"
                decoding="async"
              />
            ) : (
              <div className="absolute inset-0 grid place-items-center p-3 text-center"
                style={{ backgroundColor: book.spineColor ?? "hsl(30 35% 22%)" }}>
                <div>
                  <p className="font-display text-foreground text-base leading-tight">{book.title}</p>
                  <p className="mono text-[0.55rem] tracking-[0.25em] uppercase text-muted-foreground mt-2">{book.author}</p>
                </div>
              </div>
            )}
            {/* Cover gloss */}
            <div className="absolute inset-0 pointer-events-none"
              style={{ background: "linear-gradient(120deg, hsl(0 0% 100% / 0.18) 0%, transparent 35%)" }} />
          </div>
        )}

        {/* OPEN PAGES — only when fully opened */}
        {showPages && (
          <div className="book3d-pages">
            <div className="book3d-pages-inner">
              <div className="book3d-page-left" />
              <div className="book3d-page-right">
                <p className="font-display italic text-base text-foreground/90 leading-snug px-4">
                  {book.title}
                </p>
                <p className="mono text-[0.5rem] tracking-[0.3em] uppercase text-muted-foreground mt-2 px-4">
                  {book.author}
                </p>
                <div className="mt-4 mx-4 h-px bg-border/50" />
                <p className="mt-4 mx-4 text-[0.65rem] font-serif italic text-muted-foreground line-clamp-6">
                  {book.howIFound || "Open this dossier to read your notes, quotes, and reading sessions."}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {qa && pageIssue && (
        <div className="absolute -top-2 -right-2 z-30 h-5 min-w-5 rounded-sm border border-primary/70 bg-background/70 px-1 text-center mono text-[0.5rem] leading-5 text-primary shadow-card backdrop-blur-sm">
          {book.pages ? "!" : "?"}
        </div>
      )}

      {arc && (
        <div className={cn("absolute top-1.5 left-1.5 w-1.5 h-1.5 rounded-full ring-1 ring-background/60 z-30", ARC_DOT[arc])} />
      )}

      {abandoned && (
        <div className="absolute top-0 right-0 w-3 h-3 z-30 border-t border-r border-parchment/25 bg-transparent" />
      )}

      {/* Hover preview card — only mount image when actually hovered (RAM saver) */}
      {hovered && near && (
        <div
          className={cn(
            "pointer-events-none absolute left-1/2 bottom-full -translate-x-1/2 mb-3 z-40",
            "animate-fade-in"
          )}
          style={{ writingMode: "horizontal-tb" }}
        >
          <div className="ink-card rounded-sm p-3 w-64 shadow-card flex gap-3">
            {hasCover && (
              <img src={book.coverUrl} alt={book.title} className="w-16 h-24 object-cover rounded-[2px] ring-1 ring-border/60 shrink-0" loading="lazy" decoding="async" />
            )}
            <div className="min-w-0 flex-1">
              <p className="font-display text-sm text-foreground leading-tight">{book.title}</p>
              <p className="mono text-[0.55rem] tracking-[0.2em] uppercase text-muted-foreground mt-1 truncate">
                {book.author}{book.year ? ` · ${book.year}` : ""}
              </p>
              {rating !== undefined && (
                <p className="mt-2 mono text-[0.65rem] text-primary">Rating · {rating}/10</p>
              )}
              <p className="mt-2 mono text-[0.55rem] text-muted-foreground">
                {pages} pp{hasGeneratedSpine ? " · custom spine" : ""}
              </p>
            </div>
          </div>
        </div>
      )}
    </button>
  );
}

export const BookSpine = memo(BookSpineImpl);

