/* Galleria: elenco degli spazi (con anteprime) + creazione/accesso al proprio. */
import { mountChrome } from "../partials.js";
import { storage } from "../storage/adapter.js";
import { session } from "../session.js";
import { toast } from "../ui.js";

mountChrome();

const grid = document.getElementById("spaces");

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

async function render() {
  try {
    const spaces = await storage.listSpaces();
    spaces.sort((a, b) => b.photoCount - a.photoCount);
    grid.innerHTML = createTileHtml() + spaces.map(cardHtml).join("");
  } catch (err) {
    grid.innerHTML =
      createTileHtml() +
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

await render();

/* Regia solo con ?admin: PIN sposi, poi eliminazione di interi spazi. */
if (new URLSearchParams(location.search).has("admin")) {
  const { initGalleriaAdmin } = await import("./galleria-admin.js");
  decoraAdmin = await initGalleriaAdmin({ grid, refresh: render });
  if (decoraAdmin) decoraAdmin();
}
