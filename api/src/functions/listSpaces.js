const { app } = require("@azure/functions");
const S = require("../shared/storage");

const COVER_TILES = 4; // quante anteprime nel mosaico di copertina

/* GET /api/listSpaces -> Space[] { nickname, coverUrl, covers, photoCount }
 *   covers  = fino a COVER_TILES anteprime recenti [{ url, type, id }]
 *   coverUrl = copertina scelta dal proprietario (coverId) o, in mancanza, la
 *              foto più recente. */
app.http("listSpaces", {
  methods: ["GET"],
  authLevel: "anonymous",
  handler: async () => {
    await S.ensureInit();

    // Un giro sulle foto: raccoglie tutti gli item per nickname.
    const agg = {};
    for await (const p of S.tableClient("photos").listEntities()) {
      const nick = p.partitionKey;
      (agg[nick] || (agg[nick] = [])).push({
        id: p.rowKey,
        url: p.url,
        type: p.type === "video" ? "video" : "image",
        uploadedAt: p.uploadedAt || "",
      });
    }

    const spaces = [];
    for await (const s of S.tableClient("spaces").listEntities()) {
      const items = (agg[s.rowKey] || []).sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
      const covers = items.slice(0, COVER_TILES).map(({ url, type, id }) => ({ url, type, id }));
      // Copertina scelta se ancora esistente, altrimenti la più recente.
      const chosen = s.coverId && items.find((i) => i.id === s.coverId);
      const coverUrl = (chosen || items[0])?.url || null;
      spaces.push({ nickname: s.rowKey, coverUrl, covers, photoCount: items.length });
    }
    return S.json(200, spaces);
  },
});
