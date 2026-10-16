// The site's own script. It reads the theme colour from the tokens, loads the design's icon sprite, and mounts the homepage's hero and demo.
const themeColor = document.createElement("meta");

themeColor.name = "theme-color";
themeColor.content = getComputedStyle(document.documentElement).getPropertyValue("--ink-0").trim();
document.head.append(themeColor);

fetch("/sprite.svg")
  .then((response) => response.text())
  .then((sprite) => document.body.insertAdjacentHTML("afterbegin", sprite));

function scrollToSection(id) {
  document.getElementById(id).scrollIntoView({ behavior: "smooth", block: "start" });
}

// mountView comes from panel.js, the design's script, which only the homepage loads.
const hero = document.getElementById("site-hero");
const demo = document.getElementById("site-panel");

if (hero) mountView(hero, "heroCopy");

if (demo) {
  mountView(demo, "narrow", {
    hasSetPicker: true,
    onHelp: () => scrollToSection("how"),
    onCredits: () => scrollToSection("credits"),
    onMeasure: () => window.open("https://eqbyear.com", "_blank", "noopener"),
  });
}

// The demo scales to the room under the header, so the hero card keeps one inset on all four sides.
// The panel and its caption are a fixed size, so this is the only way to fit them at every window height.
function fitDemo() {
  const demoBox = document.querySelector(".demo");

  if (!demoBox) return;

  const card = document.querySelector(".hero");
  const landing = document.querySelector("main.landing");
  const header = document.querySelector(".site-head");
  const inset = Number.parseFloat(getComputedStyle(landing).paddingTop);
  const heroPadding = Number.parseFloat(getComputedStyle(card).paddingTop);
  const room = window.innerHeight - header.offsetHeight - (3 * inset) - (2 * heroPadding);

  demoBox.style.zoom = "1";

  const natural = demoBox.offsetHeight;
  const zoom = natural > room ? room / natural : 1;

  demoBox.style.zoom = zoom === 1 ? "" : String(zoom);
}

if (demo) {
  fitDemo();
  document.fonts.ready.then(fitDemo);
  new ResizeObserver(fitDemo).observe(document.querySelector(".demo"));
  window.addEventListener("resize", fitDemo);
}
