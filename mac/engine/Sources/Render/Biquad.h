#pragma once

#include "Render.h"

typedef struct {
  double b0, b1, b2, a1, a2;
} BiquadRow;

// 64-bit state, so a shelf near 100 Hz keeps its accuracy.
typedef struct {
  double z1, z2;
} BiquadState;

BiquadRow makeBiquadRow(RenderBand band, double sampleRateHz);

// Transposed direct form II, https://en.wikipedia.org/wiki/Digital_biquad_filter#Transposed_direct_forms
static inline double runBiquad(const BiquadRow *row, BiquadState *state, double sample) {
  double result = (row->b0 * sample) + state->z1;
  state->z1 = (row->b1 * sample) - (row->a1 * result) + state->z2;
  state->z2 = (row->b2 * sample) - (row->a2 * result);
  return result;
}
