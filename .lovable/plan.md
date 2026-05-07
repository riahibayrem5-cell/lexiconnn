# Dossier flow rework

Goal: every book gets a "Generate" button alongside Improve details / Delete. Generated dossiers are saved automatically and become the only thing the History page lists. The History page gets stronger Regenerate / Extend (with depth) controls and a richer template.

## 1. `BookBrain.tsx` — Generate button on the book page

Add a third button in the top action row (next to *Improve details* and *Delete*):

```text
[← Back to shelf]                  [Improve details] [Generate dossier] [Delete] [Dossier · XXXXXX]
```

Behavior:
- On click → call `generateDossier({ title, author, year, mode: "create" })` then `saveDossierRemote({ bookId: book.id, ... })` from `src/lib/dossier.ts`.
- Show inline state: "Generating…" → toast `"Dossier saved to your Memory Vault"`.
- If a dossier already exists, the button label switches to **"Open dossier"** and routes to `/history` with `?open=<bookId>` (consumed by History to auto-open the modal). It no longer regenerates from this page — regenerate/extend live in History.
- Same component is reused for any book that has a `BookBrain` route, which already covers both shelf books and searched books once added. (No separate flow is needed for the search drawer — generation happens after a book exists in `books`.)
- Use `loadDossier(book.id)` on mount so the label reflects existing state.

## 2. `History.tsx` — vault becomes saved-dossiers-only

Strip:
- The catalog/external `searchOpenLibrary` block, `external` state, `searching` state, `externalCards`, "From the wider catalog" section.
- The auto-generate-on-open behavior in `DossierFullScreen` (no more silent generations from this page).

Replace the data source:
- Add `loadAllDossiers()` to `src/lib/dossier.ts` — selects every row from `book_dossiers` for the user (or guest map). Returns `{ bookId, title, author, generatedAt, extendedAt, extensionCount }[]`.
- For each row, hydrate cover/year by joining with `books` (in-memory `useLibrary().books`). Books that are no longer on the shelf still appear (using stored title/author and a placeholder cover).
- Filters become: `all | recently extended | by author A–Z | last generated`. Search box stays but only filters this list.
- Empty state: "No dossiers yet — open any book and tap **Generate dossier**."

Auto-open when arriving with `?open=<bookId>` from BookBrain.

## 3. Extend with 1× / 2× / 3× depth

Replace the single Extend button in the dossier toolbar with a small segmented control:

```text
[Regenerate] [Extend ▾ 1×|2×|3×] [Spoilers] [PDF]
```

- 1× = current behavior (one pass).
- 2× = run `mode: "extend"` twice in sequence, feeding the previous output back in.
- 3× = three passes. Each pass increments `extension_count` and updates `extended_at`.
- Show progress: `Extending pass 2/3…`.

Backend (`supabase/functions/book-dossier/index.ts`) already supports `mode: "extend"`. No backend change required — looping happens client-side in `runGenerate("extend", { passes })`.

## 4. Template polish (DossierBody)

Tighten the dossier reading experience:

- Add a sticky **table of contents** sidebar on `lg:` screens (Essence / Ideas / People / Quotes / Lessons / Plot) with smooth scroll, replacing the tabbed layout for a long-form feel. Mobile keeps the existing tabs.
- Hero strip: add `oneLiner` in larger drop-cap display, a thin gold rule, and `genre · setting · X mood tags` on a single mono line.
- Ideas: numbered cards keep their structure but add a subtle `border-l-primary` glow and "Why it matters" indented in a small italic block instead of a separate bordered line.
- Characters: two-column grid on `sm:` with role chip top-right, arc as `→` line at bottom.
- Quotes: full-width pull quote treatment with hanging quotation mark, attribution on a thin line below.
- Lessons: keep diamond bullets, but add a small "carry into life" header style.
- Plot: keep the timeline, render twists as collapsible cards inside the spoiler wrap.
- Footer: add `Extended ×N · last extended <date>` when `extensionCount > 0`.

Dossier PDF (`src/lib/dossierPdf.ts`) gets the same hero strip and TOC layout updates so the export matches the on-screen template.

## 5. Storage helper changes

`src/lib/dossier.ts`:

- `loadAllDossiers(): Promise<CachedDossier[]>` — DB select-all for signed-in users; reads guest map otherwise. Returns rows including `title` and `author` for display.
- `extendDossier({ bookId, passes }): Promise<CachedDossier>` — convenience wrapper that loops `generateDossier` + `saveDossierRemote` `passes` times.

No DB migrations needed; the `book_dossiers` table already has `extension_count` and `extended_at`.

## Technical notes

- `History.tsx` removes `OLResult`/`searchOpenLibrary` imports.
- The `lexicon-dossier-change` event is already dispatched on guest writes; emit it from the DB path too so the History list refreshes immediately after generating from BookBrain.
- BookBrain's "Open dossier" navigation: `navigate("/history?open=" + book.id)`. History reads `useSearchParams()` to set `openId` once on mount.
- Extend loop guards: stop on first error, surface a toast `"Pass 2 failed — kept pass 1"`.
- All dossier writes continue to go through the existing `book-dossier` edge function; no new functions or secrets.

## Files touched

- `src/pages/BookBrain.tsx` — Generate / Open dossier button, navigate to History.
- `src/pages/History.tsx` — drop catalog search, list saved dossiers only, segmented Extend, auto-open via query param, template polish.
- `src/lib/dossier.ts` — `loadAllDossiers`, `extendDossier`, dispatch change event after DB writes.
- `src/lib/dossierPdf.ts` — match the new template structure.

Out of scope: changing the dossier JSON schema, adding new edge functions, deleting old dossiers UI.