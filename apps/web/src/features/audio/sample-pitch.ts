import type { NoteValue } from "@/features/song/song-pattern";

const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;
const minMidiNote = 12;
const maxMidiNote = 119;
const analysisWindowSize = 4096;
const amplitudeGate = 0.02;
const minimumRms = 0.015;
const minimumCorrelation = 0.78;
const minimumFrequency = 55;
const maximumFrequency = 1760;

export function suggestSamplePitchNote(pcm: ArrayLike<number>, sampleRate: number): NoteValue | null {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0 || pcm.length < 2) {
    return null;
  }

  const analysisWindow = getAnalysisWindow(pcm, sampleRate);

  if (analysisWindow === null) {
    return null;
  }

  const frequency = detectFundamentalFrequency(analysisWindow, sampleRate);

  if (frequency === null) {
    return null;
  }

  return toNearestNote(frequency);
}

function getAnalysisWindow(pcm: ArrayLike<number>, sampleRate: number) {
  const trimmedRange = getActiveRange(pcm);

  if (trimmedRange === null) {
    return null;
  }

  const { startIndex, endIndex } = trimmedRange;
  const availableLength = endIndex - startIndex;
  const windowSize = Math.min(analysisWindowSize, availableLength);
  const minimumWindowSize = Math.max(64, Math.ceil(sampleRate / maximumFrequency) * 4);

  if (windowSize < minimumWindowSize) {
    return null;
  }

  const centeredStart = startIndex + Math.floor((availableLength - windowSize) / 2);
  const window = Float32Array.from({ length: windowSize }, (_, index) => pcm[centeredStart + index] ?? 0);
  const rms = getRms(window);

  if (rms < minimumRms) {
    return null;
  }

  return window;
}

function getActiveRange(pcm: ArrayLike<number>) {
  let startIndex = 0;

  while (startIndex < pcm.length && Math.abs(pcm[startIndex] ?? 0) < amplitudeGate) {
    startIndex += 1;
  }

  let endIndex = pcm.length;

  while (endIndex > startIndex && Math.abs(pcm[endIndex - 1] ?? 0) < amplitudeGate) {
    endIndex -= 1;
  }

  return endIndex - startIndex < 2 ? null : { startIndex, endIndex };
}

function getRms(pcm: ArrayLike<number>) {
  let energy = 0;

  for (let index = 0; index < pcm.length; index += 1) {
    const sample = pcm[index] ?? 0;
    energy += sample * sample;
  }

  return Math.sqrt(energy / pcm.length);
}

function detectFundamentalFrequency(pcm: Float32Array, sampleRate: number) {
  const centered = subtractMean(pcm);
  const minLag = Math.max(2, Math.floor(sampleRate / maximumFrequency));
  const maxLag = Math.min(centered.length - 2, Math.ceil(sampleRate / minimumFrequency));

  if (maxLag <= minLag) {
    return null;
  }

  const correlations = new Float32Array(maxLag + 1);
  let bestCorrelation = -1;

  for (let lag = minLag; lag <= maxLag; lag += 1) {
    const correlation = getNormalizedCorrelation(centered, lag);
    correlations[lag] = correlation;

    if (correlation > bestCorrelation) {
      bestCorrelation = correlation;
    }
  }

  if (bestCorrelation < minimumCorrelation) {
    return null;
  }

  const bestLag = findPreferredLag(correlations, minLag, maxLag, bestCorrelation);

  if (bestLag === null) {
    return null;
  }

  const refinedLag = refineLag(bestLag, correlations);

  if (!Number.isFinite(refinedLag) || refinedLag <= 0) {
    return null;
  }

  const frequency = sampleRate / refinedLag;

  if (frequency < minimumFrequency || frequency > maximumFrequency) {
    return null;
  }

  return frequency;
}

function findPreferredLag(correlations: Float32Array, minLag: number, maxLag: number, bestCorrelation: number) {
  const significantPeakThreshold = Math.max(minimumCorrelation, bestCorrelation * 0.9);

  for (let lag = minLag + 1; lag < maxLag; lag += 1) {
    const previous = correlations[lag - 1] ?? 0;
    const current = correlations[lag] ?? 0;
    const next = correlations[lag + 1] ?? 0;

    if (current >= significantPeakThreshold && current >= previous && current >= next) {
      return lag;
    }
  }

  let fallbackLag: number | null = null;
  let fallbackCorrelation = -1;

  for (let lag = minLag; lag <= maxLag; lag += 1) {
    const correlation = correlations[lag] ?? 0;

    if (correlation > fallbackCorrelation) {
      fallbackCorrelation = correlation;
      fallbackLag = lag;
    }
  }

  return fallbackLag;
}

function subtractMean(pcm: Float32Array) {
  let total = 0;

  for (let index = 0; index < pcm.length; index += 1) {
    total += pcm[index] ?? 0;
  }

  const mean = total / pcm.length;

  return Float32Array.from(pcm, (sample) => sample - mean);
}

function getNormalizedCorrelation(pcm: Float32Array, lag: number) {
  let numerator = 0;
  let leftEnergy = 0;
  let rightEnergy = 0;

  for (let index = 0; index + lag < pcm.length; index += 1) {
    const left = pcm[index] ?? 0;
    const right = pcm[index + lag] ?? 0;
    numerator += left * right;
    leftEnergy += left * left;
    rightEnergy += right * right;
  }

  if (leftEnergy === 0 || rightEnergy === 0) {
    return 0;
  }

  return numerator / Math.sqrt(leftEnergy * rightEnergy);
}

function refineLag(lag: number, correlations: Float32Array) {
  const previous = correlations[lag - 1] ?? correlations[lag] ?? 0;
  const current = correlations[lag] ?? 0;
  const next = correlations[lag + 1] ?? correlations[lag] ?? 0;
  const denominator = previous - 2 * current + next;

  if (Math.abs(denominator) < 0.000_001) {
    return lag;
  }

  return lag + (previous - next) / (2 * denominator);
}

function toNearestNote(frequency: number): NoteValue | null {
  const midiNote = Math.round(69 + 12 * Math.log2(frequency / 440));

  if (midiNote < minMidiNote || midiNote > maxMidiNote) {
    return null;
  }

  const octave = Math.floor(midiNote / 12) - 1;
  const noteName = noteNames[midiNote % 12];

  return `${noteName}${octave}` as NoteValue;
}
