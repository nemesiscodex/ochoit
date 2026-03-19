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
export type MelodicArrangementEntry = {
  stepIndex: number;
  note: NoteValue;
};

export type ParseMelodicArrangementResult =
  | {
      ok: true;
      entries: MelodicArrangementEntry[];
    }
  | {
      ok: false;
      error: string;
    };

export const noteEntryOptions: NoteValue[] = noteOctaves.flatMap((octave) =>
  noteNames.map((noteName) => `${noteName}${octave}` as NoteValue),
);
const supportedNoteSet = new Set(noteEntryOptions);
const arrangementLinePattern = /^(\d+)\s*:\s*(\S+)$/;
const arrangementNotePattern = /^([A-Ga-g])(#?)([0-8])$/;

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

export function serializeMelodicTrackArrangement(
  track: SongDocument["tracks"]["pulse1"] | SongDocument["tracks"]["pulse2"] | SongDocument["tracks"]["triangle"],
) {
  return track.steps
    .flatMap((step, index) => {
      if (!step.enabled) {
        return [];
      }

      return `${index + 1}: ${step.note}`;
    })
    .join("\n");
}

export function parseMelodicTrackArrangement(input: string, loopLength: number): ParseMelodicArrangementResult {
  const lines = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const entriesByStep = new Map<number, NoteValue>();

  for (const [lineIndex, line] of lines.entries()) {
    const match = arrangementLinePattern.exec(line);

    if (match === null) {
      return {
        ok: false,
        error: `Line ${lineIndex + 1} must match "<step>: <note>" like "1: E4".`,
      };
    }

    const stepNumber = Number(match[1]);

    if (!Number.isInteger(stepNumber) || stepNumber < 1) {
      return {
        ok: false,
        error: `Line ${lineIndex + 1} must use a step number starting at 1.`,
      };
    }

    const note = normalizeArrangementNote(match[2]);

    if (note === null) {
      return {
        ok: false,
        error: `Line ${lineIndex + 1} has an unsupported note. Use notes from C0 to B8 with optional sharps.`,
      };
    }

    if (stepNumber > loopLength) {
      continue;
    }

    entriesByStep.set(stepNumber - 1, note);
  }

  return {
    ok: true,
    entries: Array.from(entriesByStep.entries())
      .map(([stepIndex, note]) => ({ stepIndex, note }))
      .sort((left: MelodicArrangementEntry, right: MelodicArrangementEntry) => left.stepIndex - right.stepIndex),
  };
}

export function replaceMelodicTrackArrangement(
  song: SongDocument,
  trackId: MelodicTrackId,
  entries: readonly MelodicArrangementEntry[],
): SongDocument {
  const entriesByStep = new Map(entries.map((entry) => [entry.stepIndex, entry.note]));

  switch (trackId) {
    case "pulse1":
      return {
        ...song,
        tracks: {
          ...song.tracks,
          pulse1: {
            ...song.tracks.pulse1,
            steps: song.tracks.pulse1.steps.map((step, index) => ({
              ...step,
              enabled: entriesByStep.has(index),
              note: entriesByStep.get(index) ?? step.note,
            })),
          },
        },
      };
    case "pulse2":
      return {
        ...song,
        tracks: {
          ...song.tracks,
          pulse2: {
            ...song.tracks.pulse2,
            steps: song.tracks.pulse2.steps.map((step, index) => ({
              ...step,
              enabled: entriesByStep.has(index),
              note: entriesByStep.get(index) ?? step.note,
            })),
          },
        },
      };
    case "triangle":
      return {
        ...song,
        tracks: {
          ...song.tracks,
          triangle: {
            ...song.tracks.triangle,
            steps: song.tracks.triangle.steps.map((step, index) => ({
              ...step,
              enabled: entriesByStep.has(index),
              note: entriesByStep.get(index) ?? step.note,
            })),
          },
        },
      };
  }
}

function normalizeArrangementNote(rawNote: string): NoteValue | null {
  const match = arrangementNotePattern.exec(rawNote.trim());

  if (match === null) {
    return null;
  }

  const normalizedNote = `${match[1].toUpperCase()}${match[2]}${match[3]}` as NoteValue;
  return supportedNoteSet.has(normalizedNote) ? normalizedNote : null;
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
