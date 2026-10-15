import CoreAudio
import Foundation
import Render

// Plays test tones through the render code with no audio device. It checks the gain of each band kind against the band's response, and that a change of sound fades without a click.

let sampleRateHz = 48_000.0
let framesPerCallback = 512
let channelCount = 2
let toneAmplitude = 0.25
let gainToleranceDb = 0.05
// A sine's largest step from one sample to the next is its amplitude times 2 pi f / rate. A click steps further.
let clickStepRatio = 1.1
// The check runs on one thread, so the count needs no actor.
nonisolated(unsafe) var failureCount = 0

// A render state fed a mono tone on both channels, one callback of 512 frames at a time.
final class Renderer {
  let state: OpaquePointer

  init(preampDb: Double, bands: [RenderBand]) {
    guard let state = renderStateCreate(preampDb, bands, UInt32(bands.count), sampleRateHz, UInt32(channelCount), 0) else {
      fatalError("Creating the render state failed")
    }

    self.state = state
  }

  deinit {
    renderStateDestroy(state)
  }

  func trySetSound(preampDb: Double, bands: [RenderBand]) -> Bool {
    renderTrySetSound(state, preampDb, bands, UInt32(bands.count))
  }

  // Returns the left channel of the output.
  func render(_ samples: [Float]) -> [Float] {
    var output = [Float]()
    var stamp = AudioTimeStamp()
    for start in stride(from: 0, to: samples.count, by: framesPerCallback) {
      let chunk = samples[start..<min(start + framesPerCallback, samples.count)]
      var inputSamples = chunk.flatMap { [Float](repeating: $0, count: channelCount) }
      var outputSamples = [Float](repeating: 0, count: inputSamples.count)
      let byteCount = UInt32(inputSamples.count * MemoryLayout<Float>.size)
      inputSamples.withUnsafeMutableBytes { inputBytes in
        outputSamples.withUnsafeMutableBytes { outputBytes in
          var input = AudioBufferList(mNumberBuffers: 1, mBuffers: AudioBuffer(mNumberChannels: UInt32(channelCount), mDataByteSize: byteCount, mData: inputBytes.baseAddress))
          var outputList = AudioBufferList(mNumberBuffers: 1, mBuffers: AudioBuffer(mNumberChannels: UInt32(channelCount), mDataByteSize: byteCount, mData: outputBytes.baseAddress))
          _ = renderAudio(0, &stamp, &input, &stamp, &outputList, &stamp, UnsafeMutableRawPointer(state))
        }
      }
      output += stride(from: 0, to: outputSamples.count, by: channelCount).map { outputSamples[$0] }
    }
    return output
  }
}

func makeTone(frequencyHz: Double, seconds: Double) -> [Float] {
  (0..<Int(seconds * sampleRateHz)).map { Float(toneAmplitude * sin(2 * .pi * frequencyHz * Double($0) / sampleRateHz)) }
}

func measureLevel(_ samples: ArraySlice<Float>) -> Double {
  (samples.map { Double($0 * $0) }.reduce(0, +) / Double(samples.count)).squareRoot()
}

func largestStep(_ samples: [Float]) -> Double {
  zip(samples, samples.dropFirst()).map { Double(abs($1 - $0)) }.max() ?? 0
}

func report(_ isPassing: Bool, _ text: String) {
  print("\(isPassing ? "ok    " : "FAILED") \(text)")
  if !isPassing { failureCount += 1 }
}

func band(_ kind: BandKind, _ frequencyHz: Double, gainDb: Double = 0, q: Double = 0.71) -> RenderBand {
  RenderBand(kind: kind, frequencyHz: frequencyHz, gainDb: gainDb, q: q)
}

func checkGain(_ name: String, preampDb: Double = 0, bands: [RenderBand], toneHz: Double) {
  var expectedDb = preampDb
  for band in bands {
    var magnitude = 0.0
    renderBandResponse(band, sampleRateHz, [toneHz], &magnitude, 1)
    expectedDb += 20 * log10(magnitude)
  }

  let output = Renderer(preampDb: preampDb, bands: bands).render(makeTone(frequencyHz: toneHz, seconds: 1))
  let steadyHalf = output[(output.count / 2)...]
  let measuredDb = 20 * log10(measureLevel(steadyHalf) / (toneAmplitude / 2.0.squareRoot()))
  let isPassing = expectedDb.isFinite ? abs(measuredDb - expectedDb) <= gainToleranceDb : measureLevel(steadyHalf) < 1e-6
  report(isPassing, String(format: "%@ at %.0f Hz: %.2f dB, the response says %.2f dB", name, toneHz, measuredDb, expectedDb))
}

func checkFade(_ name: String, from: (preampDb: Double, bands: [RenderBand]), to: (preampDb: Double, bands: [RenderBand]), toneHz: Double) {
  let renderer = Renderer(preampDb: from.preampDb, bands: from.bands)
  let tone = makeTone(frequencyHz: toneHz, seconds: 1)
  // The change comes at a peak of the tone, where a click jumps furthest.
  let half = (tone.count / 2) + Int(sampleRateHz / toneHz / 4)
  let before = renderer.render(Array(tone[..<half]))
  let isTaken = renderer.trySetSound(preampDb: to.preampDb, bands: to.bands)
  let isRefusedDuringFade = !renderer.trySetSound(preampDb: to.preampDb, bands: to.bands)
  let after = renderer.render(Array(tone[half...]))
  let isTakenAfterFade = renderer.trySetSound(preampDb: to.preampDb, bands: to.bands)

  let steadyCount = tone.count / 4
  let stepLimit = clickStepRatio * max(largestStep(Array(before.suffix(steadyCount))), largestStep(Array(after.suffix(steadyCount))))
  let step = largestStep(Array(before.suffix(framesPerCallback)) + after)
  report(step <= stepLimit, String(format: "%@: largest step %.4f, a click would pass %.4f", name, step, stepLimit))
  report(isTaken && isRefusedDuringFade && isTakenAfterFade, "\(name): taken, refused during the fade, taken after it")
}

print("Gain of each band kind, a -12 dB tone at \(Int(sampleRateHz)) Hz")
checkGain("Preamp -6", preampDb: -6, bands: [], toneHz: 1000)
checkGain("Peak 1 kHz +6 Q 1", bands: [band(.peak, 1000, gainDb: 6, q: 1)], toneHz: 1000)
checkGain("Peak 1 kHz -6 Q 1", bands: [band(.peak, 1000, gainDb: -6, q: 1)], toneHz: 1400)
checkGain("Low shelf 105 Hz +6", bands: [band(.lowShelf, 105, gainDb: 6)], toneHz: 50)
checkGain("High shelf 8 kHz -6", bands: [band(.highShelf, 8000, gainDb: -6)], toneHz: 15000)
checkGain("Low pass 1 kHz", bands: [band(.lowPass, 1000)], toneHz: 2000)
checkGain("High pass 1 kHz", bands: [band(.highPass, 1000)], toneHz: 500)
checkGain("Band pass 1 kHz Q 2", bands: [band(.bandPass, 1000, q: 2)], toneHz: 1200)
checkGain("Notch 1 kHz Q 2", bands: [band(.notch, 1000, q: 2)], toneHz: 1100)
checkGain("All pass 1 kHz", bands: [band(.allPass, 1000)], toneHz: 1000)
checkGain("High pass above Nyquist", bands: [band(.highPass, 30000)], toneHz: 1000)
checkGain("Two peaks and a preamp", preampDb: -6, bands: [band(.peak, 1000, gainDb: 4, q: 1), band(.peak, 2000, gainDb: 3, q: 0.5)], toneHz: 1500)

print("\nA change of sound, halfway through a tone")
checkFade("Preamp 0 to -12", from: (0, []), to: (-12, []), toneHz: 1000)
checkFade("Peak +12 to none", from: (0, [band(.peak, 1000, gainDb: 12, q: 1)]), to: (0, []), toneHz: 1000)
checkFade("Bass +12 to -12", from: (-12, [band(.lowShelf, 105, gainDb: 12)]), to: (0, [band(.lowShelf, 105, gainDb: -12)]), toneHz: 80)
checkFade("High pass 20 Hz to 200 Hz", from: (0, [band(.highPass, 20)]), to: (0, [band(.highPass, 200)]), toneHz: 150)

print(failureCount == 0 ? "\nAll checks pass." : "\n\(failureCount) checks failed.")
exit(failureCount == 0 ? 0 : 1)
