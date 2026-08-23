/* Tiny UI helpers shared across pages. */

let toastTimer;
export function toast(message) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
}

/* Wire the Google Maps "Indicazioni" buttons from config (data-maps attr). */
export function wireMaps(WEDDING) {
  document.querySelectorAll("[data-maps]").forEach((el) => {
    const which = el.dataset.maps; // "ceremony" | "reception"
    const q = encodeURIComponent(WEDDING[which].mapsQuery);
    el.href = `https://www.google.com/maps/search/?api=1&query=${q}`;
  });
}
