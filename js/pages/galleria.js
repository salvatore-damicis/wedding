/* Galleria: elenco degli spazi (con anteprime) + creazione/accesso al proprio. */
import { mountChrome } from "../partials.js";
import { storage } from "../storage/adapter.js";
import { tavoli } from "../tavoli/adapter.js";
import { session } from "../session.js";
import { toast } from "../ui.js";

mountChrome();

const grid = document.getElementById("spaces");

/* La galleria è aperta agli invitati solo quando gli Sposi la attivano
   (settings.galleriaAttiva, default false — vedi galleria-admin.js). Finché è
   chiusa gli invitati vedono la sezione predisposta ma non possono creare spazi
   né caricare foto; gli Sposi autenticati (adminOk) la vedono sempre per intero. */
let galleriaAttiva = true; // ottimista finché non ho letto le settings
/* Sola lettura (settings.galleriaBloccata): la galleria è aperta e tutto resta
   visibile, ma nessuno può creare spazi né caricare. Indipendente da galleriaAttiva. */
let galleriaBloccata = false;
let adminOk = false;

/* Avviso "galleria in sola lettura", inserito una volta sopra la griglia e
   mostrato solo quando è bloccata (con la griglia visibile). */
const bloccataNote = document.createElement("p");
bloccataNote.className = "gallery__locked-note";
bloccataNote.hidden = true;
bloccataNote.textContent =
  "Galleria in sola lettura: sfoglia pure gli spazi e i ricordi già caricati, ma per ora non si possono creare nuovi spazi né caricare foto.";
grid.before(bloccataNote);

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

function tile(item) {
  if (item.type === "video") {
    return `<span class="cover-tile"><video src="${esc(item.url)}#t=0.1" preload="metadata" muted playsinline></video><span class="cover-tile__play" aria-hidden="true">▶</span></span>`;
  }
  return `<span class="cover-tile"><img loading="lazy" src="${esc(item.url)}" alt=""></span>`;
}

function coverHtml(space) {
  // Retrocompatibile: se il backend dà solo coverUrl, ne faccio un mosaico da 1.
  const covers =
    space.covers?.length ? space.covers : space.coverUrl ? [{ url: space.coverUrl, type: "image" }] : [];
  if (!covers.length) {
    return `<div class="space-card__cover"><span class="placeholder">${esc(space.nickname.slice(0, 2))}</span></div>`;
  }
  const n = Math.min(covers.length, 4);
  return `<div class="space-card__cover cover-mosaic cover-mosaic--${n}">${covers
    .slice(0, 4)
    .map(tile)
    .join("")}</div>`;
}

function cardHtml(space) {
  const count = space.photoCount === 1 ? "1 ricordo" : `${space.photoCount} ricordi`;
  const mine = session.isOwner(space.nickname) ? " · il tuo" : "";
  return `<a class="space-card" href="spazio.html?nick=${encodeURIComponent(space.nickname)}" data-nick="${esc(space.nickname)}">
    ${coverHtml(space)}
    <div class="space-card__body">
      <div class="space-card__nick">${esc(space.nickname)}</div>
      <div class="space-card__count">${count}${mine}</div>
    </div>
  </a>`;
}

/* Moderazione sposi (galleria.html?admin): decora ogni card con un ✕ per
   eliminare l'intero spazio. Iniettata via import dinamico, così un invitato non
   scarica il codice admin. Viene richiamata dopo ogni render. */
let decoraAdmin = null;

/* Prima cella sempre presente: il "+" per creare (o rientrare nel) proprio spazio. */
function createTileHtml() {
  return `<button type="button" class="space-create" id="space-create">
    <span class="space-create__plus" aria-hidden="true">+</span>
    <span class="space-create__label">Crea il tuo spazio</span>
  </button>`;
}

/* Vista "galleria non ancora aperta": sezione predisposta, ma niente griglia né
   creazione. Riusa lo stile della card del gioco inattivo per coerenza. */
function lockedHtml() {
  return `<div class="gq-card gq-center spaces__locked">
    <p class="gq-big">La galleria aprirà a breve 🍷</p>
    <p class="gq-sub">Qui ogni invitato avrà il suo spazio per caricare foto e video della festa. Gli sposi la apriranno al momento giusto: torna tra poco!</p>
  </div>`;
}

async function render() {
  // Galleria ancora chiusa dagli Sposi: placeholder, salvo gli Sposi autenticati.
  if (!galleriaAttiva && !adminOk) {
    bloccataNote.hidden = true;
    grid.innerHTML = lockedHtml();
    return;
  }
  // Sola lettura: griglia visibile, ma niente tile "+" (nessuno crea spazi).
  bloccataNote.hidden = !galleriaBloccata;
  const createTile = galleriaBloccata ? "" : createTileHtml();
  try {
    const spaces = await storage.listSpaces();
    spaces.sort((a, b) => b.photoCount - a.photoCount);
    grid.innerHTML = createTile + spaces.map(cardHtml).join("");
  } catch (err) {
    grid.innerHTML =
      createTile +
      `<p class="spaces__empty">Impossibile caricare gli spazi. Riprova più tardi.</p>`;
    console.error(err);
  }
  if (decoraAdmin) decoraAdmin();
}

/* ---- Modal crea/entra ---- */
const modal = document.getElementById("space-modal");
const nickInput = document.getElementById("nick-input");
const pinInput = document.getElementById("pin-input");
const errEl = document.getElementById("modal-error");

function openModal() {
  errEl.textContent = "";
  nickInput.value = "";
  pinInput.value = "";
  modal.classList.add("open");
  nickInput.focus();
}
function closeModal() {
  modal.classList.remove("open");
}

async function submit() {
  const nickname = nickInput.value.trim();
  const pin = pinInput.value.trim();
  if (!nickname || !pin) {
    errEl.textContent = "Nickname e PIN obbligatori.";
    return;
  }
  const res = await storage.createOrEnter(nickname, pin);
  if (!res.ok) {
    errEl.textContent = res.reason || "Accesso negato.";
    return;
  }
  session.remember(nickname, pin);
  toast(res.isNew ? "Spazio creato! 🍷" : "Bentornato!");
  location.href = `spazio.html?nick=${encodeURIComponent(nickname)}`;
}

// Il tile "+" è ridisegnato a ogni render: delega sulla griglia.
grid.addEventListener("click", (e) => {
  if (e.target.closest(".space-create")) openModal();
});
document.getElementById("modal-cancel").addEventListener("click", closeModal);
document.getElementById("modal-go").addEventListener("click", submit);
modal.addEventListener("click", (e) => {
  if (e.target === modal) closeModal();
});
pinInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") submit();
});

// Stato apertura galleria: letto prima del primo render così gli invitati non
// vedono un lampo della griglia prima del placeholder.
try {
  const s = await tavoli.getSettings();
  galleriaAttiva = s.galleriaAttiva;
  galleriaBloccata = s.galleriaBloccata;
} catch {
  galleriaAttiva = true; // in caso di errore rete non blocco la galleria
  galleriaBloccata = false;
}

/* Regia solo con ?admin: PIN sposi, poi interruttore apertura + eliminazione di
   interi spazi. Prima del render, così gli Sposi autenticati vedono sempre la
   griglia completa anche a galleria chiusa. */
if (new URLSearchParams(location.search).has("admin")) {
  const { initGalleriaAdmin } = await import("./galleria-admin.js");
  decoraAdmin = await initGalleriaAdmin({ grid, refresh: render });
  if (decoraAdmin) adminOk = true;
}

await render();
if (decoraAdmin) decoraAdmin();
