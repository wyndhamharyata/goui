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
function extensionIdFromKey(key) {
  const digest = createHash("sha256").update(Buffer.from(key, "base64")).digest("hex").slice(0, 32);
  return [...digest].map((digit) => String.fromCharCode(97 + parseInt(digit, 16))).join("");
}

const extensionId = extensionIdFromKey(manifest.key);

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

async function steadyLevel(page) {
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

journey("given auto preamp off, an AutoEQ peak at 1 kHz plays a 1 kHz tone 6 dB louder in both views", async (context, port) => {
  const panel = await openPanel(context, port, 1000);
  await panel.click("#autoPreamp");
  await panel.click("#tabs [data-tab=library]");
  await panel.click("#libraryActions [data-action=paste]");
  await panel.fill("#libraryText", peakText);
  await panel.click("#applyText");

  await panel.click("#tabs [data-tab=tune]");
  await panel.click("#chips [data-index='0']");
  const withPeak = await steadyLevel(panel);
  await panel.fill("#gainInput", "0");
  const withoutPeak = await steadyLevel(panel);

  expect(withPeak - withoutPeak).toBeGreaterThan(5.4);
  expect(withPeak - withoutPeak).toBeLessThan(6.6);

  await panel.click("#tall");
  await panel.fill("#gainInput", "6");
  const withPeakTall = await steadyLevel(panel);
  await panel.click("#bandOn");
  const withoutPeakTall = await steadyLevel(panel);

  expect(withPeakTall - withoutPeakTall).toBeGreaterThan(5.4);
  expect(withPeakTall - withoutPeakTall).toBeLessThan(6.6);
});

journey("given auto preamp on, a 6 dB peak keeps the tone level, and a manual 0 dB preamp lets it through", async (context, port) => {
  const panel = await openPanel(context, port, 1000);
  const flat = await steadyLevel(panel);

  await panel.click("#tabs [data-tab=library]");
  await panel.click("#libraryActions [data-action=paste]");
  await panel.fill("#libraryText", peakText);
  await panel.click("#applyText");
  const withAutoPreamp = await steadyLevel(panel);
  expect(Math.abs(withAutoPreamp - flat)).toBeLessThan(0.6);

  await panel.click("#tabs [data-tab=listen]");
  await panel.locator("#preamp").evaluate((slider) => {
    slider.value = "0";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const withManualPreamp = await steadyLevel(panel);
  expect(withManualPreamp - flat).toBeGreaterThan(5.4);
  expect(withManualPreamp - flat).toBeLessThan(6.6);
});

journey("given a saved sound, loading it from the library brings the boost back", async (context, port) => {
  const panel = await openPanel(context, port, 1000);
  await panel.click("#autoPreamp");
  await panel.click("#tabs [data-tab=library]");
  await panel.click("#libraryActions [data-action=paste]");
  await panel.fill("#libraryText", peakText);
  await panel.click("#applyText");
  await panel.click("#libraryActions [data-action=save]");
  await panel.fill("#saveName", "voice");
  await panel.click("#saveButton");

  await panel.click("#tabs [data-tab=tune]");
  await panel.click("#chips [data-index='0']");
  await panel.fill("#gainInput", "0");
  const flat = await steadyLevel(panel);

  await panel.click("#tabs [data-tab=library]");
  await panel.locator("#libraryResults .item", { hasText: "voice" }).click();
  const peaked = await steadyLevel(panel);

  expect(peaked - flat).toBeGreaterThan(5.4);
  expect(peaked - flat).toBeLessThan(6.6);
});

journey("given a headphone search from the sound card, the pick boosts the tone, clears the search and exports", async (context, port) => {
  // Stand in for the AutoEQ repository.
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
  const flat = await steadyLevel(panel);

  await panel.click("#soundCard");
  await panel.fill("#librarySearch", "fixture");
  await panel.locator("#libraryResults .item", { hasText: "Fixture Phone" }).click();
  await expect(panel.locator("#profileName")).toBeVisible();
  await expect(panel.locator("#profileName")).toHaveText("Fixture Phone (ANC On)");
  await expect(panel.locator("#profileKind")).toHaveText("AutoEQ headphones");
  await expect(panel.locator("#librarySearch")).toHaveValue("");

  const peaked = await steadyLevel(panel);
  expect(peaked - flat).toBeGreaterThan(5.4);
  expect(peaked - flat).toBeLessThan(6.6);

  await panel.click("#tabs [data-tab=library]");
  await panel.click("#libraryActions [data-action=export]");
  await expect(panel.locator("#libraryText")).toHaveValue(/Preamp: 0.0 dB/);
  await expect(panel.locator("#libraryText")).toHaveValue(/Filter 1: ON PK Fc 1000 Hz Gain 6.0 dB/);
});

journey("given Vocals at +6 dB, a 2.5 kHz tone plays 6 dB louder and stays so on a new sound", async (context, port) => {
  const panel = await openPanel(context, port, 2500);
  await panel.click("#autoPreamp");
  const flat = await steadyLevel(panel);

  await panel.locator("#vocals").focus();
  for (let press = 0; press < 12; press += 1) await panel.keyboard.press("ArrowRight");
  const boosted = await steadyLevel(panel);
  expect(boosted - flat).toBeGreaterThan(5.4);
  expect(boosted - flat).toBeLessThan(6.6);

  await panel.click("#tabs [data-tab=library]");
  await panel.locator("#libraryResults .item", { hasText: "Warm" }).click();
  const afterSwitch = await steadyLevel(panel);
  expect(afterSwitch - flat).toBeGreaterThan(5.4);
  expect(afterSwitch - flat).toBeLessThan(6.6);
});
