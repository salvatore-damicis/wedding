const { app } = require("@azure/functions");
const S = require("../shared/storage");

/* POST /api/resetSpacePin { adminPin, nickname, newPin } -> 204
 * Solo Sposi. Reimposta il PIN di uno spazio esistente SENZA toccare le foto:
 * è il recupero "morbido" per un invitato che ha dimenticato il PIN, alternativo
 * all'azzeramento totale con deleteSpace (ADR-0002). Gli Sposi comunicano il
 * nuovo PIN all'invitato, che rientra nel proprio spazio con tutti i ricordi. */
app.http("resetSpacePin", {
  methods: ["POST"],
  authLevel: "anonymous",
  handler: async (req) => {
    await S.ensureInit();
    const { adminPin, nickname, newPin } = await req.json().catch(() => ({}));
    if (!S.isAdmin(adminPin)) return S.json(403, { error: "Non autorizzato" });

    const nick = String(nickname || "").trim();
    const code = String(newPin || "").trim();
    if (!nick) return S.json(400, { error: "nickname mancante" });
    if (!code) return S.json(400, { error: "nuovo PIN mancante" });

    const existing = await S.getSpaceEntity(nick);
    if (!existing) return S.json(404, { error: "Spazio inesistente" });

    const { salt, hash } = S.hashPin(code);
    await S.tableClient("spaces").updateEntity(
      { partitionKey: "space", rowKey: nick, pinSalt: salt, pinHash: hash },
      "Merge"
    );
    return { status: 204 };
  },
});
