const { app } = require("@azure/functions");
const S = require("../shared/storage");

/* GET /api/getSpace?nickname=Marco -> { nickname, photos: Photo[], coverId }
 * Photo = { id, url, name, type, caption, uploadedAt }. */
app.http("getSpace", {
  methods: ["GET"],
  authLevel: "anonymous",
  handler: async (req) => {
    await S.ensureInit();
    const nickname = (req.query.get("nickname") || "").trim();
    if (!nickname) return S.json(400, { error: "nickname mancante" });

    const photos = [];
    const iter = S.tableClient("photos").listEntities({
      queryOptions: { filter: `PartitionKey eq '${nickname.replace(/'/g, "''")}'` },
    });
    for await (const p of iter) {
      photos.push({
        id: p.rowKey,
        url: p.url,
        name: p.name,
        type: p.type === "video" ? "video" : "image",
        caption: p.caption || "",
        uploadedAt: p.uploadedAt,
      });
    }
    photos.sort((a, b) => (b.uploadedAt || "").localeCompare(a.uploadedAt || ""));

    const space = await S.getSpaceEntity(nickname);
    return S.json(200, { nickname, photos, coverId: space?.coverId || null });
  },
});
