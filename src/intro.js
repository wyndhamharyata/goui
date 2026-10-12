document.getElementById("version").textContent = `v${chrome.runtime.getManifest().version}`;
document.getElementById("close").addEventListener("click", () => window.close());
