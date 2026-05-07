# MANUS AI — Lexicon Mobile App Build Brief

> **Mission for Manus AI:** Take the existing **Lexicon** web app (a literary, "Penguin Classics meets digital" reading companion) and ship it as a production-ready, cross-platform **mobile application** (iOS + Android) that mirrors every feature of the web app, while honoring its editorial design language and offline-first instincts.
>
> This document is the single source of truth. Read it end-to-end before writing code.

---

## 0. TL;DR

- **Source app:** `https://lexiconn.lovable.app` (also `https://id-preview--c36edb32-fc78-4a61-b32c-1a94e45fdaf8.lovable.app`)
- **Stack today:** React 18 + Vite + TypeScript + Tailwind + shadcn/ui + Supabase (Lovable Cloud) + Supabase Edge Functions (Deno) + Lovable AI Gateway.
- **Target platform:** Native mobile via **Expo (React Native) + expo-router**, with a thin shared core (types, dossier logic, API clients) reused from the web codebase.
- **Backend reuse:** Keep the existing Supabase project (`gzmdgdfblbijvacscdcl`) and all 13 edge functions. **No backend rewrite.**
- **Output:** A signed, store-ready app (`.ipa` + `.aab`) with parity of the 13 web pages, plus mobile-native upgrades (haptics, offline cache, share sheet, push, biometric lock).

---

## 1. Product Definition

Lexicon is a **personal literary universe** for serious readers. It is *not* a Goodreads clone. The aesthetic is **editorial, library-like, slightly haunted** — Penguin Classics, NYRB, Faber spines on a dark parchment shelf.

### 1.1 Core pillars

1. **Shelf** — a 3D-feeling row of spines representing the user's library.
2. **Book Brain** — a deep page per book: rating, journal, quotes, emotional arc (0/25/50/75/100%), connections, AI dissection, suggested famous quotes, edition handoff, AI cover, AI spine, dossier.
3. **Memory Vault (History)** — every saved AI **dossier** for a book (one-liner, themes, ideas, characters, timeline, quotes, symbols, lessons, ending, twists). Generated on demand, extendable 1×/2×/3×, exportable to a beautifully laid-out PDF.
4. **Oracle** — an AI chat that knows the user's full library; supports persona, tone, model picker, reasoning depth, streaming + memory.
5. **Ritual** — a guided reading session timer with mood-before/after, surprise, thinking, energy.
6. **Quotes** — global quote board with shareable quote cards (image generation).
7. **Recommendations** — AI-driven, edition-aware (multi-language editions handed off into Book Brain).
8. **Review / Archive / Settings / Admin / Auth.**

### 1.2 Design language (must port verbatim)

- **Type:** Display = a literary serif (Playfair-like). Body = humanist serif. Mono = grotesque mono for "stamps" and metadata eyebrows.
- **Palette:** dark parchment background, ink foreground, primary = an old-gold / oxblood accent, muted ivory surfaces. All colors **HSL semantic tokens**, never hex in components.
- **Motifs:** gold rules, drop caps, "stamp" labels (`Dossier · A21Cdc`), spine textures (leather/cloth/paper), foil styles (gold/silver/none), italic serif captions.
- **Motion:** slow, dignified. No bouncy springs. Long fades, gentle parallax on the shelf.

> **Manus, do not redesign.** Port the look pixel-for-pixel within React Native idioms.

---

## 2. Current Web Architecture (what you are porting)

### 2.1 Frontend routes (`src/App.tsx`)

| Route | File | Purpose |
|---|---|---|
| `/auth` | `pages/Auth.tsx` | Email + Google sign-in via Supabase Auth |
| `/` | `pages/Shelf.tsx` | The 3D spine shelf, primary view |
| `/book/:id` | `pages/BookBrain.tsx` | Per-book deep view |
| `/review` | `pages/Review.tsx` | Year-in-review style aggregate |
| `/oracle` | `pages/Oracle.tsx` | AI chat (persona, model, depth) |
| `/ritual` | `pages/Ritual.tsx` | Reading session timer |
| `/quotes` | `pages/Quotes.tsx` | Global quote board |
| `/archive` | `pages/Archive.tsx` | Abandoned / finished archive |
| `/recommendations` | `pages/Recommendations.tsx` | AI recs + edition picker |
| `/history` | `pages/History.tsx` | **Memory Vault** of saved dossiers |
| `/settings` | `pages/Settings.tsx` | Theme, name, integrations |
| `/admin` | `pages/AdminPanel.tsx` | Admin-only |

### 2.2 Shared library (`src/lib/`)

- `types.ts` — `Book`, `ReadingInstance`, `Quote`, `JournalEntry`, `ArcCheckin`, `Connection`, `BookStatus`, `BookFormat`, `ResonanceTag`, `RelationshipType`. **Port unchanged.**
- `storage.ts` — `useLibrary()` hook abstracting localStorage + Supabase sync.
- `dossier.ts` — `loadDossier`, `saveDossierRemote`, `generateDossier`, `loadAllDossiers`, `extendDossier(passes: 1|2|3)`. Uses a `lexicon-dossier-change` window event for invalidation.
- `dossierPdf.ts` — jspdf + html2canvas PDF export of a dossier. **Replace with `expo-print` + HTML template.**
- `covers.ts` — `acquireCover()` cascade across OpenLibrary → Google Books → Gutendex → Internet Archive → LibraryThing → Wikipedia → Goodreads scrape → Bing Image → AI-generated fallback (opt-in).
- `openlibrary.ts` — metadata enrichment.
- `quoteCard.ts` — shareable image generation (html2canvas → png). **Replace with `react-native-view-shot`.**
- `auth.tsx` — `AuthProvider` wrapping Supabase auth.
- `theme.tsx` — dark/light theme provider.
- `goals.ts`, `progress.ts`, `history.ts`, `savedRecs.ts`, `shelfSettings.ts`, `adminSettings.ts`, `seed.ts`, `markdownExport.ts`, `goodreadsImport.ts`.

### 2.3 Backend — Supabase (Lovable Cloud)

**Project ref:** `gzmdgdfblbijvacscdcl`
**URL env:** `VITE_SUPABASE_URL` (mobile: `EXPO_PUBLIC_SUPABASE_URL`)
**Anon key env:** `VITE_SUPABASE_PUBLISHABLE_KEY` (mobile: `EXPO_PUBLIC_SUPABASE_ANON_KEY`)
Public anon key (safe to embed):
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd6bWRnZGZibGJpanZhY3NjZGNsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc4OTkxMjQsImV4cCI6MjA5MzQ3NTEyNH0.wVoeJp5Z41uXIPf0EDzcBjEI1_dRtlViX2tiEHy70OE
```

#### 2.3.1 Tables (with RLS — `auth.uid() = user_id` on every row)

**`public.books`**
```
id uuid pk default gen_random_uuid()
user_id uuid not null fk auth.users on delete cascade
title text not null
author text not null
year int
language text
original_language text
isbn text
cover_url text
cover_source text   -- 'openlibrary'|'google'|'gutendex'|'internetarchive'|'librarything'|'wikipedia'|'uploaded'|'ai-generated'|'none'
spine_color text
spine_texture text  -- 'leather'|'cloth'|'paper'
spine_width int
spine_height int
foil_style text     -- 'gold'|'silver'|'none'
status text not null default 'want'        -- want|reading|rereading|finished|abandoned
format text not null default 'physical'    -- physical|ebook|audiobook|dual
tags text[] not null default '{}'
ai_tags text[] not null default '{}'
how_i_found text
is_fiction bool
pages int
changed_how_i_think bool
connections jsonb not null default '[]'
instances jsonb not null default '[]'
added_at timestamptz not null default now()
last_opened_at timestamptz
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
spine_url text
spine_generated_at timestamptz
goodreads_id text
-- indexes: (user_id), (user_id,status), unique partial (user_id,goodreads_id) where goodreads_id is not null
```

**`public.book_dossiers`**
```
id uuid pk
user_id uuid not null
book_id text not null   -- note: text (matches client-generated ids)
title text not null
author text not null
dossier jsonb not null
generated_at timestamptz not null default now()
extended_at timestamptz
extension_count int not null default 0
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
-- unique (user_id, book_id), index (user_id, book_id)
```

**`public.profiles`**
```
id uuid pk
user_id uuid not null unique fk auth.users
display_name text
avatar_url text
goodreads_user_id text
goodreads_url text
goodreads_last_synced_at timestamptz
goodreads_sync_enabled bool not null default true
```

**`public.app_config`** — admin-managed key/value flags.

All four tables already have proper RLS. **Do not modify schemas from the mobile client.**

#### 2.3.2 Edge functions (Deno) — call via `supabase.functions.invoke(name, { body })`

| Function | Purpose | Input shape |
|---|---|---|
| `oracle` | Modes: `dissection`, generic chat. | `{ mode, book?, messages? }` |
| `oracle-chat` | Streaming chat with persona/tone/model/depth + library context. | `{ messages, persona, tone, model, depth, libraryContext }` |
| `book-dossier` | Generate or extend the structured dossier JSON. | `{ title, author, year, mode: 'create'|'extend', existing? }` |
| `book-quotes` | Famous quotes for a book. | `{ title, author, year, count }` |
| `book-editions` | Multilingual editions. | `{ title, author }` |
| `enrich-book` | AI metadata: isFiction, tags. | `{ title, author, subjects? }` |
| `generate-cover` | AI cover (style, palette, mood, typography, imagery, extra). | `{ title, author, year, hint, style, palette, mood, typography, imagery, extra }` |
| `generate-spine` | AI 2D spine artwork. | `{ bookId, title, author, pages, coverUrl }` |
| `quote-card` | Shareable quote image. | `{ quote, book, theme }` |
| `agent-brain` / `agent-command` | Internal librarian agent. | varies |
| `goodreads-sync` | Import a public Goodreads shelf. | `{ goodreadsUrl }` |
| `ritual-coach` | Coaching prompts for the reading timer. | `{ moodBefore, energy, etc. }` |

All functions deploy with `verify_jwt = false` (already configured) and use the **Lovable AI Gateway** (no user-supplied API key needed). Mobile must keep calling them through `supabase.functions.invoke`.

---

## 3. Mobile App Spec — what Manus must build

### 3.1 Stack decision

- **Expo SDK (latest LTS)**, **React Native**, **TypeScript strict-ish (match web's relaxed `tsconfig`)**.
- **Routing:** `expo-router` (file-based), mirroring the web routes.
- **Styling:** **NativeWind v4** (Tailwind for RN) + **shadcn-style** primitives (use `@rn-primitives/*` or `react-native-reusables`).
- **Data:** `@tanstack/react-query` (already in web), `@supabase/supabase-js` v2, AsyncStorage adapter for session persistence.
- **State:** keep the small Zustand-free pattern from web (`useLibrary`, `useSavedRecs`, etc.). Re-implement on top of `@react-native-async-storage/async-storage` + Supabase.
- **PDF export:** `expo-print` rendering an HTML template (port of `dossierPdf.ts`).
- **Image share:** `react-native-view-shot` + `expo-sharing`.
- **Auth:**
  - Email/password via Supabase.
  - Google sign-in via `expo-auth-session` (Web flow) **or** native `@react-native-google-signin/google-signin` for iOS/Android. Use Supabase's `signInWithIdToken({ provider: 'google', token })`.
- **Push:** `expo-notifications` + a small Edge Function `send-push` (out of scope for v1 unless time allows).
- **Biometric lock:** `expo-local-authentication` gating app entry (opt-in in Settings).
- **Haptics:** `expo-haptics` on rating change, finished-book stamp, dossier saved.
- **Offline:** React Query persistence (`@tanstack/query-async-storage-persister`) + an outbox pattern for book mutations while offline (queue → flush on reconnect).
- **Fonts:** load via `expo-font`. Match the web's display + body + mono triad.
- **Deep linking:** scheme `lexicon://` and Universal Links `https://lexiconn.lovable.app/*` so dossier shares open the app.

### 3.2 Project layout

```
lexicon-mobile/
├── app/                          # expo-router
│   ├── _layout.tsx               # ThemeProvider + AuthProvider + QueryClient + Toaster
│   ├── (auth)/sign-in.tsx
│   ├── (tabs)/_layout.tsx        # bottom tab nav
│   ├── (tabs)/index.tsx          # Shelf
│   ├── (tabs)/oracle.tsx
│   ├── (tabs)/quotes.tsx
│   ├── (tabs)/history.tsx        # Memory Vault
│   ├── (tabs)/settings.tsx
│   ├── book/[id].tsx             # Book Brain
│   ├── review.tsx
│   ├── ritual.tsx
│   ├── archive.tsx
│   ├── recommendations.tsx
│   └── admin.tsx                 # gated by has_role(admin)
├── src/
│   ├── components/               # SpineRow, FlatBookCover, RatingDial, EmotionalArc, AICoverSheet, AddBookSheet, LibrarianAgent, CommandPalette (RN-friendly), PageHeader, TodayBar, NavLink, AppSidebar (drawer)…
│   ├── lib/                      # 1:1 port of src/lib/* (covers, dossier, types, openlibrary, storage, etc.)
│   ├── integrations/supabase/    # client.ts, types.ts (regen via `supabase gen types`)
│   ├── theme/                    # tokens, fonts, semantic colors
│   └── hooks/
├── assets/                       # fonts, splash, adaptive icon
├── app.config.ts                 # expo config (scheme, plugins, env)
├── eas.json                      # build profiles: development, preview, production
├── babel.config.js               # nativewind, expo-router, reanimated/worklets
├── tailwind.config.ts            # mirror web's HSL semantic tokens
├── global.css                    # NativeWind base
├── tsconfig.json
└── package.json
```

### 3.3 Bottom tabs (mobile-native nav)

1. **Shelf** (home)
2. **Vault** (`history`)
3. **Oracle** (center, raised, primary-tinted)
4. **Quotes**
5. **More** (drawer → Ritual, Review, Archive, Recommendations, Settings, Admin)

Book Brain, Auth, Admin are stack screens, not tabs.

### 3.4 Page-by-page parity

#### Shelf
- Horizontal scroll of spines (port `BookSpine` to RN with `react-native-reanimated` for tilt). Long-press → preview sheet. Tap → `book/[id]`.
- "Today bar" pinned to top with current goal + streak (`goals.ts`, `progress.ts`).
- FAB → `AddBookSheet` (port `AddBookDrawer.tsx`) with search OpenLibrary, ISBN scan via `expo-camera` + `expo-barcode-scanner` (**mobile upgrade**).
- Filters: status, format, tags. Use a bottom sheet (`@gorhom/bottom-sheet`).

#### Book Brain
- Hero cover + spine swatch, metadata, status chips.
- Action row: **Improve details · Generate dossier · Delete · AI cover (when none) · Generate spine**.
- Tabs: *Notes · Quotes · Arc · Connections · AI · Editions*.
- Ratings: port `RatingDial` to a gesture-driven RN component (`react-native-gesture-handler` + reanimated).
- Emotional arc: port `EmotionalArc` to `react-native-svg`.
- AI Cover sheet: port `AICoverDialog.tsx` (chips for style/palette/mood/typography/imagery + extra textarea). **Opt-in only — never auto-generate.**
- Edition handoff banner (from Recommendations) preserved.

#### Memory Vault (History)
- List of saved dossiers (`loadAllDossiers`).
- Sort: recently composed / recently extended / by author.
- Detail view = the same long-form layout as web (sticky TOC on tablet, drop-cap summary, themes, numbered ideas, character cards, timeline, pull quotes, symbols, lessons, discussion questions, criticisms, "if you liked", spoiler-protected ending + twists).
- **1×/2×/3× extend** segmented control with progress: "Extending pass 2/3…".
- **PDF export** via `expo-print` → share sheet. Files saved to `FileSystem.documentDirectory + 'dossiers/'`.
- Deep link `lexicon://history?open=<bookId>`.

#### Oracle
- Streaming chat using `oracle-chat`. Use `EventSource` polyfill or `fetch` ReadableStream via `expo/fetch`.
- Persona picker (Borges, Sontag, Calvino, custom), tone slider, model picker (`google/gemini-2.5-flash`, `google/gemini-2.5-pro`, `openai/gpt-5-mini`, `openai/gpt-5`), reasoning depth (1–5).
- Library context toggle: when on, send compact JSON of titles/tags/quotes.
- Memory: persist threads in AsyncStorage; one current "session" + named saved threads.

#### Ritual
- Big timer, mood-before / energy sliders, post-session: mood-after, surprise, thinking. Submits a `ReadingSession` into the active book's instance.
- Background timer via `expo-task-manager` or local notifications.

#### Quotes
- Grid of all quotes across books. Tap → quote card preview, share via `expo-sharing` (use `react-native-view-shot` to capture).

#### Recommendations
- Form: vibe, recent loves, avoid. POSTs to AI; returns titles + multilingual editions.
- Edition picker → handoff into Book Brain (sessionStorage equivalent = a small AsyncStorage key `pending-edition-<bookId>`).

#### Settings
- Theme dark/light (default dark).
- Display name, avatar.
- Goodreads integration toggle.
- Biometric lock toggle (mobile-native).
- Sign out, delete account.

#### Admin
- Gated by `has_role(auth.uid(), 'admin')`. If your project does not yet have a `user_roles` table, **create one** following the security pattern below.

### 3.5 Cover acquisition cascade (port `covers.ts` exactly)

Order, all free sources, last is opt-in AI:

1. **OpenLibrary** `https://covers.openlibrary.org/b/isbn/{isbn}-L.jpg` → also `/title` lookup.
2. **Google Books** `https://www.googleapis.com/books/v1/volumes?q=...` → `imageLinks.thumbnail` (upgrade `zoom=0`, https).
3. **Gutendex** `https://gutendex.com/books/?search=...` → `formats['image/jpeg']`.
4. **Internet Archive** `https://archive.org/advancedsearch.php?...` → `__ia_thumb.jpg`.
5. **LibraryThing** cover service.
6. **Wikipedia** REST → page summary `originalimage`.
7. **Goodreads** scrape (book page `og:image`).
8. **Bing Image** search (book + "cover").
9. **AI-generated** (`generate-cover` edge function) — only when user taps the button in `AICoverSheet`.

Each source must return `{ url, source }` and the cascade short-circuits on first success. Validate the URL responds 200 with `image/*` content-type before accepting.

---

## 4. Authentication & Security

- Use Supabase email/password + Google.
- **Never** store tokens in plain AsyncStorage on iOS sensitive flows — use `expo-secure-store` for the refresh token if you implement biometric lock; otherwise the default `@supabase/supabase-js` AsyncStorage adapter is fine.
- **RLS:** every table is already locked to `auth.uid() = user_id`. Mobile must always be authenticated before reading/writing.
- **Roles:** if admin features land, add a separate `user_roles` table and `has_role(uuid, app_role)` SECURITY DEFINER function — **never** store roles on `profiles` (privilege escalation risk).
- **Secrets:** none ship in the app. The Lovable AI Gateway key lives only in edge function env. Don't add it to the mobile bundle.

---

## 5. Offline & sync strategy

- React Query with `persistQueryClient` + AsyncStorage persister. `staleTime: 60_000`, `gcTime: 5*60_000`, `refetchOnWindowFocus: false` (match web).
- **Outbox queue** for `books` mutations: write optimistically to AsyncStorage, attempt Supabase write, retry on `NetInfo` reconnect.
- Dossiers: read-through cache keyed by `bookId`; the `lexicon-dossier-change` event becomes a `mitt`/`EventEmitter` instance shared in `src/lib/events.ts`.
- Cover URLs cached on disk via `expo-image` (built-in disk cache).

---

## 6. Build, release, CI

### 6.1 Environments

```
.env (gitignored) and app.config.ts → process.env
EXPO_PUBLIC_SUPABASE_URL=https://gzmdgdfblbijvacscdcl.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon key from §2.3>
EXPO_PUBLIC_APP_ENV=production
```

### 6.2 EAS

```jsonc
// eas.json
{
  "cli": { "version": ">= 13.0.0" },
  "build": {
    "development": { "developmentClient": true, "distribution": "internal", "ios": { "simulator": true } },
    "preview":     { "distribution": "internal", "channel": "preview" },
    "production":  { "channel": "production", "autoIncrement": true }
  },
  "submit": { "production": {} }
}
```

### 6.3 Store metadata

- **iOS bundle id:** `app.lovable.lexicon`
- **Android package:** `app.lovable.lexicon`
- **Display name:** Lexicon
- **Category:** Books
- **Screenshots:** Shelf, Book Brain (with cover + quote), Memory Vault dossier (with drop cap), Oracle chat, AI cover sheet.
- **Privacy:** declare data collected = email + user content (books, quotes, journal). No tracking, no ads.

### 6.4 CI (GitHub Actions)

- Lint + typecheck on PR.
- `eas build --platform all --profile preview` on `main`.
- Manual `eas submit` on tagged release.

---

## 7. Acceptance criteria (definition of done)

A release is shippable only when **all** of these pass:

- [ ] Sign-up, sign-in (email + Google), sign-out, password reset.
- [ ] Add a book by ISBN scan; cover resolves through the cascade in §3.5.
- [ ] Edit a book's status, format, tags, rating; survives offline → online.
- [ ] Open Book Brain; rate, journal, quote, set arc points, draw a connection.
- [ ] Improve details → metadata enriched.
- [ ] Generate dossier → saved to Memory Vault → opens with stable layout.
- [ ] Extend dossier 2× → progress shown → `extension_count` increments correctly.
- [ ] Export dossier as PDF → share sheet → file readable in Books / Drive.
- [ ] AI cover sheet generates only when user taps; result persists.
- [ ] Oracle chat streams tokens, persona/tone/model/depth all functional.
- [ ] Quote card renders and shares as PNG with editorial layout.
- [ ] Recommendations → edition picker → handoff prefills target book.
- [ ] Memory Vault sort + filter; deep link `lexicon://history?open=<id>` opens the right dossier.
- [ ] Biometric lock works on iOS Face ID and Android fingerprint.
- [ ] App passes Apple ATT + Privacy Nutrition + Google Data Safety reviews.
- [ ] No raw hex colors in components — all semantic HSL tokens.
- [ ] Lighthouse-equivalent: cold start < 2.5s on a mid-tier Android.

---

## 8. Phased plan for Manus

### Phase 0 — Bootstrap (½ day)
1. `npx create-expo-app@latest lexicon-mobile -t expo-template-blank-typescript`
2. Install: `expo-router nativewind tailwindcss @supabase/supabase-js @tanstack/react-query @tanstack/query-async-storage-persister @react-native-async-storage/async-storage expo-secure-store expo-font expo-image expo-print expo-sharing expo-haptics expo-local-authentication expo-camera expo-barcode-scanner expo-notifications react-native-reanimated react-native-gesture-handler react-native-svg @gorhom/bottom-sheet react-native-view-shot mitt date-fns lucide-react-native`
3. Configure NativeWind + Reanimated + expo-router in `babel.config.js`.
4. Generate Supabase types: `npx supabase gen types typescript --project-id gzmdgdfblbijvacscdcl > src/integrations/supabase/types.ts`.

### Phase 1 — Theme + Auth (1 day)
- Port `tailwind.config.ts` HSL tokens.
- Load fonts.
- Build `AuthProvider`, sign-in / sign-up screens, Google OAuth.
- Gate `(tabs)` group behind auth.

### Phase 2 — Library core (2 days)
- Port `types.ts`, `storage.ts`, `seed.ts`.
- Build `Shelf` + `BookSpine` + `AddBookSheet`.
- ISBN scanner. Cover cascade (§3.5) excluding AI fallback.

### Phase 3 — Book Brain (2 days)
- All tabs, RatingDial, EmotionalArc, journal, quotes, connections.
- Improve details, AI cover sheet, generate spine.

### Phase 4 — Dossier + Vault (1.5 days)
- Port `dossier.ts` + `extendDossier`.
- Memory Vault list + detail.
- PDF export via `expo-print`.

### Phase 5 — Oracle (1 day)
- Streaming chat, persona/model/depth, library context, saved threads.

### Phase 6 — Ritual, Quotes, Recommendations, Review, Archive, Settings, Admin (2 days)

### Phase 7 — Mobile-native upgrades (1 day)
- Biometric lock, haptics, push (optional v1.1), deep linking, share extension.

### Phase 8 — Polish, store assets, EAS submit (1 day)

**Total: ~10 working days for one senior RN dev.**

---

## 9. Non-goals (do not do)

- Do **not** rewrite the backend. Reuse the Supabase project as-is.
- Do **not** add a paid AI key. Lovable AI Gateway is the only LLM path.
- Do **not** redesign the visual language. Editorial / Penguin-Classics aesthetic is the brand.
- Do **not** introduce a separate web app. The existing one stays canonical.
- Do **not** auto-trigger AI cover, AI spine, or dossier generation. Always opt-in.
- Do **not** weaken RLS or move roles onto `profiles`.
- Do **not** ship analytics SDKs without explicit user consent.

---

## 10. Reference index

- Web preview: https://id-preview--c36edb32-fc78-4a61-b32c-1a94e45fdaf8.lovable.app
- Web production: https://lexiconn.lovable.app
- Lovable Project ID: `c36edb32-fc78-4a61-b32c-1a94e45fdaf8`
- Supabase Project ref: `gzmdgdfblbijvacscdcl`
- Edge functions list: §2.3.2
- Tables: §2.3.1
- Cover cascade: §3.5
- Acceptance: §7

---

**End of brief.** When you (Manus) finish, deliver: the Expo repo, an internal-distribution build per platform, store-ready binaries, screenshots, and a one-page changelog mapping each web feature to its mobile screen.
