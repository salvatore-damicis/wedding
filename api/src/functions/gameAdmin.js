const { app } = require("@azure/functions");
const crypto = require("crypto");
const S = require("../shared/storage");

/* POST /api/gameAdmin { adminPin, action } -> { ok, phase, round }
 *
 * La regia del gioco live, solo Sposi (ADR-0005). Azioni:
 *   start  → nuova partita: nuovo gameId, fase "lobby" (gli invitati entrano).
 *   open   → apre la PROSSIMA domanda (fase "question", timer che parte ora);
 *            oltre l'ultima domanda passa a "ended".
 *   reveal → chiude il turno: conta le risposte, assegna i punti, aggiorna la
 *            classifica, fase "reveal" (mostra la corretta a tutti).
 *   end    → fine partita: classifica finale, fase "ended".
 *   reset  → torna a "idle".
 *
 * Ogni partita usa un gameId nuovo: le righe di players/answers delle partite
 * vecchie restano orfane e vengono semplicemente ignorate (niente cancellazioni
 * di massa). */
app.http("gameAdmin", {
  methods: ["POST"],
  authLevel: "anonymous",
  handler: async (req) => {
    await S.ensureInit();
    const { adminPin, action } = await req.json().catch(() => ({}));
    if (!S.isAdmin(adminPin)) return S.json(403, { error: "Non autorizzato" });

    const quiz = (await S.getSiteDoc("quiz")) || { questions: [] };
    const total = quiz.questions.length;
    let game = (await S.getSiteDoc("game")) || { phase: "idle" };

    if (action === "start") {
      game = {
        gameId: crypto.randomUUID(),
        phase: "lobby",
        round: -1,
        questionStartedAt: null,
        leaderboard: [],
        counts: null,
        playerCount: 0,
      };
    } else if (action === "open") {
      if (!total) return S.json(400, { error: "Nessuna domanda: salva prima il quiz" });
      if (!game.gameId) return S.json(409, { error: "Avvia prima la partita" });
      const next = (Number.isInteger(game.round) ? game.round : -1) + 1;
      if (next >= total) {
        game = await chiudi(game);
      } else {
        game.round = next;
        game.phase = "question";
        game.questionStartedAt = new Date().toISOString();
        game.counts = null;
      }
    } else if (action === "reveal") {
      if (game.phase !== "question") return S.json(409, { error: "Nessuna domanda aperta" });
      const q = quiz.questions[game.round];
      const counts = new Array(q.options.length).fill(0);

      // Somma i punti del turno sui giocatori e conta la distribuzione.
      const answersTable = S.tableClient("answers");
      const playersTable = S.tableClient("players");
      const it = answersTable.listEntities({
        queryOptions: { filter: `PartitionKey eq '${game.gameId}_${game.round}'` },
      });
      for await (const a of it) {
        if (a.idx >= 0 && a.idx < counts.length) counts[a.idx]++;
        const p = await playersTable.getEntity(game.gameId, a.rowKey).catch(() => null);
        if (p) {
          await playersTable.updateEntity(
            { partitionKey: game.gameId, rowKey: a.rowKey, score: (p.score || 0) + (a.points || 0) },
            "Merge"
          );
        }
      }

      game.phase = "reveal";
      game.counts = counts;
      game.leaderboard = await classifica(game.gameId);
      game.playerCount = game.leaderboard.length;
    } else if (action === "end") {
      game = await chiudi(game);
    } else if (action === "reset") {
      game = { phase: "idle", round: -1, gameId: null, leaderboard: [], counts: null, playerCount: 0 };
    } else {
      return S.json(400, { error: "Azione sconosciuta" });
    }

    await S.putSiteDoc("game", game);
    return S.json(200, { ok: true, phase: game.phase, round: game.round });

    async function chiudi(g) {
      const leaderboard = g.gameId ? await classifica(g.gameId) : [];
      return { ...g, phase: "ended", leaderboard, playerCount: leaderboard.length, counts: null };
    }

    async function classifica(gameId) {
      const righe = [];
      const it = S.tableClient("players").listEntities({
        queryOptions: { filter: `PartitionKey eq '${gameId}'` },
      });
      for await (const p of it) righe.push({ id: p.rowKey, name: p.name, score: p.score || 0 });
      righe.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "it"));
      return righe;
    }
  },
});
