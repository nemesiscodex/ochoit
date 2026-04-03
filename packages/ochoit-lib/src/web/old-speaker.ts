const oldSpeakerHighPassQ = 0.707;
const oldSpeakerLowPassQ = 0.707;

export const OLD_SPEAKER_HIGH_PASS_FREQUENCY = 220;
export const OLD_SPEAKER_LOW_PASS_FREQUENCY = 3600;

export function configureOldSpeakerFilters(highPass: BiquadFilterNode, lowPass: BiquadFilterNode) {
  highPass.type = "highpass";
  highPass.frequency.value = OLD_SPEAKER_HIGH_PASS_FREQUENCY;
  highPass.Q.value = oldSpeakerHighPassQ;

  lowPass.type = "lowpass";
  lowPass.frequency.value = OLD_SPEAKER_LOW_PASS_FREQUENCY;
  lowPass.Q.value = oldSpeakerLowPassQ;
}

export function applyOldSpeakerEffect(pcm: Float32Array, sampleRate: number) {
  if (pcm.length === 0 || !Number.isFinite(sampleRate) || sampleRate <= 0) {
    return pcm;
  }

  const highPassed = applyOnePoleHighPass(pcm, OLD_SPEAKER_HIGH_PASS_FREQUENCY, sampleRate);
  const filtered = applyOnePoleLowPass(highPassed, OLD_SPEAKER_LOW_PASS_FREQUENCY, sampleRate);
  pcm.set(filtered);
  return pcm;
}

function applyOnePoleLowPass(input: Float32Array, cutoffFrequency: number, sampleRate: number) {
  const cutoff = clampCutoffFrequency(cutoffFrequency, sampleRate);
  const dt = 1 / sampleRate;
  const rc = 1 / (2 * Math.PI * cutoff);
  const alpha = dt / (rc + dt);
  const output = new Float32Array(input.length);
  let previous = input[0] ?? 0;

  for (let index = 0; index < input.length; index += 1) {
    const sample = input[index] ?? 0;
    previous += alpha * (sample - previous);
    output[index] = previous;
  }

  return output;
}

function applyOnePoleHighPass(input: Float32Array, cutoffFrequency: number, sampleRate: number) {
  const cutoff = clampCutoffFrequency(cutoffFrequency, sampleRate);
  const dt = 1 / sampleRate;
  const rc = 1 / (2 * Math.PI * cutoff);
  const alpha = rc / (rc + dt);
  const output = new Float32Array(input.length);
  let previousInput = input[0] ?? 0;
  let previousOutput = 0;

  for (let index = 0; index < input.length; index += 1) {
    const sample = input[index] ?? 0;
    const nextOutput = alpha * (previousOutput + sample - previousInput);
    output[index] = nextOutput;
    previousInput = sample;
    previousOutput = nextOutput;
  }

  return output;
}

function clampCutoffFrequency(cutoffFrequency: number, sampleRate: number) {
  const nyquistLimit = Math.max(40, sampleRate / 2 - 10);
  return Math.min(Math.max(20, cutoffFrequency), nyquistLimit);
}
