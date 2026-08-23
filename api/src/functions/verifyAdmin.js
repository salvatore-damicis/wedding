const { app } = require("@azure/functions");
const S = require("../shared/storage");

/* POST /api/verifyAdmin { adminPin } -> { ok: true } | 403
 * Serve a validare il PIN PRIMA di entrare in modifica: senza, gli Sposi
 * scoprirebbero il PIN sbagliato dopo aver trascinato quattordici tavoli.
 * Non rilascia alcun token: ogni scrittura verifica di nuovo il PIN. */
app.http("verifyAdmin", {
  methods: ["POST"],
  authLevel: "anonymous",
  handler: async (req) => {
    const { adminPin } = await req.json().catch(() => ({}));
    if (!S.isAdmin(adminPin)) return S.json(403, { error: "PIN non valido" });
    return S.json(200, { ok: true });
  },
});
