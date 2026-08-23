/*
 * Implementazione localStorage della mappa dei tavoli e delle impostazioni
 * (nessun backend). Serve per lavorare su grafica e interazioni senza avviare
 * Azurite: `npm run serve` e via.
 *
 * Legge il SEME da data/config.js finché non esiste una mappa salvata su questo
 * dispositivo; dal primo salvataggio in poi vince quella in localStorage. È la
 * stessa regola che in modalità "api" vale tra seme e backend (ADR-0004).
 *
 * Il PIN admin qui è verificato lato browser: nessuna sicurezza, solo comodità
 * di sviluppo — come in js/storage/local-adapter.js, da cui prende lo stesso
 * valore. In modalità "api" il PIN vero è ADMIN_PIN, server-side
 * (api/local.settings.json in locale, app setting su Azure).
 */
import { WEDDING } from "../../data/config.js";

const KEY_MAP = "sm_map";
const KEY_SETTINGS = "sm_settings";
const ADMIN_PIN = "sposi"; // solo collaudo locale, come js/storage/local-adapter.js

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function leggi(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null; // localStorage illeggibile o JSON corrotto
  }
}

export class LocalTavoliAdapter {
  async getMap() {
    return leggi(KEY_MAP) || clone(WEDDING.tavoliSeed);
  }

  async saveMap(adminPin, map) {
    if (adminPin !== ADMIN_PIN) throw new Error("Non autorizzato");
    localStorage.setItem(KEY_MAP, JSON.stringify(map));
  }

  /* Senza backend il logo diventa una data-URL: sta in localStorage dentro la
     mappa e la vista la disegna come qualsiasi src. In modalità "api" invece
     finisce su Blob (vedi ApiTavoliAdapter). Comodo per provare l'editor con
     `npm run serve`. */
  async uploadLogo(adminPin, file) {
    if (adminPin !== ADMIN_PIN) throw new Error("Non autorizzato");
    return await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(new Error("Lettura del file fallita"));
      r.readAsDataURL(file);
    });
  }

  async verifyAdmin(adminPin) {
    return adminPin === ADMIN_PIN;
  }

  async getSettings() {
    return { giochiAttivi: !!leggi(KEY_SETTINGS)?.giochiAttivi };
  }

  async saveSettings(adminPin, settings) {
    if (adminPin !== ADMIN_PIN) throw new Error("Non autorizzato");
    localStorage.setItem(KEY_SETTINGS, JSON.stringify({ giochiAttivi: !!settings?.giochiAttivi }));
  }
}
