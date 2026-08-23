# Wedding Site — Salvatore & Martina

Sito matrimonio statico, multi-pagina, a tema vino. Questo file è il glossario del dominio: definisce i termini, non l'implementazione.

## Language

**Spazio**:
Raccolta personale di ricordi (foto **e video**) di un singolo invitato, identificata dal suo nickname. Il proprietario può caricare e gestire i contenuti, scegliere la **copertina** e aggiungere una **didascalia**; tutti gli altri invitati possono solo vederli e aprirli a schermo intero (scrittura sul proprio spazio, lettura su tutti). I file salgono originali, senza compressione.
_Avoid_: Album, Cartella, Bacheca

**Nickname**:
Etichetta scelta liberamente dall'invitato che identifica il suo spazio. Non è un account né un login: è pubblico e visibile a tutti.
_Avoid_: Utente, Account, Username

**PIN**:
Codice breve segreto che l'invitato imposta alla creazione del proprio spazio. Protegge la sola scrittura (caricamento/gestione) nel proprio spazio; non serve per vedere gli spazi altrui. Non è autenticazione vera (niente email/password/account).
_Avoid_: Password, Credenziali

**Invitato**:
Chiunque visiti il sito. Diventa proprietario di uno spazio nel momento in cui ne crea uno con nickname + PIN.
_Avoid_: Guest, Ospite, User

**Tavolo**:
Tavolo rotondo della sala del ricevimento, individuato dalla sua posizione nella piantina. Ha un tipo: quello degli **sposi**, quello dello **staff** (chi lavora alla giornata) o uno dei tavoli degli invitati; solo i primi due sono unici. Il sito non assegna posti e non elenca invitati: l'abbinamento invitato→tavolo resta sul tableau fisico all'ingresso, la piantina serve solo a localizzare in sala un tavolo di cui si conosce già il nome.
_Avoid_: Posto, Sedia, Tableau

**Cantina**:
La cantina visitata dagli sposi da cui un tavolo prende il nome, con le sue informazioni principali (zona, vitigni, sito) e il suo logo, che gli Sposi possono caricare dall'editor. È l'identità del tavolo, non il tavolo: se il tavolo cambia posizione, la cantina che porta resta la stessa. Ogni cantina identifica un tavolo solo, ma non tutti i tavoli ne hanno una — quello dello staff no.
_Avoid_: Tema, Etichetta, Categoria

**Sposi (ruolo admin)**:
Salvatore & Martina. Tramite un PIN riservato hanno il diritto di cancellare qualsiasi foto o intero spazio (valvola di moderazione), di modificare la piantina dei tavoli e di **condurre la Partita** (regia del gioco). Unico ruolo privilegiato.
_Avoid_: Amministratore, Moderatore, Owner

## Gioco

**Partita**:
Una sessione del quiz "Quanto conosci gli sposi?" giocata dal vivo durante la festa, condotta dagli Sposi. Attraversa delle fasi (attesa → domanda → risposta → … → fine) uguali per tutti nello stesso momento. Ce n'è una sola alla volta.
_Avoid_: Gioco, Sessione, Match

**Giocatore**:
Un invitato che è entrato nella Partita scegliendo un nome. Nessun PIN: il nome è solo l'etichetta con cui compare in classifica. È un ruolo della Partita, distinto dall'essere proprietario di uno Spazio (anche se il nome può essere lo stesso).
_Avoid_: Utente, Concorrente

**Turno**:
Una singola domanda della Partita mentre è "in scena": ha un tempo che scorre uguale per tutti. Le risposte si chiudono allo scadere; poi gli Sposi mostrano la risposta corretta.
_Avoid_: Round, Manche

**Punteggio**:
I punti di un Giocatore. Per ogni Turno: più veloce e corretta più punti; sbagliata toglie punti (di più se impulsiva). Calcolato dal server sul tempo effettivo. Può andare in negativo.
_Avoid_: Score, Voto

**Classifica**:
La graduatoria dei Giocatori per Punteggio, mostrata a tutti dopo ogni Turno e alla fine. È l'anima competitiva del gioco.
_Avoid_: Leaderboard, Ranking
