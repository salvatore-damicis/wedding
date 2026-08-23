const { app } = require("@azure/functions");
const S = require("../shared/storage");

/* POST /api/deletePhoto { nickname, pin, id } -> 204
 * Authorized if the PIN owns the space OR it's the admin PIN (moderation). */
app.http("deletePhoto", {
  methods: ["POST"],
  authLevel: "anonymous",
  handler: async (req) => {
    await S.ensureInit();
    const { nickname, pin, id } = await req.json();
    const nick = String(nickname || "").trim();

    const space = await S.getSpaceEntity(nick);
    const authorized = S.isAdmin(pin) || (space && S.verifyPin(space, String(pin || "")));
    if (!authorized) return S.json(403, { error: "Non autorizzato" });
    if (!id) return S.json(400, { error: "id mancante" });

    await S.deleteBlob(nick, id);
    await S.tableClient("photos").deleteEntity(nick, String(id)).catch(() => {});
    // Se era la copertina scelta, la sganciamo (listSpaces ricade sulla più recente).
    if (space && space.coverId === String(id)) {
      await S.tableClient("spaces")
        .updateEntity({ partitionKey: "space", rowKey: nick, coverId: "" }, "Merge")
        .catch(() => {});
    }
    return { status: 204 };
  },
});
