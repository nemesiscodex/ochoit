import { DEFAULT_PULSE_DUTY, SONG_MAX_LOOP_LENGTH, type SongDocument } from "@/features/song/song-document";
import { defaultDpcmRate } from "@/features/audio/dpcm";

export const SONG_BPM_RANGE = {
  min: 40,
  max: 240,
} as const;

export const SONG_LOOP_LENGTH_RANGE = {
  min: 8,
  max: SONG_MAX_LOOP_LENGTH,
  step: 4,
} as const;

function clampInteger(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function clampSongBpm(value: number) {
  return clampInteger(value, SONG_BPM_RANGE.min, SONG_BPM_RANGE.max);
}

export function clampSongLoopLength(value: number) {
  const roundedStepValue = Math.round(value / SONG_LOOP_LENGTH_RANGE.step) * SONG_LOOP_LENGTH_RANGE.step;

  return clampInteger(roundedStepValue, SONG_LOOP_LENGTH_RANGE.min, SONG_LOOP_LENGTH_RANGE.max);
}

export function resolveSongBpmInput(rawValue: string, fallback: number) {
  if (rawValue.trim() === "") {
    return fallback;
  }

  const parsedValue = Number(rawValue);

  if (!Number.isFinite(parsedValue)) {
    return fallback;
  }

  return clampSongBpm(parsedValue);
}

export function resolveSongLoopLengthInput(rawValue: string, fallback: number) {
  if (rawValue.trim() === "") {
    return fallback;
  }

  const parsedValue = Number(rawValue);

  if (!Number.isFinite(parsedValue)) {
    return fallback;
  }

  return clampSongLoopLength(parsedValue);
}

export function songLoopLengthWouldTrimContent(song: SongDocument, nextLoopLength: number) {
  const clampedLoopLength = clampSongLoopLength(nextLoopLength);

  return Object.values(song.tracks).some((track) => {
    switch (track.kind) {
      case "pulse":
      case "triangle":
        return track.steps.some(
          (step, index) => step.enabled && (index >= clampedLoopLength || index + step.length > clampedLoopLength),
        );
      case "noise":
      case "sample":
        return track.steps.some((step, index) => step.enabled && index >= clampedLoopLength);
    }
  });
}

export function updateSongTransport(
  song: SongDocument,
  updates: Partial<Pick<SongDocument["transport"], "bpm" | "loopLength">>,
): SongDocument {
  const bpm = updates.bpm === undefined ? song.transport.bpm : clampSongBpm(updates.bpm);
  const loopLength =
    updates.loopLength === undefined ? song.transport.loopLength : clampSongLoopLength(updates.loopLength);

  return {
    ...song,
    transport: {
      ...song.transport,
      bpm,
      loopLength,
    },
    tracks: {
      pulse1: resizePulseTrack(song.tracks.pulse1, loopLength),
      pulse2: resizePulseTrack(song.tracks.pulse2, loopLength),
      triangle: resizeTriangleTrack(song.tracks.triangle, loopLength),
      noise: resizeNoiseTrack(song.tracks.noise, loopLength),
      sample: resizeSampleTrack(song.tracks.sample, loopLength),
    },
  };
}

function resizePulseTrack(track: SongDocument["tracks"]["pulse1"], loopLength: number): SongDocument["tracks"]["pulse1"];
function resizePulseTrack(track: SongDocument["tracks"]["pulse2"], loopLength: number): SongDocument["tracks"]["pulse2"];
function resizePulseTrack(
  track: SongDocument["tracks"]["pulse1"] | SongDocument["tracks"]["pulse2"],
  loopLength: number,
) {
  return {
    ...track,
    steps: Array.from({ length: loopLength }, (_, index) => {
      const step = track.steps[index];
      const nextEnabledStepIndex = findNextEnabledStepIndex(track.steps, index + 1, loopLength);

      if (step !== undefined) {
        return {
          ...step,
          length: step.enabled ? clampMelodicStepLength(step.length, index, loopLength, nextEnabledStepIndex) : 1,
        };
      }

      return {
        enabled: false,
        note: "C4",
        volume: track.volume,
        duty: DEFAULT_PULSE_DUTY,
        length: 1,
      };
    }),
  };
}

function resizeTriangleTrack(track: SongDocument["tracks"]["triangle"], loopLength: number) {
  return {
    ...track,
    steps: Array.from({ length: loopLength }, (_, index) => {
      const step = track.steps[index];
      const nextEnabledStepIndex = findNextEnabledStepIndex(track.steps, index + 1, loopLength);

      if (step !== undefined) {
        return {
          ...step,
          length: step.enabled ? clampMelodicStepLength(step.length, index, loopLength, nextEnabledStepIndex) : 1,
        };
      }

      return {
        enabled: false,
        note: "C3",
        volume: track.volume,
        length: 1,
      };
    }),
  };
}

function clampMelodicStepLength(
  length: number,
  stepIndex: number,
  loopLength: number,
  nextEnabledStepIndex: number | null,
) {
  const maxLength = Math.min(
    loopLength - stepIndex,
    nextEnabledStepIndex === null ? loopLength - stepIndex : nextEnabledStepIndex - stepIndex,
  );

  return Math.max(1, Math.min(Math.round(length), maxLength));
}

function findNextEnabledStepIndex(
  steps: ReadonlyArray<{ enabled: boolean }>,
  startIndex: number,
  loopLength: number,
) {
  for (let index = startIndex; index < loopLength; index += 1) {
    if (steps[index]?.enabled) {
      return index;
    }
  }

  return null;
}

function resizeNoiseTrack(track: SongDocument["tracks"]["noise"], loopLength: number) {
  return {
    ...track,
    steps: Array.from({ length: loopLength }, (_, index) => {
      const step = track.steps[index];

      if (step !== undefined) {
        return step;
      }

      return {
        enabled: false,
        volume: track.volume,
        mode: "long" as const,
        periodIndex: 8,
      };
    }),
  };
}

function resizeSampleTrack(track: SongDocument["tracks"]["sample"], loopLength: number) {
  return {
    ...track,
    steps: Array.from({ length: loopLength }, (_, index) => {
      const step = track.steps[index];

      if (step !== undefined) {
        return step;
      }

        return {
          enabled: false,
          volume: track.volume,
          sampleId: null,
          note: "C4",
          playbackRate: defaultDpcmRate,
        };
    }),
  };
}
