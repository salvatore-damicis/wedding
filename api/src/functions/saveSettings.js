const { app } = require("@azure/functions");
const S = require("../shared/storage");

/* POST /api/saveSettings { adminPin, settings: { giochiAttivi } } -> 204
 * Solo Sposi. Ogni campo è ricostruito qui: il browser non decide la forma. */
app.http("saveSettings", {
  methods: ["POST"],
  authLevel: "anonymous",
  handler: async (req) => {
    await S.ensureInit();
    const { adminPin, settings } = await req.json().catch(() => ({}));
    if (!S.isAdmin(adminPin)) return S.json(403, { error: "Non autorizzato" });

    await S.putSiteDoc("settings", { giochiAttivi: !!settings?.giochiAttivi });
    return { status: 204 };
  },
});
