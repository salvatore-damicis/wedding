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

/* Aggancio in fase di trascinamento (ADR-0004, aiuti all'allineamento):
   - SNAP_PX è la distanza di cattura, misurata in PIXEL schermo e riconvertita
     in unità di sala per ogni asse, così l'aggancio "tira" allo stesso modo su
     una sala da 40 o da 180 unità;
   - la griglia è solo un aiuto d'editing: non entra nella mappa salvata (il
     server la ripulirebbe), ma la preferenza è ricordata sul dispositivo. */
const SNAP_PX = 7;
const GRIGLIA_KEY = "tavoli.griglia";

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

  /* Preferenza griglia (per dispositivo). Passo di default legato alla sala:
     ~1/8 del lato minore, così parte "utile" su stanze piccole o metriche. */
  let grigliaAttiva = false;
  let grigliaPasso = Math.max(1, Math.round(Math.min(map.sala.w, map.sala.h) / 8));
  try {
    const g = JSON.parse(localStorage.getItem(GRIGLIA_KEY) || "null");
    if (g) {
      grigliaAttiva = !!g.attiva;
      if (Number(g.passo) > 0) grigliaPasso = Math.round(g.passo);
    }
  } catch {}
  const salvaGrigliaPref = () => {
    try {
      localStorage.setItem(GRIGLIA_KEY, JSON.stringify({ attiva: grigliaAttiva, passo: grigliaPasso }));
    } catch {}
  };

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
      <button class="btn btn-outline" id="ed-griglia" type="button" aria-pressed="false" title="Griglia magnetica: aggancia i tavoli a una griglia regolare">⊞ Griglia</button>
      <button class="btn btn-outline" id="ed-aggiungi" type="button">+ Tavolo</button>
      <button class="btn btn-outline" id="ed-annulla" type="button">Annulla</button>
      <button class="btn btn-primary" id="ed-salva" type="button">Salva</button>
      <button class="btn btn-outline" id="ed-esci" type="button">Esci</button>
    </div>`;
  contenitore.prepend(barra);
  const stato = barra.querySelector("#ed-stato");
  montaManigliaIngresso();
  montaGriglia();
  aggiornaGriglia();

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
    montaGriglia();
    evidenziaSelezione();
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

  /* Griglia magnetica: overlay di sottili linee, ridisegnato a ogni ridisegna()
     perché vista.render() riscrive l'HTML della mappa. Va INSERITO subito dopo
     la sala (che ha il fondo pieno) e prima dei tavoli, così resta sotto ai
     cerchi ma sopra al pavimento. */
  function montaGriglia() {
    mapEl.querySelector(".editor-griglia")?.remove();
    if (!grigliaAttiva) return;
    const { w, h } = map.sala;
    const p = Math.max(1, grigliaPasso);
    let linee = "";
    for (let x = p; x < w; x += p) linee += `<line x1="${x}" y1="0" x2="${x}" y2="${h}" />`;
    for (let y = p; y < h; y += p) linee += `<line x1="0" y1="${y}" x2="${w}" y2="${y}" />`;
    const svg = `<svg class="editor-griglia" viewBox="0 0 ${w} ${h}" aria-hidden="true" focusable="false">${linee}</svg>`;
    const sala = mapEl.querySelector(".mappa__sala");
    if (sala) sala.insertAdjacentHTML("afterend", svg);
    else mapEl.insertAdjacentHTML("afterbegin", svg);
  }

  /* Riallinea comando in barra e (se aperto) la casella nel pannello Sala allo
     stato corrente, salva la preferenza e ridisegna la griglia. */
  function aggiornaGriglia() {
    const b = barra.querySelector("#ed-griglia");
    b.classList.toggle("is-on", grigliaAttiva);
    b.setAttribute("aria-pressed", String(grigliaAttiva));
    const chk = schedaEl.querySelector("#ed-griglia-attiva");
    if (chk) chk.checked = grigliaAttiva;
    salvaGrigliaPref();
    montaGriglia();
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
      <div class="field">
        <label class="editor-form__check"><input type="checkbox" id="ed-griglia-attiva" ${grigliaAttiva ? "checked" : ""} /> Griglia magnetica</label>
      </div>
      <div class="field">
        <label for="ed-griglia-passo">Passo della griglia <span id="ed-griglia-passo-val">${grigliaPasso}</span></label>
        <input id="ed-griglia-passo" type="range" min="1" max="${Math.max(2, Math.round(Math.min(map.sala.w, map.sala.h) / 3))}" step="1" value="${grigliaPasso}" />
      </div>
      <p class="editor-form__nota">Trascinando, i tavoli si agganciano ai nodi della griglia. Le guide verso gli altri tavoli sono sempre attive: avvicina un tavolo all'asse di un altro e si allineano da soli (compare una linea).</p>
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

    // Griglia: aiuto d'editing, non modifica la mappa (niente segnaSporco).
    schedaEl.querySelector("#ed-griglia-attiva").addEventListener("change", (e) => {
      grigliaAttiva = e.target.checked;
      aggiornaGriglia();
    });
    const passo = schedaEl.querySelector("#ed-griglia-passo");
    const passoVal = schedaEl.querySelector("#ed-griglia-passo-val");
    passo.addEventListener("input", () => {
      grigliaPasso = Math.max(1, Math.round(Number(passo.value)));
      passoVal.textContent = String(grigliaPasso);
      montaGriglia();
    });
    passo.addEventListener("change", salvaGrigliaPref);
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
  let marquee = null; // selezione a rettangolo su pavimento vuoto

  /* --- selezione multipla ---------------------------------------------------
     Set di id di tavoli. Con ≥2 selezionati compare il pannello Allinea /
     Distribuisci e trascinandone uno si muovono tutti insieme. La selezione è
     un aiuto d'editing: non entra nella mappa salvata. */
  const selezione = new Set();

  function elementiSelezione() {
    return [...selezione].map((id) => map.tavoli.find((t) => t.id === id)).filter(Boolean);
  }

  function evidenziaSelezione() {
    mapEl.querySelectorAll(".tavolo[data-id]").forEach((el) => {
      el.classList.toggle("is-selezionato", selezione.has(el.dataset.id));
    });
  }

  /* Applica lo stato corrente della selezione:
       - ≥2 → pannello Allinea/Distribuisci (e spegne la selezione singola);
       - 1  → resta evidenziato in attesa di altri (nessun pannello: distribuire
              e allinear serve da 2 in su), così Shift+clic costruisce la scelta;
       - 0  → chiude l'eventuale pannello.
     La modifica di un singolo tavolo passa invece dal clic semplice, non da qui. */
  function aggiornaModoSelezione() {
    evidenziaSelezione();
    if (selezione.size >= 2) {
      vista.seleziona(null); // spegne l'eventuale selezione singola
      evidenziaSelezione();
      mostraPannelloSelezione();
    } else if (schedaEl.querySelector(".editor-sel")) {
      schedaEl.hidden = true;
    }
  }

  function svuotaSelezione() {
    if (!selezione.size) return;
    selezione.clear();
    evidenziaSelezione();
    if (schedaEl.querySelector(".editor-sel")) schedaEl.hidden = true;
  }

  function mostraPannelloSelezione() {
    const n = selezione.size;
    const pochi = n < 3; // distribuire ha senso da 3 in su
    schedaEl.hidden = false;
    schedaEl.innerHTML = `<div class="editor-form editor-sel">
      <h3 class="editor-form__titolo">${n} tavoli selezionati</h3>
      <p class="editor-form__nota">Allinea o distribuisci i tavoli selezionati. Trascinane uno per spostarli tutti insieme.</p>
      <div class="editor-sel__gruppo" role="group" aria-label="Allinea">
        <span class="editor-sel__lab">Allinea</span>
        <button class="btn btn-outline" type="button" data-al="sx" title="Bordi a sinistra" aria-label="Allinea a sinistra">⇤</button>
        <button class="btn btn-outline" type="button" data-al="cx" title="Centri sull'asse verticale" aria-label="Allinea al centro orizzontale">↔</button>
        <button class="btn btn-outline" type="button" data-al="dx" title="Bordi a destra" aria-label="Allinea a destra">⇥</button>
        <button class="btn btn-outline" type="button" data-al="alto" title="In alto" aria-label="Allinea in alto">⤒</button>
        <button class="btn btn-outline" type="button" data-al="cy" title="Centri sull'asse orizzontale" aria-label="Allinea al centro verticale">↕</button>
        <button class="btn btn-outline" type="button" data-al="basso" title="In basso" aria-label="Allinea in basso">⤓</button>
      </div>
      <div class="editor-sel__gruppo" role="group" aria-label="Distribuisci">
        <span class="editor-sel__lab">Distribuisci</span>
        <button class="btn btn-outline" type="button" data-di="h" title="Spaziatura orizzontale uguale" aria-label="Distribuisci in orizzontale" ${pochi ? "disabled" : ""}>⇿</button>
        <button class="btn btn-outline" type="button" data-di="v" title="Spaziatura verticale uguale" aria-label="Distribuisci in verticale" ${pochi ? "disabled" : ""}>⇳</button>
      </div>
      ${pochi ? `<p class="editor-form__nota">Per distribuire servono almeno 3 tavoli.</p>` : ""}
      <button class="btn btn-outline" type="button" data-desel>Deseleziona</button>
    </div>`;

    schedaEl.querySelectorAll("[data-al]").forEach((b) =>
      b.addEventListener("click", () => allinea(b.dataset.al))
    );
    schedaEl.querySelectorAll("[data-di]").forEach((b) =>
      b.addEventListener("click", () => distribuisci(b.dataset.di))
    );
    schedaEl.querySelector("[data-desel]").addEventListener("click", svuotaSelezione);
  }

  // Allinea/distribuisci lavorano con 2 decimali (come il sanitizer del server):
  // arrotondare a unità intere renderebbe la spaziatura visibilmente disuguale
  // su sale piccole.
  const r2 = (v) => Math.round(v * 100) / 100;

  /* Allinea i centri dei tavoli selezionati al bordo/centro del loro riquadro
     complessivo (bounding box). */
  function allinea(modo) {
    const sel = elementiSelezione();
    if (sel.length < 2) return;
    const xs = sel.map((t) => t.x);
    const ys = sel.map((t) => t.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs), cX = r2((minX + maxX) / 2);
    const minY = Math.min(...ys), maxY = Math.max(...ys), cY = r2((minY + maxY) / 2);
    for (const t of sel) {
      if (modo === "sx") t.x = minX;
      else if (modo === "dx") t.x = maxX;
      else if (modo === "cx") t.x = cX;
      else if (modo === "alto") t.y = minY;
      else if (modo === "basso") t.y = maxY;
      else if (modo === "cy") t.y = cY;
    }
    segnaSporco();
    ridisegna();
  }

  /* Spaziatura uguale fra i centri: primo e ultimo restano fermi, i mezzani si
     ridistribuiscono. */
  function distribuisci(asse) {
    const sel = elementiSelezione();
    if (sel.length < 3) return;
    const k = asse === "h" ? "x" : "y";
    sel.sort((a, b) => a[k] - b[k]);
    const primo = sel[0][k];
    const passo = (sel[sel.length - 1][k] - primo) / (sel.length - 1);
    sel.forEach((t, i) => {
      t[k] = r2(primo + passo * i);
    });
    segnaSporco();
    ridisegna();
  }

  /* Due sottili linee (verticale + orizzontale) mostrate solo quando il tavolo
     trascinato si allinea a un altro. Vivono nella mappa per il tempo del
     gesto: create al pointerdown, rimosse al rilascio. */
  function creaGuide() {
    const v = document.createElement("span");
    v.className = "snap-guida snap-guida--v";
    v.hidden = true;
    const h = document.createElement("span");
    h.className = "snap-guida snap-guida--h";
    h.hidden = true;
    mapEl.append(v, h);
    return { v, h };
  }

  function aggiornaGuide(gx, gy) {
    const g = trascinato?.guide;
    if (!g) return;
    if (gx == null) g.v.hidden = true;
    else {
      g.v.hidden = false;
      g.v.style.left = `${((gx / map.sala.w) * 100).toFixed(2)}%`;
    }
    if (gy == null) g.h.hidden = true;
    else {
      g.h.hidden = false;
      g.h.style.top = `${((gy / map.sala.h) * 100).toFixed(2)}%`;
    }
  }

  /* Aggancio di un punto trascinato. Per ciascun asse, in ordine di priorità:
     1) il centro di un altro tavolo entro SNAP_PX (→ guida visiva);
     2) il nodo più vicino della griglia, se attiva, entro SNAP_PX;
     3) libero. La tolleranza è in pixel schermo, riconvertita in unità di sala
     per asse (le due dimensioni possono avere scala diversa). */
  function agganciaAllineamento(punto, idEscluso) {
    const { w, h } = map.sala;
    const rect = trascinato?.rect || mapEl.getBoundingClientRect();
    const tolX = SNAP_PX * (w / rect.width);
    const tolY = SNAP_PX * (h / rect.height);
    let x = punto.x;
    let y = punto.y;
    let guidaX = null;
    let guidaY = null;

    let distX = tolX;
    let distY = tolY;
    for (const t of map.tavoli) {
      if (t.id === idEscluso) continue;
      const dx = Math.abs(t.x - punto.x);
      if (dx < distX) {
        distX = dx;
        guidaX = t.x;
      }
      const dy = Math.abs(t.y - punto.y);
      if (dy < distY) {
        distY = dy;
        guidaY = t.y;
      }
    }
    // aggX/aggY: l'asse è stato agganciato (a un tavolo o alla griglia). Serve al
    // rilascio per NON arrotondare a intero un aggancio a coordinata frazionaria
    // (es. dopo un "distribuisci"), che altrimenti si disallineerebbe di ~1 unità.
    let aggX = guidaX != null;
    let aggY = guidaY != null;
    if (guidaX != null) x = guidaX;
    else if (grigliaAttiva) {
      const g = Math.round(punto.x / grigliaPasso) * grigliaPasso;
      if (Math.abs(g - punto.x) <= tolX) {
        x = Math.min(w, Math.max(0, g));
        aggX = true;
      }
    }
    if (guidaY != null) y = guidaY;
    else if (grigliaAttiva) {
      const g = Math.round(punto.y / grigliaPasso) * grigliaPasso;
      if (Math.abs(g - punto.y) <= tolY) {
        y = Math.min(h, Math.max(0, g));
        aggY = true;
      }
    }
    return { x, y, guidaX, guidaY, aggX, aggY };
  }

  /* Si trascinano più cose, distinte da `tipo`:
       - "etichetta"  → le scritte INGRESSO / Sposi (posizione libera);
       - "ingresso"   → la maniglia dell'ingresso (aggancio al muro);
       - "tavolo"     → un tavolo singolo (aggancio magnetico + guide);
       - "gruppo"     → tutti i tavoli selezionati insieme (nessun aggancio).
     Sul pavimento vuoto parte invece il marquee di selezione. */
  mapEl.addEventListener("pointerdown", (e) => {
    const etichetta = e.target.closest(".mappa__etichetta");
    const maniglia = e.target.closest(".ingresso-handle");
    const tavoloEl = e.target.closest(".tavolo[data-id]");
    const rect = mapEl.getBoundingClientRect();

    // Blocca il drag&drop nativo e la selezione del testo.
    if (etichetta || maniglia || tavoloEl) e.preventDefault();

    if (etichetta) {
      // Posizione visiva attuale in unità: getBoundingClientRect tiene conto
      // anche dell'offset "sopra al cerchio" del default, così non c'è scatto.
      const r = etichetta.getBoundingClientRect();
      const origine = {
        x: ((r.left + r.width / 2 - rect.left) / rect.width) * map.sala.w,
        y: ((r.top + r.height / 2 - rect.top) / rect.height) * map.sala.h,
      };
      trascinato = {
        tipo: "etichetta",
        el: etichetta,
        etichettaTipo: etichetta.dataset.etichetta,
        etichettaId: etichetta.dataset.id || null,
        rect,
        partenzaX: e.clientX,
        partenzaY: e.clientY,
        origine,
        mosso: false,
      };
      etichetta.classList.add("is-dragging"); // forza il transform base (niente --sopra)
      posizionaPunto(etichetta, origine);
      etichetta.setPointerCapture(e.pointerId);
      return;
    }

    if (maniglia) {
      trascinato = {
        tipo: "ingresso",
        el: maniglia,
        rect,
        partenzaX: e.clientX,
        partenzaY: e.clientY,
        origine: { ...map.sala.ingresso },
        mosso: false,
      };
      maniglia.setPointerCapture(e.pointerId);
      maniglia.classList.add("is-dragging");
      return;
    }

    if (tavoloEl) {
      const t = map.tavoli.find((x) => x.id === tavoloEl.dataset.id);
      if (!t) return;
      const mod = e.shiftKey || e.ctrlKey || e.metaKey;
      if (mod) {
        // Aggiunge/toglie dalla selezione, senza avviare un trascinamento.
        if (selezione.has(t.id)) selezione.delete(t.id);
        else selezione.add(t.id);
        aggiornaModoSelezione();
        return;
      }
      if (selezione.has(t.id) && selezione.size >= 2) {
        // Trascinamento di gruppo: muove tutti i selezionati insieme.
        trascinato = {
          tipo: "gruppo",
          el: tavoloEl,
          rect,
          partenzaX: e.clientX,
          partenzaY: e.clientY,
          origini: elementiSelezione().map((tt) => ({ t: tt, x0: tt.x, y0: tt.y })),
          mosso: false,
        };
        tavoloEl.setPointerCapture(e.pointerId);
        tavoloEl.classList.add("is-dragging");
        return;
      }
      // Trascinamento singolo: esce da un'eventuale selezione multipla.
      if (selezione.size) svuotaSelezione();
      trascinato = {
        tipo: "tavolo",
        el: tavoloEl,
        t,
        rect,
        partenzaX: e.clientX,
        partenzaY: e.clientY,
        origine: { x: t.x, y: t.y },
        mosso: false,
        guide: creaGuide(),
      };
      tavoloEl.setPointerCapture(e.pointerId);
      tavoloEl.classList.add("is-dragging");
      return;
    }

    // Pavimento vuoto → marquee di selezione (Shift/Ctrl = aggiunge).
    e.preventDefault();
    const box = document.createElement("div");
    box.className = "marquee";
    mapEl.appendChild(box);
    marquee = {
      box,
      rect,
      pointerId: e.pointerId,
      partenzaX: e.clientX,
      partenzaY: e.clientY,
      aggiungi: e.shiftKey || e.ctrlKey || e.metaKey,
      mosso: false,
    };
    mapEl.setPointerCapture(e.pointerId);
  });

  mapEl.addEventListener("pointermove", (e) => {
    if (marquee) {
      const dx = e.clientX - marquee.partenzaX;
      const dy = e.clientY - marquee.partenzaY;
      if (!marquee.mosso && Math.hypot(dx, dy) > 4) marquee.mosso = true;
      if (!marquee.mosso) return;
      e.preventDefault();
      Object.assign(marquee.box.style, {
        left: `${Math.min(marquee.partenzaX, e.clientX) - marquee.rect.left}px`,
        top: `${Math.min(marquee.partenzaY, e.clientY) - marquee.rect.top}px`,
        width: `${Math.abs(dx)}px`,
        height: `${Math.abs(dy)}px`,
      });
      return;
    }
    if (!trascinato) return;
    const { rect, partenzaX, partenzaY } = trascinato;
    if (!trascinato.mosso && Math.hypot(e.clientX - partenzaX, e.clientY - partenzaY) > 4) {
      trascinato.mosso = true;
    }
    if (!trascinato.mosso) return;
    e.preventDefault();
    const dux = ((e.clientX - partenzaX) / rect.width) * map.sala.w;
    const duy = ((e.clientY - partenzaY) / rect.height) * map.sala.h;
    const dentro = (v, max, base) => Math.min(max, Math.max(0, base + v));

    if (trascinato.tipo === "gruppo") {
      // Sposta il blocco, limitando il delta perché nessun tavolo esca.
      const xs0 = trascinato.origini.map((o) => o.x0);
      const ys0 = trascinato.origini.map((o) => o.y0);
      const ddx = Math.max(-Math.min(...xs0), Math.min(map.sala.w - Math.max(...xs0), dux));
      const ddy = Math.max(-Math.min(...ys0), Math.min(map.sala.h - Math.max(...ys0), duy));
      trascinato.ddx = ddx;
      trascinato.ddy = ddy;
      for (const o of trascinato.origini) {
        o.t.x = o.x0 + ddx;
        o.t.y = o.y0 + ddy;
        const el = mapEl.querySelector(`.tavolo[data-id="${CSS.escape(o.t.id)}"]`);
        if (el) posizionaPunto(el, o.t);
      }
      return;
    }

    const punto = {
      x: dentro(dux, map.sala.w, trascinato.origine.x),
      y: dentro(duy, map.sala.h, trascinato.origine.y),
    };

    if (trascinato.tipo === "etichetta") {
      trascinato.punto = punto;
      posizionaPunto(trascinato.el, punto);
      return;
    }
    if (trascinato.tipo === "ingresso") {
      map.sala.ingresso = punto;
      posizionaPunto(trascinato.el, punto);
      return;
    }
    // tavolo singolo: aggancio magnetico (guide + griglia).
    const s = agganciaAllineamento(punto, trascinato.t.id);
    trascinato.t.x = s.x;
    trascinato.t.y = s.y;
    trascinato.aggX = s.aggX;
    trascinato.aggY = s.aggY;
    posizionaPunto(trascinato.el, trascinato.t);
    aggiornaGuide(s.guidaX, s.guidaY);
  });

  const fineTrascinamento = (e) => {
    // Fine del marquee: seleziona i tavoli col centro dentro il rettangolo.
    if (marquee) {
      const { box, mosso, aggiungi, pointerId } = marquee;
      const r = box.getBoundingClientRect();
      box.remove();
      marquee = null;
      try {
        mapEl.releasePointerCapture(pointerId);
      } catch {}
      if (!mosso) {
        svuotaSelezione(); // clic a vuoto = deseleziona
        return;
      }
      if (!aggiungi) selezione.clear();
      map.tavoli.forEach((t) => {
        const el = mapEl.querySelector(`.tavolo[data-id="${CSS.escape(t.id)}"]`);
        if (!el) return;
        const c = el.getBoundingClientRect();
        const cx = c.left + c.width / 2;
        const cy = c.top + c.height / 2;
        if (cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom) selezione.add(t.id);
      });
      aggiornaModoSelezione();
      return;
    }

    if (!trascinato) return;
    const tr = trascinato;
    tr.el.classList.remove("is-dragging");
    if (tr.guide) {
      tr.guide.v.remove();
      tr.guide.h.remove();
    }
    trascinato = null;
    if (e) e.preventDefault();

    if (tr.tipo === "etichetta") {
      if (!tr.mosso) {
        ridisegna(); // clic senza spostamento: ripristina la posizione di default
        return;
      }
      const p = tr.punto || tr.origine;
      const pos = { x: Math.round(p.x), y: Math.round(p.y) };
      if (tr.etichettaTipo === "ingresso") map.sala.ingressoLabel = pos;
      else {
        const t = map.tavoli.find((x) => x.id === tr.etichettaId);
        if (t) t.ruoloPos = pos;
      }
      segnaSporco();
      ridisegna();
      return;
    }

    if (tr.tipo === "ingresso") {
      if (!tr.mosso) return;
      // Un ingresso sta su un muro per definizione: il vincolo lavora a favore.
      map.sala.ingresso = agganciaAlMuro(map.sala.ingresso, map.sala);
      segnaSporco();
      ridisegna(); // il varco e la freccia possono essere cambiati di parete
      return;
    }

    if (tr.tipo === "gruppo") {
      if (tr.mosso) {
        // Arrotondo il DELTA (non ogni tavolo): la spaziatura del blocco resta
        // identica anche dopo un eventuale allinea/distribuisci precedente.
        const ddx = r2(tr.ddx || 0);
        const ddy = r2(tr.ddy || 0);
        tr.origini.forEach((o) => {
          o.t.x = r2(o.x0 + ddx);
          o.t.y = r2(o.y0 + ddy);
        });
        segnaSporco();
        ridisegna(); // mantiene la selezione (evidenziaSelezione)
      }
      return;
    }

    // tavolo singolo
    if (tr.mosso) {
      // Asse agganciato → mantieni la coordinata esatta (anche frazionaria);
      // asse libero → arrotonda a intero, così un trascinamento a mano non
      // finisce a 43,7 (aggancio a 1 unità di sempre).
      tr.t.x = tr.aggX ? r2(tr.t.x) : Math.round(tr.t.x);
      tr.t.y = tr.aggY ? r2(tr.t.y) : Math.round(tr.t.y);
      posizionaPunto(tr.el, tr.t);
      segnaSporco();
    }
    vista.seleziona(tr.t.id, { scheda: false });
    mostraForm(tr.t.id);
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

  /* --- frecce: rifinitura di 1 unità (tavolo singolo o gruppo selezionato) --- */
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && selezione.size) {
      svuotaSelezione();
      return;
    }
    if (!e.key.startsWith("Arrow")) return;
    if (e.target.matches("input, select, textarea")) return;
    const passo = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!passo) return;

    // Gruppo: muove tutti i selezionati, limitando perché nessuno esca.
    if (selezione.size >= 2) {
      const sel = elementiSelezione();
      e.preventDefault();
      const minX = Math.min(...sel.map((t) => t.x));
      const minY = Math.min(...sel.map((t) => t.y));
      const maxX = Math.max(...sel.map((t) => t.x));
      const maxY = Math.max(...sel.map((t) => t.y));
      const dx = Math.max(-minX, Math.min(map.sala.w - maxX, passo[0]));
      const dy = Math.max(-minY, Math.min(map.sala.h - maxY, passo[1]));
      sel.forEach((t) => {
        t.x += dx;
        t.y += dy;
      });
      segnaSporco();
      ridisegna();
      return;
    }

    const id = vista.selezionato();
    if (!id) return;
    const t = map.tavoli.find((x) => x.id === id);
    if (!t) return;
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

  barra.querySelector("#ed-griglia").addEventListener("click", () => {
    grigliaAttiva = !grigliaAttiva;
    aggiornaGriglia();
  });

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
