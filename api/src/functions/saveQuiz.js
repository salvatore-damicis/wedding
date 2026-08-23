const { app } = require("@azure/functions");
const crypto = require("crypto");
const S = require("../shared/storage");

/* Il browser non è affidabile: le domande arrivate vengono ricostruite campo
 * per campo (lunghezze limitate, timer e indice della risposta entro i limiti,
 * 2..6 opzioni). */
function sanitizeQuestions(input) {
  const str = (v, max) => String(v ?? "").trim().slice(0, max);
  const arr = Array.isArray(input) ? input : [];
  return arr
    .slice(0, 40)
    .map((q) => {
      const options = (Array.isArray(q.options) ? q.options : [])
        .map((o) => str(o, 200))
        .filter((o) => o !== "")
        .slice(0, 6);
      if (options.length < 2) return null;
      const answer = Number.isInteger(q.answer) && q.answer >= 0 && q.answer < options.length ? q.answer : 0;
      const timerRaw = Math.round(Number(q.timer));
      const timer = Number.isFinite(timerRaw) ? Math.min(120, Math.max(5, timerRaw)) : 20;
      const testo = str(q.q, 300);
      if (!testo) return null;
      return { id: str(q.id, 40) || crypto.randomUUID(), q: testo, options, answer, timer };
    })
    .filter(Boolean);
}

/* POST /api/saveQuiz { adminPin, questions } -> { ok, count } */
app.http("saveQuiz", {
  methods: ["POST"],
  authLevel: "anonymous",
  handler: async (req) => {
    await S.ensureInit();
    const { adminPin, questions } = await req.json().catch(() => ({}));
    if (!S.isAdmin(adminPin)) return S.json(403, { error: "Non autorizzato" });

    const clean = sanitizeQuestions(questions);
    try {
      await S.putSiteDoc("quiz", { questions: clean });
    } catch (err) {
      if (err.tooBig) return S.json(413, { error: "Troppe domande" });
      throw err;
    }
    return S.json(200, { ok: true, count: clean.length });
  },
});
