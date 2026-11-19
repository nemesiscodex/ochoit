import type { TrackId } from "ochoit-lib";

export const WAVEFORM_SAMPLE_SIZE = 256;
const defaultMidpoint = 128;
const traceAmplitude = 90;
const triangleLevelCount = 16;
const noiseHoldSamples = 8;
const noiseSeed = 0b101_1001_1100_0101;

function clampByte(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function traceByte(level: number) {
  return clampByte(defaultMidpoint + level * traceAmplitude);
}

function createTrace(sampleSize: number, levelAt: (progress: number, sampleIndex: number) => number) {
  return Uint8Array.from({ length: sampleSize }, (_, sampleIndex) =>
    traceByte(levelAt(sampleIndex / sampleSize, sampleIndex)),
  );
}

export function createFlatWaveform(sampleSize = WAVEFORM_SAMPLE_SIZE, midpoint = defaultMidpoint) {
  const waveform = new Uint8Array(sampleSize);
  waveform.fill(clampByte(midpoint));
  return waveform;
}

function createPulseTrace(duty: number, periods: number, sampleSize = WAVEFORM_SAMPLE_SIZE) {
  return createTrace(sampleSize, (progress) => ((progress * periods) % 1 < duty ? 1 : -1));
}

function createTriangleTrace(periods: number, sampleSize = WAVEFORM_SAMPLE_SIZE) {
  const topLevel = triangleLevelCount - 1;

  return createTrace(sampleSize, (progress) => {
    const phase = (progress * periods) % 1;
    const step = Math.round((1 - Math.abs(2 * phase - 1)) * topLevel);
    return (step / topLevel) * 2 - 1;
  });
}

// The NES noise channel's 15-bit LFSR (feedback from bits 0 and 1), read four bits at a time so each held step
// lands on one of 16 levels. A fixed seed keeps the idle trace identical on every render.
function createNoiseTrace(sampleSize = WAVEFORM_SAMPLE_SIZE) {
  let register = noiseSeed;
  let level = 0;

  const clockLevel = () => {
    for (let clock = 0; clock < 4; clock += 1) {
      const feedback = (register ^ (register >> 1)) & 1;
      register = (register >> 1) | (feedback << 14);
    }

    return ((register & 0b1111) / 15) * 2 - 1;
  };

  return createTrace(sampleSize, (_, sampleIndex) => {
    if (sampleIndex % noiseHoldSamples === 0) {
      level = clockLevel();
    }

    return level;
  });
}

function createSampleBurstTrace() {
  return createTrace(WAVEFORM_SAMPLE_SIZE, (progress) => {
    const angle = progress * Math.PI * 2 * 7;
    const tone = (Math.sin(angle) + 0.35 * Math.sin(angle * 2.6)) / 1.1;
    return tone * Math.exp(-3 * progress);
  });
}

export const previewWaveformByTrackId: Record<TrackId, Uint8Array> = {
  pulse1: createPulseTrace(0.25, 4),
  pulse2: createPulseTrace(0.5, 4),
  triangle: createTriangleTrace(3),
  noise: createNoiseTrace(),
  sample: createSampleBurstTrace(),
};
