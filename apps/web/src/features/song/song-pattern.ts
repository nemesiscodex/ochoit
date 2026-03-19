import type { SongDocument, TrackId } from "@/features/song/song-document";

const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;
const noteOctaves = [0, 1, 2, 3, 4, 5, 6, 7, 8] as const;

type NoteName = (typeof noteNames)[number];
type NoteOctave = (typeof noteOctaves)[number];
export type NoteValue = `${NoteName}${NoteOctave}`;

export const melodicTrackIds = ["pulse1", "pulse2", "triangle"] as const;
export type MelodicTrackId = (typeof melodicTrackIds)[number];
export type MelodicStepUpdates = {
  enabled?: boolean;
  note?: NoteValue;
};

export const noteEntryOptions: NoteValue[] = noteOctaves.flatMap((octave) =>
  noteNames.map((noteName) => `${noteName}${octave}` as NoteValue),
);

export function isMelodicTrackId(trackId: TrackId): trackId is MelodicTrackId {
  return melodicTrackIds.includes(trackId as MelodicTrackId);
}

export function updateMelodicTrackStep(
  song: SongDocument,
  trackId: MelodicTrackId,
  stepIndex: number,
  updates: MelodicStepUpdates,
): SongDocument {
  if (stepIndex < 0 || stepIndex >= song.transport.loopLength) {
    return song;
  }

  switch (trackId) {
    case "pulse1":
      return {
        ...song,
        tracks: {
          ...song.tracks,
          pulse1: updatePulseTrackStep(song.tracks.pulse1, stepIndex, updates),
        },
      };
    case "pulse2":
      return {
        ...song,
        tracks: {
          ...song.tracks,
          pulse2: updatePulseTrackStep(song.tracks.pulse2, stepIndex, updates),
        },
      };
    case "triangle":
      return {
        ...song,
        tracks: {
          ...song.tracks,
          triangle: updateTriangleTrackStep(song.tracks.triangle, stepIndex, updates),
        },
      };
  }
}

function updatePulseTrackStep(
  track: SongDocument["tracks"]["pulse1"] | SongDocument["tracks"]["pulse2"],
  stepIndex: number,
  updates: MelodicStepUpdates,
) {
  return {
    ...track,
    steps: track.steps.map((step, index) => {
      if (index !== stepIndex) {
        return step;
      }

      return {
        ...step,
        ...updates,
      };
    }),
  };
}

function updateTriangleTrackStep(
  track: SongDocument["tracks"]["triangle"],
  stepIndex: number,
  updates: MelodicStepUpdates,
) {
  return {
    ...track,
    steps: track.steps.map((step, index) => {
      if (index !== stepIndex) {
        return step;
      }

      return {
        ...step,
        ...updates,
      };
    }),
  };
}
