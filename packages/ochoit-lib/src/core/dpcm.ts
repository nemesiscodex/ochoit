const dpcmStepDelta = 2;
const maxDpcmLevel = 127;
const minDpcmLevel = 0;
const legacyPlaybackRateThreshold = 4;

export const dpcmRatePresets = [
  { value: 4_181, label: "4.2k" },
  { value: 4_709, label: "4.7k" },
  { value: 5_265, label: "5.3k" },
  { value: 5_593, label: "5.6k" },
  { value: 6_257, label: "6.3k" },
  { value: 7_046, label: "7.0k" },
  { value: 7_919, label: "7.9k" },
  { value: 8_363, label: "8.4k" },
  { value: 9_419, label: "9.4k" },
  { value: 11_186, label: "11.2k" },
  { value: 12_604, label: "12.6k" },
  { value: 13_982, label: "14.0k" },
  { value: 16_884, label: "16.9k" },
  { value: 21_307, label: "21.3k" },
  { value: 24_858, label: "24.9k" },
  { value: 33_143, label: "33.1k" },
] as const;

export const defaultDpcmRate = 11_186;

type DpcmRatePreset = (typeof dpcmRatePresets)[number];

export type EncodedDpcmSample = {
  bytes: Uint8Array;
  decodedPcm: Float32Array;
  initialLevel: number;
  sampleRate: number;
};

export function normalizeDpcmRate(playbackRate: number) {
  const targetRate =
    Number.isFinite(playbackRate) && playbackRate > 0
      ? playbackRate <= legacyPlaybackRateThreshold
        ? defaultDpcmRate * playbackRate
        : playbackRate
      : defaultDpcmRate;

  return getClosestDpcmRatePreset(targetRate).value;
}

export function formatDpcmRateLabel(playbackRate: number) {
  return `${getClosestDpcmRatePreset(normalizeDpcmRate(playbackRate)).label}Hz`;
}

export function encodeSampleToDpcm(
  pcm: ArrayLike<number>,
  inputSampleRate: number,
  playbackRate: number,
): EncodedDpcmSample {
  const sampleRate = normalizeDpcmRate(playbackRate);
  const resampled = resamplePcm(pcm, inputSampleRate, sampleRate);
  const silentThreshold = dpcmStepDelta / maxDpcmLevel;

  if (resampled.length === 1 && Math.abs(resampled[0] ?? 0) <= silentThreshold) {
    return {
      bytes: new Uint8Array([0]),
      decodedPcm: new Float32Array([0]),
      initialLevel: quantizeLevel(0),
      sampleRate,
    };
  }

  const initialLevel = quantizeLevel(resampled[0] ?? 0);
  const decodedPcm = new Float32Array(resampled.length);
  const bytes = new Uint8Array(Math.max(1, Math.ceil(resampled.length / 8)));
  let level = initialLevel;

  for (let index = 0; index < resampled.length; index += 1) {
    const desiredSample = clampSample(resampled[index] ?? 0);
    const currentSample = decodeDpcmLevel(level);
    const difference = desiredSample - currentSample;
    const bit = difference > silentThreshold ? 1 : difference < -silentThreshold ? 0 : null;

    if (bit !== null) {
      level = clampDpcmLevel(level + (bit === 1 ? dpcmStepDelta : -dpcmStepDelta));
      const byteIndex = index >> 3;
      bytes[byteIndex] = (bytes[byteIndex] ?? 0) | (bit << (index & 7));
    }

    decodedPcm[index] = decodeDpcmLevel(level);
  }

  return {
    bytes,
    decodedPcm,
    initialLevel,
    sampleRate,
  };
}

function getClosestDpcmRatePreset(playbackRate: number): DpcmRatePreset {
  return dpcmRatePresets.reduce((closestPreset, preset) =>
    Math.abs(preset.value - playbackRate) < Math.abs(closestPreset.value - playbackRate) ? preset : closestPreset,
  );
}

function resamplePcm(pcm: ArrayLike<number>, inputSampleRate: number, outputSampleRate: number) {
  if (pcm.length === 0 || !Number.isFinite(inputSampleRate) || inputSampleRate <= 0) {
    return new Float32Array([0]);
  }

  if (!Number.isFinite(outputSampleRate) || outputSampleRate <= 0) {
    return Float32Array.from(pcm, (sample) => clampSample(sample));
  }

  const targetLength = Math.max(1, Math.round((pcm.length / inputSampleRate) * outputSampleRate));

  return Float32Array.from({ length: targetLength }, (_, index) => {
    if (targetLength === 1 || pcm.length === 1) {
      return clampSample(pcm[0] ?? 0);
    }

    const sourcePosition = (index * (pcm.length - 1)) / Math.max(1, targetLength - 1);
    const leftIndex = Math.floor(sourcePosition);
    const rightIndex = Math.min(pcm.length - 1, leftIndex + 1);
    const mix = sourcePosition - leftIndex;
    const leftSample = clampSample(pcm[leftIndex] ?? 0);
    const rightSample = clampSample(pcm[rightIndex] ?? leftSample);

    return leftSample + (rightSample - leftSample) * mix;
  });
}

function quantizeLevel(sample: number) {
  return clampDpcmLevel(Math.round(((clampSample(sample) + 1) * maxDpcmLevel) / 2));
}

function decodeDpcmLevel(level: number) {
  return (clampDpcmLevel(level) / maxDpcmLevel) * 2 - 1;
}

function clampDpcmLevel(level: number) {
  return Math.max(minDpcmLevel, Math.min(maxDpcmLevel, Math.round(level)));
}

function clampSample(sample: number) {
  return Math.max(-1, Math.min(1, sample));
}
