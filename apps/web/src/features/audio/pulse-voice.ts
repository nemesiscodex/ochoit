import type { TransportConfig } from "@/features/audio/transport-worklet-shared";
import { getFrequencyForNote } from "@/features/audio/note-frequency";
import type { PulseTrack, SongDocument } from "@/features/song/song-document";

const pulseCycleFrameCount = 2048;
const noteAttackSeconds = 0.002;
const noteReleaseSeconds = 0.016;
const sourceStopPaddingSeconds = 0.01;
const silentGainFloor = 0.0001;

type PulseDuty = PulseTrack["steps"][number]["duty"];

const dutyThresholdByFrameCount = new Map<string, number>();
const authenticPulseSequenceByDuty: Record<PulseDuty, readonly number[]> = {
  0.125: [0, 1, 0, 0, 0, 0, 0, 0],
  0.25: [0, 1, 1, 0, 0, 0, 0, 0],
  0.5: [0, 1, 1, 1, 1, 0, 0, 0],
  0.75: [1, 0, 0, 1, 1, 1, 1, 1],
};

export function createPulseCycle(
  duty: PulseDuty,
  frameCount = pulseCycleFrameCount,
  engineMode: SongDocument["meta"]["engineMode"] = "inspired",
) {
  if (engineMode === "authentic") {
    return createAuthenticPulseCycle(duty, frameCount);
  }

  return createInspiredPulseCycle(duty, frameCount);
}

function createInspiredPulseCycle(duty: PulseDuty, frameCount: number) {
  const waveform = new Float32Array(frameCount);
  const threshold = getDutyThreshold(duty, frameCount);

  for (let index = 0; index < frameCount; index += 1) {
    waveform[index] = index < threshold ? 1 : -1;
  }

  return waveform;
}

function createAuthenticPulseCycle(duty: PulseDuty, frameCount: number) {
  const waveform = new Float32Array(frameCount);
  const sequence = authenticPulseSequenceByDuty[duty];
  const averageLevel = sequence.reduce((sum, level) => sum + level, 0) / sequence.length;

  for (let index = 0; index < frameCount; index += 1) {
    const sequenceIndex = Math.floor((index / frameCount) * sequence.length) % sequence.length;
    const level = sequence[sequenceIndex] ?? 0;
    waveform[index] = level - averageLevel;
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
  private engineMode: SongDocument["meta"]["engineMode"] = "inspired";
  private readonly waveBufferByDutyAndMode = new Map<string, AudioBuffer>();

  constructor(
    private readonly context: AudioContext,
    private readonly output: AudioNode,
  ) {}

  configure(
    track: PulseTrack,
    transport: TransportConfig,
    engineMode: SongDocument["meta"]["engineMode"] = "inspired",
  ) {
    this.track = track;
    this.stepDuration = 60 / transport.bpm / transport.stepsPerBeat;
    this.engineMode = engineMode;
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
    const cacheKey = `${this.engineMode}:${duty}`;
    const cachedBuffer = this.waveBufferByDutyAndMode.get(cacheKey);

    if (cachedBuffer !== undefined) {
      return cachedBuffer;
    }

    const buffer = this.context.createBuffer(1, pulseCycleFrameCount, this.context.sampleRate);
    const channel = buffer.getChannelData(0);
    channel.set(createPulseCycle(duty, pulseCycleFrameCount, this.engineMode));
    this.waveBufferByDutyAndMode.set(cacheKey, buffer);
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
