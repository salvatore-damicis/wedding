const { app } = require("@azure/functions");
const crypto = require("crypto");
const S = require("../shared/storage");

/* POST /api/requestLogoUpload { adminPin, contentType } -> { uploadUrl (SAS), blobUrl }
 *
 * Solo Sposi (PIN admin). Rilascia un SAS a breve scadenza per caricare il LOGO
 * di una cantina direttamente su Blob, sotto il namespace riservato `_loghi/`.
 * L'URL restituito viene poi salvato in `cantina.logoUrl` dentro la mappa
 * (saveMap lo ripulisce: solo http/https). Un id casuale a ogni upload fa da
 * cache-busting quando si sostituisce un logo (l'URL cambia). ADR-0004 (nota di
 * superamento): i loghi possono ora essere un dato, non solo file statici. */
app.http("requestLogoUpload", {
  methods: ["POST"],
  authLevel: "anonymous",
  handler: async (req) => {
    await S.ensureInit();
    const { adminPin } = await req.json().catch(() => ({}));
    if (!S.isAdmin(adminPin)) return S.json(403, { error: "Non autorizzato" });

    const id = crypto.randomUUID();
    const { uploadUrl, blobUrl } = S.uploadSas("_loghi", id);
    return S.json(200, { uploadUrl, blobUrl });
  },
});
