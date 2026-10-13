#pragma once

#include <CoreAudio/CoreAudio.h>

CF_ASSUME_NONNULL_BEGIN

typedef struct RenderState RenderState;

typedef struct {
  unsigned long long callbackCount;
  unsigned int inputBufferCount;
  unsigned int tapChannelCount;
  float inputPeakLinear;
  float outputPeakLinear;
} RenderMeters;

RenderState *renderStateCreate(double gainDb, double bassDb, double sampleRateHz);
void renderStateDestroy(RenderState *state);

// Reads the meters and starts the peaks again from silence.
void renderReadMeters(RenderState *state, RenderMeters *meters);

OSStatus renderAudio(AudioObjectID device, const AudioTimeStamp *now, const AudioBufferList *input,
                     const AudioTimeStamp *inputTime, AudioBufferList *output,
                     const AudioTimeStamp *outputTime, void *_Nullable context);

CF_ASSUME_NONNULL_END
