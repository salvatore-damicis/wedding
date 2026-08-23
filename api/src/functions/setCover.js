const { app } = require("@azure/functions");
const S = require("../shared/storage");

/* POST /api/setCover { nickname, pin, id } -> 204
 * Il proprietario sceglie quale foto/video è la copertina del suo Spazio.
 * L'id viene memorizzato sull'entità dello spazio (coverId); listSpaces lo usa. */
app.http("setCover", {
  methods: ["POST"],
  authLevel: "anonymous",
  handler: async (req) => {
    await S.ensureInit();
    const { nickname, pin, id } = await req.json().catch(() => ({}));
    const nick = String(nickname || "").trim();

    const space = await S.getSpaceEntity(nick);
    if (!space || !S.verifyPin(space, String(pin || ""))) {
      return S.json(403, { error: "Non autorizzato" });
    }
    if (!id) return S.json(400, { error: "id mancante" });

    await S.tableClient("spaces").updateEntity(
      { partitionKey: "space", rowKey: nick, coverId: String(id) },
      "Merge"
    );
    return { status: 204 };
  },
});
