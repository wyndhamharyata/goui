// The level and spectrum of what the Mac plays, read as the extension's AnalyserNode reads a tab.
import { linearToDb, rootMeanSquare } from "../../src/shared/math.js";
import { silenceDb, toSpectrumDb } from "../../src/shared/messages.js";

// The engine sends its last samples as base64 of little-endian Float32, as both sides store them.
function toSamples(base64) {
  const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));

  return new Float32Array(bytes.buffer);
}

// The window Web Audio's AnalyserNode puts on its samples before the FFT, with its alpha of 0.16.
function toBlackmanWeight(index, size) {
  const turn = (2 * Math.PI * index) / size;

  return 0.42 - (0.5 * Math.cos(turn)) + (0.08 * Math.cos(2 * turn));
}

// An in-place radix-2 FFT. The size is a power of two.
function transform(real, imaginary) {
  const size = real.length;

  for (let index = 1, reversed = 0; index < size; index += 1) {
    let bit = size >> 1;

    for (; reversed & bit; bit >>= 1) reversed ^= bit;
    reversed ^= bit;

    if (index < reversed) {
      [real[index], real[reversed]] = [real[reversed], real[index]];
      [imaginary[index], imaginary[reversed]] = [imaginary[reversed], imaginary[index]];
    }
  }

  for (let span = 2; span <= size; span <<= 1) {
    const angle = (-2 * Math.PI) / span;

    for (let start = 0; start < size; start += span) {
      for (let offset = 0; offset < span / 2; offset += 1) {
        const twiddleReal = Math.cos(angle * offset);
        const twiddleImaginary = Math.sin(angle * offset);
        const even = start + offset;
        const odd = even + (span / 2);
        const oddReal = (real[odd] * twiddleReal) - (imaginary[odd] * twiddleImaginary);
        const oddImaginary = (real[odd] * twiddleImaginary) + (imaginary[odd] * twiddleReal);

        real[odd] = real[even] - oddReal;
        imaginary[odd] = imaginary[even] - oddImaginary;
        real[even] += oddReal;
        imaginary[even] += oddImaginary;
      }
    }
  }
}

// Each bin's level in dB, as getFloatFrequencyData gives it with no smoothing.
function toBinsDb(samples) {
  const size = samples.length;
  const real = Float64Array.from(samples, (sample, index) => sample * toBlackmanWeight(index, size));
  const imaginary = new Float64Array(size);

  transform(real, imaginary);

  return Float32Array.from({ length: size / 2 }, (_, bin) => linearToDb(Math.hypot(real[bin], imaginary[bin]) / size));
}

/**
 * @param {{ samples: string, sampleRateHz: number }} scope
 * @returns {{ levelDb: number, spectrumDb: number[] }}
 */
export function toTelemetry(scope) {
  const samples = toSamples(scope.samples);
  const rms = rootMeanSquare(samples);

  return {
    levelDb: rms > 0 ? Math.max(linearToDb(rms), silenceDb) : silenceDb,
    spectrumDb: toSpectrumDb(toBinsDb(samples), scope.sampleRateHz / samples.length),
  };
}
