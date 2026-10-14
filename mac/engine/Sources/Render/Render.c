#include "Render.h"

#include <math.h>
#include <stdatomic.h>
#include <stdbool.h>
#include <stdlib.h>
#include <string.h>

#include "Biquad.h"

// An output with more buffers than this plays silence on the rest.
enum { maxOutputBufferCount = 16 };

_Static_assert(ATOMIC_LLONG_LOCK_FREE == 2, "the audio thread needs lock-free 64-bit counters");
_Static_assert(ATOMIC_INT_LOCK_FREE == 2, "the audio thread needs lock-free 32-bit counters");

// Long enough that a change of sound does not click, short enough to feel instant.
static const double fadeSeconds = 0.02;

// One sound: the preamp and the bands, with each band's filter memory for each channel.
typedef struct {
  double preampLinear;
  UInt32 bandCount;
  BiquadRow rows[maxBandCount];
  BiquadState states[maxBandCount][maxTapChannelCount];
} Chain;

struct RenderState {
  // The main thread writes the chain the audio thread does not play, then publishes its number.
  Chain chains[2];
  _Atomic int publishedChain;
  // The audio thread stores the chain it plays alone once a fade ends. Until then the other is in use.
  _Atomic int settledChain;
  double sampleRateHz;
  UInt32 fadeFrameCount;
  UInt32 tapChannelCount;
  UInt32 tapBufferIndex;
  // Only the audio thread reads and writes these three. fadingFromChain is -1 outside a fade.
  int playingChain;
  int fadingFromChain;
  UInt32 fadeFrame;
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

static void writeChain(Chain *chain, double preampDb, const RenderBand *bands, UInt32 bandCount, double sampleRateHz) {
  chain->preampLinear = pow(10, preampDb / 20);
  chain->bandCount = bandCount;
  for (UInt32 index = 0; index < bandCount; index += 1) chain->rows[index] = makeBiquadRow(bands[index], sampleRateHz);
  memset(chain->states, 0, sizeof(chain->states));
}

RenderState *renderStateCreate(double preampDb, const RenderBand *bands, unsigned int bandCount, double sampleRateHz,
                               unsigned int tapChannelCount, unsigned int tapBufferIndex) {
  bool isChannelCountSupported = tapChannelCount >= 1 && tapChannelCount <= maxTapChannelCount;
  bool isBandCountSupported = bandCount <= maxBandCount && (bandCount == 0 || bands);
  if (!isChannelCountSupported || !isBandCountSupported) return NULL;

  RenderState *state = calloc(1, sizeof(RenderState));
  if (!state) return NULL;
  if (!atomic_is_lock_free(&state->inputPeakLinear)) {
    free(state);
    return NULL;
  }

  writeChain(&state->chains[0], preampDb, bands, bandCount, sampleRateHz);
  state->sampleRateHz = sampleRateHz;
  state->fadeFrameCount = (UInt32)fmax(1, round(fadeSeconds * sampleRateHz));
  state->tapChannelCount = tapChannelCount;
  state->tapBufferIndex = tapBufferIndex;
  state->fadingFromChain = -1;
  return state;
}

void renderStateDestroy(RenderState *state) { free(state); }

bool renderTrySetSound(RenderState *state, double preampDb, const RenderBand *bands, unsigned int bandCount) {
  bool isBandCountSupported = bandCount <= maxBandCount && (bandCount == 0 || bands);
  if (!isBandCountSupported) return false;

  int published = atomic_load_explicit(&state->publishedChain, memory_order_acquire);
  int settled = atomic_load_explicit(&state->settledChain, memory_order_acquire);
  if (settled != published) return false;

  int next = 1 - published;
  writeChain(&state->chains[next], preampDb, bands, bandCount, state->sampleRateHz);
  atomic_store_explicit(&state->publishedChain, next, memory_order_release);
  return true;
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

// The new chain takes the old one's filter memory, so a small change carries straight on.
static void startFadeIfPublished(RenderState *state) {
  if (state->fadingFromChain >= 0) return;

  int published = atomic_load_explicit(&state->publishedChain, memory_order_acquire);
  if (published == state->playingChain) return;

  Chain *from = &state->chains[state->playingChain];
  Chain *to = &state->chains[published];
  UInt32 sharedBandCount = from->bandCount < to->bandCount ? from->bandCount : to->bandCount;
  memcpy(to->states, from->states, sharedBandCount * sizeof(from->states[0]));
  state->fadingFromChain = state->playingChain;
  state->playingChain = published;
  state->fadeFrame = 0;
}

static inline double runChain(Chain *chain, UInt32 channel, double sample) {
  double result = sample * chain->preampLinear;
  for (UInt32 band = 0; band < chain->bandCount; band += 1) {
    result = runBiquad(&chain->rows[band], &chain->states[band][channel], result);
  }
  return result;
}

static void advanceFade(RenderState *state) {
  if (state->fadingFromChain < 0) return;

  state->fadeFrame += 1;
  if (state->fadeFrame < state->fadeFrameCount) return;

  state->fadingFromChain = -1;
  atomic_store_explicit(&state->settledChain, state->playingChain, memory_order_release);
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

  startFadeIfPublished(state);
  OutputBuffer outputBuffers[maxOutputBufferCount];
  UInt32 frameCount = tap->mDataByteSize / (tapChannelCount * sizeof(float));
  UInt32 outputBufferCount = describeOutput(output, outputBuffers, &frameCount);
  UInt32 channelCount = tapChannelCount < state->tapChannelCount ? tapChannelCount : state->tapChannelCount;
  const float *samples = tap->mData;
  float inputPeakLinear = 0;
  float outputPeakLinear = 0;
  unsigned long long clippedSampleCount = 0;
  for (UInt32 frame = 0; frame < frameCount; frame += 1) {
    float processed[maxTapChannelCount];
    bool isFading = state->fadingFromChain >= 0;
    double fadeShare = (double)(state->fadeFrame + 1) / state->fadeFrameCount;
    for (UInt32 channel = 0; channel < channelCount; channel += 1) {
      float sample = samples[(frame * tapChannelCount) + channel];
      double result = runChain(&state->chains[state->playingChain], channel, sample);
      if (isFading) {
        double fadingResult = runChain(&state->chains[state->fadingFromChain], channel, sample);
        result = fadingResult + ((result - fadingResult) * fadeShare);
      }
      processed[channel] = (float)result;
      float outputLevel = fabsf(processed[channel]);
      clippedSampleCount += outputLevel > 1.0f;
      inputPeakLinear = fmaxf(inputPeakLinear, fabsf(sample));
      outputPeakLinear = fmaxf(outputPeakLinear, outputLevel);
    }
    writeFrame(outputBuffers, outputBufferCount, frame, processed, channelCount);
    advanceFade(state);
  }
  raisePeak(&state->inputPeakLinear, inputPeakLinear);
  raisePeak(&state->outputPeakLinear, outputPeakLinear);
  atomic_fetch_add_explicit(&state->clippedSampleCount, clippedSampleCount, memory_order_relaxed);
  return noErr;
}
