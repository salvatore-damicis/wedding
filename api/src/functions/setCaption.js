const { app } = require("@azure/functions");
const S = require("../shared/storage");

/* POST /api/setCaption { nickname, pin, id, caption } -> { id, caption }
 * Il proprietario modifica (o cancella) la didascalia di una foto/video. */
app.http("setCaption", {
  methods: ["POST"],
  authLevel: "anonymous",
  handler: async (req) => {
    await S.ensureInit();
    const { nickname, pin, id, caption } = await req.json().catch(() => ({}));
    const nick = String(nickname || "").trim();

    const space = await S.getSpaceEntity(nick);
    if (!space || !S.verifyPin(space, String(pin || ""))) {
      return S.json(403, { error: "Non autorizzato" });
    }
    if (!id) return S.json(400, { error: "id mancante" });

    const cap = String(caption || "").slice(0, 300);
    await S.tableClient("photos").updateEntity(
      { partitionKey: nick, rowKey: String(id), caption: cap },
      "Merge"
    );
    return S.json(200, { id, caption: cap });
  },
});
