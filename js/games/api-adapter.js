/*
 * ApiGameAdapter — implementazione reale del seam del gioco (ADR-0005).
 * Parla con le Function sotto `apiBase`. Il PIN admin non diventa mai un token:
 * viaggia a ogni azione di regia e il server lo riverifica.
 */
export class ApiGameAdapter {
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
      const err = new Error(msg);
      err.status = res.status;
      throw err;
    }
    return res.status === 204 ? null : res.json();
  }

  getState(playerId) {
    const q = playerId ? `?playerId=${encodeURIComponent(playerId)}` : "";
    return this._json(`/getGameState${q}`);
  }

  join(playerId, name) {
    return this._json("/joinGame", {
      method: "POST",
      body: JSON.stringify({ playerId, name }),
    });
  }

  answer(playerId, round, idx) {
    return this._json("/submitAnswer", {
      method: "POST",
      body: JSON.stringify({ playerId, round, idx }),
    });
  }

  async verifyAdmin(pin) {
    try {
      const res = await this._json("/verifyAdmin", {
        method: "POST",
        body: JSON.stringify({ adminPin: pin }),
      });
      return !!res?.ok;
    } catch {
      return false;
    }
  }

  getQuiz(pin) {
    return this._json("/getQuiz", { method: "POST", body: JSON.stringify({ adminPin: pin }) });
  }

  saveQuiz(pin, questions) {
    return this._json("/saveQuiz", {
      method: "POST",
      body: JSON.stringify({ adminPin: pin, questions }),
    });
  }

  control(pin, action) {
    return this._json("/gameAdmin", {
      method: "POST",
      body: JSON.stringify({ adminPin: pin, action }),
    });
  }
}
