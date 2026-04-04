import type { TransportConfig } from "../core/transport-worklet-shared.js";
import type { NoiseTrack } from "../core/song-document.js";

const noiseCycleFrameCount = 2048;
const noteAttackSeconds = 0.001;
const noteReleaseSeconds = 0.014;
const sourceStopPaddingSeconds = 0.01;
const silentGainFloor = 0.0001;

const noisePeriodTable = [4, 8, 16, 32, 64, 96, 128, 160, 202, 254, 380, 508, 762, 1016, 2034, 4068] as const;
const referenceNoisePeriod = noisePeriodTable[3];

export function getNoisePlaybackRate(periodIndex: number) {
  const period = noisePeriodTable[periodIndex];

  if (period === undefined) {
    throw new Error(`Invalid noise period index "${periodIndex}".`);
  }

  return referenceNoisePeriod / period;
}

export function createNoiseCycle(mode: NoiseTrack["steps"][number]["mode"], frameCount = noiseCycleFrameCount) {
  const waveform = new Float32Array(frameCount);
  let shiftRegister = 1;
  const tapOffset = mode === "short" ? 6 : 1;

  for (let index = 0; index < frameCount; index += 1) {
    waveform[index] = (shiftRegister & 1) === 0 ? 1 : -1;

    const feedback = ((shiftRegister & 1) ^ ((shiftRegister >> tapOffset) & 1)) & 1;
    shiftRegister = (shiftRegister >> 1) | (feedback << 14);
  }

  return waveform;
}

export class NoiseVoice {
  private track: NoiseTrack | null = null;
  private stepDuration = 0.125;
  private readonly waveBufferByMode = new Map<NoiseTrack["steps"][number]["mode"], AudioBuffer>();

  constructor(
    private readonly context: AudioContext,
    private readonly output: AudioNode,
  ) {}

  configure(track: NoiseTrack, transport: TransportConfig) {
    this.track = track;
    this.stepDuration = 60 / transport.bpm / transport.stepsPerBeat;
  }

  scheduleStep(stepIndex: number, time: number) {
    if (this.track === null || this.track.muted) {
      return;
    }

    const step = this.track.steps[stepIndex];

    if (step === undefined || !step.enabled) {
      return;
    }

    this.playStep(step, time, this.stepDuration);
  }

  previewStep(step: Pick<NoiseTrack["steps"][number], "volume" | "mode" | "periodIndex">, durationMs = 120) {
    this.playStep(step, this.context.currentTime, durationMs / 1000);
  }

  private getWaveBuffer(mode: NoiseTrack["steps"][number]["mode"]) {
    const cachedBuffer = this.waveBufferByMode.get(mode);

    if (cachedBuffer !== undefined) {
      return cachedBuffer;
    }

    const buffer = this.context.createBuffer(1, noiseCycleFrameCount, this.context.sampleRate);
    const channel = buffer.getChannelData(0);
    channel.set(createNoiseCycle(mode, noiseCycleFrameCount));
    this.waveBufferByMode.set(mode, buffer);
    return buffer;
  }

  private playStep(
    step: Pick<NoiseTrack["steps"][number], "volume" | "mode" | "periodIndex">,
    time: number,
    durationSeconds: number,
  ) {
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    const buffer = this.getWaveBuffer(step.mode);
    const noteDuration = Math.max(durationSeconds - noteAttackSeconds, noteAttackSeconds);
    const noteEndTime = time + noteDuration;
    const releaseStartTime = Math.max(time + noteAttackSeconds, noteEndTime - noteReleaseSeconds);

    source.buffer = buffer;
    source.loop = true;
    source.playbackRate.setValueAtTime(getNoisePlaybackRate(step.periodIndex), time);

    gain.gain.cancelScheduledValues(time);
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(step.volume, time + noteAttackSeconds);
    gain.gain.setValueAtTime(step.volume, releaseStartTime);
    gain.gain.linearRampToValueAtTime(silentGainFloor, noteEndTime);

    source.connect(gain);
    gain.connect(this.output);

    source.onended = () => {
      source.disconnect();
      gain.disconnect();
    };

    source.start(time);
    source.stop(noteEndTime + sourceStopPaddingSeconds);
  }
}
