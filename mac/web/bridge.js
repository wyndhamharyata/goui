// Talks to the Swift side of the Mac app through WebKit's message channel. Bridge.swift reads the same names.

// Each message the page sends to Swift. The reply comes back as the result of the send.
export const macMessageTypes = {
  status: "status",
  meters: "meters",
  // Plays a PlayedSound at once.
  sound: "sound",
  // Keeps the PlayedSound of the stored config for the next login.
  keepSound: "keepSound",
  power: "power",
  response: "response",
  open: "open",
  openGuide: "openGuide",
  size: "size",
  print: "print",
  storageGet: "storage:get",
  storageSet: "storage:set",
  storageRemove: "storage:remove",
};

// Each event Swift sends to the page, as a "goui" event on window.
export const macEventTypes = {
  status: "status",
};

/**
 * @param {object} message
 * @returns {Promise<any>}
 */
export function send(message) {
  return window.webkit.messageHandlers.goui.postMessage(message);
}

/**
 * @param {(event: any) => void} listener
 */
export function onEvent(listener) {
  window.addEventListener("goui", (event) => listener(event.detail));
}
