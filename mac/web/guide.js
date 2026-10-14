// The Get started steps for the Mac, in place of the extension's steps about the toolbar and tabs.
import { buildElement } from "../../src/panel/dom.js";

/**
 * @param {string} symbolId
 * @returns {SVGSVGElement}
 */
function buildIcon(symbolId) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");

  use.setAttribute("href", `#${symbolId}`);
  svg.append(use);

  return svg;
}

/**
 * @param {Element[]} shotParts
 * @param {string} title
 * @param {string} text
 * @returns {HTMLElement}
 */
function buildStep(shotParts, title, text) {
  const shot = buildElement("div", { className: "shot" }, shotParts);
  const words = buildElement("p", { className: "guide-text" }, [buildElement("span", {}, [buildElement("b", { text: title }), text])]);

  return buildElement("li", { className: "guide-step" }, [shot, words]);
}

function buildPowerShot() {
  const power = buildElement("span", { className: "power focus" }, [buildIcon("power-icon"), "OFF"]);
  const cursor = buildIcon("cursor");

  cursor.classList.add("mock-cursor");
  cursor.style.left = "52px";
  cursor.style.top = "30px";

  return [buildElement("div", { className: "mock-toolbar" }, [power, buildElement("span", { className: "mock-url", text: "goui is off" })]), cursor];
}

function buildAllowShot() {
  const buttons = buildElement("div", { className: "mock-flow" }, [
    buildElement("span", { className: "mock-button", text: "Don't Allow" }),
    buildElement("span", { className: "mock-button focus", text: "Allow" }),
  ]);

  return [buildElement("div", { className: "mock-menu mock-dialog" }, [buildElement("small", { text: "goui would like to record the audio of this Mac." }), buttons])];
}

function buildPlayShot() {
  const rows = [["Lofi radio", "Music"], ["Weekly sync", "Zoom"]].map(([name, app]) => {
    const label = buildElement("span", {}, [buildIcon("speaker"), name]);

    return buildElement("div", { className: "mock-row" }, [label, buildElement("small", { text: app })]);
  });

  return [buildElement("div", { className: "mock-card mock-apps" }, rows)];
}

/** @returns {void} */
export function renderMacGuide() {
  document.head.append(buildElement("link", { rel: "stylesheet", href: new URL("guide.css", import.meta.url).href }));
  document.querySelector("#start .guide-steps").replaceChildren(
    buildStep(buildPowerShot(), "Turn goui on", "Press the power button at the top of this panel. goui EQs every sound the Mac plays."),
    buildStep(buildAllowShot(), "Allow the audio", "The first time, macOS asks to let goui record the audio of this Mac. Press Allow. goui EQs the sound on its way to you and keeps none of it."),
    buildStep(buildPlayShot(), "Play something", "Any app works. Music, a video, a call."),
  );
}
