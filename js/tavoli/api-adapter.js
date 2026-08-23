/*
 * ApiTavoliAdapter — implementazione reale del seam dei tavoli (ADR-0004).
 * Parla con le Function sotto `apiBase`: getMap, saveMap, verifyAdmin,
 * getSettings, saveSettings. Il PIN admin non viene mai "scambiato" per un
 * token: viaggia a ogni scrittura e il server lo riverifica ogni volta.
 */
import { WEDDING } from "../../data/config.js";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export class ApiTavoliAdapter {
  constructor(apiBase = "/api") {
    this.base = apiBase.replace(/\/$/, "");
  }

  async _json(path, opts = {}) {
    const res = await fetch(this.base + path, {
      headers: { "Content-Type": "application/json" },
      ...opts,
    });
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try {
        msg = (await res.json()).error || msg;
      } catch {}
      throw new Error(msg);
    }
    return res.status === 204 ? null : res.json();
  }

  /* Finché gli Sposi non hanno salvato nulla, il backend risponde map:null e
     vale il seme in config.js. Dal primo salvataggio in poi vince il backend. */
  async getMap() {
    const { map } = await this._json("/getMap");
    return map || clone(WEDDING.tavoliSeed);
  }

  async saveMap(adminPin, map) {
    await this._json("/saveMap", {
      method: "POST",
      body: JSON.stringify({ adminPin, map }),
    });
  }

  /* Carica il logo di una cantina: SAS admin-gated + PUT diretto al Blob (come
     le foto). Torna l'URL pubblico, che l'editor mette in cantina.logoUrl e poi
     salva con saveMap. Un id casuale lato server fa da cache-busting. */
  async uploadLogo(adminPin, file) {
    const { uploadUrl, blobUrl } = await this._json("/requestLogoUpload", {
      method: "POST",
      body: JSON.stringify({ adminPin, contentType: file.type }),
    });
    const put = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "x-ms-blob-type": "BlockBlob", "Content-Type": file.type },
      body: file,
    });
    if (!put.ok) throw new Error("Upload del logo fallito");
    return blobUrl;
  }

  async verifyAdmin(adminPin) {
    try {
      const res = await this._json("/verifyAdmin", {
        method: "POST",
        body: JSON.stringify({ adminPin }),
      });
      return !!res?.ok;
    } catch {
      return false;
    }
  }

  async getSettings() {
    const { settings } = await this._json("/getSettings");
    return settings || { giochiAttivi: false };
  }

  async saveSettings(adminPin, settings) {
    await this._json("/saveSettings", {
      method: "POST",
      body: JSON.stringify({ adminPin, settings }),
    });
  }
}
