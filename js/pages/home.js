import { mountChrome } from "../partials.js";
import { initCountdown } from "../countdown.js";

mountChrome();
initCountdown(document.getElementById("countdown"));
