import {
  createEmptySongDocument,
  parseSongDocument,
  type SerializedSampleAsset,
  type SongDocument,
} from "./song-document.js";
import { defaultDpcmRate } from "./dpcm.js";
import {
  parseMelodicTrackArrangement,
  parseNoiseTrackArrangement,
  parseSampleTrackArrangement,
  replaceMelodicTrackArrangement,
  replaceNoiseTrackArrangement,
  replaceSampleTrackArrangement,
  type MelodicTrackId,
} from "./song-pattern.js";

export type PlayableVoiceId = "pulse" | "pulse1" | "pulse2" | "triangle" | "noise" | "sample" | "pcm";
export type CanonicalVoiceId = "pulse1" | "pulse2" | "triangle" | "noise" | "sample";

export interface VoiceSongOptions {
  bpm?: number;
  engineMode?: SongDocument["meta"]["engineMode"];
  masterVolume?: number;
  samples?: readonly SerializedSampleAsset[];
  steps?: number;
  stepsPerBeat?: number;
  volume?: number;
}

const defaultSingleVoiceLoopLength = 16;
const defaultSingleVoiceMasterVolume = 1;
const defaultSingleVoiceTrackVolume = 1;

const canonicalVoiceIdByPlayableId: Record<PlayableVoiceId, CanonicalVoiceId> = {
  pulse: "pulse1",
  pulse1: "pulse1",
  pulse2: "pulse2",
  triangle: "triangle",
  noise: "noise",
  sample: "sample",
  pcm: "sample",
};

export function isPlayableVoiceId(value: string): value is PlayableVoiceId {
  return value in canonicalVoiceIdByPlayableId;
}

export function toCanonicalVoiceId(voiceId: PlayableVoiceId): CanonicalVoiceId {
  return canonicalVoiceIdByPlayableId[voiceId];
}

export function normalizeVoiceArrangementInput(input: string) {
  return input
    .split(/\r?\n|,/u)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .join("\n");
}

export function createVoiceSong(
  voiceId: PlayableVoiceId,
  arrangementInput: string,
  options: VoiceSongOptions = {},
): SongDocument {
  const canonicalVoiceId = toCanonicalVoiceId(voiceId);
  const loopLength = resolveLoopLength(options.steps);
  const bpm = resolveMinimumIntegerOption(options.bpm, 136, "bpm", 40);
  const stepsPerBeat = resolveBoundedIntegerOption(options.stepsPerBeat, 4, "stepsPerBeat", 1, 8);
  const masterVolume = resolveUnitIntervalOption(
    options.masterVolume,
    defaultSingleVoiceMasterVolume,
    "masterVolume",
  );
  const trackVolume = resolvePercentOption(options.volume, defaultSingleVoiceTrackVolume, "volume");
  const normalizedArrangement = normalizeVoiceArrangementInput(arrangementInput);
  const baseSong = createEmptySongDocument();
  const samples = (options.samples ?? []).map(cloneSample);

  let song: SongDocument = parseSongDocument({
    ...baseSong,
    meta: {
      ...baseSong.meta,
      engineMode: options.engineMode ?? baseSong.meta.engineMode,
    },
    transport: {
      ...baseSong.transport,
      bpm,
      stepsPerBeat,
      loopLength,
    },
    mixer: {
      ...baseSong.mixer,
      masterVolume,
    },
    tracks: {
      pulse1: createEmptyPulseTrack(baseSong.tracks.pulse1, loopLength),
      pulse2: createEmptyPulseTrack(baseSong.tracks.pulse2, loopLength),
      triangle: createEmptyTriangleTrack(baseSong.tracks.triangle, loopLength),
      noise: createEmptyNoiseTrack(baseSong.tracks.noise, loopLength),
      sample: createEmptySampleTrack(baseSong.tracks.sample, loopLength),
    },
    samples,
  });

  switch (canonicalVoiceId) {
    case "pulse1":
    case "pulse2":
    case "triangle": {
      const parsedArrangement = parseMelodicTrackArrangement(
        normalizedArrangement,
        loopLength,
        canonicalVoiceId as MelodicTrackId,
      );

      if (!parsedArrangement.ok) {
        throw new Error(parsedArrangement.error);
      }

      song = replaceMelodicTrackArrangement(song, canonicalVoiceId, parsedArrangement.entries);
      break;
    }
    case "noise": {
      const parsedArrangement = parseNoiseTrackArrangement(normalizedArrangement, loopLength);

      if (!parsedArrangement.ok) {
        throw new Error(parsedArrangement.error);
      }

      song = replaceNoiseTrackArrangement(song, parsedArrangement.entries);
      break;
    }
    case "sample": {
      const parsedArrangement = parseSampleTrackArrangement(normalizedArrangement, loopLength, samples);

      if (!parsedArrangement.ok) {
        throw new Error(parsedArrangement.error);
      }

      song = replaceSampleTrackArrangement(song, parsedArrangement.entries);
      break;
    }
  }

  song.tracks[canonicalVoiceId].volume = trackVolume;
  return parseSongDocument(song);
}

function createEmptyPulseTrack(track: SongDocument["tracks"]["pulse1"], loopLength: number): SongDocument["tracks"]["pulse1"];
function createEmptyPulseTrack(track: SongDocument["tracks"]["pulse2"], loopLength: number): SongDocument["tracks"]["pulse2"];
function createEmptyPulseTrack(
  track: SongDocument["tracks"]["pulse1"] | SongDocument["tracks"]["pulse2"],
  loopLength: number,
) {
  return {
    ...track,
    steps: Array.from({ length: loopLength }, () => ({
      enabled: false,
      note: "C4" as const,
      volume: 1,
      duty: 0.5 as const,
      length: 1,
    })),
  };
}

function createEmptyTriangleTrack(track: SongDocument["tracks"]["triangle"], loopLength: number) {
  return {
    ...track,
    steps: Array.from({ length: loopLength }, () => ({
      enabled: false,
      note: "C3" as const,
      volume: 1,
      length: 1,
    })),
  };
}

function createEmptyNoiseTrack(track: SongDocument["tracks"]["noise"], loopLength: number) {
  return {
    ...track,
    steps: Array.from({ length: loopLength }, () => ({
      enabled: false,
      volume: 1,
      mode: "long" as const,
      periodIndex: 8,
    })),
  };
}

function createEmptySampleTrack(track: SongDocument["tracks"]["sample"], loopLength: number) {
  return {
    ...track,
    steps: Array.from({ length: loopLength }, () => ({
      enabled: false,
      volume: 1,
      sampleId: null,
      note: "C4" as const,
      playbackRate: defaultDpcmRate,
    })),
  };
}

function cloneSample(sample: SerializedSampleAsset): SerializedSampleAsset {
  return {
    ...sample,
    trim: {
      ...sample.trim,
    },
    pcm: [...sample.pcm],
  };
}

function resolveLoopLength(value: number | undefined) {
  const resolvedValue = value ?? defaultSingleVoiceLoopLength;

  if (!Number.isInteger(resolvedValue) || resolvedValue < 8 || resolvedValue > 128 || resolvedValue % 4 !== 0) {
    throw new Error('Expected "steps" to be an integer between 8 and 128, in increments of 4.');
  }

  return resolvedValue;
}

function resolveMinimumIntegerOption(
  value: number | undefined,
  fallback: number,
  label: string,
  min: number,
) {
  const resolvedValue = value ?? fallback;

  if (!Number.isInteger(resolvedValue) || resolvedValue < min) {
    throw new Error(`Expected "${label}" to be an integer greater than or equal to ${min}.`);
  }

  return resolvedValue;
}

function resolveBoundedIntegerOption(
  value: number | undefined,
  fallback: number,
  label: string,
  min: number,
  max: number,
) {
  const resolvedValue = value ?? fallback;

  if (!Number.isInteger(resolvedValue) || resolvedValue < min || resolvedValue > max) {
    throw new Error(`Expected "${label}" to be an integer between ${min} and ${max}.`);
  }

  return resolvedValue;
}

function resolveUnitIntervalOption(value: number | undefined, fallback: number, label: string) {
  const resolvedValue = value ?? fallback;

  if (!Number.isFinite(resolvedValue) || resolvedValue < 0 || resolvedValue > 1) {
    throw new Error(`Expected "${label}" to be a number between 0 and 1.`);
  }

  return resolvedValue;
}

function resolvePercentOption(value: number | undefined, fallback: number, label: string) {
  if (value === undefined) {
    return fallback;
  }

  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new Error(`Expected "${label}" to be a number between 0 and 100.`);
  }

  return value / 100;
}
