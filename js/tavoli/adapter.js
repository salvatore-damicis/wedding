/*
 * Mappa dei tavoli + impostazioni del sito — il seam, gemello di
 * js/storage/adapter.js (ADR-0004).
 *
 * La UI parla SOLO con l'oggetto `tavoli` esportato qui, via questa interfaccia
 * (metodi async):
 *
 *   getMap()                      -> { sala, tavoli: Tavolo[], cantine: Cantina[] }
 *   saveMap(adminPin, map)        -> void                      (solo Sposi)
 *   verifyAdmin(adminPin)         -> boolean
 *   getSettings()                 -> { giochiAttivi: boolean, weddingDate: string|null }
 *   saveSettings(adminPin, s)     -> void                      (solo Sposi)
 *
 * saveSettings fa merge per campo presente: la regia del gioco salva solo
 * giochiAttivi, la home admin (index.html?admin) solo weddingDate. weddingDate
 * (ISO) pilota il countdown della home; null = vale il seme WEDDING.date.
 *
 * Perché un seam separato e non `storage`: le foto le scrivono gli Invitati con
 * il proprio PIN, la mappa la scrivono SOLO gli Sposi col PIN admin. Regole di
 * accesso diverse, interfacce diverse.
 *
 * L'implementazione la decide STORAGE.backend in data/config.js, esattamente
 * come per le foto — il resto dell'app non sa quale delle due è attiva.
 */
import { STORAGE } from "../../data/config.js";
import { LocalTavoliAdapter } from "./local-adapter.js";
import { ApiTavoliAdapter } from "./api-adapter.js";

export const tavoli =
  STORAGE.backend === "api" ? new ApiTavoliAdapter(STORAGE.apiBase) : new LocalTavoliAdapter();
