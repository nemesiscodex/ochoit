import { applyOldSpeakerEffect } from "@/features/audio/old-speaker";
import { getFrequencyForNote } from "@/features/audio/note-frequency";
import { createNoiseCycle, getNoisePlaybackRate } from "@/features/audio/noise-voice";
import { createPulseCycle } from "@/features/audio/pulse-voice";
import { createTriangleCycle, getTriangleOutputGain } from "@/features/audio/triangle-voice";
import { getTrimmedSamplePcm } from "@/features/song/song-samples";
import type {
  NoiseTrack,
  PulseTrack,
  SampleTrack,
  SerializedSampleAsset,
  SongDocument,
  TriangleTrack,
} from "@/features/song/song-document";

const defaultSongWavSampleRate = 44_100;
const pulseCycleFrameCount = 2048;
const triangleCycleFrameCount = 2048;
const noiseCycleFrameCount = 2048;
const pulseNoteAttackSeconds = 0.002;
const pulseNoteReleaseSeconds = 0.016;
const triangleNoteAttackSeconds = 0.002;
const triangleNoteReleaseSeconds = 0.02;
const noiseNoteAttackSeconds = 0.001;
const noiseNoteReleaseSeconds = 0.014;
const sampleNoteAttackSeconds = 0.001;
const sampleNoteReleaseSeconds = 0.012;
const silentGainFloor = 0.0001;
const defaultWavFileName = "ochoit-arrangement.wav";

const triangleCycle = createTriangleCycle(triangleCycleFrameCount);
const pulseCycleByDuty = new Map<PulseTrack["steps"][number]["duty"], Float32Array>();
const noiseCycleByMode = new Map<NoiseTrack["steps"][number]["mode"], Float32Array>();

export type RenderSongToPcmOptions = {
  sampleRate?: number;
};

export type RenderedSongPcm = {
  durationSeconds: number;
  pcm: Float32Array;
  sampleRate: number;
};

export function renderSongToPcm(song: SongDocument, options: RenderSongToPcmOptions = {}): RenderedSongPcm {
  const sampleRate = resolveSampleRate(options.sampleRate);
  const stepDurationSeconds = 60 / song.transport.bpm / song.transport.stepsPerBeat;
  const loopDurationSeconds = stepDurationSeconds * song.transport.loopLength;
  const totalDurationSeconds = Math.max(loopDurationSeconds, getSampleTailDuration(song, stepDurationSeconds));
  const totalFrameCount = Math.max(1, Math.ceil(totalDurationSeconds * sampleRate));
  const pcm = new Float32Array(totalFrameCount);

  renderPulseTrack(pcm, song.tracks.pulse1, song, stepDurationSeconds, sampleRate);
  renderPulseTrack(pcm, song.tracks.pulse2, song, stepDurationSeconds, sampleRate);
  renderTriangleTrack(pcm, song.tracks.triangle, song, stepDurationSeconds, sampleRate);
  renderNoiseTrack(pcm, song.tracks.noise, song, stepDurationSeconds, sampleRate);
  renderSampleTrack(pcm, song.tracks.sample, song, stepDurationSeconds, sampleRate);

  if (song.mixer.oldSpeakerMode) {
    applyOldSpeakerEffect(pcm, sampleRate);
  }

  return {
    durationSeconds: totalFrameCount / sampleRate,
    pcm,
    sampleRate,
  };
}

export function createSongWavBlob(song: SongDocument, options: RenderSongToPcmOptions = {}) {
  const renderedSong = renderSongToPcm(song, options);
  const wavBuffer = encodePcm16Wav(renderedSong.pcm, renderedSong.sampleRate);

  return new Blob([wavBuffer], { type: "audio/wav" });
}

export function createSongWavFileName(song: SongDocument) {
  const sanitizedBaseName = sanitizeFileNamePart(song.meta.name);

  if (sanitizedBaseName === "" || sanitizedBaseName === "no-name") {
    return defaultWavFileName;
  }

  return `${sanitizedBaseName}.wav`;
}

function renderPulseTrack(
  target: Float32Array,
  track: PulseTrack,
  song: SongDocument,
  stepDurationSeconds: number,
  sampleRate: number,
) {
  if (track.muted) {
    return;
  }

  for (let stepIndex = 0; stepIndex < track.steps.length; stepIndex += 1) {
    const step = track.steps[stepIndex];

    if (!step?.enabled) {
      continue;
    }

    const durationSeconds = Math.max(stepDurationSeconds * step.length - pulseNoteAttackSeconds, pulseNoteAttackSeconds);
    const cycle = getPulseCycle(step.duty);
    const phaseIncrement = (getFrequencyForNote(step.note) * cycle.length) / sampleRate;
    const gain = getTriangleOutputGain(song.mixer.masterVolume * track.volume * step.volume);

    mixCycleVoice(target, {
      attackSeconds: pulseNoteAttackSeconds,
      cycle,
      durationSeconds,
      gain,
      phaseIncrement,
      releaseSeconds: pulseNoteReleaseSeconds,
      sampleRate,
      startSeconds: stepIndex * stepDurationSeconds,
    });
  }
}

function renderTriangleTrack(
  target: Float32Array,
  track: TriangleTrack,
  song: SongDocument,
  stepDurationSeconds: number,
  sampleRate: number,
) {
  if (track.muted) {
    return;
  }

  for (let stepIndex = 0; stepIndex < track.steps.length; stepIndex += 1) {
    const step = track.steps[stepIndex];

    if (!step?.enabled) {
      continue;
    }

    const durationSeconds = Math.max(
      stepDurationSeconds * step.length - triangleNoteAttackSeconds,
      triangleNoteAttackSeconds,
    );
    const phaseIncrement = (getFrequencyForNote(step.note) * triangleCycle.length) / sampleRate;
    const gain = song.mixer.masterVolume * track.volume * step.volume;

    mixCycleVoice(target, {
      attackSeconds: triangleNoteAttackSeconds,
      cycle: triangleCycle,
      durationSeconds,
      gain,
      phaseIncrement,
      releaseSeconds: triangleNoteReleaseSeconds,
      sampleRate,
      startSeconds: stepIndex * stepDurationSeconds,
    });
  }
}

function renderNoiseTrack(
  target: Float32Array,
  track: NoiseTrack,
  song: SongDocument,
  stepDurationSeconds: number,
  sampleRate: number,
) {
  if (track.muted) {
    return;
  }

  for (let stepIndex = 0; stepIndex < track.steps.length; stepIndex += 1) {
    const step = track.steps[stepIndex];

    if (!step?.enabled) {
      continue;
    }

    const cycle = getNoiseCycle(step.mode);
    const gain = song.mixer.masterVolume * track.volume * step.volume;

    mixCycleVoice(target, {
      attackSeconds: noiseNoteAttackSeconds,
      cycle,
      durationSeconds: Math.max(stepDurationSeconds - noiseNoteAttackSeconds, noiseNoteAttackSeconds),
      gain,
      phaseIncrement: getNoisePlaybackRate(step.periodIndex),
      releaseSeconds: noiseNoteReleaseSeconds,
      sampleRate,
      startSeconds: stepIndex * stepDurationSeconds,
    });
  }
}

function renderSampleTrack(
  target: Float32Array,
  track: SampleTrack,
  song: SongDocument,
  stepDurationSeconds: number,
  outputSampleRate: number,
) {
  if (track.muted) {
    return;
  }

  const sampleById = new Map(song.samples.map((sample) => [sample.id, sample]));

  for (let stepIndex = 0; stepIndex < track.steps.length; stepIndex += 1) {
    const step = track.steps[stepIndex];

    if (!step?.enabled || step.sampleId === null) {
      continue;
    }

    const sample = sampleById.get(step.sampleId);

    if (sample === undefined) {
      continue;
    }

    const trimmedPcm = getTrimmedSamplePcm(sample);

    if (trimmedPcm.length === 0) {
      continue;
    }

    mixSampleVoice(target, {
      attackSeconds: sampleNoteAttackSeconds,
      gain: song.mixer.masterVolume * track.volume * step.volume,
      inputPcm: trimmedPcm,
      inputSampleRate: sample.sampleRate,
      outputSampleRate,
      playbackRate: getSamplePlaybackRate(step, sample, song.meta.engineMode),
      releaseSeconds: sampleNoteReleaseSeconds,
      startSeconds: stepIndex * stepDurationSeconds,
    });
  }
}

function mixCycleVoice(
  target: Float32Array,
  options: {
    attackSeconds: number;
    cycle: Float32Array;
    durationSeconds: number;
    gain: number;
    phaseIncrement: number;
    releaseSeconds: number;
    sampleRate: number;
    startSeconds: number;
  },
) {
  const startFrame = Math.max(0, Math.round(options.startSeconds * options.sampleRate));
  const frameCount = Math.max(1, Math.ceil(options.durationSeconds * options.sampleRate));
  const endFrame = Math.min(target.length, startFrame + frameCount);
  let phase = 0;

  for (let frame = startFrame; frame < endFrame; frame += 1) {
    const envelope = getEnvelopeGain(
      frame - startFrame,
      frameCount,
      options.attackSeconds,
      options.releaseSeconds,
      options.sampleRate,
    );
    target[frame] += getInterpolatedCycleSample(options.cycle, phase) * options.gain * envelope;
    phase = wrapPhase(phase + options.phaseIncrement, options.cycle.length);
  }
}

function mixSampleVoice(
  target: Float32Array,
  options: {
    attackSeconds: number;
    gain: number;
    inputPcm: readonly number[];
    inputSampleRate: number;
    outputSampleRate: number;
    playbackRate: number;
    releaseSeconds: number;
    startSeconds: number;
  },
) {
  if (!Number.isFinite(options.playbackRate) || options.playbackRate <= 0) {
    return;
  }

  const startFrame = Math.max(0, Math.round(options.startSeconds * options.outputSampleRate));
  const phaseIncrement = (options.inputSampleRate * options.playbackRate) / options.outputSampleRate;
  const durationSeconds = options.inputPcm.length / (options.inputSampleRate * options.playbackRate);
  const frameCount = Math.max(1, Math.ceil(durationSeconds * options.outputSampleRate));
  const endFrame = Math.min(target.length, startFrame + frameCount);
  let phase = 0;

  for (let frame = startFrame; frame < endFrame; frame += 1) {
    if (phase >= options.inputPcm.length) {
      break;
    }

    const envelope = getEnvelopeGain(
      frame - startFrame,
      frameCount,
      options.attackSeconds,
      options.releaseSeconds,
      options.outputSampleRate,
    );

    target[frame] += getInterpolatedPcmSample(options.inputPcm, phase) * options.gain * envelope;
    phase += phaseIncrement;
  }
}

function getEnvelopeGain(
  relativeFrame: number,
  frameCount: number,
  attackSeconds: number,
  releaseSeconds: number,
  sampleRate: number,
) {
  if (frameCount <= 1) {
    return 1;
  }

  const attackFrameCount = Math.max(1, Math.round(attackSeconds * sampleRate));
  const releaseFrameCount = Math.max(1, Math.round(releaseSeconds * sampleRate));
  const releaseStartFrame = Math.max(attackFrameCount, frameCount - releaseFrameCount);

  if (relativeFrame < attackFrameCount) {
    return relativeFrame / attackFrameCount;
  }

  if (relativeFrame < releaseStartFrame) {
    return 1;
  }

  const releaseProgress = (relativeFrame - releaseStartFrame) / Math.max(1, frameCount - releaseStartFrame);
  return 1 - releaseProgress * (1 - silentGainFloor);
}

function getPulseCycle(duty: PulseTrack["steps"][number]["duty"]) {
  const cachedCycle = pulseCycleByDuty.get(duty);

  if (cachedCycle !== undefined) {
    return cachedCycle;
  }

  const cycle = createPulseCycle(duty, pulseCycleFrameCount);
  pulseCycleByDuty.set(duty, cycle);
  return cycle;
}

function getNoiseCycle(mode: NoiseTrack["steps"][number]["mode"]) {
  const cachedCycle = noiseCycleByMode.get(mode);

  if (cachedCycle !== undefined) {
    return cachedCycle;
  }

  const cycle = createNoiseCycle(mode, noiseCycleFrameCount);
  noiseCycleByMode.set(mode, cycle);
  return cycle;
}

function getSampleTailDuration(song: SongDocument, stepDurationSeconds: number) {
  if (song.tracks.sample.muted) {
    return 0;
  }

  const sampleById = new Map(song.samples.map((sample) => [sample.id, sample]));
  let maxDurationSeconds = 0;

  for (let stepIndex = 0; stepIndex < song.tracks.sample.steps.length; stepIndex += 1) {
    const step = song.tracks.sample.steps[stepIndex];

    if (!step?.enabled || step.sampleId === null) {
      continue;
    }

    const sample = sampleById.get(step.sampleId);

    if (sample === undefined) {
      continue;
    }

    const trimmedFrameCount = getTrimmedSamplePcm(sample).length;

    if (trimmedFrameCount === 0) {
      continue;
    }

    const playbackRate = getSamplePlaybackRate(step, sample, song.meta.engineMode);

    if (!Number.isFinite(playbackRate) || playbackRate <= 0) {
      continue;
    }

    const stepTimeSeconds = stepIndex * stepDurationSeconds;
    const sampleDurationSeconds = trimmedFrameCount / (sample.sampleRate * playbackRate);
    maxDurationSeconds = Math.max(maxDurationSeconds, stepTimeSeconds + sampleDurationSeconds);
  }

  return maxDurationSeconds;
}

function getSamplePlaybackRate(
  step: SampleTrack["steps"][number],
  sample: SerializedSampleAsset,
  engineMode: SongDocument["meta"]["engineMode"],
) {
  if (engineMode === "authentic") {
    return step.playbackRate;
  }

  return getFrequencyForNote(step.note) / getFrequencyForNote(sample.baseNote);
}

function getInterpolatedCycleSample(cycle: Float32Array, phase: number) {
  const wrappedPhase = wrapPhase(phase, cycle.length);
  const leftIndex = Math.floor(wrappedPhase);
  const rightIndex = (leftIndex + 1) % cycle.length;
  const mix = wrappedPhase - leftIndex;
  const leftValue = cycle[leftIndex] ?? 0;
  const rightValue = cycle[rightIndex] ?? 0;

  return leftValue + (rightValue - leftValue) * mix;
}

function getInterpolatedPcmSample(values: ArrayLike<number>, phase: number) {
  const length = values.length;

  if (length === 0) {
    return 0;
  }

  const leftIndex = Math.floor(phase);

  if (leftIndex >= length - 1) {
    return values[Math.max(0, Math.min(length - 1, leftIndex))] ?? 0;
  }

  const rightIndex = leftIndex + 1;
  const mix = phase - leftIndex;
  const leftValue = values[leftIndex] ?? 0;
  const rightValue = values[rightIndex] ?? 0;

  return leftValue + (rightValue - leftValue) * mix;
}

function wrapPhase(phase: number, length: number) {
  const wrappedPhase = phase % length;

  return wrappedPhase < 0 ? wrappedPhase + length : wrappedPhase;
}

function encodePcm16Wav(pcm: Float32Array, sampleRate: number) {
  const bytesPerSample = 2;
  const dataLength = pcm.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);

  writeFourCc(view, 0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  writeFourCc(view, 8, "WAVE");
  writeFourCc(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeFourCc(view, 36, "data");
  view.setUint32(40, dataLength, true);

  for (let index = 0; index < pcm.length; index += 1) {
    const clampedSample = Math.max(-1, Math.min(1, pcm[index] ?? 0));
    const int16Sample = clampedSample < 0 ? Math.round(clampedSample * 0x8000) : Math.round(clampedSample * 0x7fff);
    view.setInt16(44 + index * bytesPerSample, int16Sample, true);
  }

  return buffer;
}

function writeFourCc(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

function resolveSampleRate(sampleRate: number | undefined) {
  if (sampleRate === undefined) {
    return defaultSongWavSampleRate;
  }

  if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
    throw new Error("WAV export requires a positive sample rate.");
  }

  return Math.round(sampleRate);
}

function sanitizeFileNamePart(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9\s_-]/g, " ")
    .trim()
    .replace(/[\s_-]+/g, "-")
    .toLowerCase();
}
