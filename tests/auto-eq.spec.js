import { chromium, expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFileSync, mkdtempSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** @typedef {import("@playwright/test").Page} Page */

/** @typedef {import("@playwright/test").BrowserContext} BrowserContext */

/** @typedef {import("@playwright/test").Locator} Locator */

const here = import.meta.dirname;
const extensionDir = join(here, "..");
const manifest = JSON.parse(readFileSync(join(extensionDir, "manifest.json"), "utf8"));
const peakText = "Preamp: 0 dB\nFilter 1: ON PK Fc 1000 Hz Gain 6.0 dB Q 1.0";

// Chrome derives the id from the public key in the manifest, so the test knows it before launch.
function deriveExtensionId(key) {
  const digest = createHash("sha256").update(Buffer.from(key, "base64")).digest("hex").slice(0, 32);
  return [...digest].map((digit) => String.fromCharCode(97 + parseInt(digit, 16))).join("");
}

const extensionId = deriveExtensionId(manifest.key);
const panelUrl = `chrome-extension://${extensionId}/src/panel.html`;

/**
 * @param {string} name
 * @returns {Buffer}
 */
function readFixture(name) {
  return readFileSync(join(here, "fixtures", name));
}

async function openBrowser() {
  const server = createServer((request, response) => {
    response.setHeader("content-type", "text/html");
    response.end(readFixture("tone.html"));
  });
  await new Promise((ready) => server.listen(0, ready));

  const context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), "goui-")), {
    channel: "chromium",
    headless: true,
    viewport: { width: 400, height: 900 },
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
function journey(name, run) {
  test(name, async () => {
    test.setTimeout(60_000);
    const { context, server, port } = await openBrowser();
    try {
      await run(context, port);
    } finally {
      await context.close();
      server.close();
    }
  });
}

/**
 * @param {BrowserContext} context
 * @param {number} port
 * @param {number} toneHz
 * @returns {Promise<Page>}
 */
async function openTone(context, port, toneHz) {
  const tone = await context.newPage();
  await tone.goto(`http://localhost:${port}/?hz=${toneHz}`);
  await tone.click("#play");
  expect(await tone.title()).toBe("playing running");
  return tone;
}

// The service worker can start after the pages, so the first read waits for it.
/**
 * @param {BrowserContext} context
 * @returns {Promise<import("@playwright/test").Worker>}
 */
async function findWorker(context) {
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

// Playwright cannot press the toolbar icon. The journey fires the icon's own click event with the
// tab instead, so the same code runs as for a real click.
/**
 * @param {BrowserContext} context
 * @param {Page} page
 */
async function pressIcon(context, page) {
  const worker = await findWorker(context);
  await worker.evaluate(async (url) => {
    const tabs = await chrome.tabs.query({});
    chrome.action.onClicked.dispatch(tabs.find((tab) => tab.url === url));
  }, page.url());
}

/**
 * @param {BrowserContext} context
 * @param {Page} page
 * @returns {Promise<string>}
 */
async function readBadge(context, page) {
  const worker = await findWorker(context);
  return worker.evaluate(async (url) => {
    const tabs = await chrome.tabs.query({});
    return chrome.action.getBadgeText({ tabId: tabs.find((tab) => tab.url === url).id });
  }, page.url());
}

/**
 * @param {BrowserContext} context
 * @param {number} port
 * @param {number} toneHz
 * @returns {Promise<Page>}
 */
async function openPanel(context, port, toneHz) {
  const tone = await openTone(context, port, toneHz);
  const panel = await context.newPage();
  await panel.goto(panelUrl);
  await expect(panel.locator("#status")).toContainText("Click the goui icon");
  await pressIcon(context, tone);
  await expect(panel.locator("#status")).toHaveText("playing running");
  return panel;
}

/** @param {Page} panel */
async function holdCompare(panel) {
  await panel.locator("#compare").hover();
  await panel.mouse.down();
}

// The wait comes first, so a reading taken before the engine reacts to the last step never counts.
/**
 * @param {Page} page
 * @returns {Promise<number>}
 */
async function readSteadyLevel(page) {
  const reactionMs = 400;
  await page.waitForTimeout(reactionMs);
  let previous = null;
  for (let attempt = 0; attempt < 75; attempt += 1) {
    const reading = Number(await page.locator("#level").textContent());
    const settled = Number.isFinite(reading) && reading > -100 && previous !== null && Math.abs(reading - previous) < 0.3;
    if (settled) return reading;
    previous = Number.isFinite(reading) ? reading : null;
    await page.waitForTimeout(200);
  }
  throw new Error("The level did not settle.");
}

const earCutText = "Filter 1: ON PK Fc 1000 Hz Gain -6.0 dB Q 1.0";

/**
 * @param {Page} panel
 * @param {string} name
 * @returns {Promise<void>}
 */
function openTab(panel, name) {
  return panel.click(`#tabs [data-tab=${name}]`);
}

/**
 * @param {Page} panel
 * @param {string} label
 * @returns {Locator}
 */
function layerRow(panel, label) {
  return panel.locator(".layer", { hasText: label });
}

/**
 * @param {Page} panel
 * @param {string} role
 * @returns {Locator}
 */
function sectionOf(panel, role) {
  return panel.locator(`.preset-section[data-role=${role}]`);
}

// Paste AutoEQ text into one layer's section, the way a person copies it from autoeq.app or
// eqbyear. A second press on Paste closes the box, so the button is pressed only while it is closed.
/**
 * @param {Page} panel
 * @param {string} role
 * @param {string} text
 */
async function pasteInto(panel, role, text) {
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
async function saveAs(panel, role, name) {
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
async function pick(panel, role, name) {
  await openTab(panel, "library");
  await sectionOf(panel, role).locator(`.item[data-name="${name}"]`).click();
}

/**
 * @param {Page} panel
 * @param {string} label
 * @returns {Locator}
 */
function layerSwitch(panel, label) {
  return layerRow(panel, label).locator("input");
}

// The switch lives in the Listen pane, so the tab comes first. A hidden input cannot be clicked.
/**
 * @param {Page} panel
 * @param {string} label
 * @param {boolean} isOn
 */
async function setLayer(panel, label, isOn) {
  await openTab(panel, "listen");
  const input = layerSwitch(panel, label);
  if ((await input.isChecked()) !== isOn) await layerRow(panel, label).locator(".switch").click();
  await expect.poll(() => input.isChecked()).toBe(isOn);
}

/** @param {number} differenceDb */
function expectAbout6Db(differenceDb) {
  expect(differenceDb).toBeGreaterThan(5.4);
  expect(differenceDb).toBeLessThan(6.6);
}

/**
 * @param {number} levelDb
 * @param {number} flatDb
 */
function expectFlat(levelDb, flatDb) {
  expect(Math.abs(levelDb - flatDb)).toBeLessThan(0.6);
}

// Stand in for the AutoEQ repository. Other Phone has no profile, as a broken download.
async function routeAutoEq(context) {
  const profilePath = "/fake/rig/Fixture%20Phone%20(ANC%20On)/Fixture%20Phone%20(ANC%20On)%20ParametricEQ.txt";
  await context.route("https://raw.githubusercontent.com/**", (route) => {
    const url = route.request().url();
    if (url.endsWith("INDEX.md")) {
      route.fulfill({ contentType: "text/plain", body: readFixture("autoeq-index.md") });
      return;
    }
    if (url.endsWith(profilePath)) {
      route.fulfill({ contentType: "text/plain", body: readFixture("fixture-phone.txt") });
      return;
    }
    route.fulfill({ status: 404, body: "404: Not Found" });
  });
}

journey("given auto preamp off, an AutoEQ peak in the headphone layer plays a 1 kHz tone 6 dB louder in both views", async (context, port) => {
  const panel = await openPanel(context, port, 1000);
  await panel.click("#autoPreamp");
  await pasteInto(panel, "headphone", "Not an AutoEQ file");
  await expect(sectionOf(panel, "headphone").locator(".action-hint")).toHaveText("No AutoEQ filters found in that text.");
  await pasteInto(panel, "headphone", peakText);

  await openTab(panel, "tune");
  await panel.click("#chips [data-index='0']");
  const withPeak = await readSteadyLevel(panel);
  await panel.fill("#gainInput", "0");
  expectAbout6Db(withPeak - await readSteadyLevel(panel));

  await panel.click("#tall");
  await panel.fill("#gainInput", "6");
  const withPeakTall = await readSteadyLevel(panel);
  await panel.click("#bandOn");
  expectAbout6Db(withPeakTall - await readSteadyLevel(panel));
});

journey("given auto preamp on, a 6 dB peak keeps the tone level, and a manual 0 dB preamp lets it through", async (context, port) => {
  const panel = await openPanel(context, port, 1000);
  const flat = await readSteadyLevel(panel);

  await pasteInto(panel, "headphone", peakText);
  expectFlat(await readSteadyLevel(panel), flat);

  // Auto sets the preamp to -6.0 dB. Sixty presses of 0.1 dB bring it to 0 dB by hand.
  await openTab(panel, "listen");
  await panel.locator("#preamp").focus();
  for (let press = 0; press < 60; press += 1) await panel.keyboard.press("ArrowRight");
  await expect(panel.locator("#preampValue")).toHaveText("0.0 dB");
  expectAbout6Db(await readSteadyLevel(panel) - flat);
});

journey("given a headphone boost and an ear cut at 1 kHz, the layers cancel and the ear switch brings the boost back", async (context, port) => {
  const panel = await openPanel(context, port, 1000);
  await panel.click("#autoPreamp");
  const flat = await readSteadyLevel(panel);

  await pasteInto(panel, "headphone", peakText);
  expectAbout6Db(await readSteadyLevel(panel) - flat);

  await pasteInto(panel, "ear", earCutText);
  await expect(layerRow(panel, "My ear")).toHaveCount(1);
  expectFlat(await readSteadyLevel(panel), flat);

  await setLayer(panel, "My ear", false);
  expectAbout6Db(await readSteadyLevel(panel) - flat);
  await setLayer(panel, "My ear", true);
  expectFlat(await readSteadyLevel(panel), flat);
});

journey("given an AutoEQ pick, Save keeps it under its headphone name, and picking it from your presets plays it again", async (context, port) => {
  await routeAutoEq(context);
  const panel = await openPanel(context, port, 1000);
  await panel.click("#autoPreamp");
  const flat = await readSteadyLevel(panel);

  await openTab(panel, "library");
  const headphone = sectionOf(panel, "headphone");
  await headphone.locator(".search").fill("phone");
  await expect(headphone.locator(".item[data-name='Fixture Phone (ANC On)']")).toContainText("AutoEQ, someone on a rig");
  await headphone.locator(".item[data-name='Other Phone']").click();
  await expect(headphone.locator(".search-hint")).toHaveText("Other Phone did not load. Check the network and try again.");

  await headphone.locator(".item[data-name='Fixture Phone (ANC On)']").click();
  await expect(layerRow(panel, "Headphone")).toContainText("Fixture Phone (ANC On)");
  expectAbout6Db(await readSteadyLevel(panel) - flat);

  await openTab(panel, "library");
  await expect(headphone.locator(".search")).toHaveValue("");
  await expect(headphone.locator(".current")).toContainText("AutoEQ, not saved yet");
  await headphone.locator("[data-action=save]").click();
  await expect(headphone.locator(".save-name")).toHaveValue("Fixture Phone (ANC On)");
  await headphone.locator("[data-action=confirmSave]").click();
  await expect(headphone.locator(".current")).toContainText("Your preset");

  await pick(panel, "headphone", "Flat");
  expectFlat(await readSteadyLevel(panel), flat);
  await pick(panel, "headphone", "Fixture Phone (ANC On)");
  expectAbout6Db(await readSteadyLevel(panel) - flat);
});

journey("given an edited headphone preset, Save changes writes over it and Save as new keeps a second one", async (context, port) => {
  const panel = await openPanel(context, port, 1000);
  await panel.click("#autoPreamp");
  const flat = await readSteadyLevel(panel);
  await pasteInto(panel, "headphone", peakText);
  await saveAs(panel, "headphone", "voice");

  await openTab(panel, "tune");
  await panel.click("#chips [data-index='0']");
  await panel.fill("#gainInput", "0");
  await expect(layerRow(panel, "Headphone")).toContainText("voice, edited");

  await openTab(panel, "library");
  const headphone = sectionOf(panel, "headphone");
  await expect(headphone.locator("[data-action=save]")).toHaveText("Save changes");
  await headphone.locator("[data-action=save]").click();
  await expect(headphone.locator(".action-hint")).toHaveText("Updated voice.");

  await openTab(panel, "tune");
  // Band 1 stays chosen from the edit above, so a second press on its chip would clear the choice.
  await panel.fill("#gainInput", "6");
  await saveAs(panel, "headphone", "voice boosted");

  await pick(panel, "headphone", "voice");
  expectFlat(await readSteadyLevel(panel), flat);
  await pick(panel, "headphone", "voice boosted");
  expectAbout6Db(await readSteadyLevel(panel) - flat);
});

journey("given a saved ear preset, it stays on a new headphone, No ear tuning drops it, and Delete removes it", async (context, port) => {
  const panel = await openPanel(context, port, 1000);
  await panel.click("#autoPreamp");
  const flat = await readSteadyLevel(panel);
  await pasteInto(panel, "headphone", peakText);
  await pasteInto(panel, "ear", earCutText);
  await saveAs(panel, "ear", "my ear");
  expectFlat(await readSteadyLevel(panel), flat);

  // The new headphone has no bands, so only the ear cut is left, 6 dB under the flat tone.
  await pick(panel, "headphone", "Flat");
  await expect(layerRow(panel, "My ear")).toContainText("my ear");
  expect(await readSteadyLevel(panel) - flat).toBeLessThan(-5.4);

  await pick(panel, "headphone", "Warm");
  await pick(panel, "ear", "No ear tuning");
  await expect(layerRow(panel, "My ear")).toHaveCount(0);
  await pasteInto(panel, "headphone", peakText);
  expectAbout6Db(await readSteadyLevel(panel) - flat);
  await pick(panel, "ear", "my ear");
  expectFlat(await readSteadyLevel(panel), flat);

  await sectionOf(panel, "ear").locator("[title='Delete my ear']").click();
  await expect(sectionOf(panel, "ear").locator(".item[data-name='my ear']")).toHaveCount(0);
});

journey("given a headphone band and an ear band, each layer exports alone and the whole sound exports both", async (context, port) => {
  const panel = await openPanel(context, port, 1000);
  await panel.click("#autoPreamp");
  await pasteInto(panel, "headphone", peakText);
  await pasteInto(panel, "ear", earCutText);

  const ear = sectionOf(panel, "ear");
  await ear.locator("[data-action=export]").click();
  await expect(ear.locator(".text")).toHaveValue(/Filter 1: ON PK Fc 1000 Hz Gain -6\.0 dB/);
  await expect(ear.locator(".text")).not.toHaveValue(/Gain 6\.0 dB/);

  await panel.click("#exportAll");
  await expect(panel.locator("#wholeText")).toHaveValue(/Filter 1: ON PK Fc 1000 Hz Gain 6\.0 dB/);
  await expect(panel.locator("#wholeText")).toHaveValue(/Filter 2: ON PK Fc 1000 Hz Gain -6\.0 dB/);
});

journey("given sounds saved by the build before the two lists, each one shows in both lists and plays", async (context, port) => {
  const panel = await openPanel(context, port, 1000);
  await panel.click("#autoPreamp");
  const flat = await readSteadyLevel(panel);
  const older = {
    enabled: true,
    layers: {
      headphone: { on: true, source: "Saved", name: "old", bands: [{ on: true, type: "PK", frequencyHz: 1000, gainDb: 6, q: 1 }] },
      ear: { on: true, source: "Pasted", name: "Pasted My ear", bands: [{ on: true, type: "PK", frequencyHz: 1000, gainDb: -6, q: 1 }] },
    },
  };
  await panel.evaluate((sound) => chrome.storage.local.set({ savedSounds: { old: sound } }), older);
  await panel.reload();

  await pick(panel, "headphone", "old");
  expectAbout6Db(await readSteadyLevel(panel) - flat);
  await pick(panel, "ear", "old");
  expectFlat(await readSteadyLevel(panel), flat);
});

journey("given an ear layer, the eqbyear button turns it off and opens the test in a new tab", async (context, port) => {
  await context.route("https://eqbyear.com/**", (route) => route.fulfill({ contentType: "text/html", body: "<h1>eqbyear</h1>" }));
  const panel = await openPanel(context, port, 1000);
  await pasteInto(panel, "ear", earCutText);
  await expect.poll(() => layerSwitch(panel, "My ear").isChecked()).toBe(true);

  await panel.click("#eqbyear");
  await expect.poll(() => layerSwitch(panel, "My ear").isChecked()).toBe(false);
  await expect.poll(() => context.pages().some((page) => page.url().startsWith("https://eqbyear.com"))).toBe(true);
  await expect(sectionOf(panel, "ear").locator(".action-hint")).toContainText("Click the goui icon on that tab");
});

journey("given a ParametricEQ.txt file, Import plays its 1 kHz peak in the headphone layer", async (context, port) => {
  const panel = await openPanel(context, port, 1000);
  await panel.click("#autoPreamp");
  const flat = await readSteadyLevel(panel);

  await openTab(panel, "library");
  const chooser = panel.waitForEvent("filechooser");
  await sectionOf(panel, "headphone").locator("[data-action=import]").click();
  await (await chooser).setFiles(join(here, "fixtures", "fixture-phone.txt"));
  await expect(layerRow(panel, "Headphone")).toContainText("fixture-phone");
  expectAbout6Db(await readSteadyLevel(panel) - flat);
});

journey("given a 6 dB boost and a 6 dB cut at 1 kHz, Solo on the boost plays the tone 6 dB louder", async (context, port) => {
  const panel = await openPanel(context, port, 1000);
  await panel.click("#autoPreamp");
  await pasteInto(panel, "headphone", peakText);
  await pasteInto(panel, "ear", earCutText);
  const flat = await readSteadyLevel(panel);

  await openTab(panel, "tune");
  await panel.click("#chips [data-index='0']");
  await panel.click("#bandSolo");
  expectAbout6Db(await readSteadyLevel(panel) - flat);
});

journey("given a 6 dB peak, holding A/B or turning the EQ off plays the 1 kHz tone flat", async (context, port) => {
  const panel = await openPanel(context, port, 1000);
  await panel.click("#autoPreamp");
  const flat = await readSteadyLevel(panel);
  await pasteInto(panel, "headphone", peakText);
  expectAbout6Db(await readSteadyLevel(panel) - flat);

  await holdCompare(panel);
  expectFlat(await readSteadyLevel(panel), flat);
  await panel.mouse.up();
  expectAbout6Db(await readSteadyLevel(panel) - flat);

  await panel.click(".head .switch");
  expectFlat(await readSteadyLevel(panel), flat);
});

journey("given Vocals at +6 dB, a 2.5 kHz tone plays 6 dB louder and stays so on a new headphone", async (context, port) => {
  const panel = await openPanel(context, port, 2500);
  await panel.click("#autoPreamp");
  const flat = await readSteadyLevel(panel);

  await panel.locator("#vocals").focus();
  for (let press = 0; press < 12; press += 1) await panel.keyboard.press("ArrowRight");
  expectAbout6Db(await readSteadyLevel(panel) - flat);

  await pick(panel, "headphone", "Warm");
  expectAbout6Db(await readSteadyLevel(panel) - flat);
});

journey("given a press on a point that wobbles 3 px, the tone keeps its boost, and a 40 px drag moves the boost off it", async (context, port) => {
  const panel = await openPanel(context, port, 1000);
  await panel.click("#autoPreamp");
  await pasteInto(panel, "headphone", peakText);
  await openTab(panel, "tune");
  const withPeak = await readSteadyLevel(panel);

  // The graph draws a new SVG on each render, so the position is read in the same step that finds the
  // point. It is read until it holds still, since the graph redraws once the page scrollbar appears.
  /** @returns {Promise<{ centerX: number, centerY: number }>} */
  const readPoint = () => panel.locator("#tuneGraph circle[r='7']").first().evaluate((circle) => {
    const bounds = circle.getBoundingClientRect();
    return { centerX: bounds.x + (bounds.width / 2), centerY: bounds.y + (bounds.height / 2) };
  });
  let position = await readPoint();
  await expect.poll(async () => {
    const next = await readPoint();
    const isStill = next.centerX === position.centerX && next.centerY === position.centerY;
    position = next;
    return isStill;
  }).toBe(true);
  const { centerX, centerY } = position;

  await panel.mouse.move(centerX, centerY);
  await panel.mouse.down();
  await panel.mouse.move(centerX + 3, centerY, { steps: 3 });
  await panel.mouse.up();
  // A 3 px shift changes a 1 kHz tone by less than a reading can show, so the band fields check it.
  await expect(panel.locator("#frequencyInput")).toHaveValue("1000");
  await expect(panel.locator("#gainInput")).toHaveValue("+6.0");
  expect(Math.abs(await readSteadyLevel(panel) - withPeak)).toBeLessThan(0.3);

  await panel.mouse.move(centerX, centerY);
  await panel.mouse.down();
  await panel.mouse.move(centerX + 40, centerY, { steps: 8 });
  await panel.mouse.up();
  expect(withPeak - await readSteadyLevel(panel)).toBeGreaterThan(2);
});

journey("given nothing selected, a double click on the graph puts a band in the headphone layer", async (context, port) => {
  const panel = await openPanel(context, port, 1000);
  await panel.click("#autoPreamp");
  const flat = await readSteadyLevel(panel);

  await openTab(panel, "tune");
  const plot = await panel.locator("#tuneGraph").boundingBox();
  await panel.mouse.dblclick(plot.x + (plot.width * 0.6), plot.y + (plot.height * 0.5));
  await expect(panel.locator("#bandTitle")).toContainText("Headphone ·");
  await panel.fill("#frequencyInput", "1000");
  await panel.fill("#gainInput", "6");
  expectAbout6Db(await readSteadyLevel(panel) - flat);
});

journey("given the Add band chip under My ear, a new 6 dB band at 1 kHz plays in the ear layer", async (context, port) => {
  const panel = await openPanel(context, port, 1000);
  await panel.click("#autoPreamp");
  const flat = await readSteadyLevel(panel);

  await openTab(panel, "tune");
  await panel.click("#chips [data-add=ear]");
  await expect(panel.locator("#bandTitle")).toContainText("My ear ·");
  await expect(layerRow(panel, "My ear")).toHaveCount(1);
  await panel.fill("#gainInput", "6");
  expectAbout6Db(await readSteadyLevel(panel) - flat);
});

journey("given goui hears a tab, a click on its icon turns goui off, and a second click brings the 6 dB peak back", async (context, port) => {
  const panel = await openPanel(context, port, 1000);
  const tone = findTone(context, 1000);
  await panel.click("#autoPreamp");
  const flat = await readSteadyLevel(panel);
  await pasteInto(panel, "headphone", peakText);
  expectAbout6Db(await readSteadyLevel(panel) - flat);
  expect(await readBadge(context, tone)).toBe("ON");

  await pressIcon(context, tone);
  await expect(panel.locator("#status")).toContainText("Click the goui icon");
  await expect.poll(() => readBadge(context, tone)).toBe("");

  await pressIcon(context, tone);
  await expect(panel.locator("#status")).toHaveText("playing running");
  expectAbout6Db(await readSteadyLevel(panel) - flat);
});

journey("given goui hears a 1 kHz tab, a click on the icon of a 5 kHz tab moves goui there, and closing it turns goui off", async (context, port) => {
  const panel = await openPanel(context, port, 1000);
  const low = findTone(context, 1000);
  await panel.click("#autoPreamp");
  await pasteInto(panel, "headphone", peakText);
  const withPeak = await readSteadyLevel(panel);
  await holdCompare(panel);
  expectAbout6Db(withPeak - await readSteadyLevel(panel));
  await panel.mouse.up();

  // The 1 kHz peak barely touches a 5 kHz tone, so the EQ on and off read the same there.
  const high = await openTone(context, port, 5000);
  await pressIcon(context, high);
  await expect.poll(() => readBadge(context, high)).toBe("ON");
  await expect.poll(() => readBadge(context, low)).toBe("");
  const highWithPeak = await readSteadyLevel(panel);
  await holdCompare(panel);
  expect(Math.abs(highWithPeak - await readSteadyLevel(panel))).toBeLessThan(0.6);
  await panel.mouse.up();

  await high.close();
  await expect(panel.locator("#status")).toContainText("Click the goui icon");
});

journey("given the panel, the help button opens the how-to page with the pin step and the reading links", async (context, port) => {
  const panel = await openPanel(context, port, 1000);
  const opened = context.waitForEvent("page");
  await panel.click("#help");
  const intro = await opened;
  await intro.waitForLoadState();
  expect(intro.url()).toContain("src/intro.html");
  await expect(intro.locator("h1")).toHaveText("goui");
  await expect(intro.locator("body")).toContainText("Pin goui");
  await expect(intro.locator("body")).toContainText("Click the goui icon");
  await expect(intro.locator("body")).toContainText("Tune it to your ear");
  await expect(intro.locator("a[href='https://github.com/jaakkopasanen/AutoEQ']")).toHaveCount(1);
  await expect(intro.locator("a[href='https://eqbyear.com']")).toHaveCount(1);
});

journey("given goui has never heard a tab, the panel shows how to start, and the first tab goui hears ends it for good", async (context, port) => {
  const tone = await openTone(context, port, 1000);
  const panel = await context.newPage();
  await panel.goto(panelUrl);
  await expect(panel.locator("#start")).toContainText("Pin goui");
  await expect(panel.locator("#start")).toBeVisible();
  await expect(panel.locator("#tabs")).toBeHidden();

  const opened = context.waitForEvent("page");
  await panel.click("#guide");
  expect((await opened).url()).toContain("src/intro.html");

  await pressIcon(context, tone);
  await expect(panel.locator("#status")).toHaveText("playing running");
  await expect(panel.locator("#start")).toBeHidden();
  await expect(panel.locator("#tabs")).toBeVisible();

  await pressIcon(context, tone);
  await expect(panel.locator("#status")).toContainText("Click the goui icon");
  await panel.reload();
  await expect(panel.locator("#tabs")).toBeVisible();
  await expect(panel.locator("#start")).toBeHidden();
});

journey("given a chosen band chip, a second press clears the choice and the inspector empties", async (context, port) => {
  const panel = await openPanel(context, port, 1000);
  await panel.click("#autoPreamp");
  await pasteInto(panel, "headphone", peakText);
  await openTab(panel, "tune");
  await panel.click("#chips [data-index='0']");
  await expect(panel.locator("#bandTitle")).toContainText("Headphone · 1.");

  await panel.click("#chips [data-index='0']");
  await expect(panel.locator("#inspectorBody")).toBeHidden();
  await expect(panel.locator("#inspectorEmpty")).toBeVisible();
});
