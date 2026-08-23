import { mountChrome } from "../partials.js";
import { initGioco } from "../games/quiz.js";

mountChrome();

const root = document.getElementById("quiz");

/* Regia solo con ?admin, e con import dinamico: un invitato non scarica nemmeno
   il codice dell'authoring/regia. Se annulla il PIN, ricade sulla vista invitato. */
if (new URLSearchParams(location.search).has("admin")) {
  const { initGiocoAdmin } = await import("../games/quiz-admin.js");
  await initGiocoAdmin(root, () => initGioco(root));
} else {
  initGioco(root);
}
