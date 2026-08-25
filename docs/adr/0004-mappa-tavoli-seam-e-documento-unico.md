# Mappa dei tavoli: seam separato, documento unico, seme in config

La piantina della sala (Tavoli e Cantine — vedi `CONTEXT.md`) è un dato di natura diversa dalle foto: **uno solo per tutto il sito**, **letto da tutti**, **scritto solo dagli Sposi** con il PIN admin, e modificabile dal browser fino all'ultimo minuto. Tre decisioni conseguenti, prese insieme perché si sostengono a vicenda.

## 1. Un seam parallelo, non l'estensione di `storage`

`js/tavoli/adapter.js` espone la propria interfaccia (`getMap`, `saveMap`, `verifyAdmin`, `getSettings`, `saveSettings`) con le stesse due implementazioni selezionate dallo stesso `STORAGE.backend` di `js/storage/adapter.js`: `LocalTavoliAdapter` (localStorage) e `ApiTavoliAdapter` (`/api`).

Perché non aggiungere i metodi a `storage`: le foto le scrivono gli **Invitati** con il proprio PIN, la mappa **solo gli Sposi** con il PIN admin. Mescolare le due cose in un'unica interfaccia costringe chi la legge a ricordare quali metodi vogliono quale PIN, e obbliga l'implementazione localStorage delle foto a sapere cos'è un tavolo. Il costo accettato è un secondo seam da imparare — mitigato dal fatto che ha **la stessa forma** del primo.

## 2. Un documento unico in Table Storage, non una riga per tavolo

Tabella `site`, `PartitionKey="site"`, `RowKey="map"` (e `"settings"` per le impostazioni), con tutto il JSON in una proprietà stringa (limite 64 KB, guardia a 60 KB in `putSiteDoc`).

L'editor salva sempre **tutta la mappa insieme**: spostare tre tavoli e rinominare una cantina è una sola transazione logica. Con una riga per tavolo sarebbero N scritture: se la connessione cade a metà — su un telefono, la sera prima — resta mezza mappa salvata. E non ci sono query da fare sui tavoli: solo *leggi tutto* / *scrivi tutto*, quindi un modello relazionale sarebbe complessità senza ritorno.

**Scritture concorrenti: l'ultimo che salva vince**, senza ETag né lock. Gli Sposi sono due e condividono il PIN: difendersi dal caso "spostano tavoli nello stesso minuto da due telefoni" costa più di quanto valga.

## 3. `config.js` è il seme, non una seconda fonte di verità

`WEDDING.tavoliSeed` vale **solo finché il backend non ha una mappa salvata** (`getMap` risponde `map: null` → l'adapter ricade sul seme). Dal primo salvataggio degli Sposi in poi la verità è il documento nel backend e il seme è documentazione storica.

Serve perché la vista deve funzionare **prima** che esista qualsiasi backend (modalità `local`, `npm run serve`) e perché l'editor deve avere 14 cerchi da spostare al primo avvio.

## Conseguenze accettate

- **Contenuti delle cantine nel backend.** Nome, zona, vitigni e sito sono editabili dall'editor, quindi vivono nel documento salvato: correggere un nome dopo il primo salvataggio si fa dal browser, non da `config.js`.
- **I loghi restano file statici** in `assets/img/cantine/`, agganciati per convenzione (`slug(nome) + ".png"`, fallback iniziali). Non sono nel documento: richiedono ritaglio manuale e non cambiano all'ultimo minuto. Rinominare una cantina dall'editor scollega il logo — visibile subito, si corregge rinominando il file.

  > **Superato (workstream "terminare il sito").** Il logo può ora essere **caricato dall'editor**: diventa un `logoUrl` nel documento della mappa (Blob in modalità `api`, data-URL in modalità `local`). L'ordine di risoluzione in `view.js` (`logoSrc`) è: `cantina.logoUrl` → file statico per convenzione → iniziali. La convenzione statica resta come fallback, ma il logo non è più *solo* un file: caricarlo non richiede più toccare il repo. Vedi [ADR-0006](0006-iac-terraform-github-actions.md) per il contesto del deploy che rendeva scomodo il vecchio flusso.
- **Il browser non è una fonte affidabile**: `saveMap` ricostruisce la mappa campo per campo (lunghezze limitate, coordinate riportate dentro la sala, `sito` solo `http(s)` — altrimenti un `javascript:` finirebbe nell'href della scheda).

- **Scritte come dato, aiuti di layout come stato locale.** Le etichette "INGRESSO" e "Sposi" sono spostabili in modifica: la posizione scelta è **un dato** nel documento — `sala.ingressoLabel` `{x,y}` e `tavolo.ruoloPos` `{x,y}`, entrambi **opzionali** (assenti = posizione di default calcolata in `view.js`, così le mappe vecchie e la vista invitati non cambiano). `saveMap` li riporta dentro la sala come tutte le coordinate. Gli aiuti dell'editor invece **non** sono dati: la **griglia magnetica** (attiva/passo, ricordata sul dispositivo in `localStorage`), le **guide di allineamento** verso gli altri tavoli e la **selezione multipla** (marquee, Shift/Ctrl+clic, con *allinea* e *distribuisci*) vivono solo nell'editor. Allinea/distribuisci lavorano a 2 decimali come il sanitizer — arrotondare a interi renderebbe la spaziatura visibilmente disuguale su sale piccole; il trascinamento a mano invece continua ad agganciarsi a 1 unità sull'asse libero, mantenendo esatto l'asse agganciato a una guida.

## Considered Options

- **Tutto in `config.js`, nessun editor** — più semplice e sufficiente per gli invitati, scartato perché la disposizione va corretta anche quando non si ha il repo a portata di mano.
- **Estendere `storage` con `getMap`/`saveMap`** — un solo seam, scartato per la differenza di autorizzazioni (vedi 1).
- **Una tabella `tavoli` + una `cantine`** — scartato: nessuna query da servire, e salvataggi non atomici (vedi 2).
- **Blob JSON invece di Table** — quasi equivalente; scartato perché il container `photos` è a lettura pubblica e servirebbe un secondo container, cioè una porta in più da presidiare.
