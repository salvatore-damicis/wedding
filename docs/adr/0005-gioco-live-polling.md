# Gioco live: quiz condotto dagli Sposi, sincronia via polling

Il quiz non è più single-player: è una **Partita** dal vivo (stile *Dr. Why / Quizzettone*) **condotta dagli Sposi**, con tutti gli invitati che rispondono alla stessa domanda a tempo e una **classifica** condivisa. Sostituisce del tutto il vecchio quiz locale. Ha il proprio seam `js/games/adapter.js`, gemello degli altri (local + api, stesso `STORAGE.backend`).

## 1. Sincronia via polling, non WebSocket

Ogni telefono chiede al server "cosa c'è in scena adesso?" (`getGameState`) ogni ~1,2 s. Niente Azure SignalR / Web PubSub: il loro piano gratuito regge ~20 connessioni concorrenti, troppo poche per gli invitati di un matrimonio, e passare a pagamento tradirebbe il vincolo ~€0 di ADR-0003. Il polling gira sulle stesse Function + Table già presenti; il volume (≈100 telefoni × 15 min) resta dentro il free grant.

**Conseguenza:** latenza di ~1-2 s tra "gli sposi aprono la domanda" e "compare sul telefono". Accettabile: la regia è umana e i tempi del punteggio sono calcolati dal **server** (vedi 3), non dal client, quindi la latenza non falsa la gara.

## 2. Fasi guidate dagli Sposi, timer automatico

Macchina a stati nel documento `game` (Table `site`, come mappa e settings — ADR-0004):
`idle → lobby → question → reveal → … → ended`. Gli Sposi (con il PIN admin) fanno avanzare: **Avvia** (lobby), **Apri domanda** (question, il timer parte *ora*), **Mostra risposta** (reveal), **Prossima** (question successiva) / **Classifica finale** (ended). Il **timer chiude le risposte da solo** (il server rifiuta i tap tardivi, con 1,5 s di grazia per la rete); la transizione question→reveal la decidono gli Sposi, così possono commentare tra una domanda e l'altra.

Regia e authoring vivono su `giochi.html?admin` (stessa convenzione dell'editor tavoli): un invitato non scarica nemmeno il modulo `quiz-admin.js`. Le domande (multiple-choice + timer per-domanda) si salvano nel documento `quiz`, seminate al primo avvio da `WEDDING.quiz` in `config.js`.

## 3. Punteggio a tempo, calcolato dal server; il primo tap fa fede

Con `f = (T − t)/T` (T = timer, t = tempo di risposta *misurato dal server* come `now − questionStartedAt`): **corretta** `+round(500 + 500·f)` (500→1000), **errata** `−round(100 + 400·f)` (−100→−500, l'errore impulsivo punito di più), **scaduta** 0. Costanti fisse, penalità moderate (una decisione di sessione).

Il tempo lo misura il server per non fidarsi dell'orologio del telefono; ognuno ha latenza simile, quindi la gara resta equa. Il **primo tap è definitivo**: la riga della risposta si crea una volta sola (`createEntity` fallisce se esiste), così i tap ripetuti non cambiano nulla e non si può ripensarci.

## 4. Righe separate per le risposte, generazioni via `gameId`

Ogni risposta è una **riga propria** (Table `answers`, `PartitionKey = ${gameId}#${round}`, `RowKey = playerId`): 100 telefoni che rispondono insieme scrivono righe diverse, nessuno sovrascrive nessuno. I punteggi cumulati stanno su Table `players` (`PartitionKey = gameId`), aggiornati al `reveal` quando gli Sposi chiudono il turno; la classifica viene fotografata nel documento `game`, così `getGameState` fa **una sola lettura** per poll (niente scansioni a ogni richiesta).

Ogni partita usa un **gameId nuovo** (generato all'Avvia): le righe delle partite vecchie restano orfane e vengono ignorate. Niente cancellazioni di massa (che su Table sarebbero N transazioni fragili) — si paga qualche riga inutile in cambio di un reset istantaneo e atomico.

## Conseguenze accettate

- **Ingresso senza PIN** (ADR: decisione di sessione): per giocare basta un nome; il client tiene un `playerId` (uuid) per restare la stessa persona tra un refresh e l'altro. Nessuna difesa dall'omonimia o dall'impersonificazione: a un matrimonio il rischio non vale l'attrito.
- **La risposta corretta non viaggia mai in fase `question`**: `getGameState` la include solo in `reveal`, altrimenti si leggerebbe nel payload di rete.
- **Interruttore `giochiAttivi`** (settings, ADR-0004): a giochi spenti gli invitati vedono "non ancora attivi"; è il maestro indipendente dalla fase della partita.
- **Ultimo che salva vince** sul documento `game`, ma lo scrive solo la regia (gli Sposi, un dispositivo alla volta in pratica): nessun bisogno di lock.

## Considered Options

- **Self-paced con classifica** (ognuno gioca quando vuole) — più robusto col wifi debole, scartato: gli Sposi volevano l'effetto "tutti insieme" del programma TV.
- **Azure SignalR / Web PubSub** (real-time vero) — scartato: il piano gratuito non regge il numero di invitati e il costo tradisce ADR-0003.
- **Punteggio calcolato dal client** — scartato: falsabile e dipendente dall'orologio del telefono.
- **Tutto nel documento `game`, giocatori compresi** — scartato: 100 scritture concorrenti sullo stesso documento si sovrascriverebbero (vedi 4).
