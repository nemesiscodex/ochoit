import type { TransportConfig } from "@/features/audio/transport-worklet-shared";
import type { PulseTrack } from "@/features/song/song-document";

const pulseCycleFrameCount = 2048;
const noteAttackSeconds = 0.002;
const noteReleaseSeconds = 0.016;
const sourceStopPaddingSeconds = 0.01;
const silentGainFloor = 0.0001;

const semitoneByNoteName = {
  C: 0,
  "C#": 1,
  Db: 1,
  D: 2,
  "D#": 3,
  Eb: 3,
  E: 4,
  F: 5,
  "F#": 6,
  Gb: 6,
  G: 7,
  "G#": 8,
  Ab: 8,
  A: 9,
  "A#": 10,
  Bb: 10,
  B: 11,
} as const satisfies Record<string, number>;

type PulseDuty = PulseTrack["steps"][number]["duty"];

const dutyThresholdByFrameCount = new Map<string, number>();

export function getFrequencyForNote(note: string) {
  const match = /^([A-G](?:#|b)?)([0-8])$/.exec(note);

  if (match === null) {
    throw new Error(`Invalid note "${note}".`);
  }

  const [, noteName, octaveValue] = match;
  const semitone = semitoneByNoteName[noteName as keyof typeof semitoneByNoteName];

  if (semitone === undefined) {
    throw new Error(`Unsupported note "${note}".`);
  }

  const octave = Number(octaveValue);
  const midiNote = (octave + 1) * 12 + semitone;
  return 440 * 2 ** ((midiNote - 69) / 12);
}

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

    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    const buffer = this.getWaveBuffer(step.duty);
    const noteDuration = Math.max(this.stepDuration - noteAttackSeconds, noteAttackSeconds);
    const noteEndTime = time + noteDuration;
    const releaseStartTime = Math.max(time + noteAttackSeconds, noteEndTime - noteReleaseSeconds);
    const playbackRate = (getFrequencyForNote(step.note) * buffer.length) / buffer.sampleRate;

    source.buffer = buffer;
    source.loop = true;
    source.playbackRate.setValueAtTime(playbackRate, time);

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
}
