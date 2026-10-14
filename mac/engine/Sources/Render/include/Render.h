#pragma once

#include <CoreAudio/CoreAudio.h>
#include <stdbool.h>

CF_ASSUME_NONNULL_BEGIN

// scopeFrameCount is the fftSize of the extension's AnalyserNode, so the panel reads the same spectrum.
enum { maxTapChannelCount = 16, maxBandCount = 32, scopeFrameCount = 8192 };

// The eight Web Audio filters. goui's two kinds of shelf each play as the one Web Audio shelf.
typedef CF_ENUM(int, BandKind) {
  BandKindPeak,
  BandKindLowShelf,
  BandKindHighShelf,
  BandKindLowPass,
  BandKindHighPass,
  BandKindBandPass,
  BandKindNotch,
  BandKindAllPass,
};

// q is the plain Q for every kind, as goui stores it.
typedef struct {
  BandKind kind;
  double frequencyHz;
  double gainDb;
  double q;
} RenderBand;

typedef struct RenderState RenderState;

typedef struct {
  unsigned long long callbackCount;
  unsigned long long clippedSampleCount;
  unsigned int inputBufferCount;
  unsigned int tapChannelCount;
  float inputPeakLinear;
  float outputPeakLinear;
} RenderMeters;

// NULL when memory runs out, a count is out of range, or atomic float is not lock-free.
RenderState *_Nullable renderStateCreate(double preampDb, const RenderBand *_Nullable bands, unsigned int bandCount,
                                         double sampleRateHz, unsigned int tapChannelCount,
                                         unsigned int tapBufferIndex);
void renderStateDestroy(RenderState *state);

// Fades to the new sound over 20 ms. False while the last change still fades, so the caller tries again.
bool renderTrySetSound(RenderState *state, double preampDb, const RenderBand *_Nullable bands, unsigned int bandCount);

// Reads the meters and starts the peaks again from silence.
void renderReadMeters(RenderState *state, RenderMeters *meters);

// Copies the last scopeFrameCount frames played, mixed to mono, oldest first.
void renderReadScope(RenderState *state, float *samples);

// The linear gain of one band at each frequency, from the same coefficients the audio plays.
void renderBandResponse(RenderBand band, double sampleRateHz, const double *frequenciesHz, double *magnitudes,
                        unsigned int count);

OSStatus renderAudio(AudioObjectID device, const AudioTimeStamp *now, const AudioBufferList *input,
                     const AudioTimeStamp *inputTime, AudioBufferList *output,
                     const AudioTimeStamp *outputTime, void *_Nullable context);

CF_ASSUME_NONNULL_END
