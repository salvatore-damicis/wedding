/*
 * LocalAdapter — zero-dependency implementation of the storage interface
 * backed by localStorage. Photos are kept as data-URLs. Everything lives in
 * ONE browser, so "everyone sees everyone's photos" does NOT work across
 * devices here — that needs the ApiAdapter + Azure backend. This adapter is
 * for fast UI/style iteration without running the stack.
 *
 * Shape in localStorage (key "sm_spaces"):
 *   { [nickname]: { pin, photos: [ { id, url, name, uploadedAt } ] } }
 *
 * PIN is checked client-side here (no security — see ADR-0002). The admin PIN
 * is hardcoded for local testing only; the real admin PIN lives server-side.
 */
const KEY = "sm_spaces";
const ADMIN_PIN = "sposi"; // local testing only; real one is server-side

function readAll() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}");
  } catch {
    return {};
  }
}
function writeAll(data) {
  localStorage.setItem(KEY, JSON.stringify(data));
}

function toDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

export class LocalAdapter {
  async listSpaces() {
    const all = readAll();
    return Object.keys(all).map((nickname) => {
      const photos = all[nickname].photos; // già in ordine dal più recente
      const covers = photos.slice(0, 4).map((p) => ({ url: p.url, type: p.type || "image", id: p.id }));
      const chosen = all[nickname].coverId && photos.find((p) => p.id === all[nickname].coverId);
      return {
        nickname,
        coverUrl: (chosen || photos[0])?.url || null,
        covers,
        photoCount: photos.length,
      };
    });
  }

  async getSpace(nickname) {
    const all = readAll();
    const space = all[nickname];
    if (!space) return { nickname, photos: [], coverId: null };
    return { nickname, photos: space.photos, coverId: space.coverId || null };
  }

  async createOrEnter(nickname, pin) {
    nickname = String(nickname || "").trim();
    pin = String(pin || "").trim();
    if (!nickname || !pin) return { ok: false, reason: "Nickname e PIN obbligatori" };

    const all = readAll();
    const existing = all[nickname];
    if (!existing) {
      all[nickname] = { pin, photos: [] };
      writeAll(all);
      return { ok: true, isNew: true };
    }
    if (existing.pin !== pin) return { ok: false, reason: "PIN errato" };
    return { ok: true, isNew: false };
  }

  async uploadPhoto(nickname, pin, file, onProgress) {
    const all = readAll();
    const space = all[nickname];
    if (!space || space.pin !== pin) throw new Error("Non autorizzato");
    const url = await toDataUrl(file);
    if (onProgress) onProgress(1); // niente rete: salta direttamente a "completato"
    const photo = {
      id: `${file.name}-${file.size}-${Date.now()}`,
      url,
      name: file.name,
      type: file.type.startsWith("video/") ? "video" : "image",
      caption: "",
      uploadedAt: new Date().toISOString(),
    };
    space.photos.unshift(photo);
    writeAll(all);
    return photo;
  }

  async setCover(nickname, pin, id) {
    const all = readAll();
    const space = all[nickname];
    if (!space || space.pin !== pin) throw new Error("Non autorizzato");
    space.coverId = String(id);
    writeAll(all);
  }

  async setCaption(nickname, pin, id, caption) {
    const all = readAll();
    const space = all[nickname];
    if (!space || space.pin !== pin) throw new Error("Non autorizzato");
    const p = space.photos.find((x) => x.id === id);
    if (p) p.caption = String(caption || "").slice(0, 300);
    writeAll(all);
    return { id, caption: p?.caption || "" };
  }

  async deletePhoto(nickname, pin, id) {
    const all = readAll();
    const space = all[nickname];
    if (!space) return;
    const authorized = space.pin === pin || pin === ADMIN_PIN;
    if (!authorized) throw new Error("Non autorizzato");
    space.photos = space.photos.filter((p) => p.id !== id);
    if (space.coverId === id) space.coverId = null;
    writeAll(all);
  }

  async deleteSpace(adminPin, nickname) {
    if (adminPin !== ADMIN_PIN) throw new Error("Non autorizzato");
    const all = readAll();
    delete all[nickname];
    writeAll(all);
  }

  /* Recupero "morbido" del PIN: gli Sposi ne impostano uno nuovo, le foto
     restano. Alternativa a deleteSpace per chi ha dimenticato il PIN. */
  async resetPin(adminPin, nickname, newPin) {
    if (adminPin !== ADMIN_PIN) throw new Error("Non autorizzato");
    const code = String(newPin || "").trim();
    if (!code) throw new Error("Nuovo PIN obbligatorio");
    const all = readAll();
    const space = all[nickname];
    if (!space) throw new Error("Spazio inesistente");
    space.pin = code;
    writeAll(all);
  }
}
