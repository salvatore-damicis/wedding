# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Wedding website for **Salvatore & Martina** (12 September 2026), Italian-language, wine-themed (their motif is a red-wine watercolor stain — logo in `assets/img/logo-sm.png`, source art in `pre_immagini/`). **Multi-page static frontend** (no framework, no build) + a small **Azure Functions** backend for the shared photo galleries. There is intentionally **no RSVP feature** — do not add one.

The design decisions and their rationale are recorded in `docs/adr/` and the domain glossary in `CONTEXT.md`. **Read those first** — they explain the *why* behind the structure below.

## Architecture — the parts that span files

### Frontend (static, multi-page — ADR-0001)
Each user-facing page is its own HTML file: `index.html` (hero + countdown + claim + hub cards; `?admin` = Sposi set the wedding date that drives the countdown, with an expiry preview — persisted in `settings.weddingDate`), `luoghi.html` (venues + maps + transfer connector), `tavoli.html` (the seating-plan page: SVG sala + tavoli, alphabetical cantina list, detail card, and a full `?admin` editor; see `CONTEXT.md` for *Tavolo* / *Cantina*), `galleria.html` (list of guest spaces; gated by `settings.galleriaAttiva` — while off, guests see the section but cannot create spaces or upload, and the couple open it from here — and by `settings.galleriaBloccata`, an independent read-only "freeze" that keeps every space/photo visible but suspends new spaces and uploads; `?admin` = Sposi moderation: activation toggle + read-only toggle + delete whole spaces), `spazio.html?nick=X` (one guest's space + upload/lightbox, also gated by `settings.galleriaAttiva`/`galleriaBloccata`; `?admin` = Sposi moderation: delete any photo + reset the space PIN (forgotten-PIN recovery, photos kept) + delete the whole space), `giochi.html` (the **live host-paced quiz**; `?admin` = Sposi authoring + conducting — ADR-0005). Every page:
- carries `<meta name="robots" content="noindex">` (guest photos must not be indexed),
- has `<div id="site-nav"></div>` / `<div id="site-footer"></div>` placeholders filled by `js/partials.js` (nav/footer live in ONE place, not duplicated across 5 files),
- loads exactly one entry module from `js/pages/<page>.js`, which imports shared modules.

**Content is centralized in `data/config.js`** (`WEDDING` object: names, date, addresses, maps queries, quiz). Never hardcode these in HTML/JS — edit `config.js`. Note `WEDDING.date` uses a 0-based month (`8` = September).

### Photo storage — the swappable seam (ADR-0002, ADR-0003)
The single most important abstraction. The whole UI talks ONLY to the `storage` object from `js/storage/adapter.js`, via this interface (all async):
```
listSpaces()                     -> Space[]  { nickname, coverUrl, photoCount }
getSpace(nickname)               -> { nickname, photos: Photo[] }
createOrEnter(nickname, pin)     -> { ok, isNew, reason? }
uploadPhoto(nickname, pin, file) -> Photo    { id, url, name, uploadedAt }
deletePhoto(nickname, pin, id)   -> void
deleteSpace(adminPin, nickname)  -> void
resetPin(adminPin, nickname, newPin) -> void   // Sposi: reimposta il PIN di uno spazio (foto intatte)
```
`adapter.js` picks the implementation from `STORAGE.backend` in `data/config.js`:
- **`local`** → `js/storage/local-adapter.js`: photos as data-URLs in `localStorage`, single browser, no backend. For fast UI/style work. ⚠️ Cross-guest sharing does NOT work here — it's one browser.
- **`api`** → `js/storage/api-adapter.js`: calls the Azure Functions at `/api`. Real shared behaviour. Uploads use a **SAS direct to Blob** (see below).

**When wiring/testing the real backend, flip `STORAGE.backend` to `"api"`.** Nothing else in the UI changes.

### Domain model — spaces, not albums (ADR-0002)
The gallery is **per-guest spaces**, not thematic albums. A guest creates a **Space** by choosing a **nickname** (public) + **PIN** (secret). Rules: write only your own space (PIN-gated), read all spaces. Same nickname + correct PIN = re-enter; wrong PIN = denied; new nickname = create — `createOrEnter` unifies "login" and "create". The **couple** hold an admin PIN that can delete any photo/space and reset a space's PIN (moderation + PIN recovery: the soft path is `resetPin`, which sets a new PIN and keeps the photos; the hard path is `deleteSpace` — admin wipes, guest recreates). The unlocked-PIN "session" is remembered per device in `localStorage` via `js/session.js` (a convenience, not security — the backend re-checks the PIN on every write). "Esci dal mio spazio" clears it. Use the glossary terms in `CONTEXT.md` (Spazio, Nickname, PIN, Invitato, Sposi) — avoid "album"/"account"/"login".

### Table map — the second seam (ADR-0004)
The seating plan has its **own** seam, `js/tavoli/adapter.js`, deliberately NOT part of `storage`: photos are written by *guests* with their own PIN, the map only by the *couple* with the admin PIN. Same shape, same `STORAGE.backend` switch:
```
getMap()                   -> { sala, tavoli: Tavolo[], cantine: Cantina[] }
saveMap(adminPin, map)     -> void        (couple only)
verifyAdmin(adminPin)      -> boolean     (validate BEFORE entering edit mode)
getSettings()              -> { giochiAttivi: boolean, weddingDate: string|null, galleriaAttiva: boolean, galleriaBloccata: boolean }
saveSettings(adminPin, s)  -> void        (couple only; merges per present field)
```
`WEDDING.tavoliSeed` in `data/config.js` is a **seed**, not a second source of truth: it applies only while the backend has no saved map (`getMap` → `map: null`). Logos resolve in this order (`logoSrc` in `js/tavoli/view.js`): an uploaded `cantina.logoUrl` (Blob in `api` mode, data-URL in `local` mode, set via the editor's logo upload) → the static convention file `assets/img/cantine/<slug(nome)>.png` → initials. So the convention file is now a *fallback*, not the only source (see ADR-0004's superseding note). Coordinates are abstract, isotropic room units (`sala.w` × `sala.h`); the sala is an SVG, each tavolo an HTML `<button>` positioned in %.

### Backend (`api/` — Azure Functions Node v4, ADR-0003)
One HTTP function per file in `api/src/functions/`, all sharing `api/src/shared/storage.js` (Table + Blob clients, scrypt PIN hashing, SAS generation, site-document helpers, `ensureInit` for tables/container/CORS). Metadata in **Azure Table Storage** (`spaces`, `photos`, `site` tables); image bytes in **Azure Blob Storage** (`photos` container, public read). The storage key never reaches the browser: `requestUpload` verifies the PIN and returns a short-lived SAS, the browser PUTs the file straight to Blob, then `confirmUpload` records metadata. The admin PIN is the `ADMIN_PIN` env var (server-side only) — `getMap`/`saveMap`/`verifyAdmin`/`getSettings`/`saveSettings` use it, and `saveMap` **re-sanitizes** the whole map server-side (clamped coordinates, capped lengths, `http(s)`-only `sito`).

## Running locally

Frontend-only (LocalAdapter, `STORAGE.backend="local"`) — no backend needed:
```powershell
npm install          # first time (dev tooling)
npm run serve        # http://localhost:5173
```

Full stack (real API against the Azurite emulator — set `STORAGE.backend="api"` in data/config.js):
```powershell
npm install          # root dev tooling: swa-cli, azurite, concurrently
npm run api:install  # installs api/ dependencies
npm run dev          # Azurite + `func start` (port 7071) + SWA CLI proxying to it
# open http://localhost:4280
```
Requires **Azure Functions Core Tools v4** installed globally (`func`). Azurite emulates Blob+Table. The same Function code runs against real Azure in production — only the `STORAGE_CONNECTION` in `api/local.settings.json` (Azurite) vs Azure app settings differs.

⚠️ **Why `dev` starts `func` itself**: on **Node 20+ (here v24)** the SWA CLI refuses to launch the Functions host (*"Found Azure Functions Core Tools v4 which is incompatible with your current Node.js"*) — but `func start` alone runs fine. So the scripts split the job: `npm run api` runs the Functions host, and `npm run swa` is `swa start . --api-devserver-url http://localhost:7071`, which proxies `/api` to the already-running host instead of spawning its own. Don't "fix" the scripts back to `--api-location api` unless the CLI/Node combination changes. The `api` script first runs `node scripts/wait-azurite.mjs`: under `concurrently`, `func` and Azurite launch together and the Functions host aborts (`Value cannot be null. (Parameter 'provider')`) if it reaches storage before Azurite has bound its ports. The script waits for Azurite's Table port (10002) to accept connections before `func start` — a fixed sleep isn't enough because Azurite's first run (fresh `.azurite/`) can take longer than any guess.

There is no test suite or linter.

## Conventions

- **Language: Italian** for all user-facing copy.
- **Styling** is a token-based design system in `css/style.css`: wine palette + fonts as `:root` custom properties (`--wine-deep`, `--rose`, `--font-script`, …). Reuse tokens; don't introduce new hex values. **Mobile-first**: base rules target phones, `@media (min-width: …)` scales up — preserve that ordering.
- Fonts: **`Gistesy`** (self-hosted from `assets/fonts/Gistesy.ttf`, the partecipazione's signature script) is the `--font-script` role — used for the hero names, the brand, and **all `.section-title` headings on every page**; `Great Vibes` (Google Fonts) is its fallback. `Poppins` (sans — body/UI). Gistesy has a single normal weight: `body { font-synthesis: none }` plus explicit `font-weight: 400` on script headings prevent faux-bold (h1/h2 are bold by default). `Cormorant Garamond` (serif) remains available for numeric/serif bits (e.g. countdown).
- **Decorations**: none currently. Grape/wine decorative art will be added later from images the couple provide (the earlier auto-generated grape SVGs were removed). When adding, prefer the CSS-only approach (pseudo-elements on existing classes, `pointer-events:none`, responsive, `prefers-reduced-motion`-aware) so no per-page HTML changes are needed.
- New feature module → export one `init*(…)` function; the page's `js/pages/*.js` entry passes in DOM nodes and wires it. New game → `js/games/`, same shape, its own section/page.
- `api/local.settings.json` holds the local `ADMIN_PIN` and is git-ignored — don't commit it. Set the real `ADMIN_PIN`, `STORAGE_CONNECTION`, `ALLOWED_ORIGIN` as Azure app settings in production.

## Directory map

```
index.html luoghi.html tavoli.html galleria.html spazio.html giochi.html   Pages (ADR-0001)
css/style.css              Design tokens + all styles (mobile-first)
data/config.js             WEDDING content + STORAGE backend switch
js/partials.js             Injected nav/footer
js/session.js              Per-device remembered PIN ("session")
js/ui.js                   toast() + wireMaps()
js/pages/*.js              One entry module per page
js/countdown.js            Countdown feature
js/games/quiz.js           Quiz game
js/storage/adapter.js      Photo seam — selects implementation from config
js/storage/local-adapter.js  localStorage impl (no backend)
js/storage/api-adapter.js    /api impl (SAS direct-to-Blob upload)
js/tavoli/adapter.js       Table-map seam (ADR-0004), same shape, same switch
js/tavoli/local-adapter.js   localStorage impl, seeded from config
js/tavoli/api-adapter.js     /api impl (getMap/saveMap/verifyAdmin/settings)
js/tavoli/view.js          Piantina (SVG sala + button tavoli) + elenco + scheda
assets/img/cantine/        Logos by convention slug(nome).png — see its README
api/src/functions/*.js     One Azure Function per endpoint
api/src/shared/storage.js  Table/Blob/PIN/SAS helpers
staticwebapp.config.json   Azure Static Web Apps routing + noindex header
docs/adr/                  Architecture Decision Records — read these
CONTEXT.md                 Domain glossary
pre_immagini/              Original logo + partecipazione (style reference)
```
