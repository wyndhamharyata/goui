export const bandTypes = ["PK", "LSC", "HSC", "LSF", "HSF", "LP", "HP", "BP", "NO", "AP"];

export const typeLabels = {
  PK: "Peak",
  LSC: "Low shelf",
  HSC: "High shelf",
  LSF: "Low shelf (slope)",
  HSF: "High shelf (slope)",
  LP: "High cut",
  HP: "Low cut",
  BP: "Band pass",
  NO: "Notch",
  AP: "All pass",
};

// A shelf in the Web Audio API takes no Q, so LSC and LSF build the same node.
export const audioNodeType = {
  PK: "peaking",
  LSC: "lowshelf",
  HSC: "highshelf",
  LSF: "lowshelf",
  HSF: "highshelf",
  LP: "lowpass",
  HP: "highpass",
  BP: "bandpass",
  NO: "notch",
  AP: "allpass",
};

const typesWithGain = new Set(["PK", "LSC", "HSC", "LSF", "HSF"]);

export function hasGain(type) {
  return typesWithGain.has(type);
}

// Every place that sets a Q uses these, so a typed Q and a dragged Q keep the same range.
export const qRange = [0.1, 18];
export const qStepRatio = 1.12;

export function clamp(value, low, high) {
  return Math.min(Math.max(value, low), high);
}

export function defaultConfig() {
  return {
    enabled: true,
    preampDb: 0,
    autoPreamp: true,
    soundName: "Flat",
    soundKind: "Starter sound",
    isEdited: false,
    sliders: { bassDb: 0, vocalsDb: 0, trebleDb: 0 },
    bands: [],
  };
}

export function newBand(frequencyHz) {
  return { on: true, type: "PK", frequencyHz: frequencyHz || 1000, gainDb: 0, q: 1 };
}

// Used on a stored config and on an imported saved sound, so a bad file cannot reach the audio chain.
export function sanitizeConfig(raw) {
  if (!raw || typeof raw !== "object") return defaultConfig();
  // A config stored before the rename uses macros, profileName and profileKind.
  const sliders = raw.sliders || raw.macros || {};
  const soundName = raw.soundName ?? raw.profileName;
  const soundKind = raw.soundKind ?? raw.profileKind;
  const sliderDb = (value) => clamp(Number(value) || 0, -6, 6);
  return {
    enabled: raw.enabled !== false,
    preampDb: clamp(Number(raw.preampDb) || 0, -24, 12),
    autoPreamp: raw.autoPreamp !== false,
    soundName: typeof soundName === "string" ? soundName : "Custom",
    soundKind: typeof soundKind === "string" ? soundKind : "Your sound",
    isEdited: raw.isEdited === true,
    sliders: { bassDb: sliderDb(sliders.bassDb), vocalsDb: sliderDb(sliders.vocalsDb), trebleDb: sliderDb(sliders.trebleDb) },
    bands: (Array.isArray(raw.bands) ? raw.bands : []).filter((band) => band && typeof band === "object").map((band) => ({
      on: band.on !== false,
      type: bandTypes.includes(band.type) ? band.type : "PK",
      frequencyHz: clamp(Number(band.frequencyHz) || 1000, 20, 20_000),
      gainDb: clamp(Number(band.gainDb) || 0, -20, 20),
      q: clamp(Number(band.q) || 0.71, ...qRange),
    })),
  };
}

// The three Listen sliders, as bands on top of the sound's own bands. They stay in the chain at
// 0 dB, so a slider move never rebuilds the audio nodes.
export function sliderBands(sliders) {
  return [
    { on: true, type: "LSC", frequencyHz: 105, gainDb: sliders.bassDb, q: 0.71 },
    { on: true, type: "PK", frequencyHz: 2500, gainDb: sliders.vocalsDb, q: 0.9 },
    { on: true, type: "HSC", frequencyHz: 8000, gainDb: sliders.trebleDb, q: 0.71 },
  ];
}

// The Web Audio low and high pass read Q in dB. AutoEQ writes a plain Q, as the other types do.
export function biquadQ(band) {
  const readsDb = band.type === "LP" || band.type === "HP";
  return readsDb ? 20 * Math.log10(band.q) : band.q;
}

export function makeBiquad(context, band) {
  const node = context.createBiquadFilter();
  node.type = audioNodeType[band.type];
  node.frequency.value = band.frequencyHz;
  node.Q.value = biquadQ(band);
  if (hasGain(band.type)) node.gain.value = band.gainDb;
  return node;
}

// The panel draws with the same nodes the engine plays, so the curve matches the sound.
const offlineContext = new OfflineAudioContext(1, 1, 48_000);

export function responseDb(bands, frequencies) {
  const totals = new Float32Array(frequencies.length);
  const magnitudes = new Float32Array(frequencies.length);
  const phases = new Float32Array(frequencies.length);
  for (const band of bands) {
    if (!band.on) continue;
    makeBiquad(offlineContext, band).getFrequencyResponse(frequencies, magnitudes, phases);
    for (let index = 0; index < totals.length; index += 1) totals[index] += 20 * Math.log10(magnitudes[index]);
  }
  return totals;
}

export function maxBoostDb(bands) {
  const sweepHz = Float32Array.from({ length: 121 }, (_, index) => 20 * 1000 ** (index / 120));
  return Math.max(0, ...responseDb(bands, sweepHz));
}

// What the audio chain plays: the sound's bands, the sliders on top, and the preamp the panel shows.
export function engineConfig(config) {
  const bands = [...config.bands, ...sliderBands(config.sliders)];
  const preampDb = config.autoPreamp ? 0 - maxBoostDb(bands) : config.preampDb;
  return { enabled: config.enabled, preampDb, bands };
}

const typeAliases = { PEAK: "PK", PEAKING: "PK", LOWPASS: "LP", HIGHPASS: "HP", NOTCH: "NO" };

// An AutoEQ line reads "Filter 1: ON PK Fc 105 Hz Gain -3.1 dB Q 0.70", with Gain and Q optional.
export function parseAutoEq(text) {
  const config = defaultConfig();
  for (const line of text.split("\n")) {
    const words = line.trim().split(" ").filter((word) => word !== "");
    const label = (words[0] || "").toLowerCase();
    if (label === "preamp:") {
      config.preampDb = Number(words[1]);
      continue;
    }
    if (label !== "filter") continue;

    const readAfter = (name) => {
      const at = words.findIndex((word) => word.toLowerCase() === name);
      return at < 0 ? undefined : Number(words[at + 1]);
    };
    const typeWord = (words[3] || "").toUpperCase();
    const type = typeAliases[typeWord] || typeWord;
    const frequencyHz = readAfter("fc");
    const isBand = bandTypes.includes(type) && Number.isFinite(frequencyHz);
    if (!isBand) continue;

    config.bands.push({ on: words[2].toUpperCase() === "ON", type, frequencyHz, gainDb: readAfter("gain") ?? 0, q: readAfter("q") ?? 0.71 });
  }
  return config;
}

export function toAutoEq(config) {
  const lines = [`Preamp: ${config.preampDb.toFixed(1)} dB`];
  config.bands.forEach((band, index) => {
    const on = band.on ? "ON" : "OFF";
    const gain = hasGain(band.type) ? ` Gain ${band.gainDb.toFixed(1)} dB` : "";
    lines.push(`Filter ${index + 1}: ${on} ${band.type} Fc ${Math.round(band.frequencyHz)} Hz${gain} Q ${band.q.toFixed(2)}`);
  });
  return lines.join("\n");
}
