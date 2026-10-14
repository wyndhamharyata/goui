#pragma once

#include <CoreAudio/CoreAudio.h>

CF_ASSUME_NONNULL_BEGIN

enum { maxTapChannelCount = 16 };

typedef struct RenderState RenderState;

typedef struct {
  unsigned long long callbackCount;
  unsigned long long clippedSampleCount;
  unsigned int inputBufferCount;
  unsigned int tapChannelCount;
  float inputPeakLinear;
  float outputPeakLinear;
} RenderMeters;

// Returns NULL when memory runs out, when the channel count is outside 1 to maxTapChannelCount, or
// when this machine has no lock-free atomic float.
RenderState *_Nullable renderStateCreate(double gainDb, double bassDb, double sampleRateHz,
                                         unsigned int tapChannelCount, unsigned int tapBufferIndex);
void renderStateDestroy(RenderState *state);

// Reads the meters and starts the peaks again from silence.
void renderReadMeters(RenderState *state, RenderMeters *meters);

OSStatus renderAudio(AudioObjectID device, const AudioTimeStamp *now, const AudioBufferList *input,
                     const AudioTimeStamp *inputTime, AudioBufferList *output,
                     const AudioTimeStamp *outputTime, void *_Nullable context);

CF_ASSUME_NONNULL_END
