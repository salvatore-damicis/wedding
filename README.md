# Sito Matrimonio — Salvatore & Martina 🍷

Sito statico multi-pagina (HTML/CSS/JS, nessun framework) + backend serverless
Azure Functions per gli spazi foto degli invitati. Tema vino.

- **Pagine**: Home (claim + card) · Luoghi & mappe · Tavoli (piantina della sala, ogni tavolo è una cantina) · Galleria (spazi degli invitati) · Giochi/quiz
- **Spazi foto**: ogni invitato crea uno spazio con *nickname + PIN*, carica le sue foto e vede quelle degli altri (dettagli in [`docs/adr/`](docs/adr/) e [`CONTEXT.md`](CONTEXT.md))

---

## Come far partire il progetto in locale

Ci sono **due modi**. Scegli in base a cosa vuoi fare.

### 🟢 Modo 1 — Solo frontend (veloce, senza backend)

Per lavorare su grafica, testi, countdown e quiz. Le foto vengono salvate solo
nel tuo browser (`localStorage`): **non** sono condivise tra dispositivi — va
benissimo per provare l'interfaccia.

**Requisiti:** solo [Node.js](https://nodejs.org/) (v18+).

```powershell
npm install        # una tantum
npm run serve      # avvia il sito
```

Apri **http://localhost:5173**

> In questo modo `data/config.js` deve avere `STORAGE.backend = "local"` (è il valore predefinito).

---

### 🔵 Modo 2 — Stack completo (frontend + API + storage reale)

Per provare *davvero* upload delle foto, PIN e condivisione tra spazi, usando
l'emulatore di Azure in locale (Azurite).

**Requisiti (una tantum):**

```powershell
# 1. Dipendenze del progetto e dell'API
npm install
npm run api:install

# 2. Azure Functions Core Tools v4 (globale)
npm install -g azure-functions-core-tools@4
```

**Attiva il backend reale:** in [`data/config.js`](data/config.js) imposta:

```js
export const STORAGE = {
  backend: "api",   // <-- cambia da "local" a "api"
  apiBase: "/api",
};
```

**Avvia tutto con un comando:**

```powershell
npm run dev
```

Questo lancia insieme tre cose: **Azurite** (emulatore storage), le **Azure
Functions** (`func start` sulla porta 7071) e la **Static Web Apps CLI**, che
serve il sito e inoltra `/api` alle Functions. Apri **http://localhost:4280**.

> ⚠️ **Perché tre processi e non due.** Con Node 20+ (qui v24) la SWA CLI si
> rifiuta di avviare le Functions da sé: *"Found Azure Functions Core Tools v4
> which is incompatible with your current Node.js"*. `func start` da solo invece
> funziona benissimo, quindi lo avviamo noi e diciamo alla SWA CLI di fare da
> proxy verso quella porta (`--api-devserver-url http://localhost:7071`).
> Non rimettere `--api-location api` a meno che non cambi la combinazione
> Node/CLI.

> ⚠️ Ricordati di rimettere `STORAGE.backend = "local"` se torni a lavorare
> senza backend, altrimenti il sito cercherà le API su `/api`.

#### PIN admin (sposi) in locale

Il PIN di moderazione per lo sviluppo locale è definito in
[`api/local.settings.json`](api/local.settings.json) → `ADMIN_PIN`
(valore attuale: `sposi-2026`). Con quel PIN puoi cancellare qualsiasi foto o
spazio. In produzione va impostato come *app setting* su Azure.

---

## Comandi disponibili (`npm run ...`)

| Comando | Cosa fa |
|---|---|
| `serve` | Serve solo il frontend statico su `:5173` (Modo 1) |
| `dev` | Avvia Azurite + Functions (`:7071`) + SWA CLI insieme (Modo 2) |
| `azurite` | Avvia solo l'emulatore storage Azurite |
| `api` | Avvia solo le Azure Functions (`func start`, porta 7071) |
| `swa` | Avvia solo la SWA CLI (sito + proxy `/api` verso `:7071`) |
| `api:install` | Installa le dipendenze dentro `api/` |

---

## Struttura del progetto (in breve)

```
index.html luoghi.html tavoli.html galleria.html spazio.html
giochi.html                Le pagine
css/style.css              Stili (design system a tema vino, mobile-first)
data/config.js             Contenuti (date, indirizzi, quiz) + scelta backend
js/                        Logica frontend (pagine, storage adapter, giochi)
api/                       Azure Functions (spazi foto, upload, moderazione)
docs/adr/  CONTEXT.md       Decisioni di architettura + glossario
```

Per i dettagli tecnici e le convenzioni vedi [`CLAUDE.md`](CLAUDE.md).

---

## Deploy su Azure (sintesi)

Il sito è pensato per **Azure Static Web Apps** (piano Free) + **Blob Storage**
per le foto + **Table Storage** per i metadati. In produzione servono queste
*app settings*: `STORAGE_CONNECTION`, `ADMIN_PIN`, `ALLOWED_ORIGIN` (il dominio
del sito). Vedi [`docs/adr/0003-azure-swa-blob-architecture.md`](docs/adr/0003-azure-swa-blob-architecture.md).
