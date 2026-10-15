// The colour of a band type and of a layer, as a tone class. Each tone class in src/base.css reads one token.

const peakTone = "tone-peak";
const shelfTone = "tone-shelf";
const cutTone = "tone-cut";

export const typeTone = {
  PK: peakTone,
  LSC: shelfTone,
  HSC: shelfTone,
  LSF: shelfTone,
  HSF: shelfTone,
  LP: cutTone,
  HP: cutTone,
  BP: cutTone,
  NO: cutTone,
  AP: cutTone,
};

export const layerTone = { headphone: "tone-headphone", ear: "tone-ear", taste: "tone-taste" };
