export const bandTypes = ["PK", "LSC", "HSC", "LSF", "HSF", "LP", "HP", "BP", "NO", "AP"];

export const typeLabels = {
  PK: "Peak",
  LSC: "Low shelf",
  HSC: "High shelf",
  LSF: "Low shelf (slope)",
  HSF: "High shelf (slope)",
  LP: "Low pass",
  HP: "High pass",
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
  return { enabled: true, preampDb: 0, limiter: false, bands: [] };
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
  return {
    enabled: raw.enabled !== false,
    preampDb: clamp(Number(raw.preampDb) || 0, -24, 12),
    limiter: !!raw.limiter,
    bands: Array.isArray(raw.bands) ? raw.bands.map(cleanBand) : [],
  };
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
