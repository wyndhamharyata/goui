import Foundation

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

// Silence has no level in dB. One decimal is enough for a meter.
public func linearToDbfs(_ linear: Float) -> Double? {
  guard linear > 0 else { return nil }

  return (20 * log10(Double(linear)) * 10).rounded() / 10
}

private func formatDbfs(_ linear: Float) -> String {
  guard let db = linearToDbfs(linear) else { return "  silent   " }

  return String(format: "%6.1f dBFS", db)
}
