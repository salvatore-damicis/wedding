/*
 * Moderazione galleria — solo Sposi, si attiva con galleria.html?admin.
 * Import dinamico da galleria.js: un invitato non scarica questo modulo.
 *
 * Fa tre cose:
 *  - Interruttore "Galleria aperta agli invitati" (settings.galleriaAttiva):
 *    finché è spento, gli invitati vedono la sezione predisposta ma non possono
 *    creare spazi né caricare foto. Gli Sposi qui la vedono sempre per intero.
 *  - Interruttore "Sola lettura" (settings.galleriaBloccata), indipendente dal
 *    primo: a galleria aperta congela i caricamenti e la creazione di spazi,
 *    lasciando tutto ciò che è già stato caricato visibile e sfogliabile.
 *  - Eliminare un INTERO spazio (foto e video compresi) con il PIN admin. La
 *    cancellazione delle singole foto sta dentro lo spazio (spazio.html?admin).
 * Il backend autorizza deleteSpace/saveSettings solo col PIN admin e la
 * cancellazione è definitiva (ADR-0002/0003): è l'unica via di recupero di un
 * PIN perso — gli sposi azzerano, l'invitato ricrea.
 *
 * Il PIN è uno solo (ADMIN_PIN, server-side): per la verifica riuso
 * tavoli.verifyAdmin, che parla con lo stesso backend.
 */
import { storage } from "../storage/adapter.js";
import { tavoli } from "../tavoli/adapter.js";
import { adminSession } from "../admin-session.js";
import { toast } from "../ui.js";

function chiediPin() {
  return new Promise((resolve) => {
    const el = document.createElement("div");
    el.className = "modal open";
    el.innerHTML = `<div class="modal__box">
      <h2 class="modal__title">Moderazione galleria</h2>
      <p class="modal__hint">Riservato agli sposi.</p>
      <div class="field"><label for="gm-pin">PIN</label>
        <input id="gm-pin" type="password" inputmode="numeric" autocomplete="off" /></div>
      <p class="modal__error" id="gm-err"></p>
      <div class="modal__actions">
        <button class="btn btn-outline" id="gm-annulla" type="button">Annulla</button>
        <button class="btn btn-primary" id="gm-ok" type="button">Entra</button>
      </div>
    </div>`;
    document.body.appendChild(el);
    const input = el.querySelector("#gm-pin");
    const err = el.querySelector("#gm-err");
    const close = (v) => {
      el.remove();
      resolve(v);
    };
    const prova = async () => {
      const pin = input.value.trim();
      if (!pin) return;
      err.textContent = "Verifica…";
      (await tavoli.verifyAdmin(pin))
        ? close(pin)
        : ((err.textContent = "PIN non valido."), input.select());
    };
    el.querySelector("#gm-ok").addEventListener("click", prova);
    el.querySelector("#gm-annulla").addEventListener("click", () => close(null));
    input.addEventListener("keydown", (e) => e.key === "Enter" && prova());
    input.focus();
  });
}

/* Torna una funzione decorate() da richiamare dopo ogni render della lista, o
   null se il PIN è stato annullato (la pagina resta quella degli invitati). */
export async function initGalleriaAdmin({ grid, refresh }) {
  let pin = adminSession.pin();
  if (!pin || !(await tavoli.verifyAdmin(pin))) {
    pin = await chiediPin();
    if (!pin) return null;
    adminSession.remember(pin);
  }

  const banner = document.createElement("div");
  banner.className = "modera-bar";
  banner.innerHTML = `<span class="modera-bar__tag">Moderazione sposi</span>
    <label class="ga-switch modera-bar__switch"><input type="checkbox" id="gm-attiva"> <span>Galleria aperta agli invitati</span></label>
    <label class="ga-switch modera-bar__switch"><input type="checkbox" id="gm-bloccata"> <span>Sola lettura (blocca nuovi spazi e caricamenti)</span></label>
    <span class="modera-bar__hint">Tocca ✕ su uno spazio per eliminarlo (definitivo).</span>`;
  grid.before(banner);

  const attiva = banner.querySelector("#gm-attiva");
  const bloccata = banner.querySelector("#gm-bloccata");
  // Stato iniziale dei due interruttori in una sola lettura.
  tavoli
    .getSettings()
    .then((s) => {
      attiva.checked = !!s.galleriaAttiva;
      bloccata.checked = !!s.galleriaBloccata;
    })
    .catch(() => {});

  /* Interruttore apertura galleria (settings.galleriaAttiva). Finché è spenta,
     gli invitati vedono la sezione predisposta ma non possono creare spazi né
     caricare foto; gli Sposi qui la vedono comunque per intero. */
  attiva.addEventListener("change", async () => {
    try {
      await tavoli.saveSettings(pin, { galleriaAttiva: attiva.checked });
      toast(
        attiva.checked
          ? "Galleria aperta agli invitati 🍷"
          : "Galleria chiusa: creazione spazi e upload sospesi"
      );
    } catch (err) {
      if (/autorizz/i.test(err.message)) {
        adminSession.forget();
        toast("PIN non più valido: ricarica per rientrare");
      } else {
        toast(err.message || "Impossibile salvare");
      }
      attiva.checked = !attiva.checked; // rollback visivo
    }
  });

  /* Interruttore sola lettura (settings.galleriaBloccata), indipendente: a
     galleria aperta congela creazione spazi e caricamenti, ma tutto resta
     visibile. Utile per "chiudere" la raccolta dopo la festa senza cancellare. */
  bloccata.addEventListener("change", async () => {
    try {
      await tavoli.saveSettings(pin, { galleriaBloccata: bloccata.checked });
      toast(
        bloccata.checked
          ? "Galleria in sola lettura: nuovi spazi e caricamenti sospesi"
          : "Galleria di nuovo aperta ai caricamenti 🍷"
      );
    } catch (err) {
      if (/autorizz/i.test(err.message)) {
        adminSession.forget();
        toast("PIN non più valido: ricarica per rientrare");
      } else {
        toast(err.message || "Impossibile salvare");
      }
      bloccata.checked = !bloccata.checked; // rollback visivo
    }
  });

  // Delega: il ✕ vive dentro l'&lt;a&gt; della card, quindi fermiamo la navigazione.
  grid.addEventListener("click", async (e) => {
    const del = e.target.closest(".space-admin-del");
    if (!del) return;
    e.preventDefault();
    e.stopPropagation();
    const nick = del.closest(".space-card")?.dataset.nick;
    if (!nick) return;
    if (!confirm(`Eliminare l'intero spazio "${nick}"? Foto e video verranno rimossi. L'azione non è reversibile.`)) return;
    del.disabled = true;
    try {
      await storage.deleteSpace(pin, nick);
      toast("Spazio eliminato");
      await refresh();
    } catch (err) {
      console.error(err);
      if (/autorizz/i.test(err.message)) {
        adminSession.forget();
        toast("PIN non più valido: ricarica per rientrare");
      } else {
        toast("Impossibile eliminare lo spazio");
      }
      del.disabled = false;
    }
  });

  return function decorate() {
    grid.querySelectorAll(".space-card").forEach((card) => {
      if (card.querySelector(".space-admin-del")) return;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "space-admin-del";
      btn.title = "Elimina questo spazio";
      btn.setAttribute("aria-label", `Elimina lo spazio ${card.dataset.nick || ""}`);
      btn.textContent = "✕";
      card.appendChild(btn);
    });
  };
}
