const { app } = require("@azure/functions");
const crypto = require("crypto");
const S = require("../shared/storage");

/* POST /api/requestUpload { nickname, pin, fileName, contentType }
 *   -> { id, uploadUrl (SAS), blobUrl }
 * Verifies the PIN, then hands back a short-lived SAS so the browser uploads
 * the image bytes DIRECTLY to Blob (bytes never pass through the Function). */
app.http("requestUpload", {
  methods: ["POST"],
  authLevel: "anonymous",
  handler: async (req) => {
    await S.ensureInit();
    const { nickname, pin } = await req.json();
    const nick = String(nickname || "").trim();

    const space = await S.getSpaceEntity(nick);
    if (!space || !S.verifyPin(space, String(pin || ""))) {
      return S.json(403, { error: "Non autorizzato" });
    }

    // Galleria in sola lettura (settings.galleriaBloccata): niente nuovi
    // caricamenti, nemmeno dal proprietario. Fail-open se le settings non sono
    // leggibili, come la UI ottimista.
    const settings = await S.getSiteDoc("settings").catch(() => null);
    if (settings?.galleriaBloccata) {
      return S.json(403, { error: "I caricamenti sono momentaneamente sospesi dagli sposi" });
    }

    const id = crypto.randomUUID();
    const { uploadUrl, blobUrl } = S.uploadSas(nick, id);
    return S.json(200, { id, uploadUrl, blobUrl });
  },
});
