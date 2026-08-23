const { app } = require("@azure/functions");
const S = require("../shared/storage");

/* GET /api/getMap -> { map: <mappa>|null }
 * Pubblica (la piantina la vedono tutti gli invitati). `map: null` significa
 * "nessuna mappa salvata": il browser ricade sul seme in data/config.js
 * (ADR-0004). Dal primo salvataggio degli Sposi in poi vince questo documento. */
app.http("getMap", {
  methods: ["GET"],
  authLevel: "anonymous",
  handler: async () => {
    await S.ensureInit();
    const map = await S.getSiteDoc("map");
    return S.json(200, { map });
  },
});
