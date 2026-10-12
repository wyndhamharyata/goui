import { chromium, expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFileSync, mkdtempSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

async function openBrowser() {
  const server = createServer((request, response) => {
    response.setHeader("content-type", "text/html");
    response.end(readFileSync(join(here, "fixtures", "tone.html")));
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

async function openPanel(context, port, toneHz) {
  const tone = await context.newPage();
  await tone.goto(`http://localhost:${port}/?hz=${toneHz}`);
  await tone.click("#play");
  expect(await tone.title()).toBe("playing running");

  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/src/panel.html`);
  await panel.click("#capture");
  await expect(panel.locator("#status")).not.toHaveText("No audio");
  return panel;
}

// The wait comes first, so a reading taken before the engine reacts to the last step never counts.
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

// Paste AutoEQ text in the Library, the way a person copies it from autoeq.app. A second press on
// Paste closes the box, so the button is pressed only while the box is closed.
async function pasteAutoEq(panel, text) {
  await panel.click("#tabs [data-tab=library]");
  const isPasteOpen = await panel.locator("#applyText").isVisible();
  if (!isPasteOpen) await panel.click("#libraryActions [data-action=paste]");
  await panel.fill("#libraryText", text);
  await panel.click("#applyText");
}

function expectAbout6Db(differenceDb) {
  expect(differenceDb).toBeGreaterThan(5.4);
  expect(differenceDb).toBeLessThan(6.6);
}

journey("given auto preamp off, an AutoEQ peak at 1 kHz plays a 1 kHz tone 6 dB louder in both views", async (context, port) => {
  const panel = await openPanel(context, port, 1000);
  await panel.click("#autoPreamp");
  await pasteAutoEq(panel, "Not an AutoEQ file");
  await expect(panel.locator("#libraryHint")).toHaveText("No AutoEQ filters found in that text.");
  await pasteAutoEq(panel, peakText);

  await panel.click("#tabs [data-tab=tune]");
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

  await pasteAutoEq(panel, peakText);
  expect(Math.abs(await readSteadyLevel(panel) - flat)).toBeLessThan(0.6);

  // Auto sets the preamp to -6.0 dB. Sixty presses of 0.1 dB bring it to 0 dB by hand.
  await panel.click("#tabs [data-tab=listen]");
  await panel.locator("#preamp").focus();
  for (let press = 0; press < 60; press += 1) await panel.keyboard.press("ArrowRight");
  await expect(panel.locator("#preampValue")).toHaveText("0.0 dB");
  expectAbout6Db(await readSteadyLevel(panel) - flat);
});

journey("given a saved sound, loading it from the library brings the boost back, and Delete removes it", async (context, port) => {
  const panel = await openPanel(context, port, 1000);
  await panel.click("#autoPreamp");
  await pasteAutoEq(panel, peakText);
  await panel.click("#libraryActions [data-action=save]");
  await panel.fill("#saveName", "voice");
  await panel.click("#saveButton");

  await panel.click("#tabs [data-tab=tune]");
  await panel.click("#chips [data-index='0']");
  await panel.fill("#gainInput", "0");
  const flat = await readSteadyLevel(panel);

  await panel.click("#tabs [data-tab=library]");
  await panel.locator("#libraryResults .item", { hasText: "voice" }).click();
  expectAbout6Db(await readSteadyLevel(panel) - flat);

  await panel.click("#libraryResults [title='Delete voice']");
  await expect(panel.locator("#libraryResults .item", { hasText: "voice" })).toHaveCount(0);
});

journey("given a headphone search from the sound card, a pick plays its peak and Listen shows its name", async (context, port) => {
  // Stand in for the AutoEQ repository. Other Phone has no profile, as a broken download.
  const profilePath = "/fake/rig/Fixture%20Phone%20(ANC%20On)/Fixture%20Phone%20(ANC%20On)%20ParametricEQ.txt";
  await context.route("https://raw.githubusercontent.com/**", (route) => {
    const url = route.request().url();
    if (url.endsWith("INDEX.md")) {
      route.fulfill({ contentType: "text/plain", body: readFileSync(join(here, "fixtures", "autoeq-index.md")) });
      return;
    }
    if (url.endsWith(profilePath)) {
      route.fulfill({ contentType: "text/plain", body: readFileSync(join(here, "fixtures", "fixture-phone.txt")) });
      return;
    }
    route.fulfill({ status: 404, body: "404: Not Found" });
  });

  const panel = await openPanel(context, port, 1000);
  await panel.click("#autoPreamp");
  const flat = await readSteadyLevel(panel);

  await panel.click("#soundCard");
  await panel.fill("#librarySearch", "phone");
  await panel.locator("#libraryResults .item", { hasText: "Other Phone" }).click();
  await expect(panel.locator("#librarySearchHint")).toHaveText("Other Phone did not load. Check the network and try again.");
  await expect(panel.locator("#soundName")).toBeHidden();

  await panel.locator("#libraryResults .item", { hasText: "Fixture Phone" }).click();
  await expect(panel.locator("#soundName")).toHaveText("Fixture Phone (ANC On)");
  await expect(panel.locator("#soundKind")).toHaveText("AutoEQ headphones");
  await expect(panel.locator("#librarySearch")).toHaveValue("");
  expectAbout6Db(await readSteadyLevel(panel) - flat);
});

journey("given a pasted AutoEQ file, Export writes the same bands back as AutoEQ text", async (context, port) => {
  const panel = await openPanel(context, port, 1000);
  await panel.click("#autoPreamp");
  await pasteAutoEq(panel, peakText);
  await panel.click("#libraryActions [data-action=export]");
  await expect(panel.locator("#libraryText")).toHaveValue("Preamp: 0.0 dB\nFilter 1: ON PK Fc 1000 Hz Gain 6.0 dB Q 1.00");
});

journey("given the sound exported as JSON, pasting it back brings the boost back", async (context, port) => {
  const panel = await openPanel(context, port, 1000);
  await panel.click("#autoPreamp");
  await pasteAutoEq(panel, peakText);
  await panel.click("#libraryActions [data-action=export]");
  await panel.click("#exportJson");
  const json = await panel.locator("#libraryText").inputValue();

  await panel.click("#tabs [data-tab=tune]");
  await panel.click("#chips [data-index='0']");
  await panel.fill("#gainInput", "0");
  const flat = await readSteadyLevel(panel);

  await pasteAutoEq(panel, json);
  expectAbout6Db(await readSteadyLevel(panel) - flat);
});

journey("given a ParametricEQ.txt file, Import plays its 1 kHz peak", async (context, port) => {
  const panel = await openPanel(context, port, 1000);
  await panel.click("#autoPreamp");
  const flat = await readSteadyLevel(panel);

  await panel.click("#tabs [data-tab=library]");
  const chooser = panel.waitForEvent("filechooser");
  await panel.click("#libraryActions [data-action=import]");
  await (await chooser).setFiles(join(here, "fixtures", "fixture-phone.txt"));
  await expect(panel.locator("#soundName")).toHaveText("fixture-phone");
  expectAbout6Db(await readSteadyLevel(panel) - flat);
});

journey("given a 6 dB boost and a 6 dB cut at 1 kHz, Solo on the boost plays the tone 6 dB louder", async (context, port) => {
  const panel = await openPanel(context, port, 1000);
  await panel.click("#autoPreamp");
  await pasteAutoEq(panel, `${peakText}\nFilter 2: ON PK Fc 1000 Hz Gain -6.0 dB Q 1.0`);
  const flat = await readSteadyLevel(panel);

  await panel.click("#tabs [data-tab=tune]");
  await panel.click("#chips [data-index='0']");
  await panel.click("#bandSolo");
  expectAbout6Db(await readSteadyLevel(panel) - flat);
});

journey("given a 6 dB peak, holding A/B or turning the EQ off plays the 1 kHz tone flat", async (context, port) => {
  const panel = await openPanel(context, port, 1000);
  await panel.click("#autoPreamp");
  const flat = await readSteadyLevel(panel);
  await pasteAutoEq(panel, peakText);
  expectAbout6Db(await readSteadyLevel(panel) - flat);

  await panel.locator("#compare").hover();
  await panel.mouse.down();
  expect(Math.abs(await readSteadyLevel(panel) - flat)).toBeLessThan(0.6);
  await panel.mouse.up();
  expectAbout6Db(await readSteadyLevel(panel) - flat);

  await panel.click(".head .switch");
  expect(Math.abs(await readSteadyLevel(panel) - flat)).toBeLessThan(0.6);
});

journey("given Vocals at +6 dB, a 2.5 kHz tone plays 6 dB louder and stays so on a new sound", async (context, port) => {
  const panel = await openPanel(context, port, 2500);
  await panel.click("#autoPreamp");
  const flat = await readSteadyLevel(panel);

  await panel.locator("#vocals").focus();
  for (let press = 0; press < 12; press += 1) await panel.keyboard.press("ArrowRight");
  expectAbout6Db(await readSteadyLevel(panel) - flat);

  await panel.click("#tabs [data-tab=library]");
  await panel.locator("#libraryResults .item", { hasText: "Warm" }).click();
  expectAbout6Db(await readSteadyLevel(panel) - flat);
});

journey("given a saved sound you then edit, the card says edited and Update keeps the edit", async (context, port) => {
  const panel = await openPanel(context, port, 1000);
  await panel.click("#autoPreamp");
  const flat = await readSteadyLevel(panel);

  await pasteAutoEq(panel, peakText);
  await panel.click("#libraryActions [data-action=save]");
  await panel.fill("#saveName", "voice");
  await panel.click("#saveButton");

  await panel.click("#tabs [data-tab=tune]");
  await panel.click("#chips [data-index='0']");
  await panel.fill("#gainInput", "0");
  await expect(panel.locator("#soundKind")).toHaveText("Saved, edited");

  await panel.click("#tabs [data-tab=library]");
  await panel.click("#libraryActions [data-action=save]");
  await expect(panel.locator("#saveName")).toHaveValue("voice");
  await expect(panel.locator("#saveButton")).toHaveText("Update");
  await panel.click("#saveButton");
  await expect(panel.locator("#soundKind")).toHaveText("Saved");

  await panel.locator("#libraryResults .item", { hasText: "Clear vocals" }).click();
  await panel.locator("#libraryResults .item", { hasText: "voice" }).click();
  expect(Math.abs(await readSteadyLevel(panel) - flat)).toBeLessThan(0.6);
});

journey("given a press on a point that wobbles 3 px, the tone keeps its boost, and a 40 px drag moves the boost off it", async (context, port) => {
  const panel = await openPanel(context, port, 1000);
  await panel.click("#autoPreamp");
  await pasteAutoEq(panel, peakText);
  await panel.click("#tabs [data-tab=tune]");
  const withPeak = await readSteadyLevel(panel);

  // The graph draws a new SVG on each render, so the position is read in the same step that finds the
  // point. It is read until it holds still, since the graph redraws once the page scrollbar appears.
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
