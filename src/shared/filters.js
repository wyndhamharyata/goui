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

export function clamp(value, low, high) {
  return Math.min(Math.max(value, low), high);
}

export function defaultConfig() {
  return {
    enabled: true,
    preampDb: 0,
    autoPreamp: true,
    limiter: false,
    profileName: "Flat",
    profileKind: "Starter sound",
    macros: { bassDb: 0, vocalsDb: 0, trebleDb: 0 },
    bands: [],
  };
}

export function newBand(frequencyHz) {
  return { on: true, type: "PK", frequencyHz: frequencyHz || 1000, gainDb: 0, q: 1 };
}

function cleanBand(raw) {
  return {
    on: !raw || raw.on !== false,
    type: raw && bandTypes.includes(raw.type) ? raw.type : "PK",
    frequencyHz: clamp(Number(raw && raw.frequencyHz) || 1000, 20, 20_000),
    gainDb: clamp(Number(raw && raw.gainDb) || 0, -20, 20),
    q: clamp(Number(raw && raw.q) || 0.71, 0.1, 18),
  };
}

// Used on a stored config and on an imported preset, so a bad file cannot reach the audio chain.
export function sanitizeConfig(raw) {
  if (!raw || typeof raw !== "object") return defaultConfig();
  const macros = raw.macros || {};
  const macroDb = (value) => clamp(Number(value) || 0, -6, 6);
  return {
    enabled: raw.enabled !== false,
    preampDb: clamp(Number(raw.preampDb) || 0, -24, 12),
    autoPreamp: raw.autoPreamp !== false,
    limiter: !!raw.limiter,
    profileName: typeof raw.profileName === "string" ? raw.profileName : "Custom",
    profileKind: typeof raw.profileKind === "string" ? raw.profileKind : "Your sound",
    macros: { bassDb: macroDb(macros.bassDb), vocalsDb: macroDb(macros.vocalsDb), trebleDb: macroDb(macros.trebleDb) },
    bands: Array.isArray(raw.bands) ? raw.bands.map(cleanBand) : [],
  };
}

// The three Listen sliders, as bands on top of the profile. They stay in the chain at 0 dB, so a
// slider move never rebuilds the audio nodes.
export function macroBands(macros) {
  return [
    { on: true, type: "LSC", frequencyHz: 105, gainDb: macros.bassDb, q: 0.71 },
    { on: true, type: "PK", frequencyHz: 2500, gainDb: macros.vocalsDb, q: 0.9 },
    { on: true, type: "HSC", frequencyHz: 8000, gainDb: macros.trebleDb, q: 0.71 },
  ];
}

// The Web Audio low and high pass read Q in dB. AutoEQ writes a plain Q, as the other types do.
export function biquadQ(band) {
  const readsDb = band.type === "LP" || band.type === "HP";
  return readsDb ? 20 * Math.log10(band.q) : band.q;
}

export function makeBiquad(context, band) {
  const filter = context.createBiquadFilter();
  filter.type = audioNodeType[band.type];
  filter.frequency.value = band.frequencyHz;
  filter.Q.value = biquadQ(band);
  if (hasGain(band.type)) filter.gain.value = band.gainDb;
  return filter;
}

// The panel draws with the same nodes the engine plays, so the curve matches the sound.
export function responseDb(context, bands, frequencies) {
  const totals = new Float32Array(frequencies.length);
  const magnitudes = new Float32Array(frequencies.length);
  const phases = new Float32Array(frequencies.length);
  for (const band of bands) {
    if (!band.on) continue;
    makeBiquad(context, band).getFrequencyResponse(frequencies, magnitudes, phases);
    for (let index = 0; index < totals.length; index += 1) totals[index] += 20 * Math.log10(magnitudes[index]);
  }
  return totals;
}

const sweepHz = Float32Array.from({ length: 121 }, (_, index) => 20 * 1000 ** (index / 120));

export function maxBoostDb(context, bands) {
  return Math.max(0, ...responseDb(context, bands, sweepHz));
}

// What the audio chain plays: the profile, the sliders on top, and the preamp the panel shows.
export function engineConfig(config, context) {
  const bands = [...config.bands, ...macroBands(config.macros)];
  const preampDb = config.autoPreamp ? 0 - maxBoostDb(context, bands) : config.preampDb;
  return { enabled: config.enabled, limiter: config.limiter, preampDb, bands };
}

const autoEqLine =
  /Filter\s+\d+\s*:\s*(ON|OFF)\s+([A-Za-z_]+)\s+Fc\s+([\d.]+)\s*Hz(?:\s+Gain\s+(-?[\d.]+)\s*dB)?(?:\s+Q\s+([\d.]+))?/i;

const typeFixes = { PEAK: "PK", PEAKING: "PK", LOWPASS: "LP", HIGHPASS: "HP", NOTCH: "NO" };

export function parseAutoEq(text) {
  const config = defaultConfig();
  for (const line of text.split(/\r?\n/)) {
    const preamp = line.match(/Preamp\s*:\s*(-?[\d.]+)\s*dB/i);
    if (preamp) {
      config.preampDb = Number(preamp[1]);
      continue;
    }

    const match = line.match(autoEqLine);
    const type = match && typeFixes[match[2].toUpperCase()];
    const plainType = match && bandTypes.includes(match[2].toUpperCase());
    if (!match || (!type && !plainType)) continue;

    config.bands.push({
      on: match[1].toUpperCase() === "ON",
      type: type || match[2].toUpperCase(),
      frequencyHz: Number(match[3]),
      gainDb: match[4] ? Number(match[4]) : 0,
      q: match[5] ? Number(match[5]) : 0.71,
    });
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
