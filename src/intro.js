import { buildStartSteps } from "./guide.js";

document.getElementById("version").textContent = `v${chrome.runtime.getManifest().version}`;
document.getElementById("startSteps").replaceChildren(...buildStartSteps());
document.getElementById("close").addEventListener("click", () => window.close());
