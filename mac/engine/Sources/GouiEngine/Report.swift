import Foundation

public func printIntroduction(_ options: Options) {
  print("goui engine. Gain \(options.gainDb) dB, bass \(options.bassDb) dB at 105 Hz. Press Control-C to stop.")
  print("If the Mac goes quiet, allow the terminal under System Settings, Privacy & Security, Screen & System Audio Recording.")
}

func printSummary(_ summary: AudioPathSummary) {
  print("Output       \(summary.outputName) at \(Int(summary.sampleRateHz)) Hz")
  print("Tap          \(summary.tapChannelCount) channels")
  print(String(format: "Delay        %.1f ms from the tap to the ear, of which the engine's buffer is %.1f ms", summary.totalDelayMs, summary.bufferDelayMs))
}

public func printMeters(_ reading: MeterReading) {
  print(String(format: "%5.0f callbacks/s  in %@  out %@  inputs %u  tap channels %u  clipped %llu  overloads %d",
               reading.callbacksPerSecond, formatDbfs(reading.inputPeakLinear), formatDbfs(reading.outputPeakLinear),
               reading.inputBufferCount, reading.tapChannelCount, reading.clippedSampleCount, reading.overloadCount))
}

private func formatDbfs(_ linear: Float) -> String {
  linear > 0 ? String(format: "%6.1f dBFS", 20 * log10(linear)) : "  silent   "
}
