const { app } = require("@azure/functions");
const S = require("../shared/storage");

/* POST /api/createOrEnter { nickname, pin } -> { ok, isNew } | { ok:false, reason } */
app.http("createOrEnter", {
  methods: ["POST"],
  authLevel: "anonymous",
  handler: async (req) => {
    await S.ensureInit();
    const { nickname, pin } = await req.json();
    const nick = String(nickname || "").trim();
    const code = String(pin || "").trim();
    if (!nick || !code) return S.json(200, { ok: false, reason: "Nickname e PIN obbligatori" });

    const existing = await S.getSpaceEntity(nick);
    if (!existing) {
      const { salt, hash } = S.hashPin(code);
      await S.tableClient("spaces").createEntity({
        partitionKey: "space",
        rowKey: nick,
        pinSalt: salt,
        pinHash: hash,
        createdAt: new Date().toISOString(),
      });
      return S.json(200, { ok: true, isNew: true });
    }
    if (!S.verifyPin(existing, code)) return S.json(200, { ok: false, reason: "PIN errato" });
    return S.json(200, { ok: true, isNew: false });
  },
});
