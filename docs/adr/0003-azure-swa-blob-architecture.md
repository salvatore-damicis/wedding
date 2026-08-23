# Architettura Azure: Static Web Apps + Functions + Blob + Table

Deploy su **Azure Static Web Apps** (free tier): serve il frontend statico multi-pagina e ospita le **Azure Functions** gestite sotto `/api/...`. Le foto vivono in **Azure Blob Storage** (object storage); i metadati (spazi, nickname, PIN, elenco foto) in **Azure Table Storage**. Scelto come soluzione più economica che soddisfa i requisiti: SWA include gratis le Functions necessarie a scrivere sull'object storage senza esporre la chiave dell'account e a verificare il PIN lato server. Costo a regime ~€0 + pochi centesimi di Blob.

## Meccanismo di lettura/scrittura

- **Scrittura (upload):** la Function verifica il PIN, registra i metadati e rilascia un **SAS a breve scadenza**; il browser carica il file **direttamente sul Blob** (i byte non passano dalla Function → meno esecuzioni/banda = più economico). Richiede regola CORS sullo storage.
- **Lettura (visualizzazione):** container Blob con **lettura pubblica** a livello di blob; le foto si vedono via URL diretto senza chiamare la Function (più economico). Coerente col fatto che il sito è pubblico (con `noindex`).

## Parità locale (requisito esplicito)

Lo stack gira interamente in locale con lo stesso codice: **Azurite** (emulatore Blob+Table, `UseDevelopmentStorage=true`) + **Azure Functions Core Tools** (`func start`) + **Static Web Apps CLI** (`swa start`, proxy verso `/api`). Solo la connection string della Function cambia tra locale (Azurite) e produzione (Blob/Table reali); il frontend non cambia.

## Adapter frontend (dual, selezionabile da flag in config)

Il seam `js/storage/adapter.js` espone due implementazioni della stessa interfaccia, scelte da una riga in config:
- **`LocalAdapter`** — `localStorage`, zero dipendenze, per ritocchi rapidi di UI senza avviare lo stack.
- **`ApiAdapter`** — chiama `/api/...`, percorso reale (locale via Azurite, o produzione).

## Considered Options

- **Azure Storage static website da solo** — scartato: nessun codice server, costringe a container pubblico in scrittura (chiunque cancella) o comunque a una Function App separata.
- **App Service / container sempre-attivo** — scartato: costo fisso (~€13/mese), sproporzionato.
- **Function come proxy dell'upload** — scartato a favore del SAS diretto per costo/scalabilità sulle immagini.
