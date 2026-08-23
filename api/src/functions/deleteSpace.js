const { app } = require("@azure/functions");
const S = require("../shared/storage");

/* POST /api/deleteSpace { adminPin, nickname } -> 204
 * Admin-only (sposi). Removes every photo (blob + metadata) and the space. */
app.http("deleteSpace", {
  methods: ["POST"],
  authLevel: "anonymous",
  handler: async (req) => {
    await S.ensureInit();
    const { adminPin, nickname } = await req.json();
    if (!S.isAdmin(adminPin)) return S.json(403, { error: "Non autorizzato" });
    const nick = String(nickname || "").trim();
    if (!nick) return S.json(400, { error: "nickname mancante" });

    const photos = S.tableClient("photos");
    const iter = photos.listEntities({
      queryOptions: { filter: `PartitionKey eq '${nick.replace(/'/g, "''")}'` },
    });
    for await (const p of iter) {
      await S.deleteBlob(nick, p.rowKey);
      await photos.deleteEntity(nick, p.rowKey).catch(() => {});
    }
    await S.tableClient("spaces").deleteEntity("space", nick).catch(() => {});
    return { status: 204 };
  },
});
