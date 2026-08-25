/*
 * Vista della piantina dei tavoli.
 *
 * Composizione (ADR-0004 + decisioni di sessione):
 *  - la SALA è un SVG di sfondo (muri, varco e freccia dell'ingresso);
 *  - ogni TAVOLO è un <button> HTML posizionato in percentuale sopra l'SVG,
 *    così ottiene gratis focus da tastiera, area di tocco e aria-*;
 *  - l'ELENCO alfabetico delle cantine è lo strumento di ricerca: l'invitato ha
 *    in mano un NOME (letto sul tableau fisico), non un numero;
 *  - selezionare (da mappa o da elenco) accende il cerchio e apre la SCHEDA
 *    sotto la mappa, che resta visibile: il compito è spaziale.
 *
 * Il logo non è un dato: si ricava dal nome della cantina
 * -> assets/img/cantine/<slug>.png. Se il file manca, il cerchio mostra le
 * iniziali — così la piantina è utilizzabile prima di avere un solo logo.
 */
import { tavoli as tavoliStore } from "./adapter.js";

const LOGO_DIR = "assets/img/cantine/";

/* Grandezza uniforme dei cerchi (sala.tavoloScala), limitata a un intervallo
   sensato. Condivisa con l'editor (cursore) e ricalcata dal server in saveMap. */
export const TAVOLO_SCALA_MIN = 0.6;
export const TAVOLO_SCALA_MAX = 1.8;
export function scalaTavoli(sala) {
  const v = Number(sala?.tavoloScala);
  if (!Number.isFinite(v) || v <= 0) return 1;
  return Math.min(TAVOLO_SCALA_MAX, Math.max(TAVOLO_SCALA_MIN, v));
}

/* "Ca' del Bosco" -> "ca-del-bosco" (accenti e apostrofi via, spazi in -) */
export function slugCantina(nome) {
  return String(nome)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/* "Ca' del Bosco" -> "CDB" · "Cantina 7" -> "C7" (max 3 caratteri) */
export function inizialiCantina(nome) {
  const parole = String(nome)
    .split(/\s+/)
    .filter((p) => p && !/^(di|de|del|della|dei|delle|da|e|il|la|lo|i|le)$/i.test(p));
  const fonte = parole.length ? parole : String(nome).split(/\s+/);
  return fonte
    .slice(0, 3)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

/* ---- SALA (SVG) ----------------------------------------------------------
   L'ingresso può stare su una qualsiasi delle quattro pareti: il muro non è un
   dato, si deduce dalla posizione (il più vicino). Così i dati salvati restano
   semplici — solo x,y — e vecchie mappe con l'ingresso "quasi" sul muro
   continuano a disegnarsi bene. */
export function muroPiuVicino({ x, y }, sala) {
  const d = { sinistra: x, destra: sala.w - x, alto: y, basso: sala.h - y };
  return Object.keys(d).reduce((a, b) => (d[b] < d[a] ? b : a));
}

/* Posa un punto sul muro più vicino, tenendolo lontano dagli angoli. */
export function agganciaAlMuro(punto, sala) {
  const lato = muroPiuVicino(punto, sala);
  const m = Math.min(8, sala.w / 6, sala.h / 6);
  const x = Math.min(sala.w - m, Math.max(m, punto.x));
  const y = Math.min(sala.h - m, Math.max(m, punto.y));
  if (lato === "sinistra") return { x: 0, y };
  if (lato === "destra") return { x: sala.w, y };
  if (lato === "alto") return { x, y: 0 };
  return { x, y: sala.h };
}

function salaSvg(sala) {
  const { w, h } = sala;
  const ing = sala.ingresso || { x: w / 2, y: h };
  const lato = muroPiuVicino(ing, sala);
  const dentro = 8; // di quanto la freccia entra nella sala

  let varco;
  let freccia;

  if (lato === "alto" || lato === "basso") {
    const muroY = lato === "alto" ? 1 : h - 1;
    const verso = lato === "alto" ? 1 : -1; // la freccia punta verso l'interno
    const puntaY = muroY + dentro * verso;
    varco = `<line class="mappa__varco" x1="${ing.x - 8}" y1="${muroY}" x2="${ing.x + 8}" y2="${muroY}" />`;
    freccia =
      `<line x1="${ing.x}" y1="${muroY}" x2="${ing.x}" y2="${puntaY}" />` +
      `<polyline points="${ing.x - 2.6},${puntaY - 2.8 * verso} ${ing.x},${puntaY} ${ing.x + 2.6},${puntaY - 2.8 * verso}" />`;
  } else {
    const muroX = lato === "sinistra" ? 1 : w - 1;
    const verso = lato === "sinistra" ? 1 : -1;
    const puntaX = muroX + dentro * verso;
    varco = `<line class="mappa__varco" x1="${muroX}" y1="${ing.y - 8}" x2="${muroX}" y2="${ing.y + 8}" />`;
    freccia =
      `<line x1="${muroX}" y1="${ing.y}" x2="${puntaX}" y2="${ing.y}" />` +
      `<polyline points="${puntaX - 2.8 * verso},${ing.y - 2.6} ${puntaX},${ing.y} ${puntaX - 2.8 * verso},${ing.y + 2.6}" />`;
  }

  // L'etichetta "INGRESSO" NON è più nell'SVG: è un'etichetta del layer HTML
  // (vedi etichetteHtml), così gli Sposi possono spostarla in modifica.
  return `<svg class="mappa__sala" viewBox="0 0 ${w} ${h}" aria-hidden="true" focusable="false">
    <rect class="mappa__muri" x="1" y="1" width="${w - 2}" height="${h - 2}" rx="3" />
    ${varco}
    <g class="mappa__ingresso">${freccia}</g>
  </svg>`;
}

/* ---- ETICHETTE (layer HTML sopra la mappa) ------------------------------
   "INGRESSO" e "Sposi" sono scritte posizionabili: di default stanno dove
   stavano prima (etichettaIngressoDefault / sopra al tavolo sposi), ma gli
   Sposi possono trascinarle in modifica e la posizione si salva
   (sala.ingressoLabel, tavolo.ruoloPos). Senza override l'aspetto è identico
   a prima, quindi la vista degli invitati non cambia. */
export function etichettaIngressoDefault(sala) {
  const { w, h } = sala;
  const ing = sala.ingresso || { x: w / 2, y: h };
  const lato = muroPiuVicino(ing, sala);
  const dentro = 8;
  if (lato === "alto") return { x: ing.x, y: dentro + 5 };
  if (lato === "basso") return { x: ing.x, y: h - dentro - 5 };
  if (lato === "sinistra") return { x: dentro + 7, y: ing.y };
  return { x: w - dentro - 7, y: ing.y };
}

function etichetteHtml(map) {
  const { sala } = map;
  const pos = (p) =>
    `left:${((p.x / sala.w) * 100).toFixed(2)}%;top:${((p.y / sala.h) * 100).toFixed(2)}%`;

  const parti = [];
  const iPos = sala.ingressoLabel || etichettaIngressoDefault(sala);
  parti.push(
    `<span class="mappa__etichetta mappa__etichetta--ingresso" data-etichetta="ingresso" style="${pos(iPos)}">INGRESSO</span>`
  );

  for (const t of map.tavoli) {
    if (t.tipo !== "sposi") continue;
    const override = t.ruoloPos;
    const p = override || { x: t.x, y: t.y };
    // Senza override la scritta sta "sopra" al cerchio (offset in px via CSS,
    // così resta a filo del cerchio a ogni scala); con override è centrata sul
    // punto scelto.
    const sopra = override ? "" : " mappa__etichetta--sopra";
    parti.push(
      `<span class="mappa__etichetta mappa__etichetta--ruolo${sopra}" data-etichetta="ruolo" data-id="${esc(t.id)}" style="${pos(p)}">Sposi</span>`
    );
  }
  return parti.join("");
}

/* Sorgente del logo: prima l'URL caricato dall'editor (Blob o data-URL), poi il
   file statico per convenzione (slug.png), infine — se l'immagine non carica —
   le iniziali (gestito da attivaFallbackLoghi). ADR-0004: il logo ora può essere
   un dato, non più solo un file statico. */
export function logoSrc(cantina, nome) {
  const salvato = cantina?.logoUrl;
  if (salvato && /^(https?:|data:)/i.test(salvato)) return salvato;
  return `${LOGO_DIR}${slugCantina(nome)}.png`;
}

/* ---- TAVOLI (bottoni sopra l'SVG) --------------------------------------- */
function cerchioInterno(cantina, nome) {
  return `<span class="tavolo__cerchio">
      <img class="tavolo__logo" src="${esc(logoSrc(cantina, nome))}" alt="" draggable="false" />
      <span class="tavolo__iniziali" hidden>${esc(inizialiCantina(nome))}</span>
    </span>`;
}

function tavoloHtml(t, cantina, sala) {
  const style = `left:${((t.x / sala.w) * 100).toFixed(2)}%;top:${((t.y / sala.h) * 100).toFixed(2)}%`;

  if (t.tipo === "staff") {
    // Visibile ma muto: il tratteggio dice "questo cerchio esiste ma non ti
    // riguarda". Non è un button proprio perché non deve invitare al clic.
    return `<span class="tavolo tavolo--staff" style="${style}" data-id="${esc(t.id)}">
      <span class="tavolo__cerchio"><span class="tavolo__iniziali">Staff</span></span>
    </span>`;
  }

  const nome = cantina?.nome || "Tavolo";
  const sposi = t.tipo === "sposi";
  // La scritta "Sposi" è ora un'etichetta del layer (etichetteHtml), non più
  // dentro al bottone: così è spostabile in modifica.
  return `<button type="button" class="tavolo${sposi ? " tavolo--sposi" : ""}" style="${style}"
      data-id="${esc(t.id)}" aria-pressed="false" aria-label="Tavolo ${esc(nome)}">
    ${cerchioInterno(cantina, nome)}
  </button>`;
}

/* ---- ELENCO alfabetico -------------------------------------------------- */
function rigaHtml(t, cantina) {
  const nome = cantina?.nome || "Tavolo";
  return `<li>
    <button type="button" class="cantina-row" data-id="${esc(t.id)}" aria-pressed="false">
      <span class="cantina-row__logo">
        <img class="tavolo__logo" src="${esc(logoSrc(cantina, nome))}" alt="" draggable="false" />
        <span class="tavolo__iniziali" hidden>${esc(inizialiCantina(nome))}</span>
      </span>
      <span class="cantina-row__testo">
        <span class="cantina-row__nome">${esc(nome)}</span>
        ${cantina?.zona ? `<span class="cantina-row__zona">${esc(cantina.zona)}</span>` : ""}
      </span>
      ${t.tipo === "sposi" ? '<span class="cantina-row__badge">Sposi</span>' : ""}
    </button>
  </li>`;
}

/* ---- SCHEDA ------------------------------------------------------------- */
function schedaHtml(t, cantina) {
  const nome = cantina?.nome || "Tavolo";
  const righe = [
    cantina?.zona ? ["Zona", cantina.zona] : null,
    cantina?.vitigni ? ["Vitigni", cantina.vitigni] : null,
    t.posti > 0 ? ["Posti", String(t.posti)] : null,
  ].filter(Boolean);

  return `<div class="scheda__logo">
      <img class="tavolo__logo" src="${esc(logoSrc(cantina, nome))}" alt="Logo ${esc(nome)}" />
      <span class="tavolo__iniziali" hidden>${esc(inizialiCantina(nome))}</span>
    </div>
    ${t.tipo === "sposi" ? '<p class="scheda__ruolo">Il tavolo degli sposi</p>' : ""}
    <h3 class="scheda__nome">${esc(nome)}</h3>
    ${
      righe.length
        ? `<dl class="scheda__meta">${righe
            .map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`)
            .join("")}</dl>`
        : ""
    }
    ${
      /* Solo http/https: un "javascript:..." arrivato dal seme o dall'editor non
         deve finire in un href. In modalità api il server già ripulisce, ma la
         vista non deve dipendere da chi le passa i dati. */
      /^https?:\/\//i.test(cantina?.sito || "")
        ? `<a class="btn btn-outline scheda__sito" href="${esc(cantina.sito)}" target="_blank" rel="noopener">Visita la cantina</a>`
        : ""
    }`;
}

/* Il logo può non esistere ancora: in quel caso mostriamo le iniziali. */
function attivaFallbackLoghi(root) {
  root.querySelectorAll("img.tavolo__logo").forEach((img) => {
    const iniziali = img.parentElement.querySelector(".tavolo__iniziali");
    const fallback = () => {
      img.remove();
      if (iniziali) iniziali.hidden = false;
    };
    if (img.complete && img.naturalWidth === 0) fallback();
    else img.addEventListener("error", fallback, { once: true });
  });
}

/* ---- init --------------------------------------------------------------- */
export async function initTavoliView({ mapEl, elencoEl, schedaEl }) {
  let map;
  try {
    map = await tavoliStore.getMap();
  } catch (err) {
    console.error(err);
    mapEl.innerHTML = `<p class="mappa__errore">Impossibile caricare la piantina. Riprova più tardi.</p>`;
    return null;
  }

  const cantinaDi = (t) => map.cantine.find((c) => c.id === t.cantinaId) || null;
  let selezionato = null;

  /* Ridisegna mappa ed elenco dall'oggetto `map`. L'editor lo richiama dopo
     ogni modifica strutturale (tavolo aggiunto/eliminato, cantina rinominata:
     il nome decide logo e iniziali). Gli spostamenti durante il trascinamento
     NON passano di qui — muovono direttamente lo stile del bottone. */
  function render() {
    const { sala } = map;
    // Rapporto larghezza/altezza: tiene la mappa in proporzione e permette al
    // CSS di limitarne l'altezza senza deformarla.
    mapEl.style.setProperty("--sala-ar", (sala.w / sala.h).toFixed(4));
    // Grandezza uniforme dei cerchi, decisa dagli Sposi (default 1).
    mapEl.style.setProperty("--tavolo-scala", String(scalaTavoli(sala)));
    mapEl.innerHTML =
      salaSvg(sala) +
      map.tavoli.map((t) => tavoloHtml(t, cantinaDi(t), sala)).join("") +
      etichetteHtml(map);

    const apribili = map.tavoli.filter((t) => t.tipo !== "staff");
    const ordinati = [...apribili].sort((a, b) =>
      (cantinaDi(a)?.nome || "").localeCompare(cantinaDi(b)?.nome || "", "it")
    );
    elencoEl.innerHTML = `<ul class="elenco__lista">${ordinati
      .map((t) => rigaHtml(t, cantinaDi(t)))
      .join("")}</ul>`;

    attivaFallbackLoghi(mapEl);
    attivaFallbackLoghi(elencoEl);
    if (selezionato) evidenzia(selezionato);
  }

  /* Solo l'accensione visiva, senza toccare la scheda: serve sia a seleziona()
     sia a render(), che deve ritrovare acceso il tavolo già scelto. */
  function evidenzia(id) {
    mapEl.querySelectorAll(".tavolo[data-id]").forEach((el) => {
      const attivo = el.dataset.id === id;
      el.classList.toggle("is-attivo", attivo);
      if (el.tagName === "BUTTON") el.setAttribute("aria-pressed", String(attivo));
    });
    elencoEl.querySelectorAll(".cantina-row").forEach((el) => {
      const attivo = el.dataset.id === id;
      el.classList.toggle("is-attivo", attivo);
      el.setAttribute("aria-pressed", String(attivo));
    });
  }

  function seleziona(id, { scorri = false, scheda = true } = {}) {
    if (id === null) {
      // Deselezione esplicita (l'editor la usa quando passa al pannello Sala).
      selezionato = null;
      evidenzia(null);
      schedaEl.hidden = true;
      return;
    }
    const t = map.tavoli.find((x) => x.id === id);
    if (!t) return;
    selezionato = id;
    evidenzia(id);
    if (!scheda || t.tipo === "staff") return; // lo Staff non ha scheda da aprire

    schedaEl.innerHTML = schedaHtml(t, cantinaDi(t));
    schedaEl.hidden = false;
    attivaFallbackLoghi(schedaEl);
    if (scorri) schedaEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  render();

  mapEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".tavolo[data-id]");
    if (btn && btn.tagName === "BUTTON") seleziona(btn.dataset.id, { scorri: true });
  });
  elencoEl.addEventListener("click", (e) => {
    const row = e.target.closest(".cantina-row");
    if (row) seleziona(row.dataset.id, { scorri: true });
  });

  return { map, render, seleziona, cantinaDi, selezionato: () => selezionato };
}
