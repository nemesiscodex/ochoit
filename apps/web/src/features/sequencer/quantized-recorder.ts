import type { MelodicTrackId, NoteValue, SongDocument, SongEdit, TrackId } from "ochoit-lib";

export type RecordTrackId = MelodicTrackId | "sample";

type HeldNote = {
  note: NoteValue;
  stepIndex: number;
  length: number;
  startLoopCount: number;
};

export type QuantizedRecording = {
  trackId: RecordTrackId;
  heldNotes: ReadonlyMap<string, HeldNote>;
};

type Playhead = { nextStep: number; loopCount: number };

export function isRecordTarget(song: SongDocument, trackId: TrackId): trackId is RecordTrackId {
  return (
    trackId === "pulse1" ||
    trackId === "pulse2" ||
    trackId === "triangle" ||
    (trackId === "sample" && song.meta.engineMode === "inspired")
  );
}

export function startRecording(trackId: RecordTrackId): QuantizedRecording {
  return { trackId, heldNotes: new Map() };
}

/** Places the note at the playhead step; null while the same key is still held (key repeat). */
export function pressRecordingKey(
  recording: QuantizedRecording,
  song: SongDocument,
  key: string,
  note: NoteValue,
  playhead: Playhead,
): { recording: QuantizedRecording; edit: SongEdit; stepIndex: number } | null {
  if (recording.heldNotes.has(key)) {
    return null;
  }

  const stepIndex = clampStepIndex(playhead.nextStep, song.transport.loopLength);
  const heldNotes = new Map(recording.heldNotes).set(key, {
    note,
    stepIndex,
    length: 1,
    startLoopCount: playhead.loopCount,
  });

  return {
    recording: { ...recording, heldNotes },
    edit: getNoteStartEdit(song, recording.trackId, stepIndex, note),
    stepIndex,
  };
}

/** Frees the key and sets the released melodic note's final length. PCM triggers have no length, so their edit is null. */
export function releaseRecordingKey(
  recording: QuantizedRecording,
  song: SongDocument,
  key: string,
  playhead: Playhead,
): { recording: QuantizedRecording; edit: SongEdit | null } | null {
  const heldNote = recording.heldNotes.get(key);

  if (heldNote === undefined) {
    return null;
  }

  const heldNotes = new Map(recording.heldNotes);
  heldNotes.delete(key);

  return {
    recording: { ...recording, heldNotes },
    edit:
      recording.trackId === "sample"
        ? null
        : {
            type: "place-steps",
            trackId: recording.trackId,
            steps: [{ stepIndex: heldNote.stepIndex, length: getHeldNoteLength(heldNote, song, playhead) }],
          },
  };
}

/** Grows every held melodic note to reach the playhead. */
export function advanceRecording(
  recording: QuantizedRecording,
  song: SongDocument,
  playhead: Playhead,
): { recording: QuantizedRecording; edits: SongEdit[] } {
  const trackId = recording.trackId;

  if (trackId === "sample") {
    return { recording, edits: [] };
  }

  const edits: SongEdit[] = [];
  const heldNotes = new Map(recording.heldNotes);

  heldNotes.forEach((heldNote, key) => {
    const length = getHeldNoteLength(heldNote, song, playhead);

    if (length !== heldNote.length) {
      heldNotes.set(key, { ...heldNote, length });
      edits.push({ type: "place-steps", trackId, steps: [{ stepIndex: heldNote.stepIndex, length }] });
    }
  });

  return edits.length === 0 ? { recording, edits } : { recording: { ...recording, heldNotes }, edits };
}

function getNoteStartEdit(song: SongDocument, trackId: RecordTrackId, stepIndex: number, note: NoteValue): SongEdit {
  if (trackId === "sample") {
    return { type: "place-steps", trackId, steps: [{ stepIndex, note }] };
  }

  const track = song.tracks[trackId];

  return {
    type: "place-steps",
    trackId,
    steps: [
      {
        stepIndex,
        note,
        length: 1,
        volume: track.steps[stepIndex]?.volume ?? track.volume,
        ...(track.kind === "pulse" ? { duty: track.steps[stepIndex]?.duty ?? 0.5 } : {}),
      },
    ],
  };
}

function getHeldNoteLength(heldNote: HeldNote, song: SongDocument, playhead: Playhead) {
  const loopLength = song.transport.loopLength;
  const releaseStep = clampStepIndex(playhead.nextStep, loopLength);
  const elapsedLoops = Math.max(0, playhead.loopCount - heldNote.startLoopCount);
  const stepDistance = elapsedLoops * loopLength + releaseStep - heldNote.stepIndex;

  return Math.max(1, Math.min(loopLength - heldNote.stepIndex, stepDistance));
}

function clampStepIndex(stepIndex: number, loopLength: number) {
  if (loopLength <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(loopLength - 1, stepIndex));
}
