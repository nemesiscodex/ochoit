import type { SongDocument, TrackId } from "./song-document.js";
import {
  getDefaultSampleTrigger,
  getMelodicArrangementEntries,
  moveMelodicTrackEntries,
  moveNoiseTrackEntries,
  moveSampleTrackEntries,
  parseMelodicTrackArrangement,
  parseNoiseTrackArrangement,
  parseSampleTrackArrangement,
  replaceMelodicTrackArrangement,
  replaceNoiseTrackArrangement,
  replaceSampleTrackArrangement,
  resizeMelodicTrackStep,
  serializeMelodicTrackArrangement,
  serializeNoiseTrackArrangement,
  serializeSampleTrackArrangement,
  updateMelodicTrackStep,
  updateNoiseTrackStep,
  updateSampleTrackStep,
  type ArrangementTextFormat,
  type MelodicStepUpdates,
  type MelodicTrackId,
  type NoiseStepUpdates,
  type NoteValue,
  type PulseDutyValue,
  type SampleStepUpdates,
} from "./song-pattern.js";
import {
  SONG_EIGHTH_GRID_STEPS_PER_BEAT,
  canUpdateSongStepsPerBeat,
  clampSongLoopLength,
  songLoopLengthWouldTrimContent,
  updateSongStepsPerBeat,
  updateSongTransport,
  type SongTimingResolution,
} from "./song-transport.js";

export type StepChangesByTrackId = {
  pulse1: MelodicStepUpdates;
  pulse2: MelodicStepUpdates;
  triangle: MelodicStepUpdates;
  noise: NoiseStepUpdates;
  sample: SampleStepUpdates;
};

export type MelodicStepPlacement = {
  stepIndex: number;
  length: number;
  /** Omit to re-length the note already starting at `stepIndex` without writing a new one. */
  note?: NoteValue;
  duty?: PulseDutyValue;
  volume?: number;
};

export type NoiseStepPlacement = Omit<NoiseStepUpdates, "enabled"> & { stepIndex: number };
export type SampleStepPlacement = Omit<SampleStepUpdates, "enabled"> & { stepIndex: number };

export type StepPlacementByTrackId = {
  pulse1: MelodicStepPlacement;
  pulse2: MelodicStepPlacement;
  triangle: MelodicStepPlacement;
  noise: NoiseStepPlacement;
  sample: SampleStepPlacement;
};

type TrackEdit<Id extends TrackId> =
  | { type: "update-step"; trackId: Id; stepIndex: number; changes: StepChangesByTrackId[Id] }
  | { type: "move-steps"; trackId: Id; stepIndexes: number[]; delta: number }
  | { type: "place-steps"; trackId: Id; steps: StepPlacementByTrackId[Id][] }
  | { type: "replace-arrangement"; trackId: Id; text: string };

export type SongEdit =
  | { type: "set-song-name"; name: string }
  | { type: "set-song-author"; author: string }
  | { type: "set-engine-mode"; engineMode: SongDocument["meta"]["engineMode"] }
  | { type: "toggle-track-mute"; trackId: TrackId }
  | { type: "set-track-volume"; trackId: TrackId; volume: number }
  | { type: "set-master-volume"; volume: number }
  | { type: "set-old-speaker-mode"; enabled: boolean }
  | { type: "set-bpm"; bpm: number }
  | { type: "set-loop-length"; loopLength: number; confirmed?: boolean }
  | { type: "set-steps-per-beat"; stepsPerBeat: SongTimingResolution }
  | { type: "resize-note"; trackId: MelodicTrackId; stepIndex: number; startStepIndex: number; length: number }
  | { [Id in TrackId]: TrackEdit<Id> }[TrackId];

export type SongEditContext = {
  /** Sample assigned when an edit enables a PCM step that has none. */
  defaultSampleId?: string | null;
};

export type SongEditResult =
  | { status: "applied"; song: SongDocument }
  | { status: "unchanged"; song: SongDocument }
  | { status: "needs-confirmation"; song: SongDocument; message: string; confirmedEdit: SongEdit }
  | { status: "rejected"; song: SongDocument; message: string };

type ParsedArrangement = { ok: true; song: SongDocument } | { ok: false; error: string };

type TrackKindAdapter<Id extends TrackId> = {
  updateStep: (
    song: SongDocument,
    trackId: Id,
    stepIndex: number,
    changes: StepChangesByTrackId[Id],
    context: SongEditContext,
  ) => SongDocument;
  moveSteps: (song: SongDocument, trackId: Id, stepIndexes: number[], delta: number) => SongDocument;
  placeSteps: (
    song: SongDocument,
    trackId: Id,
    steps: readonly StepPlacementByTrackId[Id][],
    context: SongEditContext,
  ) => SongDocument;
  replaceArrangement: (song: SongDocument, trackId: Id, text: string) => ParsedArrangement;
  serializeArrangement: (song: SongDocument, trackId: Id, format: ArrangementTextFormat) => string;
};

const songMetaTextMaxLength = 80;
const trackVolumeMin = 0;
const trackVolumeMax = 1;
const trackVolumePrecision = 100;

const melodicTrackAdapter: TrackKindAdapter<MelodicTrackId> = {
  updateStep: updateMelodicTrackStep,
  moveSteps: moveMelodicTrackEntries,
  placeSteps: placeMelodicSteps,
  replaceArrangement: (song, trackId, text) => {
    const parsed = parseMelodicTrackArrangement(text, song.transport.loopLength, trackId);

    return parsed.ok ? { ok: true, song: replaceMelodicTrackArrangement(song, trackId, parsed.entries) } : parsed;
  },
  serializeArrangement: (song, trackId, format) => serializeMelodicTrackArrangement(song.tracks[trackId], format),
};

const noiseTrackAdapter: TrackKindAdapter<"noise"> = {
  updateStep: (song, _trackId, stepIndex, changes) => updateNoiseTrackStep(song, stepIndex, changes),
  moveSteps: (song, _trackId, stepIndexes, delta) => moveNoiseTrackEntries(song, stepIndexes, delta),
  placeSteps: (song, _trackId, steps) =>
    steps.reduce(
      (currentSong, { stepIndex, ...updates }) => updateNoiseTrackStep(currentSong, stepIndex, { ...updates, enabled: true }),
      song,
    ),
  replaceArrangement: (song, _trackId, text) => {
    const parsed = parseNoiseTrackArrangement(text, song.transport.loopLength);

    return parsed.ok ? { ok: true, song: replaceNoiseTrackArrangement(song, parsed.entries) } : parsed;
  },
  serializeArrangement: (song, _trackId, format) => serializeNoiseTrackArrangement(song.tracks.noise, format),
};

const sampleTrackAdapter: TrackKindAdapter<"sample"> = {
  updateStep: (song, _trackId, stepIndex, changes, context) => updateSampleStep(song, stepIndex, changes, context),
  moveSteps: (song, _trackId, stepIndexes, delta) => moveSampleTrackEntries(song, stepIndexes, delta),
  placeSteps: (song, _trackId, steps, context) =>
    steps.reduce(
      (currentSong, { stepIndex, ...updates }) =>
        updateSampleStep(currentSong, stepIndex, { ...updates, enabled: true }, context),
      song,
    ),
  replaceArrangement: (song, _trackId, text) => {
    const parsed = parseSampleTrackArrangement(text, song.transport.loopLength, song.samples);

    return parsed.ok ? { ok: true, song: replaceSampleTrackArrangement(song, parsed.entries) } : parsed;
  },
  serializeArrangement: (song, _trackId, format) =>
    serializeSampleTrackArrangement(song.tracks.sample, song.meta.engineMode, format),
};

const trackAdapterById: { [Id in TrackId]: TrackKindAdapter<Id> } = {
  pulse1: melodicTrackAdapter,
  pulse2: melodicTrackAdapter,
  triangle: melodicTrackAdapter,
  noise: noiseTrackAdapter,
  sample: sampleTrackAdapter,
};

export function applySongEdit(song: SongDocument, edit: SongEdit, context: SongEditContext = {}): SongEditResult {
  switch (edit.type) {
    case "set-song-name":
      return commitSong(song, { ...song, meta: { ...song.meta, name: edit.name.slice(0, songMetaTextMaxLength) } });
    case "set-song-author":
      return commitSong(song, {
        ...song,
        meta: { ...song.meta, author: edit.author.slice(0, songMetaTextMaxLength) },
      });
    case "set-engine-mode":
      return commitSong(song, { ...song, meta: { ...song.meta, engineMode: edit.engineMode } });
    case "toggle-track-mute": {
      const track = song.tracks[edit.trackId];

      return commitSong(song, replaceTrack(song, edit.trackId, { ...track, muted: !track.muted }));
    }
    case "set-track-volume":
      if (!Number.isFinite(edit.volume)) {
        return unchanged(song);
      }

      return commitSong(
        song,
        replaceTrack(song, edit.trackId, { ...song.tracks[edit.trackId], volume: clampTrackVolume(edit.volume) }),
      );
    case "set-master-volume":
      if (!Number.isFinite(edit.volume)) {
        return unchanged(song);
      }

      return commitSong(song, { ...song, mixer: { ...song.mixer, masterVolume: clampTrackVolume(edit.volume) } });
    case "set-old-speaker-mode":
      return commitSong(song, { ...song, mixer: { ...song.mixer, oldSpeakerMode: edit.enabled } });
    case "set-bpm":
      return commitSong(song, updateSongTransport(song, { bpm: edit.bpm }));
    case "set-loop-length": {
      const loopLength = clampSongLoopLength(edit.loopLength);

      if (loopLength === song.transport.loopLength) {
        return unchanged(song);
      }

      if (edit.confirmed !== true && songLoopLengthWouldTrimContent(song, loopLength)) {
        return {
          status: "needs-confirmation",
          song,
          message: `Reduce the pattern to ${loopLength} steps? This will delete or shorten notes and triggers beyond the new end.`,
          confirmedEdit: { ...edit, confirmed: true },
        };
      }

      return commitSong(song, updateSongTransport(song, { loopLength }));
    }
    case "set-steps-per-beat":
      if (!canUpdateSongStepsPerBeat(song, edit.stepsPerBeat)) {
        return {
          status: "rejected",
          song,
          message:
            edit.stepsPerBeat === SONG_EIGHTH_GRID_STEPS_PER_BEAT
              ? "1/8 grid would exceed the maximum pattern length."
              : "Grid mode is only available when recorded notes and triggers align to the beat grid.",
        };
      }

      return commitSong(song, updateSongStepsPerBeat(song, edit.stepsPerBeat));
    case "resize-note":
      return commitSong(
        song,
        resizeMelodicTrackStep(song, edit.trackId, edit.stepIndex, edit.startStepIndex, edit.length),
      );
    default:
      return applyTrackEdit(song, edit, context);
  }
}

export function serializeTrackArrangement<Id extends TrackId>(
  song: SongDocument,
  trackId: Id,
  format: ArrangementTextFormat = "multiline",
) {
  return trackAdapterById[trackId].serializeArrangement(song, trackId, format);
}

export function clampTrackVolume(value: number) {
  return Math.min(
    trackVolumeMax,
    Math.max(trackVolumeMin, Math.round(value * trackVolumePrecision) / trackVolumePrecision),
  );
}

function applyTrackEdit<Id extends TrackId>(
  song: SongDocument,
  edit: TrackEdit<Id>,
  context: SongEditContext,
): SongEditResult {
  const adapter: TrackKindAdapter<Id> = trackAdapterById[edit.trackId];

  switch (edit.type) {
    case "update-step":
      return commitSong(song, adapter.updateStep(song, edit.trackId, edit.stepIndex, edit.changes, context));
    case "move-steps":
      return commitSong(song, adapter.moveSteps(song, edit.trackId, edit.stepIndexes, edit.delta));
    case "place-steps":
      return commitSong(song, adapter.placeSteps(song, edit.trackId, edit.steps, context));
    case "replace-arrangement": {
      const parsed = adapter.replaceArrangement(song, edit.trackId, edit.text);

      return parsed.ok ? commitSong(song, parsed.song) : { status: "rejected", song, message: parsed.error };
    }
  }
}

function placeMelodicSteps(song: SongDocument, trackId: MelodicTrackId, steps: readonly MelodicStepPlacement[]) {
  const loopLength = song.tracks[trackId].steps.length;
  const placedStepIndexes = new Set(steps.map((step) => step.stepIndex));
  const overlappedStepIndexes = getMelodicArrangementEntries(song.tracks[trackId])
    .filter(
      (entry) =>
        !placedStepIndexes.has(entry.stepIndex) &&
        steps.some(
          (step) =>
            entry.stepIndex < Math.min(step.stepIndex + step.length, loopLength) &&
            step.stepIndex < entry.stepIndex + entry.length,
        ),
    )
    .map((entry) => entry.stepIndex);
  const clearedSong = overlappedStepIndexes.reduce(
    (currentSong, stepIndex) => updateMelodicTrackStep(currentSong, trackId, stepIndex, { enabled: false }),
    song,
  );

  return steps.reduce(
    (currentSong, { stepIndex, note, ...updates }) =>
      updateMelodicTrackStep(
        currentSong,
        trackId,
        stepIndex,
        note === undefined ? updates : { ...updates, enabled: true, note },
      ),
    clearedSong,
  );
}

function updateSampleStep(
  song: SongDocument,
  stepIndex: number,
  changes: SampleStepUpdates,
  context: SongEditContext,
) {
  const step = song.tracks.sample.steps[stepIndex];
  const nextSampleId = changes.sampleId === undefined ? step?.sampleId : changes.sampleId;

  if (changes.enabled !== true || nextSampleId !== null) {
    return updateSampleTrackStep(song, stepIndex, changes);
  }

  return updateSampleTrackStep(song, stepIndex, {
    ...changes,
    sampleId: getDefaultSampleTrigger(song.samples, context.defaultSampleId).sampleId,
  });
}

function replaceTrack<Id extends TrackId>(song: SongDocument, trackId: Id, track: SongDocument["tracks"][Id]) {
  return {
    ...song,
    tracks: {
      ...song.tracks,
      [trackId]: track,
    },
  };
}

function commitSong(song: SongDocument, nextSong: SongDocument): SongEditResult {
  if (isSameValue(song, nextSong)) {
    return unchanged(song);
  }

  return {
    status: "applied",
    song: {
      ...nextSong,
      meta: {
        ...nextSong.meta,
        updatedAt: new Date().toISOString(),
      },
    },
  };
}

function unchanged(song: SongDocument): SongEditResult {
  return { status: "unchanged", song };
}

function isSameValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true;
  }

  if (typeof left !== "object" || typeof right !== "object" || left === null || right === null) {
    return false;
  }

  if (Array.isArray(left) !== Array.isArray(right)) {
    return false;
  }

  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord);

  return (
    leftKeys.length === Object.keys(rightRecord).length &&
    leftKeys.every((key) => key in rightRecord && isSameValue(leftRecord[key], rightRecord[key]))
  );
}
