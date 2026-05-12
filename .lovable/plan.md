# LEXICON — General Audit & Roadmap

A scan across `src/pages`, `src/components`, `src/lib`, and `supabase/functions` (≈10.7K LOC, 14 edge functions, 555 i18n keys, full RTL pass already in place). Below is a prioritized list of what's worth adding, continuing, fixing, and removing.

---

## 🟢 Continue (in-flight, finish strong)

1. **RTL/Arabic polish endgame**
   - i18n is wired across all pages; remaining gaps are in **History.tsx** (727 LOC, never imported `useLang`) and **Recommendations.tsx** detail strings. Sweep those and we hit 100%.
   - Verify Arabic numerals/dates use `toLocaleString("ar")` consistently in History stats and Ritual streaks.

2. **Edition matching scoring**
   - Already scoring ISBN/OCLC/title+author. Add a "why this match" tooltip in `EditionSourceDialog` so users trust the auto-pick.

3. **Spine generation pipeline**
   - `generate-spine` works but has no retry on transient AI failures and no visible queue state when bulk-importing from Goodreads.

---

## 🔵 Add (high value, low risk)

1. **Reading goals dashboard widget**
   - `src/lib/goals.ts` exists (49 lines) but is barely surfaced. Add a TodayBar / Shelf widget showing "X of Y books · pace: ahead/behind".

2. **Quote card export presets**
   - `quoteCard.ts` generates one style. Add 3 presets (minimal, editorial, foil) and a copy-link button.

3. **Global search via Command Palette**
   - `CommandPalette.tsx` (117 LOC) currently navigates only. Index books, quotes, and journal entries for fuzzy search.

4. **Keyboard shortcuts surface**
   - Add a `?` overlay listing shortcuts (open palette, add book, jump to today, toggle theme/lang).

5. **Backup / export-everything**
   - One-click JSON export of the entire library + an import that round-trips. Foundation already there in `markdownExport.ts` and `goodreadsImport.ts`.

6. **Reading streak + heatmap on History**
   - History page is large (727 LOC) but lacks a calendar heatmap of sessions. Big visual win.

7. **Book cover fallback chain UI**
   - `covers.ts` tries multiple sources. Show source attribution under cover in BookBrain (already partially done — extend to Shelf hover).

---

## 🟡 Fix (bugs / debt)

1. **`BookBrain.tsx` is 929 LOC** — split into `BookBrainHeader`, `BookBrainTabs`, `BookBrainSidebar`. Currently slow to edit and re-render heavy.

2. **`History.tsx` (727 LOC) has no i18n** — entire page renders English even when `lang === "ar"`.

3. **`storage.ts` uses 5 separate `localStorage` keys with no schema version** — one bad write breaks load. Add a `schemaVersion` field + migration shim. Quota errors are also unhandled.

4. **No error boundaries** — a single render error in BookBrain blanks the whole route. Add a route-level boundary in `AppLayout`.

5. **`console.warn` left in production paths** (`covers.ts`, `arabicPdf.ts`, `AddBookDrawer.tsx`) — route through a tiny `logger.ts` that no-ops in prod.

6. **Edge function input validation** — most `supabase/functions/*` accept JSON without zod/shape checks; malformed payloads return 500 instead of 400.

7. **React Query unused** — `QueryClientProvider` is mounted but most data fetching uses ad-hoc `useEffect`+`useState`. Either adopt it (caching, retries) or remove the dep.

8. **Lazy routes have no preloading** — first navigation to BookBrain stalls on the chunk. Add `onMouseEnter` preload on shelf spines.

9. **AICoverDialog generation cost not enforced** — UI says "costs credits" but there's no client-side rate limit or confirmation for repeats.

10. **Missing route in nav editor** — `AdminPanel.PAGE_ORDER` omits `/recommendations` and `/history`, so admins can't rename them.

---

## 🔴 Remove / Simplify

1. **`src/lib/seed.ts` (30 LOC)** — dev-only seed data; gate behind `import.meta.env.DEV` or delete if unused.

2. **Duplicate toast systems** — both `@/components/ui/toaster` (shadcn) and `sonner` are mounted in `App.tsx`. Pick one (sonner is already the default in code).

3. **`src/lib/utils.ts` is 6 lines** — fine to keep, but several pages re-implement `cn`-like helpers locally; consolidate.

4. **Unused i18n keys** — after the big push, run a quick "key used?" audit; ~555 keys is a lot and some are likely orphaned.

5. **`MANUS_AI.md` at repo root** — confirm it's still relevant or remove from the build context.

---

## 🛡️ Security & Backend

1. Run `security--run_security_scan` — RLS coverage on user-scoped tables hasn't been re-validated since the recent schema additions.
2. `agent-command` and `oracle-chat` should rate-limit per user (currently rely on Lovable AI gateway only).
3. Confirm `verify_jwt` settings on each edge function in `supabase/config.toml` match intent (some public, some user-scoped).

---

## Suggested next sprint (pick 3–4)

A. Finish i18n on **History** + **Recommendations** detail
B. Split **BookBrain.tsx** + add route-level **ErrorBoundary**
C. Make **CommandPalette** a true global search
D. Add **JSON export/import** (true backup)
E. Add **session heatmap** on History

Tell me which bucket(s) to tackle first and I'll turn it into concrete tasks.
