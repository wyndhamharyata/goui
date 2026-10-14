// The Web Audio spec's filter formulas, https://webaudio.github.io/web-audio-api/#filters-characteristics
#include "Biquad.h"

#include <complex.h>
#include <math.h>

static BiquadRow fixedGain(double gain) { return (BiquadRow){.b0 = gain}; }

static BiquadRow divideByA0(double b0, double b1, double b2, double a0, double a1, double a2) {
  return (BiquadRow){.b0 = b0 / a0, .b1 = b1 / a0, .b2 = b2 / a0, .a1 = a1 / a0, .a2 = a2 / a0};
}

// At or above the Nyquist frequency, half the sample rate, WebKit plays each kind as a fixed gain.
static BiquadRow makeRowAtNyquist(BandKind kind, double amplitude) {
  switch (kind) {
  case BandKindLowShelf:
    return fixedGain(amplitude * amplitude);
  case BandKindHighPass:
  case BandKindBandPass:
    return fixedGain(0);
  default:
    return fixedGain(1);
  }
}

BiquadRow makeBiquadRow(RenderBand band, double sampleRateHz) {
  double amplitude = pow(10, band.gainDb / 40);
  if (band.frequencyHz >= sampleRateHz / 2) return makeRowAtNyquist(band.kind, amplitude);

  double omegaRad = 2 * M_PI * band.frequencyHz / sampleRateHz;
  double cosine = cos(omegaRad);
  // Web Audio reads the Q of a low or high pass in dB. goui sends 20 log10(q), so the plain q works here.
  double alphaQ = sin(omegaRad) / (2 * band.q);
  // A Web Audio shelf takes no Q. Its slope S is 1, which makes its alpha sin(w0) / 2 * sqrt(2).
  double alphaShelf = (sin(omegaRad) / 2) * M_SQRT2;
  double shelfTerm = 2 * sqrt(amplitude) * alphaShelf;
  double plus = amplitude + 1;
  double minus = amplitude - 1;

  switch (band.kind) {
  case BandKindPeak:
    return divideByA0(1 + (alphaQ * amplitude), -2 * cosine, 1 - (alphaQ * amplitude), 1 + (alphaQ / amplitude),
                      -2 * cosine, 1 - (alphaQ / amplitude));
  case BandKindLowShelf:
    return divideByA0(amplitude * (plus - (minus * cosine) + shelfTerm), 2 * amplitude * (minus - (plus * cosine)),
                      amplitude * (plus - (minus * cosine) - shelfTerm), plus + (minus * cosine) + shelfTerm,
                      -2 * (minus + (plus * cosine)), plus + (minus * cosine) - shelfTerm);
  case BandKindHighShelf:
    return divideByA0(amplitude * (plus + (minus * cosine) + shelfTerm), -2 * amplitude * (minus + (plus * cosine)),
                      amplitude * (plus + (minus * cosine) - shelfTerm), plus - (minus * cosine) + shelfTerm,
                      2 * (minus - (plus * cosine)), plus - (minus * cosine) - shelfTerm);
  case BandKindLowPass:
    return divideByA0((1 - cosine) / 2, 1 - cosine, (1 - cosine) / 2, 1 + alphaQ, -2 * cosine, 1 - alphaQ);
  case BandKindHighPass:
    return divideByA0((1 + cosine) / 2, -(1 + cosine), (1 + cosine) / 2, 1 + alphaQ, -2 * cosine, 1 - alphaQ);
  case BandKindBandPass:
    return divideByA0(alphaQ, 0, -alphaQ, 1 + alphaQ, -2 * cosine, 1 - alphaQ);
  case BandKindNotch:
    return divideByA0(1, -2 * cosine, 1, 1 + alphaQ, -2 * cosine, 1 - alphaQ);
  case BandKindAllPass:
    return divideByA0(1 - alphaQ, -2 * cosine, 1 + alphaQ, 1 + alphaQ, -2 * cosine, 1 - alphaQ);
  }
  return fixedGain(1);
}

// |H(z)| at z = e^(jw), the filter's gain at one frequency.
void renderBandResponse(RenderBand band, double sampleRateHz, const double *frequenciesHz, double *magnitudes,
                        unsigned int count) {
  BiquadRow row = makeBiquadRow(band, sampleRateHz);
  for (unsigned int index = 0; index < count; index += 1) {
    double complex delay = cexp(-I * 2 * M_PI * frequenciesHz[index] / sampleRateHz);
    double complex numerator = row.b0 + (row.b1 * delay) + (row.b2 * delay * delay);
    double complex denominator = 1 + (row.a1 * delay) + (row.a2 * delay * delay);
    magnitudes[index] = cabs(numerator / denominator);
  }
}
