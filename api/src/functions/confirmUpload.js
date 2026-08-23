const { app } = require("@azure/functions");
const S = require("../shared/storage");

/* POST /api/confirmUpload { nickname, pin, id, name, blobUrl, type, caption } -> Photo
 * Records the photo/video metadata after the browser has uploaded the blob.
 * `type` è "video" per i filmati, altrimenti "image". `caption` è opzionale. */
app.http("confirmUpload", {
  methods: ["POST"],
  authLevel: "anonymous",
  handler: async (req) => {
    await S.ensureInit();
    const { nickname, pin, id, name, blobUrl, type, caption } = await req.json();
    const nick = String(nickname || "").trim();

    const space = await S.getSpaceEntity(nick);
    if (!space || !S.verifyPin(space, String(pin || ""))) {
      return S.json(403, { error: "Non autorizzato" });
    }
    if (!id || !blobUrl) return S.json(400, { error: "Dati mancanti" });

    const uploadedAt = new Date().toISOString();
    const kind = type === "video" ? "video" : "image";
    const cap = String(caption || "").slice(0, 300);
    await S.tableClient("photos").upsertEntity({
      partitionKey: nick,
      rowKey: String(id),
      name: String(name || (kind === "video" ? "video" : "foto")),
      url: String(blobUrl),
      type: kind,
      caption: cap,
      uploadedAt,
    });
    return S.json(200, { id, url: blobUrl, name, type: kind, caption: cap, uploadedAt });
  },
});
