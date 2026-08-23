/*
 * Single source of truth for all editable content of the site.
 * Change dates, addresses, texts, quiz questions here — never hardcode them
 * inside components. Every JS module imports from this file.
 */

/*
 * Storage backend selection (see ADR-0003 + CLAUDE.md).
 *   "local" → LocalAdapter: photos live in localStorage, single browser, no
 *             backend needed. Use for quick UI/style work.
 *   "api"   → ApiAdapter: talks to the Azure Functions at `apiBase`. Real
 *             behaviour (shared spaces, server-verified PIN). Works locally
 *             via `swa start` + Azurite, and in production on Azure.
 */
export const STORAGE = {
  backend: "api", // "local" | "api"
  apiBase: "/api",
};

export const WEDDING = {
  couple: { partnerA: "Salvatore", partnerB: "Martina", initials: "S&M" },

  // Ceremony date/time. Used by the countdown and the details section.
  // Month is 0-based in JS Date: 8 = September.
  date: new Date(2026, 8, 12, 11, 0, 0),
  dateLabel: "Sabato 12 Settembre 2026",
  timeLabel: "ore 11:00",

  ceremony: {
    title: "La Cerimonia",
    venue: "Chiesa San Francesco",
    address: "Via Concordia 6, Cesate (MI)",
    time: "ore 11:00",
    // Google Maps query string, URL-encoded at use site.
    mapsQuery: "Chiesa San Francesco, Via Concordia 6, Cesate MI",
  },

  // ------------------------------------------------------------------------
  // SEME della mappa dei tavoli (ADR-0004).
  // Vale SOLO finché il backend non ha una mappa salvata: dal primo salvataggio
  // degli Sposi in poi, la verità è il backend e questo blocco è storia.
  //
  // Coordinate: unità astratte della sala, `sala.w` x `sala.h`, isotrope
  // (1 unità = 1 unità in entrambi gli assi). Tavolo e Cantina sono entità
  // separate (vedi CONTEXT.md): `tipo` = cantina | sposi | staff, e solo i
  // primi due hanno una cantina. Il logo NON è un campo: si ricava dal nome
  // -> assets/img/cantine/<slug>.png, con le iniziali come fallback.
  //
  // Posizioni segnaposto: la sala vera la conoscete voi, si sistema
  // trascinando i cerchi dall'editor.
  // ------------------------------------------------------------------------
  tavoliSeed: {
    sala: { w: 100, h: 88, ingresso: { x: 50, y: 84 } },
    tavoli: [
      { id: "t-sposi", tipo: "sposi", x: 50, y: 8, cantinaId: "c13" },
      { id: "t-staff", tipo: "staff", x: 12, y: 8, cantinaId: null },
      { id: "t1", tipo: "cantina", x: 16, y: 26, cantinaId: "c1" },
      { id: "t2", tipo: "cantina", x: 38, y: 26, cantinaId: "c2" },
      { id: "t3", tipo: "cantina", x: 62, y: 26, cantinaId: "c3" },
      { id: "t4", tipo: "cantina", x: 84, y: 26, cantinaId: "c4" },
      { id: "t5", tipo: "cantina", x: 16, y: 44, cantinaId: "c5" },
      { id: "t6", tipo: "cantina", x: 38, y: 44, cantinaId: "c6" },
      { id: "t7", tipo: "cantina", x: 62, y: 44, cantinaId: "c7" },
      { id: "t8", tipo: "cantina", x: 84, y: 44, cantinaId: "c8" },
      { id: "t9", tipo: "cantina", x: 16, y: 62, cantinaId: "c9" },
      { id: "t10", tipo: "cantina", x: 38, y: 62, cantinaId: "c10" },
      { id: "t11", tipo: "cantina", x: 62, y: 62, cantinaId: "c11" },
      { id: "t12", tipo: "cantina", x: 84, y: 62, cantinaId: "c12" },
    ],
    // Campi facoltativi: quelli vuoti non vengono mostrati nella scheda.
    cantine: [
      { id: "c1", nome: "Cantina 1", zona: "", vitigni: "", sito: "" },
      { id: "c2", nome: "Cantina 2", zona: "", vitigni: "", sito: "" },
      { id: "c3", nome: "Cantina 3", zona: "", vitigni: "", sito: "" },
      { id: "c4", nome: "Cantina 4", zona: "", vitigni: "", sito: "" },
      { id: "c5", nome: "Cantina 5", zona: "", vitigni: "", sito: "" },
      { id: "c6", nome: "Cantina 6", zona: "", vitigni: "", sito: "" },
      { id: "c7", nome: "Cantina 7", zona: "", vitigni: "", sito: "" },
      { id: "c8", nome: "Cantina 8", zona: "", vitigni: "", sito: "" },
      { id: "c9", nome: "Cantina 9", zona: "", vitigni: "", sito: "" },
      { id: "c10", nome: "Cantina 10", zona: "", vitigni: "", sito: "" },
      { id: "c11", nome: "Cantina 11", zona: "", vitigni: "", sito: "" },
      { id: "c12", nome: "Cantina 12", zona: "", vitigni: "", sito: "" },
      { id: "c13", nome: "Cantina 13", zona: "", vitigni: "", sito: "" },
    ],
  },

  reception: {
    title: "Il Ricevimento",
    venue: "La Corte e Il Sogno",
    address: "Via Donatelli 3, Trescore Balneario (BG)",
    // Nessun orario: non è ancora certo, e la pagina Luoghi non lo mostra.
    mapsQuery: "La Corte e Il Sogno, Via Donatelli 3, Trescore Balneario BG",
  },

  // SEME del quiz "Quanto conosci gli sposi?" (gioco live, ADR-0005).
  // Vale come pre-compilazione dell'editor su giochi.html?admin quando il
  // backend non ha ancora domande salvate: da lì gli Sposi le modificano e le
  // salvano (con timer e opzioni). Dal primo salvataggio in poi vince il backend.
  quiz: [
    {
      q: "Dove si sono conosciuti Salvatore e Martina?",
      options: ["A una festa", "Al lavoro", "In vacanza", "Online"],
      answer: 0,
    },
    {
      q: "Qual è il vino preferito degli sposi?",
      options: ["Bianco fermo", "Rosso corposo", "Bollicine", "Rosato"],
      answer: 2,
    },
    {
      q: "In che mese è il matrimonio?",
      options: ["Giugno", "Luglio", "Agosto", "Settembre"],
      answer: 3,
    },
  ],
};
