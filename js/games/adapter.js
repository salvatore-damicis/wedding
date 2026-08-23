/*
 * Gioco live — il seam del quiz condotto dagli Sposi (ADR-0005), gemello di
 * js/storage/adapter.js e js/tavoli/adapter.js.
 *
 * La UI parla SOLO con l'oggetto `game` esportato qui (metodi async):
 *
 *   getState(playerId?)          -> stato corrente (pollato da tutti)
 *   join(playerId, name)         -> { playerId, name }
 *   answer(playerId, round, idx) -> { ok }
 *   verifyAdmin(pin)             -> boolean
 *   getQuiz(pin)                 -> { questions }              (solo Sposi)
 *   saveQuiz(pin, questions)     -> { ok, count }              (solo Sposi)
 *   control(pin, action)         -> { ok, phase, round }       (solo Sposi)
 *       action: "start" | "open" | "reveal" | "end" | "reset"
 *
 * L'implementazione la sceglie STORAGE.backend in data/config.js, come per gli
 * altri seam. In modalità "local" la partita vive in localStorage: due schede
 * dello stesso browser (host + giocatore) la condividono, comodo per provare.
 */
import { STORAGE } from "../../data/config.js";
import { LocalGameAdapter } from "./local-adapter.js";
import { ApiGameAdapter } from "./api-adapter.js";

export const game =
  STORAGE.backend === "api" ? new ApiGameAdapter(STORAGE.apiBase) : new LocalGameAdapter();
