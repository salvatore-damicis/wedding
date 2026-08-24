import { mountChrome } from "../partials.js";
import { initCountdown } from "../countdown.js";
import { WEDDING } from "../../data/config.js";
import { tavoli } from "../tavoli/adapter.js";

mountChrome();

const cdEl = document.getElementById("countdown");
const dateEl = document.querySelector(".hero__date");

/* Parte subito col seme (data/config.js) così il countdown non "sfarfalla" in
   attesa della rete; poi, se gli Sposi hanno salvato una data, si aggiorna. */
const cd = initCountdown(cdEl, WEDDING.date);

/* Etichetta della data in home ("Sabato 12 Settembre 2026 · ore 11:00"):
   la ricostruiamo dalla data effettiva così, cambiando data da admin, cambia
   anche la scritta e non solo il countdown. Prima lettera di giorno e mese
   maiuscola, per restare in Title Case come nel markup originale. */
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
function etichettaData(d) {
  const giorno = cap(d.toLocaleDateString("it-IT", { weekday: "long" }));
  const mese = cap(d.toLocaleDateString("it-IT", { month: "long" }));
  const ora = d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  return `${giorno} ${d.getDate()} ${mese} ${d.getFullYear()} · ore ${ora}`;
}
function aggiornaEtichetta(d) {
  if (dateEl) dateEl.textContent = etichettaData(d);
}

/* Applica data + etichetta insieme: usata sia all'avvio sia dal pannello admin. */
function applicaData(d) {
  cd.update(d);
  aggiornaEtichetta(d);
}

tavoli
  .getSettings()
  .then((s) => {
    const d = s.weddingDate ? new Date(s.weddingDate) : null;
    if (d && !Number.isNaN(d.getTime())) applicaData(d);
  })
  .catch(() => {}); // offline o backend spento: resta il seme

/* Admin data/countdown: solo con ?admin e via import dinamico, così un invitato
   non scarica nemmeno il codice del pannello (come tavoli e gioco). */
if (new URLSearchParams(location.search).has("admin")) {
  const { initHomeAdmin } = await import("./home-admin.js");
  initHomeAdmin({ cd, applicaData });
}
