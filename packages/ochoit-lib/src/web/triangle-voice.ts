import type { TransportConfig } from "../core/transport-worklet-shared";
import { getFrequencyForNote } from "../core/note-frequency";
import type { TriangleTrack } from "../core/song-document";

const triangleCycleFrameCount = 2048;
const noteAttackSeconds = 0.002;
const noteReleaseSeconds = 0.02;
const sourceStopPaddingSeconds = 0.01;
const silentGainFloor = 0.0001;
export const TRIANGLE_OUTPUT_GAIN = 1.7;

export function getTriangleOutputGain(volume: number) {
  return Math.min(1, volume * TRIANGLE_OUTPUT_GAIN);
}

export function createTriangleCycle(frameCount = triangleCycleFrameCount) {
  const waveform = new Float32Array(frameCount);

  for (let index = 0; index < frameCount; index += 1) {
    const phase = index / frameCount;

    if (phase < 0.25) {
      waveform[index] = phase * 4;
      continue;
    }

    if (phase < 0.75) {
      waveform[index] = 2 - phase * 4;
      continue;
    }

    waveform[index] = phase * 4 - 4;
  }

  return waveform;
}

export class TriangleVoice {
  private track: TriangleTrack | null = null;
  private stepDuration = 0.125;
  private waveBuffer: AudioBuffer | null = null;

  constructor(
    private readonly context: AudioContext,
    private readonly output: AudioNode,
  ) {}

  configure(track: TriangleTrack, transport: TransportConfig) {
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

    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    const buffer = this.getWaveBuffer();
    const noteDuration = Math.max(this.stepDuration * step.length - noteAttackSeconds, noteAttackSeconds);
    const noteEndTime = time + noteDuration;
    const releaseStartTime = Math.max(time + noteAttackSeconds, noteEndTime - noteReleaseSeconds);
    const playbackRate = (getFrequencyForNote(step.note) * buffer.length) / buffer.sampleRate;

    source.buffer = buffer;
    source.loop = true;
    source.playbackRate.setValueAtTime(playbackRate, time);

    gain.gain.cancelScheduledValues(time);
    gain.gain.setValueAtTime(0, time);
    const outputGain = getTriangleOutputGain(step.volume);

    gain.gain.linearRampToValueAtTime(outputGain, time + noteAttackSeconds);
    gain.gain.setValueAtTime(outputGain, releaseStartTime);
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

  private getWaveBuffer() {
    if (this.waveBuffer !== null) {
      return this.waveBuffer;
    }

    const buffer = this.context.createBuffer(1, triangleCycleFrameCount, this.context.sampleRate);
    const channel = buffer.getChannelData(0);
    channel.set(createTriangleCycle(triangleCycleFrameCount));
    this.waveBuffer = buffer;
    return buffer;
  }
}
