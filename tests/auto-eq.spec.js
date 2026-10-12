import { chromium, expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFileSync, mkdtempSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const here = import.meta.dirname;
const extensionDir = join(here, "..");
const manifest = JSON.parse(readFileSync(join(extensionDir, "manifest.json"), "utf8"));

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

test("given an AutoEQ file with a 1 kHz peak, a 1 kHz tone plays 6 dB louder", async () => {
  test.setTimeout(60_000);
  const { context, server, port } = await openBrowser();

  try {
    const tone = await context.newPage();
    await tone.goto(`http://localhost:${port}/`);
    await tone.click("#play");
    expect(await tone.title()).toBe("playing running");

    const panel = await context.newPage();
    await panel.goto(`chrome-extension://${extensionId}/src/panel.html`);
    await panel.click("#capture");
    await expect(panel.locator("#status")).not.toHaveText("No audio");

    await panel.click("#importToggle");
    await panel.fill("#autoEqText", "Preamp: 0 dB\nFilter 1: ON PK Fc 1000 Hz Gain 6.0 dB Q 1.0");
    await panel.click("#applyAutoEq");
    await expect(panel.locator(".band").first()).toContainText("Peak");

    const withPeak = await steadyLevel(panel);
    await panel.locator(".band .on").first().uncheck();
    const withoutPeak = await steadyLevel(panel);

    expect(withPeak - withoutPeak).toBeGreaterThan(5.4);
    expect(withPeak - withoutPeak).toBeLessThan(6.6);

    // The same journey in the rotated view. The audio path must not change with the view.
    await panel.click("#viewToggle");
    await panel.locator(".band .on").first().check();
    const withPeakVertical = await steadyLevel(panel);
    await panel.locator(".band .on").first().uncheck();
    const withoutPeakVertical = await steadyLevel(panel);

    expect(withPeakVertical - withoutPeakVertical).toBeGreaterThan(5.4);
    expect(withPeakVertical - withoutPeakVertical).toBeLessThan(6.6);
  } finally {
    await context.close();
    server.close();
  }
});

test("given a saved preset, loading it brings the boost back", async () => {
  test.setTimeout(60_000);
  const { context, server, port } = await openBrowser();

  try {
    const tone = await context.newPage();
    await tone.goto(`http://localhost:${port}/`);
    await tone.click("#play");

    const panel = await context.newPage();
    await panel.goto(`chrome-extension://${extensionId}/src/panel.html`);
    await panel.click("#capture");
    await expect(panel.locator("#status")).not.toHaveText("No audio");

    await panel.click("#importToggle");
    await panel.fill("#autoEqText", "Filter 1: ON PK Fc 1000 Hz Gain 6.0 dB Q 1.0");
    await panel.click("#applyAutoEq");

    await panel.click("#presetToggle");
    await panel.fill("#presetName", "voice");
    await panel.click("#presetSave");

    await panel.locator(".band .on").first().uncheck();
    const flat = await steadyLevel(panel);

    await panel.locator(".chip-item button", { hasText: "voice" }).click();
    const peaked = await steadyLevel(panel);

    expect(peaked - flat).toBeGreaterThan(5.4);
    expect(peaked - flat).toBeLessThan(6.6);
  } finally {
    await context.close();
    server.close();
  }
});

test("given a headphone search, the chosen profile boosts the tone and exports as AutoEQ text", async () => {
  test.setTimeout(60_000);
  const { context, server, port } = await openBrowser();

  try {
    // Stand in for the AutoEQ repository.
    await context.route("https://raw.githubusercontent.com/**", (route) => {
      const isIndex = route.request().url().endsWith("INDEX.md");
      const body = readFileSync(join(here, "fixtures", isIndex ? "autoeq-index.md" : "fixture-phone.txt"));
      route.fulfill({ contentType: "text/plain", body });
    });

    const tone = await context.newPage();
    await tone.goto(`http://localhost:${port}/`);
    await tone.click("#play");

    const panel = await context.newPage();
    await panel.goto(`chrome-extension://${extensionId}/src/panel.html`);
    await panel.click("#capture");
    await expect(panel.locator("#status")).not.toHaveText("No audio");

    const flat = await steadyLevel(panel);

    await panel.click("#importToggle");
    await panel.fill("#searchText", "fixture");
    await panel.click("#searchButton");
    await panel.locator("#searchResults button").first().click();
    await expect(panel.locator(".band").first()).toContainText("Peak");

    const peaked = await steadyLevel(panel);
    expect(peaked - flat).toBeGreaterThan(5.4);
    expect(peaked - flat).toBeLessThan(6.6);

    await panel.click("#exportAutoEq");
    await expect(panel.locator("#autoEqText")).toHaveValue(/Preamp: 0.0 dB/);
    await expect(panel.locator("#autoEqText")).toHaveValue(/Filter 1: ON PK Fc 1000 Hz Gain 6.0 dB/);
  } finally {
    await context.close();
    server.close();
  }
});
