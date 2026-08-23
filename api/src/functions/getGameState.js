const { app } = require("@azure/functions");
const S = require("../shared/storage");

/* GET /api/getGameState?playerId=... -> stato del gioco live (pollato da tutti).
 *
 * Restituisce SOLO ciò che la fase consente: durante "question" la risposta
 * corretta NON viene inviata (arriverebbe nel payload e si potrebbe barare);
 * compare in "reveal". `you` (se passi playerId) personalizza: se hai già
 * risposto, il tuo punteggio del turno, il tuo rango. Vedi ADR-0005. */
app.http("getGameState", {
  methods: ["GET"],
  authLevel: "anonymous",
  handler: async (req) => {
    await S.ensureInit();
    const game = (await S.getSiteDoc("game")) || { phase: "idle" };
    const quiz = (await S.getSiteDoc("quiz")) || { questions: [] };
    const playerId = (req.query.get("playerId") || "").trim();

    const phase = game.phase || "idle";
    const now = Date.now();
    const total = quiz.questions.length;
    const round = Number.isInteger(game.round) ? game.round : -1;

    const out = {
      phase,
      round,
      total,
      serverNow: new Date(now).toISOString(),
      playerCount: 0,
      leaderboard: [],
    };

    if (phase === "lobby") {
      // Lobby breve: contare le righe qui è accettabile (poi basta la classifica).
      let n = 0;
      if (game.gameId) {
        const it = S.tableClient("players").listEntities({
          queryOptions: { filter: `PartitionKey eq '${game.gameId}'`, select: ["rowKey"] },
        });
        for await (const _ of it) n++;
      }
      out.playerCount = n;
    } else {
      out.leaderboard = game.leaderboard || [];
      out.playerCount = game.playerCount ?? out.leaderboard.length;
    }

    const q = round >= 0 && round < total ? quiz.questions[round] : null;
    if (phase === "question" && q) {
      out.question = { q: q.q, options: q.options, timer: q.timer };
      out.questionStartedAt = game.questionStartedAt;
      out.remainingMs = Math.max(0, q.timer * 1000 - (now - Date.parse(game.questionStartedAt || 0)));
    } else if (phase === "reveal" && q) {
      out.question = { q: q.q, options: q.options, timer: q.timer };
      out.correct = q.answer;
      out.counts = game.counts || null;
    }

    if (playerId && game.gameId) {
      const you = { joined: false };
      const player = await S.tableClient("players").getEntity(game.gameId, playerId).catch(() => null);
      if (player) {
        you.joined = true;
        you.name = player.name;
        you.score = player.score || 0;
        const idx = (game.leaderboard || []).findIndex((e) => e.id === playerId);
        you.rank = idx >= 0 ? idx + 1 : null;
      }
      if ((phase === "question" || phase === "reveal") && q) {
        const a = await S.tableClient("answers")
          .getEntity(`${game.gameId}_${round}`, playerId)
          .catch(() => null);
        if (phase === "question") {
          you.answered = !!a;
        } else {
          you.answeredIdx = a ? a.idx : null;
          you.correct = a ? a.idx === q.answer : false;
          you.points = a ? a.points : 0;
        }
      }
      out.you = you;
    }

    return S.json(200, out);
  },
});
