import { expect } from "@playwright/test";
import {
  chooseBand,
  earCutText,
  expectChangeDb,
  findWorker,
  fixturePath,
  holdCompare,
  journey,
  layerRow,
  layerSwitch,
  manifest,
  nudgeSlider,
  openLibrarySection,
  openPanelPage,
  openTab,
  openTone,
  openToneInApp,
  pasteInto,
  peakText,
  pick,
  playingToneTitle,
  pressIcon,
  readBadge,
  readPopup,
  readSteadyLevel,
  readStillBandPoint,
  releaseCompare,
  routeAutoEq,
  saveAs,
  sectionOf,
  setLayer,
  startGouiOnTone,
  turnAutoPreampOff,
  turnEqOff,
  useTallGraph,
} from "./helpers.js";

journey("given auto preamp off, an AutoEQ peak in the headphone layer plays a 1 kHz tone 6 dB louder in both views", async (context, port) => {
  const { panel } = await startGouiOnTone(context, port, 1000);

  await turnAutoPreampOff(panel);
  await pasteInto(panel, "headphone", "Not an AutoEQ file");
  await expect(sectionOf(panel, "headphone").locator(".action-hint")).toHaveText("No AutoEQ filters found in that text.");
  // A Preamp line that is not a number plays as 0 dB.
  await pasteInto(panel, "headphone", peakText.replace("Preamp: 0 dB", "Preamp: abc dB"));
  await expect(panel.locator("#preampValue")).toHaveText("0.0 dB");

  await openTab(panel, "tune");
  await chooseBand(panel, 0);

  const withPeak = await readSteadyLevel(panel);

  await panel.fill("#gainInput", "0");
  expectChangeDb(withPeak, await readSteadyLevel(panel), 6);

  await useTallGraph(panel);
  await panel.fill("#gainInput", "6");

  const withPeakTall = await readSteadyLevel(panel);

  await panel.click("#bandOn");
  expectChangeDb(withPeakTall, await readSteadyLevel(panel), 6);
});

journey("given auto preamp on, a 6 dB peak keeps the tone level, and a manual 0 dB preamp lets it through", async (context, port) => {
  const { panel } = await startGouiOnTone(context, port, 1000);
  const flat = await readSteadyLevel(panel);

  await pasteInto(panel, "headphone", peakText);
  expectChangeDb(await readSteadyLevel(panel), flat, 0);

  // Auto sets the preamp to -6.0 dB. Sixty presses of 0.1 dB bring it to 0 dB by hand.
  await openTab(panel, "listen");
  await nudgeSlider(panel, "#preamp", 60);
  await expect(panel.locator("#preampValue")).toHaveText("0.0 dB");
  expectChangeDb(await readSteadyLevel(panel), flat, 6);
});

journey("given a headphone boost and an ear cut at 1 kHz, the layers cancel and the ear switch brings the boost back", async (context, port) => {
  const { panel } = await startGouiOnTone(context, port, 1000);

  await turnAutoPreampOff(panel);

  const flat = await readSteadyLevel(panel);

  await pasteInto(panel, "headphone", peakText);
  expectChangeDb(await readSteadyLevel(panel), flat, 6);

  await pasteInto(panel, "ear", earCutText);
  await expect(layerRow(panel, "My ear")).toHaveCount(1);
  expectChangeDb(await readSteadyLevel(panel), flat, 0);

  await setLayer(panel, "My ear", false);
  expectChangeDb(await readSteadyLevel(panel), flat, 6);
  await setLayer(panel, "My ear", true);
  expectChangeDb(await readSteadyLevel(panel), flat, 0);
});

journey("given eight HD 600 measurements, each result names its source, form, rig and target, and AutoEQ's pick comes first", async (context, port) => {
  await routeAutoEq(context);

  const { panel } = await startGouiOnTone(context, port, 1000);

  await openTab(panel, "library");

  const headphone = sectionOf(panel, "headphone");

  await headphone.locator(".search").fill("HD 600");

  const results = headphone.locator(".item[data-name='Sennheiser HD 600']");

  await expect(results).toHaveCount(8);
  await expect(results.nth(0)).toContainText("oratory1990 · Over-ear · Harman over-ear 2018");
  await expect(results.nth(0)).toContainText("AutoEQ's pick");
  await expect(results.nth(1)).toContainText("crinacle · Over-ear · GRAS 43AG-7 · Harman over-ear 2018");
  await expect(results.nth(1)).not.toContainText("AutoEQ's pick");
  await expect(results.nth(5)).toContainText("Rtings · Over-ear · B&K 5128 · HMS II.3 Harman over-ear 2018");
  await expect(results.nth(6)).toContainText("Innerfidelity · Over-ear · HMS II.3 Harman over-ear 2018");

  // Eight results share the name, so only the measurement that plays is marked.
  await results.nth(0).click();
  await expect(layerRow(panel, "Headphone")).toContainText("Sennheiser HD 600");
  await openTab(panel, "library");
  await headphone.locator(".search").fill("HD 600");
  await expect(results).toHaveCount(8);
  await expect(headphone.locator("[aria-current=true]")).toHaveCount(1);
  await expect(results.nth(0)).toHaveAttribute("aria-current", "true");
});

// At 50 Hz, AutoEQ puts Harman over-ear 2018 at +3.3 dB and optimum hifi at -1.6 dB. Both are 0 dB at 1 kHz.
journey("given the HD 600 by oratory1990, the optimum hifi target plays a 50 Hz tone 4.9 dB quieter than Harman 2018 and keeps 1 kHz", async (context, port) => {
  await routeAutoEq(context);

  const { panel } = await startGouiOnTone(context, port, 50);

  await turnAutoPreampOff(panel);
  await openTab(panel, "library");

  const headphone = sectionOf(panel, "headphone");

  await headphone.locator(".search").fill("HD 600");
  await headphone.locator(".item[data-name='Sennheiser HD 600']").first().click();

  const target = layerRow(panel, "Headphone").locator(".target select");

  await expect(target).toHaveValue("Harman over-ear 2018");

  const lowWithHarman = await readSteadyLevel(panel);

  await target.selectOption("oratory1990 optimum hifi over-ear");
  await expect(target).toHaveValue("oratory1990 optimum hifi over-ear");
  expectChangeDb(await readSteadyLevel(panel), lowWithHarman, -4.9);

  const reopened = await openPanelPage(context);

  await expect(layerRow(reopened, "Headphone").locator(".target select")).toHaveValue("oratory1990 optimum hifi over-ear");
  await reopened.close();

  const mid = await openTone(context, port, 1000);

  await pressIcon(context, mid);
  await expect(panel.locator("#status")).toHaveText(playingToneTitle);

  const midWithOratory = await readSteadyLevel(panel);

  await target.selectOption("Harman over-ear 2018");
  await expect(target).toHaveValue("Harman over-ear 2018");
  expectChangeDb(await readSteadyLevel(panel), midWithOratory, 0);
});

journey("given an AutoEQ pick, Save keeps it under its headphone name, and picking it from your presets plays it again", async (context, port) => {
  await routeAutoEq(context);

  const { panel } = await startGouiOnTone(context, port, 1000);

  await turnAutoPreampOff(panel);

  const flat = await readSteadyLevel(panel);

  await openTab(panel, "library");

  const headphone = sectionOf(panel, "headphone");

  // GitHub can answer with an error page. The search says so, and the next search loads the real list.
  await context.route("**/INDEX.md", (route) => route.fulfill({ status: 503, body: "Service Unavailable" }), { times: 1 });
  await headphone.locator(".search").fill("phone");
  await expect(headphone.locator(".search-hint")).toHaveText("The AutoEQ list did not load. Check the network.");
  await headphone.locator(".search").fill("");
  await headphone.locator(".search").fill("phone");
  await expect(headphone.locator(".item[data-name='Fixture Phone (ANC On)']")).toContainText("Filk · Over-ear · Harman over-ear 2018");
  await expect(headphone.locator(".item[data-name='Fixture Phone (ANC On)']")).not.toContainText("AutoEQ's pick");
  await headphone.locator(".item[data-name='Other Phone']").click();
  await expect(headphone.locator(".search-hint")).toHaveText("Other Phone did not load. Check the network and try again.");

  await headphone.locator(".item[data-name='Fixture Phone (ANC On)']").click();
  await expect(layerRow(panel, "Headphone")).toContainText("Fixture Phone (ANC On)");
  expectChangeDb(await readSteadyLevel(panel), flat, 6);

  await openTab(panel, "library");
  await expect(headphone.locator(".search")).toHaveValue("");
  await expect(headphone.locator(".current")).toContainText("AutoEQ, not saved yet");
  await headphone.locator("[data-action=save]").click();
  await expect(headphone.locator(".save-name")).toHaveValue("Fixture Phone (ANC On)");
  await headphone.locator(".confirm-save").click();
  await expect(headphone.locator(".current")).toContainText("Your preset");

  await pick(panel, "headphone", "Flat");
  expectChangeDb(await readSteadyLevel(panel), flat, 0);
  await pick(panel, "headphone", "Fixture Phone (ANC On)");
  expectChangeDb(await readSteadyLevel(panel), flat, 6);
});

journey("given an edited headphone preset, Save changes writes over it and Save as new keeps a second one", async (context, port) => {
  const { panel } = await startGouiOnTone(context, port, 1000);

  await turnAutoPreampOff(panel);

  const flat = await readSteadyLevel(panel);

  await pasteInto(panel, "headphone", peakText);
  await saveAs(panel, "headphone", "voice");

  await openTab(panel, "tune");
  await chooseBand(panel, 0);
  await panel.fill("#gainInput", "0");
  await expect(layerRow(panel, "Headphone")).toContainText("voice, edited");

  await openTab(panel, "library");

  const headphone = sectionOf(panel, "headphone");

  await expect(headphone.locator("[data-action=save]")).toHaveText("Save changes");
  await headphone.locator("[data-action=save]").click();
  await expect(headphone.locator(".action-hint")).toHaveText("Updated voice.");

  await openTab(panel, "tune");
  // Band 1 stays chosen from the edit above, so a second press on its chip would unselect it.
  await panel.fill("#gainInput", "6");

  // A name that every object has, such as constructor, is still a new name.
  await openTab(panel, "library");
  await headphone.locator("[data-action=saveAs]").click();
  await headphone.locator(".save-name").fill("voice");
  await expect(headphone.locator(".confirm-save")).toHaveText("Replace");
  await headphone.locator(".save-name").fill("constructor");
  await expect(headphone.locator(".confirm-save")).toHaveText("Save");
  await headphone.locator(".save-name").press("Enter");
  await expect(headphone.locator(".action-hint")).toHaveText("Saved constructor.");

  await pick(panel, "headphone", "voice");
  expectChangeDb(await readSteadyLevel(panel), flat, 0);
  await pick(panel, "headphone", "constructor");
  expectChangeDb(await readSteadyLevel(panel), flat, 6);
});

journey("given a saved ear preset, it stays on a new headphone, No ear tuning drops it, and Delete removes it", async (context, port) => {
  const { panel } = await startGouiOnTone(context, port, 1000);

  await turnAutoPreampOff(panel);

  const flat = await readSteadyLevel(panel);

  await pasteInto(panel, "headphone", peakText);
  await pasteInto(panel, "ear", earCutText);
  await saveAs(panel, "ear", "my ear");
  expectChangeDb(await readSteadyLevel(panel), flat, 0);

  // The new headphone has no bands, so only the ear cut is left, 6 dB under the flat tone.
  await pick(panel, "headphone", "Flat");
  await expect(layerRow(panel, "My ear")).toContainText("my ear");
  expectChangeDb(await readSteadyLevel(panel), flat, -6);

  await pick(panel, "headphone", "Warm");
  await pick(panel, "ear", "No ear tuning");
  await expect(layerRow(panel, "My ear")).toHaveCount(0);
  await pasteInto(panel, "headphone", peakText);
  expectChangeDb(await readSteadyLevel(panel), flat, 6);
  await pick(panel, "ear", "my ear");
  expectChangeDb(await readSteadyLevel(panel), flat, 0);

  await sectionOf(panel, "ear").locator("[title='Delete my ear']").click();
  await expect(sectionOf(panel, "ear").locator(".item[data-name='my ear']")).toHaveCount(0);
});

journey("given a headphone band and an ear band, each layer exports alone in a box that fits it, the whole sound exports both, and a second press puts it away", async (context, port) => {
  const { panel } = await startGouiOnTone(context, port, 1000);

  await turnAutoPreampOff(panel);
  await pasteInto(panel, "headphone", peakText);
  await pasteInto(panel, "ear", earCutText);

  const ear = sectionOf(panel, "ear");

  await ear.locator("[data-action=export]").click();
  await expect(ear.locator(".text")).toHaveValue(/Filter 1: ON PK Fc 1000 Hz Gain -6\.0 dB/);
  await expect(ear.locator(".text")).not.toHaveValue(/Gain 6\.0 dB/);

  const exportBox = await ear.locator(".text").evaluate((box) => ({ hidden: box.scrollHeight - box.clientHeight, height: box.offsetHeight }));

  expect(exportBox.hidden).toBe(0);
  expect(exportBox.height).toBeLessThan(80);

  await ear.locator("[data-action=paste]").click();
  expect(await ear.locator(".text").evaluate((box) => box.offsetHeight)).toBeGreaterThanOrEqual(80);

  await panel.click("#exportAll");
  await expect(panel.locator("#wholeText")).toHaveValue(/Filter 1: ON PK Fc 1000 Hz Gain 6\.0 dB/);
  await expect(panel.locator("#wholeText")).toHaveValue(/Filter 2: ON PK Fc 1000 Hz Gain -6\.0 dB/);

  await panel.click("#exportAll");
  await expect(panel.locator("#wholeText")).toBeHidden();
});

journey("given an AutoEQ peak, the × on the headphone row plays the 1 kHz tone flat again and names the layer Flat", async (context, port) => {
  const { panel } = await startGouiOnTone(context, port, 1000);

  await turnAutoPreampOff(panel);

  const flat = await readSteadyLevel(panel);

  await pasteInto(panel, "headphone", peakText);
  expectChangeDb(await readSteadyLevel(panel), flat, 6);

  const clear = layerRow(panel, "Headphone").locator("[title='Clear the headphone layer to Flat']");

  await openTab(panel, "listen");
  await clear.click();
  expectChangeDb(await readSteadyLevel(panel), flat, 0);
  await expect(layerRow(panel, "Headphone")).toContainText("Flat");
  await expect(clear).toHaveCount(0);
});

function readBox(panel, selector) {
  return panel.locator(selector).boundingBox();
}

journey("given a 1100 px panel, Listen, Tune and Library stand in one row, and the Library shows one layer under its tab", async (context, port) => {
  const { panel } = await startGouiOnTone(context, port, 1000);

  await panel.setViewportSize({ width: 1100, height: 900 });

  const columns = [];

  for (const pane of ["listen", "tune", "library"]) columns.push(await readBox(panel, `[data-pane=${pane}]`));

  for (const [index, column] of columns.entries()) {
    expect(column.y).toBeLessThan(columns[0].y + 40);
    if (index > 0) expect(column.x).toBeGreaterThan(columns[index - 1].x + columns[index - 1].width);
  }

  await openLibrarySection(panel, "taste");
  await expect(sectionOf(panel, "taste")).toBeVisible();
  await expect(sectionOf(panel, "headphone")).toBeHidden();
  await expect(sectionOf(panel, "ear")).toBeHidden();
  await expect(panel.locator("#exportAll")).toBeVisible();
});

journey("given a Taste peak on a headphone peak, the tone plays 12 dB louder, Taste saves as its own preset, and No taste takes it off", async (context, port) => {
  const { panel } = await startGouiOnTone(context, port, 1000);

  await turnAutoPreampOff(panel);

  const flat = await readSteadyLevel(panel);

  await pasteInto(panel, "headphone", peakText);
  await pasteInto(panel, "taste", peakText);
  expectChangeDb(await readSteadyLevel(panel), flat, 12);
  await expect(layerRow(panel, "Taste")).toContainText("Pasted taste");

  await saveAs(panel, "taste", "warm taste");
  await pick(panel, "taste", "No taste");
  await expect(layerRow(panel, "Taste")).toHaveCount(0);
  expectChangeDb(await readSteadyLevel(panel), flat, 6);

  await pick(panel, "taste", "warm taste");
  expectChangeDb(await readSteadyLevel(panel), flat, 12);

  await panel.click("#exportAll");
  await expect(panel.locator("#wholeText")).toHaveValue(/Filter 2: ON PK Fc 1000 Hz Gain 6\.0 dB/);
});

journey("given sounds and Level match saved by older builds, each sound shows in both lists and plays, and Level match stays on", async (context, port) => {
  const { panel } = await startGouiOnTone(context, port, 1000);

  await turnAutoPreampOff(panel);

  const flat = await readSteadyLevel(panel);
  const older = {
    enabled: true,
    layers: {
      headphone: { on: true, source: "Saved", name: "old", bands: [{ on: true, type: "PK", frequencyHz: 1000, gainDb: 6, q: 1 }] },
      ear: { on: true, source: "Pasted", name: "Pasted My ear", bands: [{ on: true, type: "PK", frequencyHz: 1000, gainDb: -6, q: 1 }] },
    },
  };

  // A tab name goui does not know opens Listen alone.
  await panel.evaluate((sound) => chrome.storage.local.set({ savedSounds: { old: sound }, keepsPreampInCompare: true, tab: "mixer" }), older);
  await panel.reload();
  await expect(panel.locator("#levelMatch")).toBeChecked();
  await expect(panel.locator("[data-pane=listen]")).toBeVisible();
  await expect(panel.locator("[data-pane=tune]")).toBeHidden();
  await expect(panel.locator("[data-pane=library]")).toBeHidden();

  await pick(panel, "headphone", "old");
  expectChangeDb(await readSteadyLevel(panel), flat, 6);
  await pick(panel, "ear", "old");
  expectChangeDb(await readSteadyLevel(panel), flat, 0);
});

journey("given an ear layer, the EQByEar button turns it off and opens the test in a new tab", async (context, port) => {
  await context.route("https://eqbyear.com/**", (route) => route.fulfill({ contentType: "text/html", body: "<h1>eqbyear</h1>" }));

  const { panel } = await startGouiOnTone(context, port, 1000);

  await pasteInto(panel, "ear", earCutText);
  await expect.poll(() => layerSwitch(panel, "My ear").isChecked()).toBe(true);

  await panel.click("#eqbyear");
  await expect.poll(() => layerSwitch(panel, "My ear").isChecked()).toBe(false);
  await expect.poll(() => context.pages().some((page) => page.url().startsWith("https://eqbyear.com"))).toBe(true);
});

journey("given a ParametricEQ.txt file, Import plays its 1 kHz peak in the headphone layer", async (context, port) => {
  const { panel } = await startGouiOnTone(context, port, 1000);

  await turnAutoPreampOff(panel);

  const flat = await readSteadyLevel(panel);

  await openTab(panel, "library");

  const chooser = panel.waitForEvent("filechooser");

  await sectionOf(panel, "headphone").locator("[data-action=import]").click();
  await (await chooser).setFiles(fixturePath("fixture-phone.txt"));
  await expect(layerRow(panel, "Headphone")).toContainText("fixture-phone");
  expectChangeDb(await readSteadyLevel(panel), flat, 6);
});

journey("given a 6 dB boost and a 6 dB cut at 1 kHz, Solo on the boost plays the tone 6 dB louder, also on a tab goui moves to", async (context, port) => {
  const { panel } = await startGouiOnTone(context, port, 1000);

  await turnAutoPreampOff(panel);
  await pasteInto(panel, "headphone", peakText);
  await pasteInto(panel, "ear", earCutText);

  const flat = await readSteadyLevel(panel);

  await openTab(panel, "tune");
  await chooseBand(panel, 0);
  await panel.click("#bandSolo");
  expectChangeDb(await readSteadyLevel(panel), flat, 6);

  const second = await openTone(context, port, 1000);

  await pressIcon(context, second);
  await expect.poll(() => readBadge(context, second)).toBe("ON");
  expectChangeDb(await readSteadyLevel(panel), flat, 6);
});

journey("given a 6 dB peak, holding A/B or turning the EQ off plays the 1 kHz tone flat", async (context, port) => {
  const { panel } = await startGouiOnTone(context, port, 1000);

  await turnAutoPreampOff(panel);

  const flat = await readSteadyLevel(panel);

  await pasteInto(panel, "headphone", peakText);
  expectChangeDb(await readSteadyLevel(panel), flat, 6);

  await holdCompare(panel);
  expectChangeDb(await readSteadyLevel(panel), flat, 0);
  await releaseCompare(panel);
  expectChangeDb(await readSteadyLevel(panel), flat, 6);

  await turnEqOff(panel);
  expectChangeDb(await readSteadyLevel(panel), flat, 0);
});

journey("given a 6 dB peak, A/B held with Space plays the 1 kHz tone flat until the key comes up, and a held A/B lets go when the panel loses focus", async (context, port) => {
  const { panel } = await startGouiOnTone(context, port, 1000);

  await turnAutoPreampOff(panel);

  const flat = await readSteadyLevel(panel);

  await pasteInto(panel, "headphone", peakText);
  expectChangeDb(await readSteadyLevel(panel), flat, 6);

  await panel.locator("#compare").focus();
  await panel.keyboard.down("Space");
  expectChangeDb(await readSteadyLevel(panel), flat, 0);
  await panel.keyboard.up("Space");
  expectChangeDb(await readSteadyLevel(panel), flat, 6);

  // A headless window never loses focus, so this fires the blur a switch to another window sends.
  await holdCompare(panel);
  expectChangeDb(await readSteadyLevel(panel), flat, 0);
  await panel.evaluate(() => window.dispatchEvent(new FocusEvent("blur")));
  expectChangeDb(await readSteadyLevel(panel), flat, 6);
  await releaseCompare(panel);
});

journey("given a 1 kHz peak under auto preamp, A/B plays a 5 kHz tone 6 dB louder, and Level match holds it at the EQ level", async (context, port) => {
  const { panel } = await startGouiOnTone(context, port, 5000);

  await pasteInto(panel, "headphone", peakText);

  const withEq = await readSteadyLevel(panel);

  await holdCompare(panel);
  expectChangeDb(await readSteadyLevel(panel), withEq, 6);
  await releaseCompare(panel);

  await openTab(panel, "listen");
  await panel.getByText("Level match").click();
  await holdCompare(panel);
  expectChangeDb(await readSteadyLevel(panel), withEq, 0);
  await releaseCompare(panel);

  const reopened = await openPanelPage(context);

  await expect(reopened.locator("#levelMatch")).toBeChecked();
  await holdCompare(reopened);
  expectChangeDb(await readSteadyLevel(reopened), withEq, 0);
});

journey("given Vocals at +6 dB, a 1.5 kHz tone plays 6 dB louder and stays so on a new headphone", async (context, port) => {
  const { panel } = await startGouiOnTone(context, port, 1500);

  await turnAutoPreampOff(panel);

  const flat = await readSteadyLevel(panel);

  await nudgeSlider(panel, "#vocals", 12);
  expectChangeDb(await readSteadyLevel(panel), flat, 6);

  await pick(panel, "headphone", "Warm");
  expectChangeDb(await readSteadyLevel(panel), flat, 6);
});

journey("given a press on a point that wobbles 3 px, the tone keeps its boost, and a 40 px drag moves the boost off it", async (context, port) => {
  const { panel } = await startGouiOnTone(context, port, 1000);

  await turnAutoPreampOff(panel);
  await pasteInto(panel, "headphone", peakText);
  await openTab(panel, "tune");

  const withPeak = await readSteadyLevel(panel);

  const { centerX, centerY } = await readStillBandPoint(panel);

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
  const { panel } = await startGouiOnTone(context, port, 1000);

  await turnAutoPreampOff(panel);

  const flat = await readSteadyLevel(panel);

  await openTab(panel, "tune");

  const plot = await panel.locator("#tuneGraph").boundingBox();

  await panel.mouse.dblclick(plot.x + (plot.width * 0.6), plot.y + (plot.height * 0.5));
  await expect(panel.locator("#bandTitle")).toContainText("Headphone ·");
  await panel.fill("#frequencyInput", "1000");
  await panel.fill("#gainInput", "6");
  expectChangeDb(await readSteadyLevel(panel), flat, 6);
});

journey("given the Add band chip under My ear, a new 6 dB band at 1 kHz plays in the ear layer", async (context, port) => {
  const { panel } = await startGouiOnTone(context, port, 1000);

  await turnAutoPreampOff(panel);

  const flat = await readSteadyLevel(panel);

  await openTab(panel, "tune");
  await panel.click("#chips [data-add=ear]");
  await expect(panel.locator("#bandTitle")).toContainText("My ear ·");
  await expect(layerRow(panel, "My ear")).toHaveCount(1);
  await panel.fill("#gainInput", "6");
  expectChangeDb(await readSteadyLevel(panel), flat, 6);
});

journey("given goui hears a tab, a click on its icon turns goui off and blanks the level, and a second click brings the 6 dB peak back", async (context, port) => {
  const { panel, tone } = await startGouiOnTone(context, port, 1000);

  await turnAutoPreampOff(panel);

  const flat = await readSteadyLevel(panel);

  await pasteInto(panel, "headphone", peakText);
  expectChangeDb(await readSteadyLevel(panel), flat, 6);
  expect(await readBadge(context, tone)).toBe("ON");

  await pressIcon(context, tone);
  await expect(panel.locator("#status")).toContainText("Click the goui icon");
  await expect.poll(() => readBadge(context, tone)).toBe("");
  await expect(panel.locator("#level")).toHaveText("--");
  await expect(panel.locator("#meter")).toHaveAttribute("title", "Output level. goui hears nothing now.");

  await pressIcon(context, tone);
  await expect(panel.locator("#status")).toHaveText(playingToneTitle);
  expectChangeDb(await readSteadyLevel(panel), flat, 6);
});

journey("given goui hears a tab and the panel is closed, a click on its icon brings the panel back with the 6 dB peak still on", async (context, port) => {
  const { panel, tone } = await startGouiOnTone(context, port, 1000);

  await turnAutoPreampOff(panel);
  await pasteInto(panel, "headphone", peakText);

  const withPeak = await readSteadyLevel(panel);

  await panel.close();

  await pressIcon(context, tone);

  const reopened = await openPanelPage(context);

  await expect(reopened.locator("#status")).toHaveText(playingToneTitle);
  expectChangeDb(await readSteadyLevel(reopened), withPeak, 0);
  expect(await readBadge(context, tone)).toBe("ON");
});

journey("given goui hears a 1 kHz tab, a click on the icon of a 5 kHz tab moves goui there, and closing it turns goui off", async (context, port) => {
  const { panel, tone: low } = await startGouiOnTone(context, port, 1000);

  await turnAutoPreampOff(panel);
  await pasteInto(panel, "headphone", peakText);

  const withPeak = await readSteadyLevel(panel);

  await holdCompare(panel);
  expectChangeDb(withPeak, await readSteadyLevel(panel), 6);
  await releaseCompare(panel);

  // A page that is not on the web cannot be heard. goui stays on the 1 kHz tab with its peak.
  const blank = await context.newPage();

  await pressIcon(context, blank);
  await expect(panel.locator("#status")).toHaveText("Open a web page with audio, then click the goui icon.");
  await expect.poll(() => readBadge(context, low)).toBe("ON");
  expectChangeDb(await readSteadyLevel(panel), withPeak, 0);
  await blank.close();

  // The 1 kHz peak barely touches a 5 kHz tone, so the EQ on and off read the same there.
  const high = await openTone(context, port, 5000);

  await pressIcon(context, high);
  await expect.poll(() => readBadge(context, high)).toBe("ON");
  await expect.poll(() => readBadge(context, low)).toBe("");

  const highWithPeak = await readSteadyLevel(panel);

  await holdCompare(panel);
  expectChangeDb(highWithPeak, await readSteadyLevel(panel), 0);
  await releaseCompare(panel);

  await high.close();
  await expect(panel.locator("#status")).toContainText("Click the goui icon");
});

journey("given a tab in a window with no side panel, its icon opens goui as a popup that plays the 6 dB peak and turns it off", async (context, port) => {
  const { tone, tabId } = await openToneInApp(context, port, 1000);

  await expect.poll(() => readPopup(context, tabId)).toContain("/src/panel.html?tab=");

  const panel = await context.newPage();

  await panel.goto(await readPopup(context, tabId));
  await expect(panel.locator("#power")).toHaveText("ON");

  await turnAutoPreampOff(panel);

  const flat = await readSteadyLevel(panel);

  await pasteInto(panel, "headphone", peakText);
  expectChangeDb(await readSteadyLevel(panel), flat, 6);

  await panel.click("#power");
  await expect(panel.locator("#status")).toHaveText("goui is off on this tab. Press the power button to EQ it.");
  await panel.click("#power");
  await expect(panel.locator("#power")).toHaveText("ON");
  expectChangeDb(await readSteadyLevel(panel), flat, 6);

  // Chrome forgets the popup of a tab when the tab loads a page.
  await tone.reload();
  await expect.poll(() => readPopup(context, tabId)).toContain("/src/panel.html?tab=");

  // "Open in Brave" moves the tab of an app into a normal window, where the icon opens the side panel.
  const worker = await findWorker(context);

  await worker.evaluate(async (id) => {
    const [normal] = await chrome.windows.getAll({ windowTypes: ["normal"] });

    await chrome.tabs.move(id, { windowId: normal.id, index: -1 });
  }, tabId);
  await expect.poll(() => readPopup(context, tabId)).toBe("");
});

journey("given the panel, the help button opens the how-to page with the steps, the credits, the version and the store link", async (context, port) => {
  const { panel } = await startGouiOnTone(context, port, 1000);
  const opened = context.waitForEvent("page");

  await panel.click("#help");

  const intro = await opened;

  await intro.waitForLoadState();
  expect(intro.url()).toContain("src/intro.html");
  await expect(intro.locator("h1")).toHaveText("goui");
  await expect(intro.locator("#version")).toHaveText(`v${manifest.version}`);
  await expect(intro.locator("body")).toContainText("Pin goui");
  await expect(intro.locator("body")).toContainText("Click the goui icon");
  await expect(intro.locator("body")).toContainText("Tune it to your ear");
  await expect(intro.locator("h2", { hasText: "Credits" })).toBeVisible();
  await expect(intro.locator("a[href='https://github.com/jaakkopasanen/AutoEQ']")).toHaveCount(1);
  await expect(intro.locator("a[href='https://eqbyear.com']")).toHaveCount(1);
  await expect(intro.locator("a[href='https://github.com/google/material-design-icons']")).toHaveCount(1);

  const store = intro.locator("a[href='https://chromewebstore.google.com/detail/goui/ghldfngciehgonecnnihpdeghejkndap']");

  await expect(store).toHaveCount(1);

  const badge = store.locator("img[alt='Available in the Chrome Web Store']");

  await expect(badge).toBeVisible();
  expect(await badge.evaluate((image) => image.naturalWidth)).toBeGreaterThan(0);
  await expect(intro.locator("a[href='https://github.com/wyndhamharyata/goui/blob/main/THIRD_PARTY_NOTICES.md']")).toHaveCount(1);
  await expect(intro.locator(".fine")).toContainText("goui is under the MIT licence");
});

journey("given the Library, the credits line names the three sources and its button opens the guide", async (context, port) => {
  const { panel } = await startGouiOnTone(context, port, 1000);

  await openTab(panel, "library");

  const credits = panel.locator(".credits");

  await expect(credits).toContainText("AutoEQ by Jaakko Pasanen");
  await expect(credits).toContainText("EQByEar");
  await expect(credits).toContainText("Google Material Icons");
  await expect(credits).toContainText("MIT licence");

  const opened = context.waitForEvent("page");

  await panel.click("#credits");
  expect((await opened).url()).toContain("src/intro.html");
});

journey("given goui has never heard a tab, the panel shows how to start, and the first tab goui hears ends it for good", async (context, port) => {
  const tone = await openTone(context, port, 1000);
  const panel = await openPanelPage(context);

  await expect(panel.locator("#start")).toContainText("Pin goui");
  await expect(panel.locator("#start")).toBeVisible();
  await expect(panel.locator("#tabs")).toBeHidden();

  const opened = context.waitForEvent("page");

  await panel.click("#guide");
  expect((await opened).url()).toContain("src/intro.html");

  await pressIcon(context, tone);
  await expect(panel.locator("#status")).toHaveText(playingToneTitle);
  await expect(panel.locator("#start")).toBeHidden();
  await expect(panel.locator("#tabs")).toBeVisible();

  await pressIcon(context, tone);
  await expect(panel.locator("#status")).toContainText("Click the goui icon");
  await panel.reload();
  await expect(panel.locator("#tabs")).toBeVisible();
  await expect(panel.locator("#start")).toBeHidden();
});

journey("given a chosen band chip, a second press unselects it and the inspector empties", async (context, port) => {
  const { panel } = await startGouiOnTone(context, port, 1000);

  await turnAutoPreampOff(panel);
  await pasteInto(panel, "headphone", peakText);
  await openTab(panel, "tune");
  await chooseBand(panel, 0);
  await expect(panel.locator("#bandTitle")).toContainText("Headphone · 1.");

  await chooseBand(panel, 0);
  await expect(panel.locator("#inspectorBody")).toBeHidden();
  await expect(panel.locator("#inspectorEmpty")).toBeVisible();
});

/**
 * @param {import("@playwright/test").Page} panel
 * @param {string} name
 * @returns {import("@playwright/test").Locator}
 */
function readStepButtons(panel, name) {
  return panel.locator(`[data-step=${name}]`);
}

journey("given a peak turned into a low shelf, then a low cut, the inspector turns off Q, then gain and Q, and a peak turns both on again", async (context, port) => {
  const { panel } = await startGouiOnTone(context, port, 1000);

  await pasteInto(panel, "headphone", peakText);
  await openTab(panel, "tune");
  await chooseBand(panel, 0);

  await panel.click("#bandSegments [data-type=LSC]");
  await expect(panel.locator("#qInput")).toBeDisabled();
  await expect(readStepButtons(panel, "q")).toHaveCount(2);
  for (const button of await readStepButtons(panel, "q").all()) await expect(button).toBeDisabled();
  await expect(panel.locator("#gainInput")).toBeEnabled();

  await panel.click("#bandSegments [data-type=HP]");
  await expect(panel.locator("#gainInput")).toBeDisabled();
  await expect(panel.locator("#qInput")).toBeDisabled();
  for (const button of await readStepButtons(panel, "gain").all()) await expect(button).toBeDisabled();

  await panel.click("#bandSegments [data-type=PK]");
  await expect(panel.locator("#gainInput")).toBeEnabled();
  await expect(panel.locator("#qInput")).toBeEnabled();
  for (const button of await readStepButtons(panel, "q").all()) await expect(button).toBeEnabled();
});

journey("given a Set of a saved headphone peak and Vocals at +2 dB, picking it after other changes plays the 1 kHz tone at the Set's level again, and a deleted preset plays as Flat", async (context, port) => {
  const { panel } = await startGouiOnTone(context, port, 1000);
  const sets = sectionOf(panel, "sets");

  await turnAutoPreampOff(panel);
  await pasteInto(panel, "headphone", peakText);
  await openTab(panel, "listen");
  await panel.click("#saveSet");
  await expect(sets.locator(".action-hint")).toHaveText("Save Headphone as a preset first. A Set names its presets, so each layer with bands needs one.");

  await saveAs(panel, "headphone", "voice");
  await openTab(panel, "listen");
  await nudgeSlider(panel, "#vocals", 4);
  await expect(panel.locator("#vocalsValue")).toHaveText("+2.0 dB");

  const withSet = await readSteadyLevel(panel);

  await panel.click("#saveSet");
  await sets.locator(".save-name").fill("home");
  await sets.locator(".confirm-save").click();
  await expect(sets.locator(".action-hint")).toHaveText("Saved home.");
  await expect(sets.locator(".item[data-name='home']")).toContainText("voice · No ear tuning · No taste");

  await pick(panel, "headphone", "Flat");
  await pasteInto(panel, "ear", earCutText);
  await openTab(panel, "listen");
  await nudgeSlider(panel, "#vocals", 4);
  await expect(panel.locator("#setSelect")).toHaveValue("");
  expect(Math.abs((await readSteadyLevel(panel)) - withSet)).toBeGreaterThan(6);

  await panel.locator("#setSelect").selectOption("home");
  await expect(panel.locator("#vocalsValue")).toHaveText("+2.0 dB");
  await expect(layerRow(panel, "Headphone")).toContainText("voice");
  expectChangeDb(await readSteadyLevel(panel), withSet, 0);

  // The empty ear slot turns My ear off. The pasted ear cut is kept, and its switch brings it back.
  await expect(layerRow(panel, "My ear")).toContainText("Pasted ear tuning");
  await expect(layerSwitch(panel, "My ear")).not.toBeChecked();
  await setLayer(panel, "My ear", true);
  expectChangeDb(await readSteadyLevel(panel), withSet, -6);
  await expect(panel.locator("#setSelect")).toHaveValue("");

  // With its headphone preset deleted, the Set still applies and plays Flat in that slot.
  await (await openLibrarySection(panel, "headphone")).locator("[title='Delete voice']").click();
  await openLibrarySection(panel, "sets");
  await expect(sets.locator(".item[data-name='home']")).toContainText("voice, missing · No ear tuning · No taste");
  await sets.locator(".item[data-name='home']").click();
  await expect(layerRow(panel, "Headphone")).toContainText("Flat");
  expectChangeDb(await readSteadyLevel(panel), withSet, -6);
});
