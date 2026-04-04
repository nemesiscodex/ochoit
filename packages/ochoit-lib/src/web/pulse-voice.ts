import type { TransportConfig } from "../core/transport-worklet-shared.js";
import { getFrequencyForNote } from "../core/note-frequency.js";
import type { PulseTrack } from "../core/song-document.js";

const pulseCycleFrameCount = 2048;
const noteAttackSeconds = 0.002;
const noteReleaseSeconds = 0.016;
const sourceStopPaddingSeconds = 0.01;
const silentGainFloor = 0.0001;

type PulseDuty = PulseTrack["steps"][number]["duty"];

const dutyThresholdByFrameCount = new Map<string, number>();

export function createPulseCycle(duty: PulseDuty, frameCount = pulseCycleFrameCount) {
  const waveform = new Float32Array(frameCount);
  const threshold = getDutyThreshold(duty, frameCount);

  for (let index = 0; index < frameCount; index += 1) {
    waveform[index] = index < threshold ? 1 : -1;
  }

  return waveform;
}

function getDutyThreshold(duty: PulseDuty, frameCount: number) {
  const cacheKey = `${duty}:${frameCount}`;
  const cachedThreshold = dutyThresholdByFrameCount.get(cacheKey);

  if (cachedThreshold !== undefined) {
    return cachedThreshold;
  }

  const threshold = Math.max(1, Math.round(frameCount * duty));
  dutyThresholdByFrameCount.set(cacheKey, threshold);
  return threshold;
}

export class PulseVoice {
  private track: PulseTrack | null = null;
  private stepDuration = 0.125;
  private readonly waveBufferByDuty = new Map<PulseDuty, AudioBuffer>();

  constructor(
    private readonly context: AudioContext,
    private readonly output: AudioNode,
  ) {}

  configure(track: PulseTrack, transport: TransportConfig) {
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

    const noteDuration = Math.max(this.stepDuration * step.length - noteAttackSeconds, noteAttackSeconds);
    this.playNote(step.note, step.duty, step.volume, time, noteDuration);
  }

  previewNote(note: string, duty: PulseDuty, durationMs = 120, volume = 0.25) {
    this.playNote(note, duty, volume, this.context.currentTime, durationMs / 1000);
  }

  private getWaveBuffer(duty: PulseDuty) {
    const cachedBuffer = this.waveBufferByDuty.get(duty);

    if (cachedBuffer !== undefined) {
      return cachedBuffer;
    }

    const buffer = this.context.createBuffer(1, pulseCycleFrameCount, this.context.sampleRate);
    const channel = buffer.getChannelData(0);
    channel.set(createPulseCycle(duty, pulseCycleFrameCount));
    this.waveBufferByDuty.set(duty, buffer);
    return buffer;
  }

  private playNote(note: string, duty: PulseDuty, volume: number, time: number, durationSeconds: number) {
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    const buffer = this.getWaveBuffer(duty);
    const noteDuration = Math.max(durationSeconds, noteAttackSeconds);
    const noteEndTime = time + noteDuration;
    const releaseStartTime = Math.max(time + noteAttackSeconds, noteEndTime - noteReleaseSeconds);
    const playbackRate = (getFrequencyForNote(note) * buffer.length) / buffer.sampleRate;

    source.buffer = buffer;
    source.loop = true;
    source.playbackRate.setValueAtTime(playbackRate, time);

    gain.gain.cancelScheduledValues(time);
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(volume, time + noteAttackSeconds);
    gain.gain.setValueAtTime(volume, releaseStartTime);
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
