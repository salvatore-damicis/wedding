/*
 * Moderazione di un singolo spazio — solo Sposi, con spazio.html?admin.
 * Import dinamico da spazio.js: un invitato non scarica questo modulo.
 *
 * Aggiunge la barra con "Reimposta PIN" (resetPin: recupero morbido di un PIN
 * dimenticato, foto intatte) e "Elimina intero spazio" (deleteSpace, definitivo).
 * La cancellazione delle SINGOLE foto la gestisce spazio.js nel visore, abilitata
 * dal PIN admin che restituiamo qui.
 *
 * Il PIN admin è uno solo (ADMIN_PIN, server-side): per verificarlo riuso
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
      <h2 class="modal__title">Moderazione spazio</h2>
      <p class="modal__hint">Riservato agli sposi.</p>
      <div class="field"><label for="sm-pin">PIN</label>
        <input id="sm-pin" type="password" inputmode="numeric" autocomplete="off" /></div>
      <p class="modal__error" id="sm-err"></p>
      <div class="modal__actions">
        <button class="btn btn-outline" id="sm-annulla" type="button">Annulla</button>
        <button class="btn btn-primary" id="sm-ok" type="button">Entra</button>
      </div>
    </div>`;
    document.body.appendChild(el);
    const input = el.querySelector("#sm-pin");
    const err = el.querySelector("#sm-err");
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
    el.querySelector("#sm-ok").addEventListener("click", prova);
    el.querySelector("#sm-annulla").addEventListener("click", () => close(null));
    input.addEventListener("keydown", (e) => e.key === "Enter" && prova());
    input.focus();
  });
}

/* Chiede il nuovo PIN da assegnare allo spazio (recupero morbido). Torna la
   stringa inserita, o null se annullato. */
function chiediNuovoPin(nick) {
  return new Promise((resolve) => {
    const el = document.createElement("div");
    el.className = "modal open";
    el.innerHTML = `<div class="modal__box">
      <h2 class="modal__title">Reimposta il PIN di “${nick}”</h2>
      <p class="modal__hint">Scegli un nuovo PIN e comunicalo all'invitato: le foto restano al loro posto.</p>
      <div class="field"><label for="rp-pin">Nuovo PIN</label>
        <input id="rp-pin" type="text" inputmode="numeric" autocomplete="off" /></div>
      <p class="modal__error" id="rp-err"></p>
      <div class="modal__actions">
        <button class="btn btn-outline" id="rp-annulla" type="button">Annulla</button>
        <button class="btn btn-primary" id="rp-ok" type="button">Reimposta</button>
      </div>
    </div>`;
    document.body.appendChild(el);
    const input = el.querySelector("#rp-pin");
    const err = el.querySelector("#rp-err");
    const close = (v) => {
      el.remove();
      resolve(v);
    };
    const conferma = () => {
      const v = input.value.trim();
      if (!v) {
        err.textContent = "Inserisci un nuovo PIN.";
        return;
      }
      close(v);
    };
    el.querySelector("#rp-ok").addEventListener("click", conferma);
    el.querySelector("#rp-annulla").addEventListener("click", () => close(null));
    el.addEventListener("click", (e) => e.target === el && close(null));
    input.addEventListener("keydown", (e) => e.key === "Enter" && conferma());
    input.focus();
  });
}

/* Torna { pin } se la moderazione è attiva, o null se il PIN è annullato. */
export async function initSpazioAdmin({ nick, container }) {
  let pin = adminSession.pin();
  if (!pin || !(await tavoli.verifyAdmin(pin))) {
    pin = await chiediPin();
    if (!pin) return null;
    adminSession.remember(pin);
  }

  const bar = document.createElement("div");
  bar.className = "modera-bar";
  bar.innerHTML = `<span class="modera-bar__tag">Moderazione sposi</span>
    <span class="modera-bar__hint">Elimina singole foto dal visore, reimposta il PIN o elimina tutto lo spazio.</span>
    <button class="btn btn-outline modera-bar__reset" id="modera-reset-pin" type="button">Reimposta PIN</button>
    <button class="btn btn-outline modera-bar__del" id="modera-del-space" type="button">Elimina intero spazio</button>`;
  (container || document.body).prepend(bar);

  bar.querySelector("#modera-reset-pin").addEventListener("click", async () => {
    const nuovo = await chiediNuovoPin(nick);
    if (!nuovo) return;
    try {
      await storage.resetPin(pin, nick, nuovo);
      toast(`PIN reimpostato: comunica “${nuovo}” all'invitato`);
    } catch (err) {
      console.error(err);
      if (/autorizz/i.test(err.message)) {
        adminSession.forget();
        toast("PIN non più valido: ricarica per rientrare");
      } else {
        toast(err.message || "Impossibile reimpostare il PIN");
      }
    }
  });

  bar.querySelector("#modera-del-space").addEventListener("click", async () => {
    if (!confirm(`Eliminare l'INTERO spazio "${nick}"? Foto e video verranno rimossi. L'azione non è reversibile.`)) return;
    try {
      await storage.deleteSpace(pin, nick);
      toast("Spazio eliminato");
      location.href = "galleria.html";
    } catch (err) {
      console.error(err);
      if (/autorizz/i.test(err.message)) {
        adminSession.forget();
        toast("PIN non più valido: ricarica per rientrare");
      } else {
        toast("Impossibile eliminare lo spazio");
      }
    }
  });

  return { pin };
}
