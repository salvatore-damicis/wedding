/*
 * LocalGameAdapter — il gioco live in localStorage, senza backend (ADR-0005).
 * Replica la stessa logica delle Function (fasi, punteggio a tempo) così la UI
 * si può provare con `npm run serve`: due schede dello stesso browser
 * condividono localStorage, quindi una fa da regia (?admin) e l'altra da
 * giocatore. Nessuna sicurezza: il PIN è verificato lato browser, come negli
 * altri local-adapter.
 */
const K_GAME = "sm_game_state";
const K_QUIZ = "sm_game_quiz";
const K_PLAYERS = "sm_game_players";
const K_ANSWERS = "sm_game_answers";
const ADMIN_PIN = "sposi"; // solo collaudo locale

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
function write(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}
function fail(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}
function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : `p-${Date.now()}-${Math.round(Math.random() * 1e9)}`;
}

function classifica(gameId) {
  const players = read(K_PLAYERS, {})[gameId] || {};
  return Object.keys(players)
    .map((id) => ({ id, name: players[id].name, score: players[id].score || 0 }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "it"));
}

export class LocalGameAdapter {
  async getState(playerId) {
    const game = read(K_GAME, { phase: "idle" });
    const quiz = read(K_QUIZ, { questions: [] });
    const phase = game.phase || "idle";
    const now = Date.now();
    const total = quiz.questions.length;
    const round = Number.isInteger(game.round) ? game.round : -1;

    const out = { phase, round, total, serverNow: new Date(now).toISOString(), playerCount: 0, leaderboard: [] };

    if (phase === "lobby") {
      out.playerCount = Object.keys(read(K_PLAYERS, {})[game.gameId] || {}).length;
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
      const p = (read(K_PLAYERS, {})[game.gameId] || {})[playerId];
      const you = { joined: !!p };
      if (p) {
        you.name = p.name;
        you.score = p.score || 0;
        const idx = (game.leaderboard || []).findIndex((e) => e.id === playerId);
        you.rank = idx >= 0 ? idx + 1 : null;
      }
      if ((phase === "question" || phase === "reveal") && q) {
        const a = ((read(K_ANSWERS, {})[game.gameId] || {})[round] || {})[playerId];
        if (phase === "question") you.answered = !!a;
        else {
          you.answeredIdx = a ? a.idx : null;
          you.correct = a ? a.idx === q.answer : false;
          you.points = a ? a.points : 0;
        }
      }
      out.you = you;
    }
    return out;
  }

  async join(playerId, name) {
    const game = read(K_GAME, { phase: "idle" });
    if (!game.gameId || !["lobby", "question", "reveal"].includes(game.phase)) {
      throw fail(409, "Nessuna partita aperta");
    }
    const nome = String(name || "").trim().slice(0, 30);
    if (!nome) throw fail(400, "Serve un nome");
    const pid = String(playerId || "").trim() || uid();
    const all = read(K_PLAYERS, {});
    const g = all[game.gameId] || (all[game.gameId] = {});
    g[pid] = { name: nome, score: g[pid]?.score || 0, joinedAt: g[pid]?.joinedAt || new Date().toISOString() };
    write(K_PLAYERS, all);
    return { playerId: pid, name: nome };
  }

  async answer(playerId, round, idx) {
    const game = read(K_GAME, { phase: "idle" });
    if (game.phase !== "question") throw fail(409, "Risposte chiuse");
    if (Number(round) !== game.round) throw fail(409, "Turno non valido");
    const quiz = read(K_QUIZ, { questions: [] });
    const q = quiz.questions[game.round];
    if (!q) throw fail(400, "Domanda non trovata");
    const scelta = Number(idx);
    if (!Number.isInteger(scelta) || scelta < 0 || scelta >= q.options.length) throw fail(400, "Risposta non valida");

    const T = q.timer * 1000;
    const elapsed = Date.now() - Date.parse(game.questionStartedAt || 0);
    if (elapsed > T + 1500) throw fail(409, "Tempo scaduto");

    const all = read(K_ANSWERS, {});
    const ga = all[game.gameId] || (all[game.gameId] = {});
    const gr = ga[game.round] || (ga[game.round] = {});
    if (gr[playerId]) return { ok: true, locked: true };

    const f = Math.max(0, Math.min(1, (T - elapsed) / T));
    const corretta = scelta === q.answer;
    const points = corretta ? Math.round(500 + 500 * f) : -Math.round(100 + 400 * f);
    gr[playerId] = { idx: scelta, ms: elapsed, points };
    write(K_ANSWERS, all);
    return { ok: true };
  }

  async verifyAdmin(pin) {
    return pin === ADMIN_PIN;
  }

  async getQuiz(pin) {
    if (pin !== ADMIN_PIN) throw fail(403, "Non autorizzato");
    return { questions: read(K_QUIZ, { questions: [] }).questions };
  }

  async saveQuiz(pin, questions) {
    if (pin !== ADMIN_PIN) throw fail(403, "Non autorizzato");
    const clean = (Array.isArray(questions) ? questions : [])
      .slice(0, 40)
      .map((q) => {
        const options = (Array.isArray(q.options) ? q.options : [])
          .map((o) => String(o ?? "").trim().slice(0, 200))
          .filter(Boolean)
          .slice(0, 6);
        const testo = String(q.q ?? "").trim().slice(0, 300);
        if (!testo || options.length < 2) return null;
        const answer = Number.isInteger(q.answer) && q.answer >= 0 && q.answer < options.length ? q.answer : 0;
        const t = Math.round(Number(q.timer));
        const timer = Number.isFinite(t) ? Math.min(120, Math.max(5, t)) : 20;
        return { id: String(q.id || "").slice(0, 40) || uid(), q: testo, options, answer, timer };
      })
      .filter(Boolean);
    write(K_QUIZ, { questions: clean });
    return { ok: true, count: clean.length };
  }

  async control(pin, action) {
    if (pin !== ADMIN_PIN) throw fail(403, "Non autorizzato");
    const quiz = read(K_QUIZ, { questions: [] });
    const total = quiz.questions.length;
    let game = read(K_GAME, { phase: "idle" });

    const chiudi = (g) => ({
      ...g,
      phase: "ended",
      leaderboard: g.gameId ? classifica(g.gameId) : [],
      playerCount: g.gameId ? classifica(g.gameId).length : 0,
      counts: null,
    });

    if (action === "start") {
      game = { gameId: uid(), phase: "lobby", round: -1, questionStartedAt: null, leaderboard: [], counts: null, playerCount: 0 };
    } else if (action === "open") {
      if (!total) throw fail(400, "Nessuna domanda: salva prima il quiz");
      if (!game.gameId) throw fail(409, "Avvia prima la partita");
      const next = (Number.isInteger(game.round) ? game.round : -1) + 1;
      if (next >= total) game = chiudi(game);
      else {
        game.round = next;
        game.phase = "question";
        game.questionStartedAt = new Date().toISOString();
        game.counts = null;
      }
    } else if (action === "reveal") {
      if (game.phase !== "question") throw fail(409, "Nessuna domanda aperta");
      const q = quiz.questions[game.round];
      const counts = new Array(q.options.length).fill(0);
      const allP = read(K_PLAYERS, {});
      const players = allP[game.gameId] || (allP[game.gameId] = {});
      const gr = (read(K_ANSWERS, {})[game.gameId] || {})[game.round] || {};
      for (const pid of Object.keys(gr)) {
        const a = gr[pid];
        if (a.idx >= 0 && a.idx < counts.length) counts[a.idx]++;
        if (players[pid]) players[pid].score = (players[pid].score || 0) + (a.points || 0);
      }
      write(K_PLAYERS, allP);
      game.phase = "reveal";
      game.counts = counts;
      game.leaderboard = classifica(game.gameId);
      game.playerCount = game.leaderboard.length;
    } else if (action === "end") {
      game = chiudi(game);
    } else if (action === "reset") {
      game = { phase: "idle", round: -1, gameId: null, leaderboard: [], counts: null, playerCount: 0 };
    } else {
      throw fail(400, "Azione sconosciuta");
    }

    write(K_GAME, game);
    return { ok: true, phase: game.phase, round: game.round };
  }
}
