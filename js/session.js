/*
 * PIN "session": once an invitato unlocks their own space with the correct
 * PIN, we remember it in localStorage on this device so uploads/deletes don't
 * re-prompt (D7 in the design). "Esci dal mio spazio" forgets it. This is a
 * convenience store, not security — the PIN is still checked by the backend
 * on every write (ADR-0002/0003).
 *
 * Shape (key "sm_session"): { [nickname]: pin }
 */
const KEY = "sm_session";

function read() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}");
  } catch {
    return {};
  }
}
function write(data) {
  localStorage.setItem(KEY, JSON.stringify(data));
}

export const session = {
  remember(nickname, pin) {
    const s = read();
    s[nickname] = pin;
    write(s);
  },
  pinFor(nickname) {
    return read()[nickname] || null;
  },
  /* I nickname ricordati su questo dispositivo (per pre-compilare, es. il nome
     nel gioco). Il primo è di solito lo Spazio dell'invitato. */
  nicknames() {
    return Object.keys(read());
  },
  isOwner(nickname) {
    return !!read()[nickname];
  },
  forget(nickname) {
    const s = read();
    delete s[nickname];
    write(s);
  },
};
