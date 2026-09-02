/*
 * Photo storage — the ONE seam between the UI and where photos live.
 *
 * The whole site talks ONLY to the `storage` object exported here, via this
 * interface (all methods async):
 *
 *   listSpaces()                             -> Space[]  { nickname, coverUrl, covers[], photoCount }
 *   getSpace(nickname)                       -> { nickname, photos: Photo[], coverId }
 *                                               Photo = { id, url, name, type, caption, uploadedAt }
 *   createOrEnter(nickname, pin)             -> { ok, isNew, reason? }
 *   uploadPhoto(nickname, pin, file, onProg) -> Photo        (onProg(0..1) opzionale; foto/video ORIGINALI)
 *   setCover(nickname, pin, id)              -> void          (proprietario: scegli copertina)
 *   setCaption(nickname, pin, id, caption)   -> void          (proprietario: didascalia)
 *   deletePhoto(nickname, pin, id)           -> void
 *   deleteSpace(adminPin, nickname)          -> void
 *   resetPin(adminPin, nickname, newPin)     -> void          (Sposi: PIN dimenticato, foto intatte)
 *
 * Two interchangeable implementations exist (see ADR-0003). Which one is used
 * is decided by STORAGE.backend in data/config.js — NOTHING else in the app
 * needs to know which backend is live.
 */
import { STORAGE } from "../../data/config.js";
import { LocalAdapter } from "./local-adapter.js";
import { ApiAdapter } from "./api-adapter.js";

export const storage =
  STORAGE.backend === "api" ? new ApiAdapter(STORAGE.apiBase) : new LocalAdapter();
