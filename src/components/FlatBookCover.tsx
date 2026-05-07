import { memo, useState } from "react";
import { Book } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Props {
  book: Book;
  onClick?: () => void;
  index?: number;
}

/** Lightweight Goodreads-style 2D cover card. Native lazy loading +
 * decoding="async" keeps GPU/RAM/CPU usage minimal even on huge libraries. */
function FlatBookCoverImpl({ book, onClick, index = 0 }: Props) {
  const instances = book.instances ?? [];
  const lastInst = instances[instances.length - 1];
  const rating = lastInst?.rating;
  const [failed, setFailed] = useState(false);
  const hasCover = !!book.coverUrl && !failed;

  return (
    <button
      onClick={onClick}
      className={cn(
        "group relative shrink-0 w-[120px] text-left outline-none",
        "focus-visible:ring-2 focus-visible:ring-primary/60 rounded-sm",
        "transition-transform duration-200 hover:-translate-y-1",
        book.status === "abandoned" && "opacity-60",
      )}
      style={{ animationDelay: `${index * 20}ms` }}
      aria-label={`${book.title} by ${book.author}`}
      title={book.title}
    >
      <div
        className="relative w-[120px] h-[180px] rounded-sm overflow-hidden ring-1 ring-border/60 shadow-card bg-muted"
        style={{ backgroundColor: book.spineColor ?? "hsl(30 35% 22%)" }}
      >
        {hasCover ? (
          <img
            src={book.coverUrl}
            alt={`${book.title} cover`}
            className="absolute inset-0 h-full w-full object-cover"
            loading="lazy"
            decoding="async"
            onError={() => setFailed(true)}
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center p-2 text-center">
            <div>
              <p className="font-display text-sm text-foreground leading-tight line-clamp-3">{book.title}</p>
              <p className="mono text-[0.5rem] tracking-[0.2em] uppercase text-muted-foreground mt-1.5 line-clamp-1">{book.author}</p>
            </div>
          </div>
        )}
      </div>
      <div className="mt-2 px-0.5">
        <p className="font-display text-[0.78rem] text-foreground leading-tight line-clamp-2">{book.title}</p>
        <p className="mono text-[0.5rem] tracking-[0.18em] uppercase text-muted-foreground mt-0.5 line-clamp-1">{book.author}</p>
        {rating !== undefined && (
          <p className="mono text-[0.55rem] text-primary mt-0.5">★ {rating}/10</p>
        )}
      </div>
    </button>
  );
}

export const FlatBookCover = memo(FlatBookCoverImpl);
