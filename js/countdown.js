/* Countdown to the wedding date. Renders into #countdown as 4 boxes.
 *
 * La data di default è WEDDING.date (data/config.js), ma la home la sovrascrive
 * con quella salvata dagli Sposi (settings.weddingDate). Per questo initCountdown
 * accetta una data e restituisce un piccolo controller:
 *   update(date)     -> cambia il bersaglio e riparte
 *   previewExpired() -> mostra lo stato "scaduto" senza aspettare (per l'admin)
 *   restore()        -> torna al conteggio reale
 *   stop()           -> ferma il timer
 */
import { WEDDING } from "../data/config.js";

const LABELS = { d: "Giorni", h: "Ore", m: "Minuti", s: "Secondi" };

function box(num, key) {
  return `<div class="countdown__box">
    <div class="countdown__num" data-cd="${key}">${String(num).padStart(2, "0")}</div>
    <div class="countdown__label">${LABELS[key]}</div>
  </div>`;
}

function validDate(d) {
  return d instanceof Date && !Number.isNaN(d.getTime());
}

export function initCountdown(el, date) {
  if (!el) return null;
  let target = validDate(date) ? date : WEDDING.date;
  let timer = null;

  const renderBoxes = () => {
    el.innerHTML = ["d", "h", "m", "s"].map((k) => box(0, k)).join("");
  };
  const renderExpired = () => {
    el.innerHTML = `<p class="hero__tagline">Oggi è il grande giorno! 🥂</p>`;
  };
  const stop = () => {
    if (timer) clearInterval(timer);
    timer = null;
  };

  const tick = () => {
    const diff = target.getTime() - Date.now();
    if (diff <= 0) {
      renderExpired();
      stop();
      return;
    }
    const s = Math.floor(diff / 1000);
    const vals = {
      d: Math.floor(s / 86400),
      h: Math.floor((s % 86400) / 3600),
      m: Math.floor((s % 3600) / 60),
      s: s % 60,
    };
    for (const k in vals) {
      const node = el.querySelector(`[data-cd="${k}"]`);
      if (node) node.textContent = String(vals[k]).padStart(2, "0");
    }
  };

  const start = () => {
    stop();
    renderBoxes();
    tick();
    timer = setInterval(tick, 1000);
  };

  start();

  return {
    update(newDate) {
      if (validDate(newDate)) target = newDate;
      start();
    },
    previewExpired() {
      stop();
      renderExpired();
    },
    restore: start,
    stop,
  };
}
