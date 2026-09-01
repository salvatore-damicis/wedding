/* Spazio singolo: griglia foto/video (tutti in lettura) + upload con barra di
 * avanzamento, lightbox a schermo intero, didascalie e copertina (proprietario).
 * I file salgono ORIGINALI, nessuna compressione (scelta esplicita). */
import { mountChrome } from "../partials.js";
import { storage } from "../storage/adapter.js";
import { tavoli } from "../tavoli/adapter.js";
import { session } from "../session.js";
import { toast } from "../ui.js";

mountChrome();

const params = new URLSearchParams(location.search);
const nick = (params.get("nick") || "").trim();

const nickEl = document.getElementById("space-nick");
const ownerBadge = document.getElementById("owner-badge");
const uploadEl = document.getElementById("upload");
const unlockBox = document.getElementById("unlock-box");
const unlockBtn = document.getElementById("unlock-btn");
const lockBtn = document.getElementById("lock-btn");
const gallery = document.getElementById("gallery");
const input = document.getElementById("photo-input");
const progressEl = document.getElementById("upload-progress");

if (!nick) location.replace("galleria.html");
nickEl.textContent = nick;
document.title = `${nick} — Salvatore & Martina`;

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}
const isOwner = () => session.isOwner(nick);
const pin = () => session.pinFor(nick);

/* Stato condiviso tra griglia e lightbox. */
let photos = [];
let coverId = null;
/* PIN sposi, valorizzato solo in moderazione (spazio.html?admin): abilita la
   cancellazione di qualsiasi foto anche non essendo il proprietario. */
let adminPin = null;
/* Galleria aperta dagli Sposi (settings.galleriaAttiva). Finché è chiusa non si
   può caricare né rientrare in uno spazio; gli Sposi in moderazione la scavalcano.
   Ottimista finché non ho letto le settings, così non lampeggia il blocco. */
let galleriaAttiva = true;

/* Avviso mostrato quando la galleria è chiusa (inserito una volta, sopra la
   griglia; nascosto quando è aperta o in moderazione sposi). */
const lockNote = document.createElement("p");
lockNote.className = "gallery__locked-note";
lockNote.hidden = true;
gallery.before(lockNote);

/* ---- Render griglia ---- */
function mediaThumb(p) {
  if (p.type === "video") {
    // #t=0.1 forza la generazione di un fotogramma di anteprima su molti browser.
    return `<video src="${esc(p.url)}#t=0.1" preload="metadata" muted playsinline></video>
      <span class="gallery__play" aria-hidden="true">▶</span>`;
  }
  return `<img loading="lazy" src="${esc(p.url)}" alt="${esc(p.caption || p.name || "foto")}">`;
}

function itemHtml(p, i) {
  const cover = p.id === coverId ? `<span class="gallery__cover" title="Copertina">★</span>` : "";
  return `<figure class="gallery__item">
    <button class="gallery__open" type="button" data-i="${i}" aria-label="Apri ${esc(p.name || "media")}">
      ${mediaThumb(p)}
      ${cover}
    </button>
    ${p.caption ? `<figcaption class="gallery__cap">${esc(p.caption)}</figcaption>` : ""}
  </figure>`;
}

async function render() {
  // Galleria chiusa dagli Sposi: niente upload né accesso, salvo moderazione sposi.
  const bloccata = !galleriaAttiva && !adminPin;
  ownerBadge.hidden = !isOwner();
  // Upload solo al proprietario e solo a galleria aperta.
  uploadEl.hidden = !isOwner() || bloccata;
  // L'invito a sbloccare vale per chi non è proprietario (e non è in moderazione),
  // ma a galleria chiusa non si entra in nessuno spazio.
  unlockBox.hidden = isOwner() || !!adminPin || bloccata;
  // "Esci" solo al proprietario, e discreto: niente più badge sempre in vista.
  lockBtn.hidden = !isOwner();

  lockNote.hidden = !bloccata;
  if (bloccata) {
    lockNote.textContent = isOwner()
      ? "Galleria momentaneamente chiusa: potrai caricare di nuovo quando gli sposi la riapriranno."
      : "La galleria aprirà a breve 🍷 Gli sposi la stanno preparando.";
  }

  try {
    const data = await storage.getSpace(nick);
    photos = data.photos || [];
    coverId = data.coverId || null;
    gallery.innerHTML = photos.length
      ? photos.map(itemHtml).join("")
      : `<p class="gallery__empty">Ancora niente qui${isOwner() ? ": carica il primo ricordo! 📸" : "."}</p>`;
  } catch (err) {
    gallery.innerHTML = `<p class="gallery__empty">Impossibile caricare i contenuti.</p>`;
    console.error(err);
  }

  gallery.querySelectorAll(".gallery__open").forEach((b) =>
    b.addEventListener("click", () => openLightbox(Number(b.dataset.i)))
  );
}

/* ---- Upload con barra di avanzamento ---- */
async function handleFiles(fileList) {
  const files = [...fileList].filter(
    (f) => f.type.startsWith("image/") || f.type.startsWith("video/")
  );
  if (!files.length) {
    toast("Seleziona foto o video");
    return;
  }

  progressEl.hidden = false;
  progressEl.innerHTML = "";
  const rows = files.map((f) => {
    const row = document.createElement("div");
    row.className = "up-row";
    row.innerHTML = `<span class="up-row__name">${esc(f.name)}</span>
      <span class="up-row__track"><span class="up-row__bar"></span></span>
      <span class="up-row__pct">0%</span>`;
    progressEl.appendChild(row);
    return row;
  });

  let ok = 0;
  for (let i = 0; i < files.length; i++) {
    const row = rows[i];
    const bar = row.querySelector(".up-row__bar");
    const pct = row.querySelector(".up-row__pct");
    try {
      await storage.uploadPhoto(nick, pin(), files[i], (frac) => {
        const p = Math.round(frac * 100);
        bar.style.width = `${p}%`;
        pct.textContent = `${p}%`;
      });
      bar.style.width = "100%";
      pct.textContent = "✓";
      row.classList.add("is-done");
      ok++;
    } catch (err) {
      console.error("Upload fallito:", files[i].name, err);
      pct.textContent = "✕";
      row.classList.add("is-error");
    }
  }

  toast(ok ? `Caricati ${ok}/${files.length} 🍷` : "Nessun caricamento riuscito");
  await render();
  // Lascia un attimo le barre visibili, poi pulisci.
  setTimeout(() => {
    progressEl.hidden = true;
    progressEl.innerHTML = "";
  }, 2500);
}

uploadEl.addEventListener("click", (e) => {
  if (e.target.closest("#photo-input")) return;
  input.click();
});
input.addEventListener("change", (e) => {
  handleFiles(e.target.files);
  input.value = ""; // consenti di ricaricare lo stesso file
});
["dragover", "dragenter"].forEach((ev) =>
  uploadEl.addEventListener(ev, (e) => {
    e.preventDefault();
    uploadEl.classList.add("is-drop");
  })
);
["dragleave", "drop"].forEach((ev) =>
  uploadEl.addEventListener(ev, (e) => {
    e.preventDefault();
    uploadEl.classList.remove("is-drop");
  })
);
uploadEl.addEventListener("drop", (e) => handleFiles(e.dataTransfer.files));

/* ---- Lightbox (visione a schermo intero) ---- */
const lb = document.getElementById("lightbox");
const lbStage = lb.querySelector(".lightbox__stage");
const lbBar = lb.querySelector(".lightbox__bar");
let lbIndex = 0;

function renderLightbox() {
  const p = photos[lbIndex];
  if (!p) return closeLightbox();

  lbStage.innerHTML =
    p.type === "video"
      ? `<video src="${esc(p.url)}" controls autoplay playsinline></video>`
      : `<img src="${esc(p.url)}" alt="${esc(p.caption || p.name || "foto")}">`;

  const owner = isOwner();
  // Didascalia e copertina sono curatela del proprietario; l'eliminazione la può
  // fare anche lo sposo in moderazione (adminPin) su qualsiasi foto.
  const canDelete = owner || !!adminPin;
  const isCover = p.id === coverId;

  const capBlock = owner
    ? `<div class="lightbox__cap-edit">
         <input id="lb-cap" type="text" maxlength="300" placeholder="Aggiungi una didascalia…" value="${esc(p.caption || "")}">
         <button class="btn btn-outline" id="lb-cap-save" type="button">Salva</button>
       </div>`
    : `<div class="lightbox__cap">${p.caption ? esc(p.caption) : ""}</div>`;

  lbBar.innerHTML = `${capBlock}
    <div class="lightbox__actions">
      <a class="btn btn-outline" href="${esc(p.url)}" target="_blank" rel="noopener" download="${esc(p.name || "")}">Scarica</a>
      ${owner ? `<button class="btn btn-outline" id="lb-cover" type="button">${isCover ? "★ Copertina" : "☆ Imposta copertina"}</button>` : ""}
      ${canDelete ? `<button class="btn btn-outline lightbox__del" id="lb-del" type="button">Elimina</button>` : ""}
    </div>`;

  lb.querySelector(".lightbox__count").textContent = `${lbIndex + 1} / ${photos.length}`;

  if (owner) {
    lbBar.querySelector("#lb-cap-save").addEventListener("click", async () => {
      const val = lbBar.querySelector("#lb-cap").value.trim();
      try {
        await storage.setCaption(nick, pin(), p.id, val);
        p.caption = val;
        toast("Didascalia salvata");
        renderGridSilently();
      } catch (err) {
        toast("Impossibile salvare la didascalia");
        console.error(err);
      }
    });
    lbBar.querySelector("#lb-cover").addEventListener("click", async () => {
      try {
        await storage.setCover(nick, pin(), p.id);
        coverId = p.id;
        toast("Copertina impostata ★");
        renderLightbox();
        renderGridSilently();
      } catch (err) {
        toast("Impossibile impostare la copertina");
        console.error(err);
      }
    });
  }

  // Eliminazione: proprietario col proprio PIN, oppure sposo col PIN admin
  // (moderazione). Il backend accetta entrambi (deletePhoto: PIN dello spazio
  // OR PIN admin).
  if (canDelete) {
    lbBar.querySelector("#lb-del").addEventListener("click", async () => {
      if (!confirm("Eliminare questo contenuto?")) return;
      try {
        await storage.deletePhoto(nick, adminPin || pin(), p.id);
        photos.splice(lbIndex, 1);
        if (coverId === p.id) coverId = null;
        toast("Eliminato");
        if (!photos.length) return closeLightbox(), render();
        lbIndex = Math.min(lbIndex, photos.length - 1);
        renderLightbox();
        renderGridSilently();
      } catch (err) {
        toast("Impossibile eliminare");
        console.error(err);
      }
    });
  }
}

/* Aggiorna solo la griglia sotto senza toccare la lightbox aperta. */
function renderGridSilently() {
  gallery.innerHTML = photos.length
    ? photos.map(itemHtml).join("")
    : `<p class="gallery__empty">Ancora niente qui.</p>`;
  gallery.querySelectorAll(".gallery__open").forEach((b) =>
    b.addEventListener("click", () => openLightbox(Number(b.dataset.i)))
  );
}

function openLightbox(i) {
  lbIndex = i;
  lb.hidden = false;
  document.body.style.overflow = "hidden";
  renderLightbox();
}
function closeLightbox() {
  lb.hidden = true;
  document.body.style.overflow = "";
  lbStage.innerHTML = ""; // ferma eventuali video
}
function step(delta) {
  if (!photos.length) return;
  lbIndex = (lbIndex + delta + photos.length) % photos.length;
  renderLightbox();
}

lb.querySelector(".lightbox__close").addEventListener("click", closeLightbox);
lb.querySelector(".lightbox__prev").addEventListener("click", () => step(-1));
lb.querySelector(".lightbox__next").addEventListener("click", () => step(1));
lb.addEventListener("click", (e) => {
  if (e.target === lb) closeLightbox();
});
document.addEventListener("keydown", (e) => {
  if (lb.hidden) return;
  if (e.key === "Escape") closeLightbox();
  else if (e.key === "ArrowLeft") step(-1);
  else if (e.key === "ArrowRight") step(1);
});
// Swipe su mobile.
let touchX = null;
lbStage.addEventListener("touchstart", (e) => (touchX = e.changedTouches[0].clientX), { passive: true });
lbStage.addEventListener(
  "touchend",
  (e) => {
    if (touchX == null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 45) step(dx < 0 ? 1 : -1);
    touchX = null;
  },
  { passive: true }
);

/* ---- Esci dal proprio spazio ---- */
document.getElementById("lock-btn").addEventListener("click", (e) => {
  e.preventDefault();
  session.forget(nick);
  toast("Uscito dal tuo spazio");
  render();
});

/* ---- Sblocca (diventa proprietario) ---- */
const modal = document.getElementById("pin-modal");
const pinInput = document.getElementById("pin-input");
const errEl = document.getElementById("modal-error");

unlockBtn.addEventListener("click", () => {
  errEl.textContent = "";
  pinInput.value = "";
  modal.classList.add("open");
  pinInput.focus();
});
document.getElementById("modal-cancel").addEventListener("click", () => modal.classList.remove("open"));
modal.addEventListener("click", (e) => {
  if (e.target === modal) modal.classList.remove("open");
});
async function unlock() {
  const p = pinInput.value.trim();
  if (!p) {
    errEl.textContent = "Inserisci il PIN.";
    return;
  }
  const res = await storage.createOrEnter(nick, p);
  if (!res.ok) {
    errEl.textContent = res.reason || "PIN errato.";
    return;
  }
  session.remember(nick, p);
  modal.classList.remove("open");
  toast(res.isNew ? "Spazio creato! 🍷" : "Spazio sbloccato!");
  render();
}
document.getElementById("modal-go").addEventListener("click", unlock);
pinInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") unlock();
});

// Stato apertura galleria, letto prima del primo render (in errore rete non blocco).
try {
  galleriaAttiva = (await tavoli.getSettings()).galleriaAttiva;
} catch {
  galleriaAttiva = true;
}

render();

/* Moderazione sposi (spazio.html?admin): PIN sposi, poi barra "Elimina intero
   spazio" e cancellazione delle singole foto nel visore. Import dinamico: un
   invitato non scarica questo codice. */
if (new URLSearchParams(location.search).has("admin")) {
  const { initSpazioAdmin } = await import("./spazio-admin.js");
  const res = await initSpazioAdmin({ nick, container: document.querySelector(".section .container") });
  if (res) {
    adminPin = res.pin;
    render(); // ridisegna con i permessi di moderazione (elimina su ogni foto)
  }
}
