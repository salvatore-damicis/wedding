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
 *   getSettings()                 -> { giochiAttivi: boolean, weddingDate: string|null, galleriaAttiva: boolean, galleriaBloccata: boolean }
 *   saveSettings(adminPin, s)     -> void                      (solo Sposi)
 *
 * saveSettings fa merge per campo presente: la regia del gioco salva solo
 * giochiAttivi, la home admin (index.html?admin) solo weddingDate, la moderazione
 * galleria (galleria.html?admin) galleriaAttiva e/o galleriaBloccata. weddingDate
 * (ISO) pilota il countdown della home; null = vale il seme WEDDING.date.
 * galleriaAttiva (default false) apre la galleria condivisa: finché è false gli
 * invitati vedono la sezione predisposta ma non possono creare spazi né caricare
 * foto. galleriaBloccata (default false) è indipendente: a galleria aperta la mette
 * in SOLA LETTURA — tutto resta visibile ma nessuno crea spazi né carica.
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
