/* Countdown to the wedding date. Renders into #countdown as 4 boxes. */
import { WEDDING } from "../data/config.js";

const LABELS = { d: "Giorni", h: "Ore", m: "Minuti", s: "Secondi" };

function box(num, key) {
  return `<div class="countdown__box">
    <div class="countdown__num" data-cd="${key}">${String(num).padStart(2, "0")}</div>
    <div class="countdown__label">${LABELS[key]}</div>
  </div>`;
}

export function initCountdown(el) {
  if (!el) return;
  el.innerHTML = ["d", "h", "m", "s"].map((k) => box(0, k)).join("");

  const tick = () => {
    const diff = WEDDING.date.getTime() - Date.now();
    if (diff <= 0) {
      el.innerHTML = `<p class="hero__tagline">Oggi è il grande giorno! 🥂</p>`;
      clearInterval(timer);
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

  tick();
  const timer = setInterval(tick, 1000);
}
