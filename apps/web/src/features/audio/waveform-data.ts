import { trackOrder, type TrackId } from "@/features/song/song-document";

export const WAVEFORM_SAMPLE_SIZE = 256;
const defaultMidpoint = 128;

const previewLevelsByTrackId: Record<TrackId, readonly number[]> = {
  pulse1: [18, 18, 18, 7, 7, 18, 18, 18, 7, 7, 18, 18],
  pulse2: [16, 16, 8, 8, 16, 16, 8, 8, 16, 16, 8, 8],
  triangle: [4, 8, 12, 16, 20, 16, 12, 8, 4, 8, 12, 16],
  noise: [5, 16, 8, 20, 7, 14, 11, 19, 6, 17, 9, 15],
  sample: [3, 9, 18, 13, 7, 17, 10, 5, 14, 8, 12, 4],
};

function clampByte(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

export function createFlatWaveform(sampleSize = WAVEFORM_SAMPLE_SIZE, midpoint = defaultMidpoint) {
  const waveform = new Uint8Array(sampleSize);
  waveform.fill(clampByte(midpoint));
  return waveform;
}

export function createPreviewWaveform(levels: readonly number[], sampleSize = WAVEFORM_SAMPLE_SIZE) {
  if (levels.length === 0) {
    return createFlatWaveform(sampleSize);
  }

  const maxLevel = Math.max(...levels, 1);
  const lastLevelIndex = levels.length - 1;

  return Uint8Array.from({ length: sampleSize }, (_, sampleIndex) => {
    const progress = sampleSize === 1 ? 0 : sampleIndex / (sampleSize - 1);
    const scaledIndex = progress * lastLevelIndex;
    const lowerIndex = Math.floor(scaledIndex);
    const upperIndex = Math.min(lastLevelIndex, lowerIndex + 1);
    const mix = scaledIndex - lowerIndex;
    const interpolatedLevel =
      levels[lowerIndex] + (levels[upperIndex] - levels[lowerIndex]) * mix;
    const amplitude = (interpolatedLevel / maxLevel) * 92;
    const phase = progress * Math.PI * 6;

    return clampByte(defaultMidpoint + Math.sin(phase) * amplitude);
  });
}

export const previewWaveformByTrackId = Object.fromEntries(
  trackOrder.map((trackId) => [trackId, createPreviewWaveform(previewLevelsByTrackId[trackId])]),
) as Record<TrackId, Uint8Array>;

export const sampleDeckPreviewWaveform = createPreviewWaveform(previewLevelsByTrackId.sample, 192);
