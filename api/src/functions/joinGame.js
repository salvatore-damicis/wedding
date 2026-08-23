const { app } = require("@azure/functions");
const crypto = require("crypto");
const S = require("../shared/storage");

/* POST /api/joinGame { playerId?, name } -> { playerId, name }
 *
 * Ingresso "leggero": solo un nome, nessun PIN (ADR-0005). Il client genera e
 * conserva un playerId (uuid) per restare la stessa persona tra un refresh e
 * l'altro; se manca lo genera il server. Si può entrare anche a partita in
 * corso (le domande già passate valgono 0). */
app.http("joinGame", {
  methods: ["POST"],
  authLevel: "anonymous",
  handler: async (req) => {
    await S.ensureInit();
    const { playerId, name } = await req.json().catch(() => ({}));

    const game = await S.getSiteDoc("game");
    const phase = game?.phase;
    if (!game?.gameId || !["lobby", "question", "reveal"].includes(phase)) {
      return S.json(409, { error: "Nessuna partita aperta" });
    }

    const nome = String(name || "").trim().slice(0, 30);
    if (!nome) return S.json(400, { error: "Serve un nome" });

    const pid = String(playerId || "").trim() || crypto.randomUUID();

    // Conserva il punteggio se stai rientrando nella STESSA partita.
    const existing = await S.tableClient("players").getEntity(game.gameId, pid).catch(() => null);
    await S.tableClient("players").upsertEntity(
      {
        partitionKey: game.gameId,
        rowKey: pid,
        name: nome,
        joinedAt: existing?.joinedAt || new Date().toISOString(),
        score: existing?.score || 0,
      },
      "Merge"
    );

    return S.json(200, { playerId: pid, name: nome });
  },
});
