#include "Render.h"

#include <math.h>
#include <stdatomic.h>
#include <stdbool.h>
#include <stdlib.h>
#include <string.h>

// An output with more buffers than this plays silence on the rest.
enum { maxOutputBufferCount = 16 };

_Static_assert(ATOMIC_LLONG_LOCK_FREE == 2, "the audio thread needs lock-free 64-bit counters");
_Static_assert(ATOMIC_INT_LOCK_FREE == 2, "the audio thread needs lock-free 32-bit counters");

static const double bassFrequencyHz = 105;

typedef struct {
  double b0, b1, b2, a1, a2;
} BiquadRow;

// 64-bit state, so a shelf near 100 Hz keeps its accuracy.
typedef struct {
  double z1, z2;
} BiquadState;

struct RenderState {
  _Atomic float gainLinear;
  bool hasBass;
  BiquadRow bass;
  BiquadState bassStates[maxTapChannelCount];
  UInt32 tapChannelCount;
  UInt32 tapBufferIndex;
  _Atomic unsigned long long callbackCount;
  _Atomic unsigned long long clippedSampleCount;
  _Atomic unsigned int inputBufferCount;
  _Atomic unsigned int tapChannelCountSeen;
  _Atomic float inputPeakLinear;
  _Atomic float outputPeakLinear;
};

typedef struct {
  float *samples;
  UInt32 channelCount;
  UInt32 firstChannel;
} OutputBuffer;

// A = 10^(dBgain/40), w0 = 2*pi*f0/Fs, alpha = sin(w0)/2 * sqrt((A + 1/A)*(1/S - 1) + 2), RBJ Audio EQ Cookbook
static BiquadRow makeLowShelf(double frequencyHz, double gainDb, double sampleRateHz) {
  // S = 1, as the Web Audio spec plays a low shelf.
  double shelfSlope = 1;
  double amplitude = pow(10, gainDb / 40);
  double omegaRad = 2 * M_PI * frequencyHz / sampleRateHz;
  double cosine = cos(omegaRad);
  double alpha = (sin(omegaRad) / 2) * sqrt(((amplitude + (1 / amplitude)) * ((1 / shelfSlope) - 1)) + 2);
  double twoSqrtAmplitudeAlpha = 2 * sqrt(amplitude) * alpha;
  double a0 = (amplitude + 1) + ((amplitude - 1) * cosine) + twoSqrtAmplitudeAlpha;
  return (BiquadRow){
      .b0 = amplitude * ((amplitude + 1) - ((amplitude - 1) * cosine) + twoSqrtAmplitudeAlpha) / a0,
      .b1 = 2 * amplitude * ((amplitude - 1) - ((amplitude + 1) * cosine)) / a0,
      .b2 = amplitude * ((amplitude + 1) - ((amplitude - 1) * cosine) - twoSqrtAmplitudeAlpha) / a0,
      .a1 = -2 * ((amplitude - 1) + ((amplitude + 1) * cosine)) / a0,
      .a2 = ((amplitude + 1) + ((amplitude - 1) * cosine) - twoSqrtAmplitudeAlpha) / a0,
  };
}

// Transposed direct form II.
static inline double runBiquad(const BiquadRow *row, BiquadState *state, double sample) {
  double result = (row->b0 * sample) + state->z1;
  state->z1 = (row->b1 * sample) - (row->a1 * result) + state->z2;
  state->z2 = (row->b2 * sample) - (row->a2 * result);
  return result;
}

RenderState *renderStateCreate(double gainDb, double bassDb, double sampleRateHz, unsigned int tapChannelCount,
                               unsigned int tapBufferIndex) {
  bool isChannelCountSupported = tapChannelCount >= 1 && tapChannelCount <= maxTapChannelCount;
  if (!isChannelCountSupported) return NULL;

  RenderState *state = calloc(1, sizeof(RenderState));
  if (!state) return NULL;
  if (!atomic_is_lock_free(&state->inputPeakLinear)) {
    free(state);
    return NULL;
  }

  atomic_init(&state->gainLinear, (float)pow(10, gainDb / 20));
  state->hasBass = bassDb != 0;
  state->bass = makeLowShelf(bassFrequencyHz, bassDb, sampleRateHz);
  state->tapChannelCount = tapChannelCount;
  state->tapBufferIndex = tapBufferIndex;
  return state;
}

void renderStateDestroy(RenderState *state) { free(state); }

void renderSetGain(RenderState *state, double gainDb) {
  atomic_store_explicit(&state->gainLinear, (float)pow(10, gainDb / 20), memory_order_relaxed);
}

void renderReadMeters(RenderState *state, RenderMeters *meters) {
  meters->callbackCount = atomic_load_explicit(&state->callbackCount, memory_order_relaxed);
  meters->clippedSampleCount = atomic_load_explicit(&state->clippedSampleCount, memory_order_relaxed);
  meters->inputBufferCount = atomic_load_explicit(&state->inputBufferCount, memory_order_relaxed);
  meters->tapChannelCount = atomic_load_explicit(&state->tapChannelCountSeen, memory_order_relaxed);
  meters->inputPeakLinear = atomic_exchange_explicit(&state->inputPeakLinear, 0, memory_order_relaxed);
  meters->outputPeakLinear = atomic_exchange_explicit(&state->outputPeakLinear, 0, memory_order_relaxed);
}

static void raisePeak(_Atomic float *peak, float value) {
  float current = atomic_load_explicit(peak, memory_order_relaxed);
  while (value > current &&
         !atomic_compare_exchange_weak_explicit(peak, &current, value, memory_order_relaxed, memory_order_relaxed)) {
  }
}

static void silence(AudioBufferList *output) {
  for (UInt32 index = 0; index < output->mNumberBuffers; index += 1) {
    AudioBuffer *buffer = &output->mBuffers[index];
    if (buffer->mData) memset(buffer->mData, 0, buffer->mDataByteSize);
  }
}

// Lowers frameCount to the shortest output buffer. Returns the number of buffers written to buffers.
static UInt32 describeOutput(AudioBufferList *output, OutputBuffer *buffers, UInt32 *frameCount) {
  UInt32 bufferCount = 0;
  UInt32 firstChannel = 0;
  for (UInt32 index = 0; index < output->mNumberBuffers && bufferCount < maxOutputBufferCount; index += 1) {
    AudioBuffer *buffer = &output->mBuffers[index];
    UInt32 channelCount = buffer->mNumberChannels;
    bool isWritable = buffer->mData && channelCount > 0;
    if (isWritable) {
      UInt32 bufferFrameCount = buffer->mDataByteSize / (channelCount * sizeof(float));
      if (bufferFrameCount < *frameCount) *frameCount = bufferFrameCount;
      buffers[bufferCount] = (OutputBuffer){buffer->mData, channelCount, firstChannel};
      bufferCount += 1;
    }
    firstChannel += channelCount;
  }
  return bufferCount;
}

// Output channels take tap channels by number, wrapping round, so a stereo tap fills any device.
static void writeFrame(const OutputBuffer *buffers, UInt32 bufferCount, UInt32 frame, const float *processed,
                       UInt32 channelCount) {
  for (UInt32 index = 0; index < bufferCount; index += 1) {
    const OutputBuffer *buffer = &buffers[index];
    float *frameSamples = buffer->samples + (frame * buffer->channelCount);
    for (UInt32 channel = 0; channel < buffer->channelCount; channel += 1) {
      frameSamples[channel] = processed[(buffer->firstChannel + channel) % channelCount];
    }
  }
}

// Runs on the audio thread. No allocation, no lock, no call that can wait.
OSStatus renderAudio(AudioObjectID device, const AudioTimeStamp *now, const AudioBufferList *input,
                     const AudioTimeStamp *inputTime, AudioBufferList *output,
                     const AudioTimeStamp *outputTime, void *context) {
  (void)device;
  (void)now;
  (void)inputTime;
  (void)outputTime;
  RenderState *state = context;
  UInt32 inputBufferCount = input ? input->mNumberBuffers : 0;
  atomic_fetch_add_explicit(&state->callbackCount, 1, memory_order_relaxed);
  atomic_store_explicit(&state->inputBufferCount, inputBufferCount, memory_order_relaxed);
  silence(output);
  if (state->tapBufferIndex >= inputBufferCount) return noErr;

  const AudioBuffer *tap = &input->mBuffers[state->tapBufferIndex];
  UInt32 tapChannelCount = tap->mNumberChannels;
  atomic_store_explicit(&state->tapChannelCountSeen, tapChannelCount, memory_order_relaxed);
  if (!tap->mData || tapChannelCount == 0) return noErr;

  OutputBuffer outputBuffers[maxOutputBufferCount];
  UInt32 frameCount = tap->mDataByteSize / (tapChannelCount * sizeof(float));
  UInt32 outputBufferCount = describeOutput(output, outputBuffers, &frameCount);
  UInt32 channelCount = tapChannelCount < state->tapChannelCount ? tapChannelCount : state->tapChannelCount;
  const float *samples = tap->mData;
  float gainLinear = atomic_load_explicit(&state->gainLinear, memory_order_relaxed);
  float inputPeakLinear = 0;
  float outputPeakLinear = 0;
  unsigned long long clippedSampleCount = 0;
  for (UInt32 frame = 0; frame < frameCount; frame += 1) {
    float processed[maxTapChannelCount];
    for (UInt32 channel = 0; channel < channelCount; channel += 1) {
      float sample = samples[(frame * tapChannelCount) + channel];
      double result = sample * gainLinear;
      if (state->hasBass) result = runBiquad(&state->bass, &state->bassStates[channel], result);
      processed[channel] = (float)result;
      float outputLevel = fabsf(processed[channel]);
      clippedSampleCount += outputLevel > 1.0f;
      inputPeakLinear = fmaxf(inputPeakLinear, fabsf(sample));
      outputPeakLinear = fmaxf(outputPeakLinear, outputLevel);
    }
    writeFrame(outputBuffers, outputBufferCount, frame, processed, channelCount);
  }
  raisePeak(&state->inputPeakLinear, inputPeakLinear);
  raisePeak(&state->outputPeakLinear, outputPeakLinear);
  atomic_fetch_add_explicit(&state->clippedSampleCount, clippedSampleCount, memory_order_relaxed);
  return noErr;
}
