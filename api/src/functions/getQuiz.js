const { app } = require("@azure/functions");
const S = require("../shared/storage");

/* POST /api/getQuiz { adminPin } -> { questions }
 *
 * Admin-gated: le domande includono la risposta corretta, che gli invitati non
 * devono vedere (loro ricevono le domande, senza `answer`, via getGameState).
 * Serve alla schermata di authoring su giochi.html?admin. */
app.http("getQuiz", {
  methods: ["POST"],
  authLevel: "anonymous",
  handler: async (req) => {
    await S.ensureInit();
    const { adminPin } = await req.json().catch(() => ({}));
    if (!S.isAdmin(adminPin)) return S.json(403, { error: "Non autorizzato" });

    const quiz = (await S.getSiteDoc("quiz")) || { questions: [] };
    return S.json(200, { questions: quiz.questions || [] });
  },
});
