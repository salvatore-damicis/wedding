const { app } = require("@azure/functions");
const S = require("../shared/storage");

/* GET /api/getSettings -> { settings: { giochiAttivi: boolean, weddingDate: string|null, galleriaAttiva: boolean, galleriaBloccata: boolean } }
 * Pubblica. Le impostazioni governano il CONTENUTO delle pagine, non la
 * navigazione (ADR-0005): la nav resta markup statico e non dipende dalla rete.
 * Default a giochi spenti: si accendono dal pannello Sposi quando è il momento.
 * `weddingDate` (ISO) pilota il countdown della home: se null, vale la data
 * seme in data/config.js (WEDDING.date). Gli Sposi la cambiano da index.html?admin.
 * `galleriaAttiva` (default spenta) apre la galleria condivisa: finché è false gli
 * invitati vedono la sezione predisposta ma non possono creare spazi né caricare
 * foto. `galleriaBloccata` (default spenta) è indipendente: a galleria aperta la
 * mette in SOLA LETTURA — spazi e foto restano visibili, ma nessuno può creare
 * nuovi spazi né caricare. Gli Sposi le governano da galleria.html?admin. */
app.http("getSettings", {
  methods: ["GET"],
  authLevel: "anonymous",
  handler: async () => {
    await S.ensureInit();
    const saved = await S.getSiteDoc("settings");
    return S.json(200, {
      settings: {
        giochiAttivi: !!saved?.giochiAttivi,
        weddingDate: saved?.weddingDate || null,
        galleriaAttiva: !!saved?.galleriaAttiva,
        galleriaBloccata: !!saved?.galleriaBloccata,
      },
    });
  },
});
