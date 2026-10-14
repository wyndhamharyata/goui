// The browser, the tone page, the icon press, the panel steps and the level checks of every journey.
import { chromium, expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** @typedef {import("@playwright/test").Page} Page */

/** @typedef {import("@playwright/test").BrowserContext} BrowserContext */

/** @typedef {import("@playwright/test").Locator} Locator */

const here = import.meta.dirname;
export const extensionDir = join(here, "..");
export const manifest = JSON.parse(readFileSync(join(extensionDir, "manifest.json"), "utf8"));
export const peakText = "Preamp: 0 dB\nFilter 1: ON PK Fc 1000 Hz Gain 6.0 dB Q 1.0";
export const earCutText = "Filter 1: ON PK Fc 1000 Hz Gain -6.0 dB Q 1.0";
// tone.html sets this title once it plays. The panel shows the title of the tab goui hears.
export const playingToneTitle = "playing running";
const levelToleranceDb = 0.6;

// Chrome derives the id from the public key in the manifest, so the test knows it before launch.
/**
 * @param {string} key
 * @returns {string}
 */
export function deriveExtensionId(key) {
  const digest = createHash("sha256").update(Buffer.from(key, "base64")).digest("hex").slice(0, 32);
  return [...digest].map((digit) => String.fromCharCode(97 + parseInt(digit, 16))).join("");
}

export const extensionId = deriveExtensionId(manifest.key);
export const panelUrl = `chrome-extension://${extensionId}/src/panel.html`;

/**
 * @param {string} name
 * @returns {Buffer}
 */
export function readFixture(name) {
  return readFileSync(join(here, "fixtures", name));
}

/**
 * @param {string} name
 * @returns {string}
 */
export function fixturePath(name) {
  return join(here, "fixtures", name);
}

// A local server for tone.html, and Chromium with goui loaded and sound allowed to play.
/**
 * @param {{ width: number, height: number }} viewport
 * @returns {Promise<{ context: BrowserContext, server: import("node:http").Server, port: number }>}
 */
export async function openBrowser(viewport) {
  const server = createServer((request, response) => {
    response.setHeader("content-type", "text/html");
    response.end(readFixture("tone.html"));
  });
  await new Promise((ready) => server.listen(0, ready));

  const context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), "goui-")), {
    channel: "chromium",
    headless: true,
    viewport,
    ignoreDefaultArgs: ["--mute-audio"],
    args: [
      `--disable-extensions-except=${extensionDir}`,
      `--load-extension=${extensionDir}`,
      `--allowlisted-extension-id=${extensionId}`,
      "--autoplay-policy=no-user-gesture-required",
      "--disable-audio-output",
    ],
  });

  return { context, server, port: server.address().port };
}

/**
 * @param {string} name
 * @param {(context: BrowserContext, port: number) => Promise<void>} run
 */
export function journey(name, run) {
  test(name, async () => {
    const { context, server, port } = await openBrowser({ width: 400, height: 900 });
    try {
      await run(context, port);
    } finally {
      await context.close();
      server.close();
    }
  });
}

/**
 * @param {number} port
 * @param {number} toneHz
 * @returns {string}
 */
function toneUrl(port, toneHz) {
  return `http://localhost:${port}/?hz=${toneHz}`;
}

/** @param {Page} tone */
async function playTone(tone) {
  await tone.click("#play");
  expect(await tone.title()).toBe(playingToneTitle);
}

/**
 * @param {BrowserContext} context
 * @param {number} port
 * @param {number} toneHz
 * @returns {Promise<Page>}
 */
export async function openTone(context, port, toneHz) {
  const tone = await context.newPage();
  await tone.goto(toneUrl(port, toneHz));
  await playTone(tone);

  return tone;
}

// The service worker can start after the pages, so the first read waits for it.
/**
 * @param {BrowserContext} context
 * @returns {Promise<import("@playwright/test").Worker>}
 */
export async function findWorker(context) {
  return context.serviceWorkers()[0] || context.waitForEvent("serviceworker");
}

/**
 * @param {BrowserContext} context
 * @param {number} toneHz
 * @returns {Page | undefined}
 */
function findTone(context, toneHz) {
  return context.pages().find((page) => page.url().includes(`?hz=${toneHz}`));
}

// goui has no tabs permission, so the step runs on the active tab with the page's url and title added.
/**
 * @param {BrowserContext} context
 * @param {Page} page
 * @param {"pressIcon" | "readBadge"} step
 * @returns {Promise<unknown>}
 */
async function runOnActiveTab(context, page, step) {
  const worker = await findWorker(context);
  await page.bringToFront();
  const details = { url: page.url(), title: await page.title() };

  return worker.evaluate(async ({ tabDetails, stepName }) => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    const activeTab = { ...tab, ...tabDetails };
    if (stepName === "pressIcon") return chrome.action.onClicked.dispatch(activeTab);


    return chrome.action.getBadgeText({ tabId: activeTab.id });
  }, { tabDetails: details, stepName: step });
}

// Playwright cannot press the toolbar icon, so this fires the icon's own click event with the page's tab.
/**
 * @param {BrowserContext} context
 * @param {Page} page
 */
export async function pressIcon(context, page) {
  await runOnActiveTab(context, page, "pressIcon");
}

/**
 * @param {BrowserContext} context
 * @param {Page} page
 * @returns {Promise<string>}
 */
export async function readBadge(context, page) {
  return runOnActiveTab(context, page, "readBadge");
}

// Playwright cannot install an app. A popup window has no side panel either, so it stands in for one.
/**
 * @param {BrowserContext} context
 * @param {number} port
 * @param {number} toneHz
 * @returns {Promise<{ tone: Page, tabId: number }>}
 */
export async function openToneInApp(context, port, toneHz) {
  const worker = await findWorker(context);
  const tabId = await worker.evaluate(async (url) => (await chrome.windows.create({ type: "popup", url })).tabs[0].id, toneUrl(port, toneHz));
  await expect.poll(() => findTone(context, toneHz)).toBeTruthy();
  const tone = findTone(context, toneHz);
  await tone.waitForLoadState();
  await playTone(tone);

  return { tone, tabId };
}

// Playwright cannot press the icon in a window with no toolbar, so a journey opens the popup page itself.
/**
 * @param {BrowserContext} context
 * @param {number} tabId
 * @returns {Promise<string>}
 */
export async function readPopup(context, tabId) {
  const worker = await findWorker(context);
  return worker.evaluate((id) => chrome.action.getPopup({ tabId: id }), tabId);
}

/**
 * @param {BrowserContext} context
 * @returns {Promise<Page>}
 */
export async function openPanelPage(context) {
  const panel = await context.newPage();
  await panel.goto(panelUrl);
  return panel;
}

// Opens a tone, opens the panel, and presses the icon on the tone, as a person starts goui.
/**
 * @param {BrowserContext} context
 * @param {number} port
 * @param {number} toneHz
 * @returns {Promise<{ panel: Page, tone: Page }>}
 */
export async function startGouiOnTone(context, port, toneHz) {
  const tone = await openTone(context, port, toneHz);
  const panel = await openPanelPage(context);
  await expect(panel.locator("#status")).toContainText("Click the goui icon");
  await pressIcon(context, tone);
  await expect(panel.locator("#status")).toHaveText(playingToneTitle);

  return { panel, tone };
}

// Auto preamp is on at the start. It would hide a boost, so most journeys turn it off first.
/** @param {Page} panel */
export async function turnAutoPreampOff(panel) {
  await panel.click("#autoPreamp");
}

/** @param {Page} panel */
export async function turnEqOff(panel) {
  await panel.click(".head .switch");
}

/** @param {Page} panel */
export async function holdCompare(panel) {
  await panel.locator("#compare").hover();
  await panel.mouse.down();
}

/** @param {Page} panel */
export async function releaseCompare(panel) {
  await panel.mouse.up();
}

// The tall view turns the graph so frequency runs down the panel.
/** @param {Page} panel */
export async function useTallGraph(panel) {
  await panel.click("#tall");
}

/**
 * @param {Page} panel
 * @param {number} index
 */
export async function chooseBand(panel, index) {
  await panel.click(`#chips [data-index='${index}']`);
}

/**
 * @param {Page} panel
 * @param {string} selector
 * @param {number} pressCount
 */
export async function nudgeSlider(panel, selector, pressCount) {
  await panel.locator(selector).focus();
  for (let press = 0; press < pressCount; press += 1) await panel.keyboard.press("ArrowRight");
}

// The wait comes first, so a reading from before the last step never counts. Two readings must agree.
/**
 * @param {Page} page
 * @returns {Promise<number>}
 */
export async function readSteadyLevel(page) {
  const reactionMs = 400;
  const readingIntervalMs = 200;
  const maxReadings = 75;
  const silentBelowDb = -100;
  const settledWithinDb = 0.3;
  await page.waitForTimeout(reactionMs);
  let previous = null;
  for (let attempt = 0; attempt < maxReadings; attempt += 1) {
    const reading = Number(await page.locator("#level").textContent());
    const isSettled = Number.isFinite(reading) && reading > silentBelowDb && previous !== null && Math.abs(reading - previous) < settledWithinDb;
    if (isSettled) return reading;

    previous = Number.isFinite(reading) ? reading : null;
    await page.waitForTimeout(readingIntervalMs);
  }
  throw new Error("The level did not settle.");
}

/**
 * @param {Page} panel
 * @returns {Promise<{ centerX: number, centerY: number }>}
 */
function readBandPointCenter(panel) {
  return panel.locator("#tuneGraph circle[r='7']").first().evaluate((circle) => {
    const bounds = circle.getBoundingClientRect();

    return { centerX: bounds.x + (bounds.width / 2), centerY: bounds.y + (bounds.height / 2) };
  });
}

// The graph draws again once the page scrollbar shows, so the first band point is read until it holds still.
/**
 * @param {Page} panel
 * @returns {Promise<{ centerX: number, centerY: number }>}
 */
export async function readStillBandPoint(panel) {
  let position = await readBandPointCenter(panel);
  await expect.poll(async () => {
    const next = await readBandPointCenter(panel);
    const isStill = next.centerX === position.centerX && next.centerY === position.centerY;
    position = next;

    return isStill;
  }).toBe(true);

  return position;
}

// A level changed by expectedDb, to within 0.6 dB.
/**
 * @param {number} afterDb
 * @param {number} beforeDb
 * @param {number} expectedDb
 */
export function expectChangeDb(afterDb, beforeDb, expectedDb) {
  expect(Math.abs(afterDb - beforeDb - expectedDb)).toBeLessThan(levelToleranceDb);
}

/**
 * @param {Page} panel
 * @param {string} name
 * @returns {Promise<void>}
 */
export async function openTab(panel, name) {
  // From 900 px wide the three tabs show side by side, and the tab buttons are hidden.
  const tab = panel.locator(`#tabs [data-tab=${name}]`);
  if (await tab.isVisible()) await tab.click();
}

/**
 * @param {Page} panel
 * @param {string} label
 * @returns {Locator}
 */
export function layerRow(panel, label) {
  return panel.locator(".layer", { hasText: label });
}

/**
 * @param {Page} panel
 * @param {string} role
 * @returns {Locator}
 */
export function sectionOf(panel, role) {
  return panel.locator(`.preset-section[data-role=${role}]`);
}

// Pastes AutoEQ text into one layer. A second press on Paste closes the box, so it is pressed only when closed.
/**
 * @param {Page} panel
 * @param {string} role
 * @param {string} text
 */
export async function pasteInto(panel, role, text) {
  await openTab(panel, "library");
  const section = sectionOf(panel, role);
  if (!(await section.locator("[data-action=apply]").isVisible())) await section.locator("[data-action=paste]").click();
  await section.locator(".text").fill(text);
  await section.locator("[data-action=apply]").click();
}

/**
 * @param {Page} panel
 * @param {string} role
 * @param {string} name
 */
export async function saveAs(panel, role, name) {
  await openTab(panel, "library");
  const section = sectionOf(panel, role);
  await section.locator("[data-action=saveAs]").click();
  await section.locator(".save-name").fill(name);
  await section.locator("[data-action=confirmSave]").click();
}

/**
 * @param {Page} panel
 * @param {string} role
 * @param {string} name
 */
export async function pick(panel, role, name) {
  await openTab(panel, "library");
  await sectionOf(panel, role).locator(`.item[data-name="${name}"]`).click();
}

/**
 * @param {Page} panel
 * @param {string} label
 * @returns {Locator}
 */
export function layerSwitch(panel, label) {
  return layerRow(panel, label).locator("input");
}

// The switch lives in the Listen pane, so the tab comes first. A hidden input cannot be clicked.
/**
 * @param {Page} panel
 * @param {string} label
 * @param {boolean} isOn
 */
export async function setLayer(panel, label, isOn) {
  await openTab(panel, "listen");
  const input = layerSwitch(panel, label);
  if ((await input.isChecked()) !== isOn) await layerRow(panel, label).locator(".switch").click();
  await expect.poll(() => input.isChecked()).toBe(isOn);
}

// Stands in for AutoEQ on GitHub with real files. Other Phone is in the index, but its file answers 404.
/** @param {BrowserContext} context */
export async function routeAutoEq(context) {
  const fixturesByPath = {
    "/Filk/over-ear/Fixture%20Phone%20(ANC%20On)/Fixture%20Phone%20(ANC%20On)%20ParametricEQ.txt": "fixture-phone.txt",
    "/oratory1990/over-ear/Sennheiser%20HD%20600/Sennheiser%20HD%20600%20ParametricEQ.txt": "Sennheiser HD 600 ParametricEQ.txt",
    "INDEX.md": "autoeq-index.md",
  };
  await context.route("https://raw.githubusercontent.com/**", (route) => {
    const url = route.request().url();
    const fixture = Object.entries(fixturesByPath).find(([path]) => url.endsWith(path));
    if (fixture) route.fulfill({ contentType: "text/plain", body: readFixture(fixture[1]) });
    else route.fulfill({ status: 404, body: "404: Not Found" });
  });
}
