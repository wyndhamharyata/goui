// The Mac controls above the panel: the engine status and its restart button.
import { onEvent, send } from "./bridge.js";

const statusTexts = {
  running: "Playing through goui",
  stopped: "Off",
  waitingToRetry: "Could not start. Trying again.",
};

/**
 * @param {{ state: string, lastError?: string }} status
 */
function showStatus(status) {
  document.querySelector("#statusDot").dataset.state = status.state;
  document.querySelector("#statusText").textContent = statusTexts[status.state];
  document.querySelector("#statusText").title = status.lastError ?? "";
  document.querySelector("#restart").hidden = status.state !== "waitingToRetry";
}

onEvent((event) => {
  if (event.type === "status") showStatus(event.status);
});
document.querySelector("#restart").addEventListener("click", () => send({ type: "restart" }));
showStatus(await send({ type: "status" }));
