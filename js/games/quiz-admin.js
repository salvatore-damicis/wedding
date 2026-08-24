/*
 * Gioco live — vista SPOSI (regia + authoring), giochi.html?admin (ADR-0005).
 * Import dinamico: un invitato non scarica nemmeno questo modulo.
 *
 * Due pannelli:
 *   Regia    — avvia, apri domanda, mostra risposta, prossima, termina; con
 *              cruscotto live (fase, giocatori, domanda corrente, classifica).
 *   Domande  — crea/modifica le domande (multiple-choice + timer) e le salva.
 * Più l'interruttore "giochi attivi" (settings), che decide se gli invitati
 * vedono il gioco.
 */
import { game } from "./adapter.js";
import { tavoli } from "../tavoli/adapter.js";
import { adminSession } from "../admin-session.js";
import { toast } from "../ui.js";
import { WEDDING } from "../../data/config.js";

const OPT_LETTERS = ["A", "B", "C", "D", "E", "F"];

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}
const uid = () =>
  crypto.randomUUID ? crypto.randomUUID() : `q-${Date.now()}-${Math.round(Math.random() * 1e6)}`;

/* PIN admin: chiesto una volta, ricordato sul dispositivo (come l'editor tavoli). */
function chiediPin() {
  return new Promise((resolve) => {
    const el = document.createElement("div");
    el.className = "modal open";
    el.innerHTML = `<div class="modal__box">
      <h2 class="modal__title">Regia del gioco</h2>
      <p class="modal__hint">Riservato agli sposi.</p>
      <div class="field"><label for="ga-pin">PIN</label>
        <input id="ga-pin" type="password" inputmode="numeric" autocomplete="off" /></div>
      <p class="modal__error" id="ga-err"></p>
      <div class="modal__actions">
        <button class="btn btn-outline" id="ga-annulla" type="button">Annulla</button>
        <button class="btn btn-primary" id="ga-ok" type="button">Entra</button>
      </div>
    </div>`;
    document.body.appendChild(el);
    const input = el.querySelector("#ga-pin");
    const err = el.querySelector("#ga-err");
    const close = (v) => {
      el.remove();
      resolve(v);
    };
    const prova = async () => {
      const pin = input.value.trim();
      if (!pin) return;
      err.textContent = "Verifica…";
      (await game.verifyAdmin(pin)) ? close(pin) : ((err.textContent = "PIN non valido."), input.select());
    };
    el.querySelector("#ga-ok").addEventListener("click", prova);
    el.querySelector("#ga-annulla").addEventListener("click", () => close(null));
    input.addEventListener("keydown", (e) => e.key === "Enter" && prova());
    input.focus();
  });
}

export async function initGiocoAdmin(root, fallbackGuest) {
  let pin = adminSession.pin();
  if (!pin || !(await game.verifyAdmin(pin))) {
    pin = await chiediPin();
    if (!pin) return fallbackGuest(); // annullato: mostra la vista invitato
    adminSession.remember(pin);
  }

  root.innerHTML = `<div class="ga">
    <div class="ga-tabs">
      <button class="ga-tab is-active" data-tab="regia" type="button">Regia</button>
      <button class="ga-tab" data-tab="domande" type="button">Domande</button>
    </div>
    <div class="ga-panel" data-panel="regia"></div>
    <div class="ga-panel" data-panel="domande" hidden></div>
  </div>`;

  const regiaEl = root.querySelector('[data-panel="regia"]');
  const domandeEl = root.querySelector('[data-panel="domande"]');
  root.querySelectorAll(".ga-tab").forEach((t) =>
    t.addEventListener("click", () => {
      root.querySelectorAll(".ga-tab").forEach((x) => x.classList.toggle("is-active", x === t));
      regiaEl.hidden = t.dataset.tab !== "regia";
      domandeEl.hidden = t.dataset.tab !== "domande";
    })
  );

  initRegia(regiaEl, pin);
  initDomande(domandeEl, pin);
}

/* ============================ REGIA ============================ */
function initRegia(el, pin) {
  let last = null; // firma dell'ultimo stato disegnato

  el.innerHTML = `<div class="ga-dash"></div>
    <div class="ga-controls"></div>
    <label class="ga-switch"><input type="checkbox" id="ga-attivi"> <span>Gioco visibile agli invitati</span></label>
    <div class="ga-live"></div>`;

  const dash = el.querySelector(".ga-dash");
  const controls = el.querySelector(".ga-controls");
  const live = el.querySelector(".ga-live");
  const attivi = el.querySelector("#ga-attivi");

  tavoli.getSettings().then((s) => (attivi.checked = !!s.giochiAttivi)).catch(() => {});
  attivi.addEventListener("change", async () => {
    try {
      await tavoli.saveSettings(pin, { giochiAttivi: attivi.checked });
      toast(attivi.checked ? "Gioco visibile agli invitati" : "Gioco nascosto");
    } catch (err) {
      toast(err.message || "Impossibile salvare");
      attivi.checked = !attivi.checked;
    }
  });

  async function azione(action) {
    try {
      await game.control(pin, action);
      refresh();
    } catch (err) {
      if (/autorizz/i.test(err.message)) {
        adminSession.forget();
        toast("PIN non più valido: ricarica la pagina");
      } else toast(err.message || "Azione non riuscita");
    }
  }
  // Deleghiamo i click dei bottoni (ridisegnati a ogni refresh).
  controls.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]");
    if (!b) return;
    if (b.dataset.act === "reset" && !confirm("Azzerare la partita?")) return;
    azione(b.dataset.act);
  });

  const PHASE_IT = { idle: "Ferma", lobby: "Sala d'attesa", question: "Domanda aperta", reveal: "Risposta", ended: "Finita" };

  async function refresh() {
    let s;
    try {
      s = await game.getState();
    } catch {
      return;
    }
    dash.innerHTML = `<span class="ga-badge ga-badge--${s.phase}">${PHASE_IT[s.phase] || s.phase}</span>
      <span class="ga-dash__info">${s.phase === "question" || s.phase === "reveal" ? `Domanda ${s.round + 1}/${s.total}` : `${s.total} domande`}</span>
      <span class="ga-dash__info">👥 ${s.playerCount}</span>`;

    controls.innerHTML = bottoni(s);

    // Cruscotto live: domanda corrente (con la corretta) + classifica.
    const sig = `${s.phase}#${s.round}#${(s.leaderboard || []).map((e) => e.score).join(",")}#${s.playerCount}`;
    if (sig !== last) {
      last = sig;
      live.innerHTML = liveHtml(s);
    }
  }

  function bottoni(s) {
    const b = (act, label, cls = "btn-outline") => `<button class="btn ${cls}" data-act="${act}" type="button">${label}</button>`;
    if (s.phase === "idle")
      return b("start", "▶ Avvia partita", "btn-primary") + (s.total ? "" : `<span class="ga-warn">Salva prima le domande</span>`);
    if (s.phase === "lobby") return b("open", "Apri la prima domanda", "btn-primary") + b("reset", "Azzera");
    if (s.phase === "question") return b("reveal", "Mostra la risposta", "btn-primary") + b("reset", "Azzera");
    if (s.phase === "reveal") {
      const ultima = s.round + 1 >= s.total;
      return (
        b("open", ultima ? "Classifica finale 🏆" : "Prossima domanda ▶", "btn-primary") +
        b("end", "Termina ora") +
        b("reset", "Azzera")
      );
    }
    if (s.phase === "ended") return b("start", "Nuova partita", "btn-primary") + b("reset", "Azzera");
    return "";
  }

  function liveHtml(s) {
    let html = "";
    if ((s.phase === "question" || s.phase === "reveal") && s.question) {
      html += `<div class="ga-live__q"><strong>${esc(s.question.q)}</strong><ul>${s.question.options
        .map(
          (o, i) =>
            `<li class="${s.phase === "reveal" && i === s.correct ? "is-correct" : ""}">${OPT_LETTERS[i]}. ${esc(o)}${
              s.phase === "reveal" && s.counts ? ` <em>(${s.counts[i] || 0})</em>` : ""
            }</li>`
        )
        .join("")}</ul></div>`;
    }
    const lb = s.leaderboard || [];
    if (lb.length) {
      html += `<ol class="ga-live__board">${lb
        .slice(0, 10)
        .map((e) => `<li><span>${esc(e.name)}</span><b>${e.score}</b></li>`)
        .join("")}</ol>`;
    }
    return html;
  }

  setInterval(refresh, 1500);
  refresh();
}

/* ============================ DOMANDE ============================ */
function initDomande(el, pin) {
  let questions = [];

  el.innerHTML = `<div class="ga-qlist"></div>
    <div class="ga-qactions">
      <button class="btn btn-outline" id="ga-add" type="button">+ Aggiungi domanda</button>
      <button class="btn btn-primary" id="ga-save" type="button">Salva domande</button>
    </div>`;
  const list = el.querySelector(".ga-qlist");

  (async () => {
    try {
      const { questions: saved } = await game.getQuiz(pin);
      questions = saved?.length ? saved : seedFromConfig();
    } catch {
      questions = seedFromConfig();
    }
    render();
  })();

  function seedFromConfig() {
    return (WEDDING.quiz || []).map((q) => ({
      id: uid(),
      q: q.q,
      options: [...q.options],
      answer: q.answer,
      timer: 20,
    }));
  }

  function render() {
    list.innerHTML = questions
      .map(
        (q, qi) => `<div class="ga-q" data-qi="${qi}">
        <div class="ga-q__head">
          <span class="ga-q__n">Domanda ${qi + 1}</span>
          <div class="ga-q__ord">
            <button class="ga-mini" data-act="up" title="Su" type="button">↑</button>
            <button class="ga-mini" data-act="down" title="Giù" type="button">↓</button>
            <button class="ga-mini ga-mini--del" data-act="delq" title="Elimina" type="button">✕</button>
          </div>
        </div>
        <textarea class="ga-q__text" data-field="q" rows="2" placeholder="Testo della domanda">${esc(q.q)}</textarea>
        <div class="ga-opts">
          ${q.options
            .map(
              (o, oi) => `<div class="ga-opt-row">
              <input type="radio" name="correct-${qi}" data-act="correct" data-oi="${oi}" ${oi === q.answer ? "checked" : ""} title="Risposta corretta" />
              <span class="ga-opt-row__k">${OPT_LETTERS[oi]}</span>
              <input type="text" class="ga-opt-row__in" data-field="opt" data-oi="${oi}" value="${esc(o)}" placeholder="Opzione ${OPT_LETTERS[oi]}" />
              <button class="ga-mini ga-mini--del" data-act="delopt" data-oi="${oi}" title="Togli opzione" type="button" ${q.options.length <= 2 ? "disabled" : ""}>✕</button>
            </div>`
            )
            .join("")}
          ${q.options.length < 6 ? `<button class="ga-mini ga-addopt" data-act="addopt" type="button">+ opzione</button>` : ""}
        </div>
        <label class="ga-timer">Tempo (sec)
          <input type="number" min="5" max="120" step="1" data-field="timer" value="${q.timer}" />
        </label>
      </div>`
      )
      .join("");
    if (!questions.length) list.innerHTML = `<p class="gq-sub">Nessuna domanda. Aggiungine una.</p>`;
  }

  // Input testuali/numerici: aggiorno il modello senza ridisegnare (non perdo il focus).
  list.addEventListener("input", (e) => {
    const card = e.target.closest(".ga-q");
    if (!card) return;
    const qi = Number(card.dataset.qi);
    const f = e.target.dataset.field;
    if (f === "q") questions[qi].q = e.target.value;
    else if (f === "timer") questions[qi].timer = Number(e.target.value) || 20;
    else if (f === "opt") questions[qi].options[Number(e.target.dataset.oi)] = e.target.value;
  });

  // Azioni strutturali: ridisegno.
  list.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    const card = e.target.closest(".ga-q");
    const qi = Number(card.dataset.qi);
    const act = btn.dataset.act;
    if (act === "correct") questions[qi].answer = Number(btn.dataset.oi);
    else if (act === "delq") questions.splice(qi, 1);
    else if (act === "up" && qi > 0) [questions[qi - 1], questions[qi]] = [questions[qi], questions[qi - 1]];
    else if (act === "down" && qi < questions.length - 1)
      [questions[qi + 1], questions[qi]] = [questions[qi], questions[qi + 1]];
    else if (act === "addopt" && questions[qi].options.length < 6) questions[qi].options.push("");
    else if (act === "delopt" && questions[qi].options.length > 2) {
      const oi = Number(btn.dataset.oi);
      questions[qi].options.splice(oi, 1);
      if (questions[qi].answer >= questions[qi].options.length) questions[qi].answer = 0;
      else if (questions[qi].answer > oi) questions[qi].answer--;
    } else return;
    render();
  });

  el.querySelector("#ga-add").addEventListener("click", () => {
    questions.push({ id: uid(), q: "", options: ["", ""], answer: 0, timer: 20 });
    render();
  });

  el.querySelector("#ga-save").addEventListener("click", async () => {
    try {
      const res = await game.saveQuiz(pin, questions);
      toast(`Salvate ${res.count} domande 🍷`);
    } catch (err) {
      if (/autorizz/i.test(err.message)) {
        adminSession.forget();
        toast("PIN non più valido: ricarica la pagina");
      } else toast(err.message || "Salvataggio non riuscito");
    }
  });
}
