const { app } = require("@azure/functions");
const S = require("../shared/storage");

/* POST /api/saveSettings { adminPin, settings: { giochiAttivi?, weddingDate?, galleriaAttiva?, galleriaBloccata? } } -> 204
 * Solo Sposi. Ogni campo è ricostruito qui: il browser non decide la forma.
 *
 * Aggiornamento PARZIALE per campo presente: la regia del gioco salva solo
 * `giochiAttivi`, la home admin solo `weddingDate`, la moderazione galleria
 * `galleriaAttiva` e/o `galleriaBloccata`. Si fa merge col documento esistente
 * così un pannello non azzera il campo gestito dagli altri.
 *
 * `weddingDate`: se la chiave è presente e vuota/null → si cancella (torna al
 * seme); se è una data valida → si normalizza in ISO; se è spazzatura → si
 * ignora e resta il valore precedente. */
app.http("saveSettings", {
  methods: ["POST"],
  authLevel: "anonymous",
  handler: async (req) => {
    await S.ensureInit();
    const { adminPin, settings } = await req.json().catch(() => ({}));
    if (!S.isAdmin(adminPin)) return S.json(403, { error: "Non autorizzato" });

    const s = settings && typeof settings === "object" ? settings : {};
    const prev = (await S.getSiteDoc("settings")) || {};

    const next = {
      giochiAttivi: "giochiAttivi" in s ? !!s.giochiAttivi : !!prev.giochiAttivi,
      weddingDate: prev.weddingDate || null,
      galleriaAttiva: "galleriaAttiva" in s ? !!s.galleriaAttiva : !!prev.galleriaAttiva,
      galleriaBloccata: "galleriaBloccata" in s ? !!s.galleriaBloccata : !!prev.galleriaBloccata,
    };

    if ("weddingDate" in s) {
      const raw = s.weddingDate;
      if (raw == null || raw === "") {
        next.weddingDate = null; // richiesta esplicita di tornare al seme
      } else {
        const d = new Date(raw);
        if (!Number.isNaN(d.getTime())) next.weddingDate = d.toISOString();
        // spazzatura: si tiene next.weddingDate (il valore precedente)
      }
    }

    await S.putSiteDoc("settings", next);
    return { status: 204 };
  },
});
