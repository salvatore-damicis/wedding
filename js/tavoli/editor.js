/*
 * Editor della piantina — solo Sposi, si attiva con tavoli.html?admin.
 *
 * Regole decise in sessione:
 *  - il PIN è verificato dal server PRIMA di entrare in modifica (`verifyAdmin`),
 *    altrimenti si scoprirebbe di averlo sbagliato dopo aver mosso 14 tavoli;
 *  - si trascina con Pointer Events (mouse e dito uguali), con aggancio a 1
 *    unità di sala; le frecce rifiniscono di 1 unità dove il dito non arriva;
 *  - trascinare NON salva: Salva e Annulla sono espliciti, e uscire con
 *    modifiche pendenti chiede conferma;
 *  - l'editor è anche un piccolo CMS: nome/zona/vitigni/sito della cantina,
 *    tipo del tavolo, aggiungi ed elimina.
 *
 * Un invitato che apre tavoli.html senza `?admin` non carica nemmeno questo
 * modulo (import dinamico in js/pages/tavoli.js).
 */
import { tavoli as tavoliStore } from "./adapter.js";
import { adminSession } from "../admin-session.js";
import { slugCantina, inizialiCantina, logoSrc, agganciaAlMuro, scalaTavoli, TAVOLO_SCALA_MIN, TAVOLO_SCALA_MAX } from "./view.js";
import { toast } from "../ui.js";

const TIPI = [
  ["cantina", "Tavolo invitati"],
  ["sposi", "Tavolo degli sposi"],
  ["staff", "Tavolo staff"],
];

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

const nuovoId = (prefisso) =>
  `${prefisso}-${Date.now().toString(36)}${Math.floor(performance.now() % 1000)}`;

/* Riquadro del logo nel form della cantina: anteprima (logo caricato → file per
   convenzione → iniziali) + i comandi Carica/Cambia/Rimuovi e l'input file. */
function logoBoxHtml(cantina, nome) {
  const ha = !!cantina?.logoUrl;
  return `<div class="editor-form__logo">
      <img src="${esc(logoSrc(cantina, nome))}" alt="" />
      <span class="tavolo__iniziali" hidden>${esc(inizialiCantina(nome))}</span>
    </div>
    <div class="editor-form__logo-actions">
      <button class="btn btn-outline" id="ed-logo-carica" type="button">${ha ? "Cambia logo" : "Carica logo"}</button>
      ${ha ? `<button class="btn btn-outline" id="ed-logo-rimuovi" type="button">Rimuovi</button>` : ""}
      <input id="ed-logo-file" type="file" accept="image/*" hidden />
    </div>
    <p class="editor-form__nota">${
      ha
        ? "Logo caricato dall'editor."
        : `Senza logo caricato si prova <code>${esc(slugCantina(nome))}.png</code>, altrimenti le iniziali.`
    }</p>`;
}

/* ---- PIN: chiesto una volta, ricordato sul dispositivo ------------------- */
function chiediPin() {
  return new Promise((resolve) => {
    const el = document.createElement("div");
    el.className = "modal open";
    el.innerHTML = `<div class="modal__box">
      <h2 class="modal__title">Modifica piantina</h2>
      <p class="modal__hint">Riservato agli sposi.</p>
      <div class="field">
        <label for="admin-pin">PIN</label>
        <input id="admin-pin" type="password" inputmode="numeric" autocomplete="off" />
      </div>
      <p class="modal__error" id="admin-err"></p>
      <div class="modal__actions">
        <button class="btn btn-outline" id="admin-annulla" type="button">Annulla</button>
        <button class="btn btn-primary" id="admin-ok" type="button">Entra</button>
      </div>
    </div>`;
    document.body.appendChild(el);

    const input = el.querySelector("#admin-pin");
    const err = el.querySelector("#admin-err");
    const chiudi = (valore) => {
      el.remove();
      resolve(valore);
    };

    const prova = async () => {
      const pin = input.value.trim();
      if (!pin) return;
      err.textContent = "Verifica…";
      if (await tavoliStore.verifyAdmin(pin)) chiudi(pin);
      else {
        err.textContent = "PIN non valido.";
        input.select();
      }
    };

    el.querySelector("#admin-ok").addEventListener("click", prova);
    el.querySelector("#admin-annulla").addEventListener("click", () => chiudi(null));
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") prova();
    });
    input.focus();
  });
}

/* ---- init --------------------------------------------------------------- */
export async function initTavoliEditor({ vista, mapEl, elencoEl, schedaEl, contenitore }) {
  let pin = adminSession.pin();
  // Un PIN ricordato può essere stato cambiato nel frattempo: si rivalida sempre.
  if (!pin || !(await tavoliStore.verifyAdmin(pin))) {
    pin = await chiediPin();
    if (!pin) return; // annullato: la pagina resta quella degli invitati
    adminSession.remember(pin);
  }

  const map = vista.map;
  let sporco = false;
  let salvato = JSON.stringify(map); // per Annulla e per sapere cosa è cambiato

  contenitore.classList.add("is-editing");

  /* --- barra degli strumenti --- */
  const barra = document.createElement("div");
  barra.className = "editor-bar";
  barra.innerHTML = `
    <span class="editor-bar__stato" id="ed-stato">Modifica attiva</span>
    <div class="editor-bar__azioni">
      <button class="btn btn-outline" id="ed-undo" type="button" title="Annulla azione (Ctrl+Z)" aria-label="Annulla azione">↶</button>
      <button class="btn btn-outline" id="ed-redo" type="button" title="Ripristina azione (Ctrl+Y)" aria-label="Ripristina azione">↷</button>
      <button class="btn btn-outline" id="ed-sala" type="button">Sala</button>
      <button class="btn btn-outline" id="ed-aggiungi" type="button">+ Tavolo</button>
      <button class="btn btn-outline" id="ed-annulla" type="button">Annulla</button>
      <button class="btn btn-primary" id="ed-salva" type="button">Salva</button>
      <button class="btn btn-outline" id="ed-esci" type="button">Esci</button>
    </div>`;
  contenitore.prepend(barra);
  const stato = barra.querySelector("#ed-stato");
  montaManigliaIngresso();

  /* --- cronologia per undo/redo ---
     Ogni modifica committata (ogni segnaSporco(true)) registra uno snapshot
     JSON della mappa. Undo/redo camminano su questa pila. `restoring` evita che
     il ripristino registri a sua volta un nuovo snapshot. */
  const history = [salvato];
  let hIndex = 0;
  let restoring = false;

  function pushHistory() {
    const snap = JSON.stringify(map);
    if (snap === history[hIndex]) return; // niente di nuovo
    history.length = hIndex + 1; // taglia l'eventuale ramo "redo"
    history.push(snap);
    hIndex = history.length - 1;
    aggiornaUndo();
  }

  function applySnapshot(json) {
    const s = JSON.parse(json);
    restoring = true;
    map.sala = s.sala;
    map.tavoli = s.tavoli;
    map.cantine = s.cantine;
    segnaSporco(json !== salvato);
    schedaEl.hidden = true;
    vista.seleziona(null);
    ridisegna();
    restoring = false;
    aggiornaUndo();
  }

  function undo() {
    if (hIndex > 0) applySnapshot(history[--hIndex]);
  }
  function redo() {
    if (hIndex < history.length - 1) applySnapshot(history[++hIndex]);
  }
  function resetHistory() {
    history.length = 0;
    history.push(salvato);
    hIndex = 0;
    aggiornaUndo();
  }
  function aggiornaUndo() {
    barra.querySelector("#ed-undo").disabled = hIndex <= 0;
    barra.querySelector("#ed-redo").disabled = hIndex >= history.length - 1;
  }

  function segnaSporco(valore = true) {
    sporco = valore;
    stato.textContent = valore ? "Modifiche non salvate" : "Modifica attiva";
    stato.classList.toggle("is-sporco", valore);
    if (valore && !restoring) pushHistory();
  }
  aggiornaUndo();

  /* vista.render() ricostruisce l'HTML della mappa, quindi porta via la
     maniglia dell'ingresso: ogni ridisegno in modifica passa da qui. */
  function ridisegna() {
    vista.render();
    montaManigliaIngresso();
  }

  function montaManigliaIngresso() {
    const ing = map.sala.ingresso || { x: map.sala.w / 2, y: map.sala.h };
    const el = document.createElement("span");
    el.className = "ingresso-handle";
    el.title = "Ingresso — trascina: si aggancia al muro più vicino";
    el.setAttribute("aria-hidden", "true");
    posizionaPunto(el, ing);
    mapEl.appendChild(el);
  }

  /* --- ridimensionamento della sala: tutto scala in proporzione --- */
  function ridimensiona(nuovoW, nuovoH) {
    const w = Math.min(1000, Math.max(20, Math.round(nuovoW)));
    const h = Math.min(1000, Math.max(20, Math.round(nuovoH)));
    const fx = w / map.sala.w;
    const fy = h / map.sala.h;
    const dentro = (v, max) => Math.min(max, Math.max(0, Math.round(v)));

    map.tavoli.forEach((t) => {
      t.x = dentro(t.x * fx, w);
      t.y = dentro(t.y * fy, h);
    });
    const ing = map.sala.ingresso || { x: map.sala.w / 2, y: map.sala.h };
    map.sala.w = w;
    map.sala.h = h;
    map.sala.ingresso = agganciaAlMuro({ x: ing.x * fx, y: ing.y * fy }, map.sala);

    segnaSporco();
    ridisegna();
    return { w, h };
  }

  function mostraFormSala() {
    vista.seleziona(null);
    schedaEl.hidden = false;
    schedaEl.innerHTML = `<div class="editor-form">
      <h3 class="editor-form__titolo">La sala</h3>
      <div class="field">
        <label for="ed-w">Larghezza</label>
        <input id="ed-w" type="number" min="20" max="1000" step="1" value="${map.sala.w}" />
      </div>
      <div class="field">
        <label for="ed-h">Profondità</label>
        <input id="ed-h" type="number" min="20" max="1000" step="1" value="${map.sala.h}" />
      </div>
      <p class="editor-form__nota">Tavoli e ingresso scalano in proporzione: la disposizione resta quella che vedi, cambia la forma della stanza. Se il ristorante ti dà i metri, usali come unità (18×11 m → 180 e 110).</p>
      <p class="editor-form__nota">L'ingresso si sposta trascinando il segno in piantina: si aggancia da solo al muro più vicino.</p>
      <div class="field">
        <label for="ed-scala">Grandezza dei tavoli <span id="ed-scala-val">${Math.round(scalaTavoli(map.sala) * 100)}%</span></label>
        <input id="ed-scala" type="range" min="${TAVOLO_SCALA_MIN}" max="${TAVOLO_SCALA_MAX}" step="0.05" value="${scalaTavoli(map.sala)}" />
      </div>
      <p class="editor-form__nota">Vale per tutti i cerchi allo stesso modo: trascina per rimpicciolire o ingrandire.</p>
    </div>`;

    const applica = () => {
      const w = Number(schedaEl.querySelector("#ed-w").value);
      const h = Number(schedaEl.querySelector("#ed-h").value);
      if (!(w > 0) || !(h > 0)) return;
      const fatto = ridimensiona(w, h);
      // Rileggo i valori davvero applicati (possono essere stati limitati).
      schedaEl.querySelector("#ed-w").value = fatto.w;
      schedaEl.querySelector("#ed-h").value = fatto.h;
    };
    // `change` e non `input`: altrimenti digitando "1", "10", "100" la sala
    // verrebbe scalata tre volte, con due passaggi intermedi assurdi.
    schedaEl.querySelector("#ed-w").addEventListener("change", applica);
    schedaEl.querySelector("#ed-h").addEventListener("change", applica);

    // Grandezza dei cerchi: anteprima dal vivo (input) e commit alla fine (change).
    const scala = schedaEl.querySelector("#ed-scala");
    const scalaVal = schedaEl.querySelector("#ed-scala-val");
    scala.addEventListener("input", () => {
      const v = Number(scala.value);
      map.sala.tavoloScala = v;
      scalaVal.textContent = `${Math.round(v * 100)}%`;
      mapEl.style.setProperty("--tavolo-scala", String(v));
    });
    scala.addEventListener("change", () => segnaSporco());
  }

  /* --- form del tavolo selezionato --- */
  function mostraForm(id) {
    const t = map.tavoli.find((x) => x.id === id);
    if (!t) return;
    const c = vista.cantinaDi(t);
    const nome = c?.nome || "";
    const staff = t.tipo === "staff";

    schedaEl.hidden = false;
    schedaEl.innerHTML = `<div class="editor-form">
      ${staff ? "" : logoBoxHtml(c, nome)}
      <div class="field">
        <label for="ed-tipo">Tipo di tavolo</label>
        <select id="ed-tipo">
          ${TIPI.map(
            ([v, etichetta]) =>
              `<option value="${v}"${t.tipo === v ? " selected" : ""}>${etichetta}</option>`
          ).join("")}
        </select>
      </div>
      ${
        staff
          ? `<p class="editor-form__nota">Il tavolo staff non ha una cantina: in piantina resta tratteggiato e non si apre.</p>`
          : `<div class="field"><label for="ed-nome">Cantina</label><input id="ed-nome" value="${esc(nome)}" /></div>
             <div class="field"><label for="ed-zona">Zona</label><input id="ed-zona" value="${esc(c?.zona || "")}" /></div>
             <div class="field"><label for="ed-vitigni">Vitigni</label><input id="ed-vitigni" value="${esc(c?.vitigni || "")}" /></div>
             <div class="field"><label for="ed-sito">Sito</label><input id="ed-sito" type="url" placeholder="https://…" value="${esc(c?.sito || "")}" /></div>
             <div class="field"><label for="ed-posti">Posti</label><input id="ed-posti" type="number" inputmode="numeric" min="0" max="50" step="1" placeholder="—" value="${t.posti > 0 ? t.posti : ""}" /></div>`
      }
      <div class="editor-form__coord">x ${t.x} · y ${t.y} <span>(trascina, o frecce per 1 unità)</span></div>
      <div class="editor-form__azioni">
        <button class="btn btn-outline" id="ed-duplica" type="button">Duplica</button>
        <button class="btn btn-outline editor-form__elimina" id="ed-elimina" type="button">Elimina</button>
      </div>
    </div>`;

    const campo = (sel) => schedaEl.querySelector(sel);
    // Anteprima logo: se l'immagine non carica, sparisce e mostra le iniziali.
    nascondiSeRotta();

    campo("#ed-tipo").addEventListener("change", (e) => {
      t.tipo = e.target.value;
      if (t.tipo === "staff") t.cantinaId = null;
      else if (!t.cantinaId) {
        const c2 = { id: nuovoId("c"), nome: "Nuova cantina", zona: "", vitigni: "", sito: "", logoUrl: "" };
        map.cantine.push(c2);
        t.cantinaId = c2.id;
      }
      segnaSporco();
      ridisegna();
      mostraForm(id);
    });

    const scriviCantina = (chiave, valore) => {
      const target = vista.cantinaDi(t);
      if (!target) return;
      target[chiave] = valore;
      segnaSporco();
      // Il nome cambia logo e ordinamento dell'elenco: ridisegno.
      if (chiave === "nome") {
        ridisegna();
        aggiornaAnteprimaLogo();
      }
    };
    for (const [sel, chiave] of [
      ["#ed-nome", "nome"],
      ["#ed-zona", "zona"],
      ["#ed-vitigni", "vitigni"],
      ["#ed-sito", "sito"],
    ]) {
      campo(sel)?.addEventListener("input", (e) => scriviCantina(chiave, e.target.value));
    }

    // Posti a tavola (0/vuoto = non indicato).
    campo("#ed-posti")?.addEventListener("input", (e) => {
      const n = Math.round(Number(e.target.value));
      t.posti = Number.isFinite(n) && n > 0 ? Math.min(50, n) : 0;
      segnaSporco();
    });

    // Carica / cambia / rimuovi il logo della cantina.
    campo("#ed-logo-carica")?.addEventListener("click", () => campo("#ed-logo-file").click());
    campo("#ed-logo-file")?.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const btn = campo("#ed-logo-carica");
      const testo = btn.textContent;
      btn.disabled = true;
      btn.textContent = "Caricamento…";
      try {
        const url = await tavoliStore.uploadLogo(pin, file);
        const target = vista.cantinaDi(t);
        if (target) {
          target.logoUrl = url;
          segnaSporco();
          ridisegna();
        }
        mostraForm(id);
        toast("Logo caricato 🍷");
      } catch (err) {
        console.error(err);
        if (/autorizz/i.test(err.message)) {
          adminSession.forget();
          toast("PIN non più valido: ricarica per rientrare");
        } else {
          toast(`Logo non caricato: ${err.message}`);
        }
        btn.disabled = false;
        btn.textContent = testo;
      }
    });
    campo("#ed-logo-rimuovi")?.addEventListener("click", () => {
      const target = vista.cantinaDi(t);
      if (!target) return;
      target.logoUrl = "";
      segnaSporco();
      ridisegna();
      mostraForm(id);
    });

    // Duplica: clona il tavolo e (se ne ha) la sua cantina, con nuovi id.
    campo("#ed-duplica").addEventListener("click", () => {
      const nuovo = { ...t, id: nuovoId("t"), x: Math.min(map.sala.w, t.x + 6), y: Math.min(map.sala.h, t.y + 6) };
      if (!staff && t.cantinaId) {
        const origine = vista.cantinaDi(t);
        const copia = { ...(origine || {}), id: nuovoId("c"), nome: `${origine?.nome || "Cantina"} (copia)` };
        map.cantine.push(copia);
        nuovo.cantinaId = copia.id;
      }
      map.tavoli.push(nuovo);
      segnaSporco();
      ridisegna();
      vista.seleziona(nuovo.id, { scheda: false });
      mostraForm(nuovo.id);
      toast("Tavolo duplicato");
    });

    campo("#ed-elimina").addEventListener("click", () => {
      if (!confirm("Eliminare questo tavolo?")) return;
      map.tavoli = map.tavoli.filter((x) => x.id !== id);
      // La cantina resta solo se un altro tavolo la usa (Tavolo != Cantina).
      if (t.cantinaId && !map.tavoli.some((x) => x.cantinaId === t.cantinaId)) {
        map.cantine = map.cantine.filter((c2) => c2.id !== t.cantinaId);
      }
      segnaSporco();
      schedaEl.hidden = true;
      ridisegna();
    });

    function aggiornaAnteprimaLogo() {
      const box = schedaEl.querySelector(".editor-form__logo");
      if (!box) return;
      const cc = vista.cantinaDi(t);
      const nomeC = cc?.nome || "";
      box.innerHTML = `<img src="${esc(logoSrc(cc, nomeC))}" alt="" />
        <span class="tavolo__iniziali" hidden>${esc(inizialiCantina(nomeC))}</span>`;
      nascondiSeRotta();
    }

    function nascondiSeRotta() {
      schedaEl.querySelectorAll(".editor-form__logo img").forEach((img) => {
        const ini = img.parentElement.querySelector(".tavolo__iniziali");
        const via = () => {
          img.style.display = "none";
          if (ini) ini.hidden = false;
        };
        if (img.complete && img.naturalWidth === 0) via();
        else img.addEventListener("error", via, { once: true });
      });
    }
  }

  /* --- trascinamento (mouse e dito) --- */
  let trascinato = null;

  /* Si trascinano due cose: i tavoli (aggancio a 1 unità) e l'ingresso
     (aggancio al muro più vicino). Stesso meccanismo, rilascio diverso. */
  mapEl.addEventListener("pointerdown", (e) => {
    const maniglia = e.target.closest(".ingresso-handle");
    const el = maniglia || e.target.closest(".tavolo[data-id]");
    if (!el) return;
    const t = maniglia ? null : map.tavoli.find((x) => x.id === el.dataset.id);
    if (!maniglia && !t) return;
    // Blocca sul nascere il drag&drop nativo (immagini) e la selezione del
    // testo: il gesto appartiene all'editor, non al browser.
    e.preventDefault();
    const origine = t ? { x: t.x, y: t.y } : { ...map.sala.ingresso };
    trascinato = {
      el,
      t,
      ingresso: !!maniglia,
      rect: mapEl.getBoundingClientRect(),
      partenzaX: e.clientX,
      partenzaY: e.clientY,
      origine,
      mosso: false,
    };
    el.setPointerCapture(e.pointerId);
    el.classList.add("is-dragging");
  });

  mapEl.addEventListener("pointermove", (e) => {
    if (!trascinato) return;
    const { rect, t, el, partenzaX, partenzaY, origine } = trascinato;
    if (!trascinato.mosso && Math.hypot(e.clientX - partenzaX, e.clientY - partenzaY) > 4) {
      trascinato.mosso = true;
    }
    if (!trascinato.mosso) return;
    e.preventDefault();
    const punto = {
      x: Math.min(map.sala.w, Math.max(0, origine.x + ((e.clientX - partenzaX) / rect.width) * map.sala.w)),
      y: Math.min(map.sala.h, Math.max(0, origine.y + ((e.clientY - partenzaY) / rect.height) * map.sala.h)),
    };
    if (trascinato.ingresso) map.sala.ingresso = punto;
    else Object.assign(t, punto);
    posizionaPunto(el, punto);
  });

  const fineTrascinamento = (e) => {
    if (!trascinato) return;
    const { el, t, mosso, ingresso } = trascinato;
    el.classList.remove("is-dragging");
    trascinato = null;
    if (e) e.preventDefault();

    if (ingresso) {
      if (!mosso) return;
      // Un ingresso sta su un muro per definizione: il vincolo lavora a favore.
      map.sala.ingresso = agganciaAlMuro(map.sala.ingresso, map.sala);
      segnaSporco();
      ridisegna(); // il varco e la freccia possono essere cambiati di parete
      return;
    }

    if (mosso) {
      // Aggancio a 1 unità: i tavoli restano allineati invece di finire a 43,7.
      t.x = Math.round(t.x);
      t.y = Math.round(t.y);
      posizionaPunto(el, t);
      segnaSporco();
    }
    vista.seleziona(t.id, { scheda: false });
    mostraForm(t.id);
  };
  mapEl.addEventListener("pointerup", fineTrascinamento);
  mapEl.addEventListener("pointercancel", fineTrascinamento);
  // Rete di sicurezza per i browser che avviano comunque il drag nativo.
  mapEl.addEventListener("dragstart", (e) => e.preventDefault());
  /* In modifica comanda il form, non la scheda da invitato: intercetto i clic
     in fase di cattura, prima che li veda la vista (che aprirebbe la scheda
     sopra il form che stai compilando). Vale sia per la mappa sia per l'elenco,
     che qui diventa un secondo modo di scegliere il tavolo da modificare. */
  mapEl.addEventListener("click", (e) => e.stopPropagation(), true);
  elencoEl.addEventListener(
    "click",
    (e) => {
      const riga = e.target.closest(".cantina-row");
      if (!riga) return;
      e.stopPropagation();
      vista.seleziona(riga.dataset.id, { scheda: false });
      mostraForm(riga.dataset.id);
    },
    true
  );

  function posizionaPunto(el, p) {
    el.style.left = `${((p.x / map.sala.w) * 100).toFixed(2)}%`;
    el.style.top = `${((p.y / map.sala.h) * 100).toFixed(2)}%`;
  }

  /* --- frecce: rifinitura di 1 unità --- */
  document.addEventListener("keydown", (e) => {
    const id = vista.selezionato();
    if (!id || !e.key.startsWith("Arrow")) return;
    if (e.target.matches("input, select, textarea")) return;
    const t = map.tavoli.find((x) => x.id === id);
    if (!t) return;
    const passo = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!passo) return;
    e.preventDefault();
    t.x = Math.min(map.sala.w, Math.max(0, t.x + passo[0]));
    t.y = Math.min(map.sala.h, Math.max(0, t.y + passo[1]));
    const el = mapEl.querySelector(`.tavolo[data-id="${CSS.escape(id)}"]`);
    if (el) posizionaPunto(el, t);
    segnaSporco();
    mostraForm(id);
  });

  /* --- undo/redo da tastiera (Ctrl/Cmd+Z, Ctrl/Cmd+Y o Shift+Z) ---
     Solo fuori dai campi: dentro un input vince l'undo nativo del browser. */
  document.addEventListener("keydown", (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    if (e.target.matches("input, select, textarea")) return;
    const k = e.key.toLowerCase();
    if (k === "z" && !e.shiftKey) {
      e.preventDefault();
      undo();
    } else if (k === "y" || (k === "z" && e.shiftKey)) {
      e.preventDefault();
      redo();
    }
  });

  /* --- azioni della barra --- */
  barra.querySelector("#ed-sala").addEventListener("click", mostraFormSala);

  barra.querySelector("#ed-undo").addEventListener("click", undo);
  barra.querySelector("#ed-redo").addEventListener("click", redo);

  barra.querySelector("#ed-aggiungi").addEventListener("click", () => {
    const c = { id: nuovoId("c"), nome: "Nuova cantina", zona: "", vitigni: "", sito: "", logoUrl: "" };
    const t = {
      id: nuovoId("t"),
      tipo: "cantina",
      x: Math.round(map.sala.w / 2),
      y: Math.round(map.sala.h / 2),
      posti: 0,
      cantinaId: c.id,
    };
    map.cantine.push(c);
    map.tavoli.push(t);
    segnaSporco();
    ridisegna();
    vista.seleziona(t.id, { scheda: false });
    mostraForm(t.id);
    toast("Tavolo aggiunto al centro della sala");
  });

  barra.querySelector("#ed-salva").addEventListener("click", async () => {
    try {
      await tavoliStore.saveMap(pin, map);
      salvato = JSON.stringify(map);
      segnaSporco(false);
      resetHistory();
      toast("Piantina salvata 🍷");
    } catch (err) {
      console.error(err);
      if (/autorizz/i.test(err.message)) {
        adminSession.forget();
        toast("PIN non più valido: ricarica per rientrare");
      } else {
        toast(`Salvataggio non riuscito: ${err.message}`);
      }
    }
  });

  barra.querySelector("#ed-annulla").addEventListener("click", () => {
    if (sporco && !confirm("Annullare le modifiche non salvate?")) return;
    const precedente = JSON.parse(salvato);
    map.sala = precedente.sala;
    map.tavoli = precedente.tavoli;
    map.cantine = precedente.cantine;
    segnaSporco(false);
    resetHistory();
    schedaEl.hidden = true;
    ridisegna();
  });

  barra.querySelector("#ed-esci").addEventListener("click", () => {
    if (sporco && !confirm("Ci sono modifiche non salvate. Uscire comunque?")) return;
    location.href = "tavoli.html";
  });

  window.addEventListener("beforeunload", (e) => {
    if (!sporco) return;
    e.preventDefault();
    e.returnValue = "";
  });
}
