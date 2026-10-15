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
