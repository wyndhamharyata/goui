#include "Render.h"

#include <math.h>
#include <stdatomic.h>
#include <stdbool.h>
#include <stdlib.h>
#include <string.h>

enum { maxChannelCount = 16 };

static const double bassFrequencyHz = 105;

typedef struct {
  double b0, b1, b2, a1, a2;
} BiquadRow;

// 64-bit state, so a shelf near 100 Hz keeps its accuracy.
typedef struct {
  double z1, z2;
} BiquadState;

struct RenderState {
  double gainLinear;
  bool hasBass;
  BiquadRow bass;
  BiquadState bassStates[maxChannelCount];
  _Atomic unsigned long long callbackCount;
  _Atomic unsigned int inputBufferCount;
  _Atomic unsigned int tapChannelCount;
  _Atomic float inputPeakLinear;
  _Atomic float outputPeakLinear;
};

// Low shelf with S = 1, as the Web Audio spec plays it. RBJ Audio EQ Cookbook.
static BiquadRow makeLowShelf(double frequencyHz, double gainDb, double sampleRateHz) {
  double amplitude = pow(10, gainDb / 40);
  double omegaRad = 2 * M_PI * frequencyHz / sampleRateHz;
  double cosine = cos(omegaRad);
  double alpha = sin(omegaRad) / 2 * sqrt(2);
  double shelf = 2 * sqrt(amplitude) * alpha;
  double a0 = (amplitude + 1) + ((amplitude - 1) * cosine) + shelf;
  return (BiquadRow){
      .b0 = amplitude * ((amplitude + 1) - ((amplitude - 1) * cosine) + shelf) / a0,
      .b1 = 2 * amplitude * ((amplitude - 1) - ((amplitude + 1) * cosine)) / a0,
      .b2 = amplitude * ((amplitude + 1) - ((amplitude - 1) * cosine) - shelf) / a0,
      .a1 = -2 * ((amplitude - 1) + ((amplitude + 1) * cosine)) / a0,
      .a2 = ((amplitude + 1) + ((amplitude - 1) * cosine) - shelf) / a0,
  };
}

// Transposed direct form II.
static inline double runBiquad(const BiquadRow *row, BiquadState *state, double sample) {
  double result = (row->b0 * sample) + state->z1;
  state->z1 = (row->b1 * sample) - (row->a1 * result) + state->z2;
  state->z2 = (row->b2 * sample) - (row->a2 * result);
  return result;
}

RenderState *renderStateCreate(double gainDb, double bassDb, double sampleRateHz) {
  RenderState *state = calloc(1, sizeof(RenderState));
  state->gainLinear = pow(10, gainDb / 20);
  state->hasBass = bassDb != 0;
  state->bass = makeLowShelf(bassFrequencyHz, bassDb, sampleRateHz);
  return state;
}

void renderStateDestroy(RenderState *state) { free(state); }

void renderReadMeters(RenderState *state, RenderMeters *meters) {
  meters->callbackCount = atomic_load(&state->callbackCount);
  meters->inputBufferCount = atomic_load(&state->inputBufferCount);
  meters->tapChannelCount = atomic_load(&state->tapChannelCount);
  meters->inputPeakLinear = atomic_exchange(&state->inputPeakLinear, 0);
  meters->outputPeakLinear = atomic_exchange(&state->outputPeakLinear, 0);
}

static void raisePeak(_Atomic float *peak, float value) {
  if (value > atomic_load(peak)) atomic_store(peak, value);
}

static void silence(AudioBufferList *output) {
  for (UInt32 index = 0; index < output->mNumberBuffers; index += 1) {
    AudioBuffer *buffer = &output->mBuffers[index];
    if (buffer->mData) memset(buffer->mData, 0, buffer->mDataByteSize);
  }
}

// Each output channel takes the tap channel with the same number, wrapping round, so a stereo tap
// fills a device of any width.
static void writeFrame(AudioBufferList *output, UInt32 frame, const float *processed, UInt32 channelCount) {
  UInt32 outputChannel = 0;
  for (UInt32 index = 0; index < output->mNumberBuffers; index += 1) {
    AudioBuffer *buffer = &output->mBuffers[index];
    UInt32 bufferChannelCount = buffer->mNumberChannels;
    UInt32 bufferFrameCount = bufferChannelCount ? buffer->mDataByteSize / (bufferChannelCount * sizeof(float)) : 0;
    if (frame < bufferFrameCount) {
      float *samples = buffer->mData;
      for (UInt32 channel = 0; channel < bufferChannelCount; channel += 1) {
        samples[(frame * bufferChannelCount) + channel] = processed[(outputChannel + channel) % channelCount];
      }
    }
    outputChannel += bufferChannelCount;
  }
}

// Runs on the audio thread. No allocation, no lock, no call that can wait.
OSStatus renderAudio(AudioObjectID device, const AudioTimeStamp *now, const AudioBufferList *input,
                     const AudioTimeStamp *inputTime, AudioBufferList *output,
                     const AudioTimeStamp *outputTime, void *context) {
  RenderState *state = context;
  atomic_fetch_add(&state->callbackCount, 1);
  atomic_store(&state->inputBufferCount, input ? input->mNumberBuffers : 0);
  silence(output);
  if (!input || input->mNumberBuffers == 0) return noErr;

  // The aggregate device lists the inputs of its devices first and the tap last.
  const AudioBuffer *tap = &input->mBuffers[input->mNumberBuffers - 1];
  UInt32 tapChannelCount = tap->mNumberChannels;
  atomic_store(&state->tapChannelCount, tapChannelCount);
  if (!tap->mData || tapChannelCount == 0) return noErr;

  UInt32 channelCount = tapChannelCount < maxChannelCount ? tapChannelCount : maxChannelCount;
  UInt32 frameCount = tap->mDataByteSize / (tapChannelCount * sizeof(float));
  const float *samples = tap->mData;
  float inputPeakLinear = 0;
  float outputPeakLinear = 0;
  for (UInt32 frame = 0; frame < frameCount; frame += 1) {
    float processed[maxChannelCount];
    for (UInt32 channel = 0; channel < channelCount; channel += 1) {
      float sample = samples[(frame * tapChannelCount) + channel];
      double result = sample * state->gainLinear;
      if (state->hasBass) result = runBiquad(&state->bass, &state->bassStates[channel], result);
      processed[channel] = (float)result;
      inputPeakLinear = fmaxf(inputPeakLinear, fabsf(sample));
      outputPeakLinear = fmaxf(outputPeakLinear, fabsf(processed[channel]));
    }
    writeFrame(output, frame, processed, channelCount);
  }
  raisePeak(&state->inputPeakLinear, inputPeakLinear);
  raisePeak(&state->outputPeakLinear, outputPeakLinear);
  return noErr;
}
