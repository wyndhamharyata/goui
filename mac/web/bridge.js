// Talks to the Swift side of the Mac app through WebKit's message channel.

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
