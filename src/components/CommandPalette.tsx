import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { useLibrary } from "@/lib/storage";
import { Book, Quote as QuoteIcon, Library, ClipboardCheck, Compass, Sparkles, Timer, CalendarDays, Settings as SettingsIcon, Plus } from "lucide-react";

const NAV_ITEMS = [
  { to: "/", label: "Shelf", icon: Library },
  { to: "/review", label: "Review Desk", icon: ClipboardCheck },
  { to: "/recommendations", label: "Recommendations", icon: Compass },
  { to: "/oracle", label: "Oracle", icon: Sparkles },
  { to: "/ritual", label: "Reading Ritual", icon: Timer },
  { to: "/quotes", label: "Quotes Vault", icon: QuoteIcon },
  
  { to: "/archive", label: "Archive", icon: CalendarDays },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
];

export function CommandPalette() {
  const navigate = useNavigate();
  const { books } = useLibrary();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const quotes = useMemo(
    () =>
      books.flatMap((b) =>
        b.instances.flatMap((i) =>
          i.quotes.map((q) => ({ ...q, book: b }))
        )
      ).slice(0, 100),
    [books]
  );

  const run = (fn: () => void) => {
    setOpen(false);
    fn();
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search books, quotes, jump anywhere…  (⌘K)" />
      <CommandList className="max-h-[60vh]">
        <CommandEmpty>Nothing found.</CommandEmpty>

        <CommandGroup heading="Pages">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <CommandItem key={to} value={`page ${label}`} onSelect={() => run(() => navigate(to))}>
              <Icon className="h-4 w-4 mr-2" /> {label}
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Quick actions">
          <CommandItem value="add book" onSelect={() => run(() => navigate("/?add=1"))}>
            <Plus className="h-4 w-4 mr-2" /> Add a book
          </CommandItem>
          <CommandItem value="start ritual" onSelect={() => run(() => navigate("/ritual"))}>
            <Timer className="h-4 w-4 mr-2" /> Start a reading ritual
          </CommandItem>
        </CommandGroup>

        {books.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading={`Books · ${books.length}`}>
              {books.slice(0, 80).map((b) => (
                <CommandItem
                  key={b.id}
                  value={`book ${b.title} ${b.author}`}
                  onSelect={() => run(() => navigate(`/book/${b.id}`))}
                >
                  <Book className="h-4 w-4 mr-2" />
                  <span className="truncate">{b.title}</span>
                  <span className="ml-2 text-xs text-muted-foreground truncate">— {b.author}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {quotes.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading={`Quotes · ${quotes.length}`}>
              {quotes.slice(0, 30).map((q) => (
                <CommandItem
                  key={q.id}
                  value={`quote ${q.text} ${q.book.title}`}
                  onSelect={() => run(() => navigate(`/book/${q.book.id}`))}
                >
                  <QuoteIcon className="h-4 w-4 mr-2 shrink-0" />
                  <span className="truncate italic">&ldquo;{q.text.slice(0, 80)}{q.text.length > 80 ? "…" : ""}&rdquo;</span>
                  <span className="ml-2 text-xs text-muted-foreground truncate">— {q.book.title}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
