const { app } = require("@azure/functions");
const S = require("../shared/storage");

const TIPI = ["cantina", "sposi", "staff"];

/* Il browser non è una fonte affidabile: la mappa che arriva viene ricostruita
 * campo per campo, con lunghezze limitate e coordinate riportate dentro la sala.
 * In particolare `sito` accetta solo http/https — altrimenti un "javascript:..."
 * finirebbe nell'href della scheda cantina. */
function sanitizeMap(input) {
  if (!input || typeof input !== "object") return null;
  const dim = (v) => (Number(v) > 0 ? Math.min(2000, Math.max(10, Math.round(Number(v)))) : 0);
  const w = dim(input.sala?.w);
  const h = dim(input.sala?.h);
  if (!w || !h) return null;

  const clamp = (v, max) => Math.min(max, Math.max(0, Number(v) || 0));
  const round = (v) => Math.round(v * 100) / 100;
  const str = (v, max) => String(v ?? "").trim().slice(0, max);

  const url = (v) => (/^https?:\/\//i.test(String(v || "")) ? str(v, 400) : "");
  const cantine = (Array.isArray(input.cantine) ? input.cantine : [])
    .map((c) => ({
      id: str(c.id, 40),
      nome: str(c.nome, 80),
      zona: str(c.zona, 80),
      vitigni: str(c.vitigni, 140),
      sito: url(c.sito),
      // Logo caricato dall'editor (Blob): solo http/https, altrimenti si ricade
      // sul file statico per convenzione o sulle iniziali (view.js). ADR-0004.
      logoUrl: url(c.logoUrl),
    }))
    .filter((c) => c.id && c.nome);

  const posti = (v) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) && n > 0 ? Math.min(50, n) : 0; // 0 = non indicato
  };
  const noti = new Set(cantine.map((c) => c.id));
  const tavoli = (Array.isArray(input.tavoli) ? input.tavoli : [])
    .map((t) => ({
      id: str(t.id, 40),
      tipo: TIPI.includes(t.tipo) ? t.tipo : "cantina",
      x: round(clamp(t.x, w)),
      y: round(clamp(t.y, h)),
      posti: posti(t.posti),
      cantinaId: noti.has(t.cantinaId) ? t.cantinaId : null,
    }))
    .filter((t) => t.id);

  if (!tavoli.length) return null;
  const ing = input.sala.ingresso || {};
  return {
    sala: { w, h, ingresso: { x: round(clamp(ing.x, w)), y: round(clamp(ing.y, h)) } },
    tavoli,
    cantine,
  };
}

/* POST /api/saveMap { adminPin, map } -> 204
 * Solo Sposi. Ultimo che salva vince: nessun blocco né ETag (siamo in due). */
app.http("saveMap", {
  methods: ["POST"],
  authLevel: "anonymous",
  handler: async (req) => {
    await S.ensureInit();
    const { adminPin, map } = await req.json().catch(() => ({}));
    if (!S.isAdmin(adminPin)) return S.json(403, { error: "Non autorizzato" });

    const pulita = sanitizeMap(map);
    if (!pulita) return S.json(400, { error: "Mappa non valida" });

    try {
      await S.putSiteDoc("map", pulita);
    } catch (err) {
      if (err.tooBig) return S.json(413, { error: "Mappa troppo grande" });
      throw err;
    }
    return { status: 204 };
  },
});
