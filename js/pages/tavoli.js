import { mountChrome } from "../partials.js";
import { initTavoliView } from "../tavoli/view.js";

mountChrome();

const mapEl = document.getElementById("mappa");
const elencoEl = document.getElementById("elenco");
const schedaEl = document.getElementById("scheda");

const vista = await initTavoliView({ mapEl, elencoEl, schedaEl });

/* Modalità modifica solo con ?admin, e con import dinamico: un invitato non
   scarica nemmeno il codice dell'editor (js/tavoli/editor.js). */
if (vista && new URLSearchParams(location.search).has("admin")) {
  const { initTavoliEditor } = await import("../tavoli/editor.js");
  await initTavoliEditor({
    vista,
    mapEl,
    elencoEl,
    schedaEl,
    contenitore: document.querySelector(".tavoli"),
  });
}
