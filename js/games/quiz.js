/*
 * Gioco live "Quanto conosci gli sposi?" — vista INVITATO (ADR-0005).
 * Condotto dagli Sposi, sincronia via polling. Fasi: idle → lobby → question →
 * reveal → … → ended. Il punteggio a tempo lo calcola il server.
 *
 * La shell della fase si ridisegna solo quando cambia fase o turno; le parti
 * dinamiche (countdown, classifica) si aggiornano senza toccare le opzioni, per
 * non cancellare la risposta appena data.
 */
import { game } from "./adapter.js";
import { tavoli } from "../tavoli/adapter.js";
import { session } from "../session.js";

const IDK = "sm_gioco_id";
const NK = "sm_gioco_name";

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}
function myId() {
  let v = localStorage.getItem(IDK);
  if (!v) {
    v = crypto.randomUUID ? crypto.randomUUID() : `p-${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    localStorage.setItem(IDK, v);
  }
  return v;
}
const savedName = () => localStorage.getItem(NK) || session.nicknames()[0] || "";

export function initGioco(root) {
  if (!root) return;
  const pid = myId();

  let attivo = null; // giochiAttivi (interruttore Sposi)
  let view = { key: null }; // shell attualmente disegnata: `${phase}#${round}`
  let selected = null; // indice scelto nel turno corrente (lato client)
  let deadline = 0; // scadenza countdown (ora client)
  let tick = 0;

  const OPT_LETTERS = ["A", "B", "C", "D", "E", "F"];

  /* ---- countdown fluido, indipendente dal polling ---- */
  setInterval(() => {
    const bar = root.querySelector(".gq-timer__bar");
    const num = root.querySelector(".gq-timer__num");
    if (!bar || !num || !deadline) return;
    const q = root.querySelector(".gq-question");
    const totalMs = Number(q?.dataset.timer || 0) * 1000;
    const left = Math.max(0, deadline - Date.now());
    num.textContent = Math.ceil(left / 1000);
    bar.style.width = totalMs ? `${(left / totalMs) * 100}%` : "0%";
    if (left <= 0) chiudiRisposte("Tempo scaduto");
  }, 200);

  function chiudiRisposte(msg) {
    root.querySelectorAll(".gq-opt").forEach((b) => (b.disabled = true));
    const hint = root.querySelector(".gq-hint");
    if (hint && !hint.dataset.locked) hint.textContent = msg;
  }

  /* ---- loop principale ---- */
  async function loop() {
    try {
      if (attivo === null || tick % 4 === 0) {
        attivo = (await tavoli.getSettings()).giochiAttivi;
      }
      if (!attivo) {
        renderInattivo();
        return;
      }
      const s = await game.getState(pid);
      handle(s);
    } catch (err) {
      console.error(err);
    } finally {
      tick++;
    }
  }
  setInterval(loop, 1200);
  loop();

  /* ---- instradamento per fase ---- */
  function handle(s) {
    const key = `${s.phase}#${s.round}`;
    if (s.phase === "idle" || s.phase === "ended") {
      if (view.key !== key) {
        s.phase === "idle" ? renderIdle() : renderEnded(s);
        view = { key };
      } else if (s.phase === "ended") aggiornaClassifica(s);
      return;
    }
    if (s.phase === "lobby") {
      if (view.key !== key) {
        renderLobby(s);
        view = { key };
      } else {
        const c = root.querySelector(".gq-count b");
        if (c) c.textContent = s.playerCount;
        // Se nel frattempo mi sono unito da un'altra scheda, aggiorna.
        if (s.you?.joined) mostraInAttesa(s);
      }
      return;
    }
    if (s.phase === "question") {
      if (view.key !== key) {
        selected = null;
        renderQuestion(s);
        view = { key };
      }
      if (s.you?.answered && selected === null) markInviata();
      return;
    }
    if (s.phase === "reveal") {
      if (view.key !== key) {
        renderReveal(s);
        view = { key };
      } else {
        aggiornaClassifica(s);
      }
    }
  }

  /* ---- schermate ---- */
  function renderInattivo() {
    if (view.key === "inattivo") return;
    view = { key: "inattivo" };
    root.innerHTML = `<div class="gq-card gq-center">
      <p class="gq-big">I giochi non sono ancora attivi 🍷</p>
      <p class="gq-sub">Gli sposi li apriranno al momento giusto. Torna tra poco!</p>
    </div>`;
  }

  function renderIdle() {
    root.innerHTML = `<div class="gq-card gq-center">
      <p class="gq-big">Il gioco sta per iniziare ✨</p>
      <p class="gq-sub">Tieni il telefono a portata di mano: quando gli sposi aprono la prima domanda, comparirà qui.</p>
    </div>`;
  }

  function renderLobby(s) {
    if (s.you?.joined) return mostraInAttesa(s);
    root.innerHTML = `<div class="gq-card gq-center">
      <p class="gq-big">Unisciti al quiz! 🍷</p>
      <p class="gq-sub">Scegli il nome che vedranno tutti in classifica.</p>
      <div class="gq-join">
        <input id="gq-name" type="text" maxlength="30" placeholder="Il tuo nome" value="${esc(savedName())}" />
        <button class="btn btn-primary" id="gq-enter" type="button">Entra</button>
      </div>
      <p class="gq-count">Già in gioco: <b>${s.playerCount}</b></p>
    </div>`;
    const nameEl = root.querySelector("#gq-name");
    const enter = async () => {
      const name = nameEl.value.trim();
      if (!name) {
        nameEl.focus();
        return;
      }
      try {
        const res = await game.join(pid, name);
        localStorage.setItem(NK, res.name);
        // Il prossimo poll mostrerà l'attesa; anticipiamolo.
        mostraInAttesa({ playerCount: s.playerCount + 1 });
      } catch (err) {
        alert(err.message || "Ingresso non riuscito");
      }
    };
    root.querySelector("#gq-enter").addEventListener("click", enter);
    nameEl.addEventListener("keydown", (e) => e.key === "Enter" && enter());
  }

  function mostraInAttesa(s) {
    root.innerHTML = `<div class="gq-card gq-center">
      <p class="gq-big">Sei in gioco, ${esc(savedName())}! ✓</p>
      <p class="gq-sub">In attesa che gli sposi aprano la prima domanda…</p>
      <p class="gq-count">In gioco: <b>${s?.playerCount ?? "…"}</b></p>
    </div>`;
    view = { key: "lobby#-1" };
  }

  function renderQuestion(s) {
    const q = s.question;
    deadline = Date.now() + (s.remainingMs ?? q.timer * 1000);
    root.innerHTML = `<div class="gq-card">
      <div class="gq-timer"><span class="gq-timer__bar"></span></div>
      <div class="gq-timer__row"><span class="gq-round">Domanda ${s.round + 1} di ${s.total}</span><span class="gq-timer__num">${Math.ceil((s.remainingMs ?? q.timer * 1000) / 1000)}</span></div>
      <p class="gq-question" data-timer="${q.timer}">${esc(q.q)}</p>
      <div class="gq-options">
        ${q.options
          .map(
            (o, i) =>
              `<button class="gq-opt" data-i="${i}" type="button"><span class="gq-opt__k">${OPT_LETTERS[i]}</span><span>${esc(o)}</span></button>`
          )
          .join("")}
      </div>
      <p class="gq-hint">Tocca la risposta — più sei veloce, più punti 🍷</p>
    </div>`;

    root.querySelectorAll(".gq-opt").forEach((b) =>
      b.addEventListener("click", () => rispondi(Number(b.dataset.i), s.round, b))
    );
  }

  async function rispondi(i, round, btn) {
    if (selected !== null) return;
    selected = i;
    root.querySelectorAll(".gq-opt").forEach((b) => (b.disabled = true));
    btn.classList.add("is-chosen");
    markInviata();
    try {
      await game.answer(pid, round, i);
    } catch (err) {
      // Tempo scaduto o turno cambiato: la risposta non conta, ma non spaventiamo.
      console.warn(err.message);
    }
  }

  function markInviata() {
    const hint = root.querySelector(".gq-hint");
    if (hint) {
      hint.textContent = "Risposta inviata ✓ — aspetta il responso";
      hint.dataset.locked = "1";
    }
  }

  function renderReveal(s) {
    const q = s.question;
    const you = s.you || {};
    const totalRisposte = (s.counts || []).reduce((a, b) => a + b, 0) || 1;
    const esito = you.answeredIdx == null
      ? `<p class="gq-esito gq-esito--none">Nessuna risposta · 0 punti</p>`
      : you.correct
        ? `<p class="gq-esito gq-esito--ok">Giusto! +${you.points} punti 🎉</p>`
        : `<p class="gq-esito gq-esito--ko">Sbagliato · ${you.points} punti</p>`;

    root.innerHTML = `<div class="gq-card">
      <span class="gq-round">Domanda ${s.round + 1} di ${s.total}</span>
      <p class="gq-question">${esc(q.q)}</p>
      <div class="gq-options gq-options--reveal">
        ${q.options
          .map((o, i) => {
            const cls = i === s.correct ? " is-correct" : i === you.answeredIdx ? " is-yours" : "";
            const perc = Math.round(((s.counts?.[i] || 0) / totalRisposte) * 100);
            return `<div class="gq-opt gq-opt--r${cls}">
              <span class="gq-opt__k">${OPT_LETTERS[i]}</span><span class="gq-opt__t">${esc(o)}</span>
              <span class="gq-opt__bar" style="width:${perc}%"></span>
              <span class="gq-opt__pct">${perc}%</span>
            </div>`;
          })
          .join("")}
      </div>
      ${esito}
      <div class="gq-board"></div>
    </div>`;
    aggiornaClassifica(s);
  }

  function renderEnded(s) {
    root.innerHTML = `<div class="gq-card gq-center">
      <p class="gq-big">Partita finita! 🏆</p>
      <p class="gq-sub">Grazie per aver giocato con noi 🍷</p>
      <div class="gq-board gq-board--final"></div>
    </div>`;
    aggiornaClassifica(s, true);
  }

  /* Classifica: podio + la tua riga se sei fuori dai primi. */
  function aggiornaClassifica(s, final = false) {
    const box = root.querySelector(".gq-board");
    if (!box) return;
    const lb = s.leaderboard || [];
    const topN = final ? 10 : 5;
    const top = lb.slice(0, topN);
    const you = s.you || {};
    const inTop = top.some((e) => e.id === pid);

    const riga = (e, pos) =>
      `<li class="gq-board__row${e.id === pid ? " is-you" : ""}">
         <span class="gq-board__pos">${pos}</span>
         <span class="gq-board__name">${esc(e.name)}</span>
         <span class="gq-board__pts">${e.score}</span>
       </li>`;

    let html = `<ol class="gq-board__list">${top.map((e, i) => riga(e, i + 1)).join("")}</ol>`;
    if (!inTop && you.joined && you.rank) {
      const me = lb[you.rank - 1];
      html += `<ol class="gq-board__list gq-board__list--you">${riga(me, you.rank)}</ol>`;
    }
    if (!lb.length) html = `<p class="gq-sub">Ancora nessun punteggio.</p>`;
    box.innerHTML = html;
  }
}
