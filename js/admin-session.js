/*
 * "Sessione" admin degli Sposi: una volta verificato il PIN, lo ricordiamo su
 * questo dispositivo per non richiederlo a ogni salvataggio.
 *
 * Gemella di js/session.js (che ricorda i PIN degli Invitati) e con lo stesso
 * disclaimer: è comodità, NON sicurezza. Il PIN vero vive server-side
 * (ADMIN_PIN) e ogni scrittura lo riverifica.
 */
const KEY = "sm_admin";

export const adminSession = {
  pin() {
    try {
      return localStorage.getItem(KEY) || null;
    } catch {
      return null;
    }
  },
  remember(pin) {
    localStorage.setItem(KEY, pin);
  },
  forget() {
    localStorage.removeItem(KEY);
  },
};
