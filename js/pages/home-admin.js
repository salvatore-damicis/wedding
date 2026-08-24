/*
 * Admin della home — solo Sposi, si attiva con index.html?admin (come
 * tavoli.html?admin e giochi.html?admin). Import dinamico da home.js: un
 * invitato non scarica nemmeno questo modulo.
 *
 * Cosa fa: imposta la DATA/ORA del matrimonio, che pilota il countdown della
 * home. La data vive nelle settings del backend (weddingDate, ISO); se non è
 * mai stata salvata vale il seme WEDDING.date in data/config.js. Salvando,
 * countdown ed etichetta si aggiornano subito, senza ricaricare.
 *
 * "Anteprima scadenza" mostra lo stato di fine countdown senza toccare la data
 * salvata, per vedere cosa vedranno gli invitati il giorno del matrimonio.
 */
import { tavoli } from "../tavoli/adapter.js";
import { adminSession } from "../admin-session.js";
import { toast } from "../ui.js";
import { WEDDING } from "../../data/config.js";

/* Date -> "YYYY-MM-DDTHH:MM" in ora locale, per il value di datetime-local.
   Locale e non ISO/UTC: gli Sposi ragionano nella loro ora, e il round-trip
   (new Date(value) al salvataggio) resta nello stesso fuso. */
function toLocalInput(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/* PIN admin: chiesto una volta, ricordato sul dispositivo (come gli altri admin). */
function chiediPin() {
  return new Promise((resolve) => {
    const el = document.createElement("div");
    el.className = "modal open";
    el.innerHTML = `<div class="modal__box">
      <h2 class="modal__title">Impostazioni home</h2>
      <p class="modal__hint">Riservato agli sposi.</p>
      <div class="field"><label for="ha-pin">PIN</label>
        <input id="ha-pin" type="password" inputmode="numeric" autocomplete="off" /></div>
      <p class="modal__error" id="ha-err"></p>
      <div class="modal__actions">
        <button class="btn btn-outline" id="ha-annulla" type="button">Annulla</button>
        <button class="btn btn-primary" id="ha-ok" type="button">Entra</button>
      </div>
    </div>`;
    document.body.appendChild(el);
    const input = el.querySelector("#ha-pin");
    const err = el.querySelector("#ha-err");
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
    el.querySelector("#ha-ok").addEventListener("click", prova);
    el.querySelector("#ha-annulla").addEventListener("click", () => close(null));
    input.addEventListener("keydown", (e) => e.key === "Enter" && prova());
    input.focus();
  });
}

export async function initHomeAdmin({ cd, applicaData }) {
  let pin = adminSession.pin();
  if (!pin || !(await tavoli.verifyAdmin(pin))) {
    pin = await chiediPin();
    if (!pin) return; // annullato: resta la home da invitato
    adminSession.remember(pin);
  }

  // Data effettiva corrente: quella salvata, o il seme.
  let attuale;
  try {
    const s = await tavoli.getSettings();
    attuale = s.weddingDate ? new Date(s.weddingDate) : WEDDING.date;
  } catch {
    attuale = WEDDING.date;
  }
  if (Number.isNaN(attuale.getTime())) attuale = WEDDING.date;

  /* Il pannello vive in fondo alla pagina come card, dopo il contenuto: è uno
     strumento di regia, non parte della home vista dagli invitati. */
  const box = document.createElement("section");
  box.className = "section home-admin";
  box.innerHTML = `<div class="container">
    <div class="home-admin__card">
      <h2 class="home-admin__titolo">Data del matrimonio</h2>
      <p class="home-admin__nota">Pilota il countdown e la data mostrata in home. Salvando, cambia subito qui e per tutti gli invitati.</p>
      <div class="field">
        <label for="ha-data">Data e ora</label>
        <input id="ha-data" type="datetime-local" value="${toLocalInput(attuale)}" />
      </div>
      <div class="home-admin__azioni">
        <button class="btn btn-primary" id="ha-salva" type="button">Salva data</button>
        <button class="btn btn-outline" id="ha-anteprima" type="button">Anteprima scadenza</button>
        <button class="btn btn-outline" id="ha-seme" type="button">Ripristina data predefinita</button>
        <button class="btn btn-outline" id="ha-esci" type="button">Esci</button>
      </div>
      <p class="home-admin__stato" id="ha-stato" aria-live="polite"></p>
    </div>
  </div>`;

  const footer = document.getElementById("site-footer");
  footer ? footer.before(box) : document.body.appendChild(box);

  const input = box.querySelector("#ha-data");
  const stato = box.querySelector("#ha-stato");
  const btnAnteprima = box.querySelector("#ha-anteprima");
  let inAnteprima = false;

  const fineAnteprima = () => {
    if (!inAnteprima) return;
    inAnteprima = false;
    btnAnteprima.textContent = "Anteprima scadenza";
    cd.restore();
  };

  async function salva(iso, msg) {
    const testo = box.querySelector("#ha-salva").textContent;
    box.querySelector("#ha-salva").disabled = true;
    stato.textContent = "Salvataggio…";
    try {
      await tavoli.saveSettings(pin, { weddingDate: iso });
      stato.textContent = msg;
      toast("Data salvata 🍷");
    } catch (err) {
      if (/autorizz/i.test(err.message)) {
        adminSession.forget();
        toast("PIN non più valido: ricarica per rientrare");
      } else {
        toast(`Salvataggio non riuscito: ${err.message}`);
      }
      stato.textContent = "";
    } finally {
      box.querySelector("#ha-salva").disabled = false;
      box.querySelector("#ha-salva").textContent = testo;
    }
  }

  box.querySelector("#ha-salva").addEventListener("click", async () => {
    const d = new Date(input.value);
    if (Number.isNaN(d.getTime())) {
      stato.textContent = "Data non valida.";
      return;
    }
    fineAnteprima();
    await salva(d.toISOString(), `Impostata: ${d.toLocaleString("it-IT")}`);
    applicaData(d); // countdown + etichetta, subito
  });

  btnAnteprima.addEventListener("click", () => {
    if (inAnteprima) {
      fineAnteprima();
    } else {
      inAnteprima = true;
      btnAnteprima.textContent = "Torna al conteggio";
      cd.previewExpired();
    }
  });

  box.querySelector("#ha-seme").addEventListener("click", async () => {
    if (!confirm("Tornare alla data predefinita del sito?")) return;
    fineAnteprima();
    // weddingDate: "" -> il backend cancella e torna al seme WEDDING.date.
    await salva("", `Ripristinata: ${WEDDING.date.toLocaleString("it-IT")}`);
    input.value = toLocalInput(WEDDING.date);
    applicaData(WEDDING.date);
  });

  box.querySelector("#ha-esci").addEventListener("click", () => {
    fineAnteprima();
    location.href = "index.html";
  });
}
