const { app } = require("@azure/functions");
const S = require("../shared/storage");

/* POST /api/submitAnswer { playerId, round, idx } -> { ok }
 *
 * Punteggio a tempo (moderato, ADR-0005), con f = (T−t)/T ∈ [0,1]:
 *   corretta:  +round(500 + 500·f)   → +500 (lenta) … +1000 (istantanea)
 *   errata:    −round(100 + 400·f)   → −100 (lenta) … −500  (veloce)
 *   scaduta:   niente riga = 0.
 * Il primo tap fa fede: la riga si crea una volta sola (createEntity), i tap
 * successivi vengono ignorati. Il tempo è quello del SERVER (now −
 * questionStartedAt), non ci si fida dell'orologio del telefono. */
app.http("submitAnswer", {
  methods: ["POST"],
  authLevel: "anonymous",
  handler: async (req) => {
    await S.ensureInit();
    const { playerId, round, idx } = await req.json().catch(() => ({}));
    const pid = String(playerId || "").trim();
    if (!pid) return S.json(400, { error: "playerId mancante" });

    const game = await S.getSiteDoc("game");
    if (game?.phase !== "question") return S.json(409, { error: "Risposte chiuse" });
    if (Number(round) !== game.round) return S.json(409, { error: "Turno non valido" });

    const quiz = await S.getSiteDoc("quiz");
    const q = quiz?.questions?.[game.round];
    if (!q) return S.json(400, { error: "Domanda non trovata" });

    const scelta = Number(idx);
    if (!Number.isInteger(scelta) || scelta < 0 || scelta >= q.options.length) {
      return S.json(400, { error: "Risposta non valida" });
    }

    const T = q.timer * 1000;
    const elapsed = Date.now() - Date.parse(game.questionStartedAt || 0);
    if (elapsed > T + 1500) return S.json(409, { error: "Tempo scaduto" }); // 1.5s di grazia per la rete

    const f = Math.max(0, Math.min(1, (T - elapsed) / T));
    const corretta = scelta === q.answer;
    const points = corretta ? Math.round(500 + 500 * f) : -Math.round(100 + 400 * f);

    try {
      await S.tableClient("answers").createEntity({
        partitionKey: `${game.gameId}_${game.round}`,
        rowKey: pid,
        idx: scelta,
        ms: elapsed,
        points,
      });
    } catch (err) {
      // 409 = riga già presente: hai già risposto, vale la prima. Non è errore.
      if (err?.statusCode === 409) return S.json(200, { ok: true, locked: true });
      throw err; // altri errori devono emergere, non essere scambiati per "già risposto"
    }

    return S.json(200, { ok: true });
  },
});
