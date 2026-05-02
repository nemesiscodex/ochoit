import type { TransportConfig } from "../core/transport-worklet-shared.js";
import { getFrequencyForNote } from "../core/note-frequency.js";
import type { SongDocument, TriangleTrack } from "../core/song-document.js";

const triangleCycleFrameCount = 2048;
const noteAttackSeconds = 0.002;
const noteReleaseSeconds = 0.02;
const sourceStopPaddingSeconds = 0.01;
const silentGainFloor = 0.0001;
export const TRIANGLE_OUTPUT_GAIN = 1.7;
type ActiveTriangleNote = {
  source: AudioBufferSourceNode;
  gain: GainNode;
  releaseLevel: number;
};
const authenticTriangleSequence = [
  15, 14, 13, 12, 11, 10, 9, 8,
  7, 6, 5, 4, 3, 2, 1, 0,
  0, 1, 2, 3, 4, 5, 6, 7,
  8, 9, 10, 11, 12, 13, 14, 15,
] as const;

export function getTriangleOutputGain(volume: number) {
  return Math.min(1, volume * TRIANGLE_OUTPUT_GAIN);
}

export function createTriangleCycle(
  frameCount = triangleCycleFrameCount,
  engineMode: SongDocument["meta"]["engineMode"] = "inspired",
) {
  if (engineMode === "authentic") {
    return createAuthenticTriangleCycle(frameCount);
  }

  return createInspiredTriangleCycle(frameCount);
}

function createInspiredTriangleCycle(frameCount: number) {
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

function createAuthenticTriangleCycle(frameCount: number) {
  const waveform = new Float32Array(frameCount);

  for (let index = 0; index < frameCount; index += 1) {
    const sequenceIndex = Math.floor((index / frameCount) * authenticTriangleSequence.length) % authenticTriangleSequence.length;
    const level = authenticTriangleSequence[sequenceIndex] ?? 0;
    waveform[index] = (level / 15) * 2 - 1;
  }

  return waveform;
}

export class TriangleVoice {
  private track: TriangleTrack | null = null;
  private stepDuration = 0.125;
  private engineMode: SongDocument["meta"]["engineMode"] = "inspired";
  private readonly waveBufferByMode = new Map<SongDocument["meta"]["engineMode"], AudioBuffer>();

  constructor(
    private readonly context: AudioContext,
    private readonly output: AudioNode,
  ) {}

  configure(
    track: TriangleTrack,
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
    const noteEndTime = time + noteDuration;
    const releaseStartTime = Math.max(time + noteAttackSeconds, noteEndTime - noteReleaseSeconds);
    const outputGain = getTriangleOutputGain(step.volume);

    const activeNote = this.startNote(step.note, outputGain, time);
    activeNote.gain.gain.setValueAtTime(outputGain, releaseStartTime);
    activeNote.gain.gain.linearRampToValueAtTime(silentGainFloor, noteEndTime);
    activeNote.source.stop(noteEndTime + sourceStopPaddingSeconds);
  }

  startSustainedPreviewNote(note: string, volume = 0.25) {
    const activeNote = this.startNote(note, getTriangleOutputGain(volume), this.context.currentTime);

    return () => {
      this.releaseNote(activeNote, this.context.currentTime);
    };
  }

  private getWaveBuffer() {
    const cachedBuffer = this.waveBufferByMode.get(this.engineMode);

    if (cachedBuffer !== undefined) {
      return cachedBuffer;
    }

    const buffer = this.context.createBuffer(1, triangleCycleFrameCount, this.context.sampleRate);
    const channel = buffer.getChannelData(0);
    channel.set(createTriangleCycle(triangleCycleFrameCount, this.engineMode));
    this.waveBufferByMode.set(this.engineMode, buffer);
    return buffer;
  }

  private startNote(note: string, outputGain: number, time: number): ActiveTriangleNote {
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    const buffer = this.getWaveBuffer();
    const playbackRate = (getFrequencyForNote(note) * buffer.length) / buffer.sampleRate;

    source.buffer = buffer;
    source.loop = true;
    source.playbackRate.setValueAtTime(playbackRate, time);

    gain.gain.cancelScheduledValues(time);
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(outputGain, time + noteAttackSeconds);

    source.connect(gain);
    gain.connect(this.output);

    source.onended = () => {
      source.disconnect();
      gain.disconnect();
    };

    source.start(time);

    return {
      source,
      gain,
      releaseLevel: outputGain,
    };
  }

  private releaseNote(activeNote: ActiveTriangleNote, time: number) {
    activeNote.gain.gain.cancelScheduledValues(time);
    activeNote.gain.gain.setValueAtTime(activeNote.releaseLevel, time);
    activeNote.gain.gain.linearRampToValueAtTime(silentGainFloor, time + noteReleaseSeconds);
    activeNote.source.stop(time + noteReleaseSeconds + sourceStopPaddingSeconds);
  }
}
