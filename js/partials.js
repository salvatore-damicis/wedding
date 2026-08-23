/*
 * Shared nav + footer, injected into every page so we don't hand-duplicate
 * them across the 5 HTML files (ADR-0001). Each page includes:
 *   <div id="site-nav"></div> ... <div id="site-footer"></div>
 * and loads this module. The active link is highlighted from the URL.
 */
const LINKS = [
  { href: "index.html", label: "Home" },
  { href: "luoghi.html", label: "Luoghi" },
  { href: "tavoli.html", label: "Tavoli" },
  { href: "galleria.html", label: "Galleria" },
  { href: "giochi.html", label: "Giochi" },
];

function currentPage() {
  const path = location.pathname.split("/").pop() || "index.html";
  return path === "" ? "index.html" : path;
}

function navHtml() {
  const here = currentPage();
  const links = LINKS.map(
    (l) =>
      `<a href="${l.href}"${l.href === here ? ' aria-current="page"' : ""}>${l.label}</a>`
  ).join("");
  return `
    <nav class="nav">
      <div class="container nav__inner">
        <a href="index.html" class="nav__brand">S&amp;M</a>
        <button class="nav__toggle" aria-label="Menu" aria-expanded="false">&#9776;</button>
        <div class="nav__links">${links}</div>
      </div>
    </nav>`;
}

function footerHtml() {
  return `
    <footer class="footer">
      <p class="script">Salvatore &amp; Martina</p>
      <small>12 Settembre 2026 · Con amore</small>
    </footer>`;
}

export function mountChrome() {
  const nav = document.getElementById("site-nav");
  const footer = document.getElementById("site-footer");
  if (nav) nav.innerHTML = navHtml();
  if (footer) footer.innerHTML = footerHtml();

  const toggle = document.querySelector(".nav__toggle");
  const links = document.querySelector(".nav__links");
  toggle?.addEventListener("click", () => {
    const open = links.classList.toggle("open");
    toggle.setAttribute("aria-expanded", String(open));
  });
  links?.querySelectorAll("a").forEach((a) =>
    a.addEventListener("click", () => links.classList.remove("open"))
  );
}
