const { app } = require("@azure/functions");
const S = require("../shared/storage");

/* GET /api/getSettings -> { settings: { giochiAttivi: boolean } }
 * Pubblica. Le impostazioni governano il CONTENUTO delle pagine, non la
 * navigazione (ADR-0005): la nav resta markup statico e non dipende dalla rete.
 * Default a giochi spenti: si accendono dal pannello Sposi quando è il momento. */
app.http("getSettings", {
  methods: ["GET"],
  authLevel: "anonymous",
  handler: async () => {
    await S.ensureInit();
    const saved = await S.getSiteDoc("settings");
    return S.json(200, { settings: { giochiAttivi: !!saved?.giochiAttivi } });
  },
});
