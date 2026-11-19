import {
  getDefaultSampleTrigger,
  getFrequencyForNote,
  getMelodicStepState,
  type MelodicTrackId,
  type NoteValue,
  type SongDocument,
  type TrackId,
} from "ochoit-lib";
import type { AudioEngine } from "ochoit-lib/web";

import type { StepSelection } from "@/features/sequencer/step-selection";
import { labelByTrackId } from "@/components/sequencer-theme";

export type KeyboardNoteTarget =
  | {
      trackId: MelodicTrackId;
      stepIndex: number;
      note: NoteValue;
      enabled: boolean;
      kind: "melodic";
      label: string;
    }
  | {
      trackId: "sample";
      stepIndex: number;
      note: NoteValue;
      enabled: boolean;
      kind: "sample";
      label: string;
      sampleId: string | null;
    };

export function getStepDurationMs(song: SongDocument) {
  return 60_000 / song.transport.bpm / song.transport.stepsPerBeat;
}

export function getKeyboardNoteTarget(song: SongDocument, selection: StepSelection | null): KeyboardNoteTarget | null {
  if (selection === null) {
    return null;
  }

  const track = song.tracks[selection.trackId];
  const stepIndex = selection.anchorStepIndex;

  switch (track.kind) {
    case "pulse":
    case "triangle": {
      const step = track.steps[stepIndex];

      if (step === undefined) {
        return null;
      }

      return {
        trackId: track.id,
        stepIndex,
        note: step.note as NoteValue,
        enabled: step.enabled,
        kind: "melodic",
        label: `${labelByTrackId[track.id]} step ${stepIndex + 1}`,
      };
    }
    case "sample": {
      if (song.meta.engineMode !== "inspired") {
        return null;
      }

      const step = track.steps[stepIndex];

      if (step === undefined) {
        return null;
      }

      return {
        trackId: "sample",
        stepIndex,
        note: step.note as NoteValue,
        enabled: step.enabled,
        kind: "sample",
        label: `PCM step ${stepIndex + 1}`,
        sampleId: step.sampleId,
      };
    }
    case "noise":
      return null;
  }
}

function previewSampleAtNote(engine: AudioEngine, song: SongDocument, sampleId: string, note: NoteValue) {
  const sample = song.samples.find((entry) => entry.id === sampleId);

  if (sample === undefined) {
    return;
  }

  engine.previewSampleNote?.(sample.id, sample.baseNote as NoteValue, note);

  if (typeof engine.previewSampleNote !== "function") {
    engine.previewSampleTrigger(sample.id, getFrequencyForNote(note) / getFrequencyForNote(sample.baseNote));
  }
}

export function previewKeyboardNote(
  engine: AudioEngine,
  song: SongDocument,
  defaultSampleId: string | null,
  target: KeyboardNoteTarget,
  note: NoteValue,
) {
  if (target.kind === "melodic") {
    const track = song.tracks[target.trackId];
    const step = track.steps[target.stepIndex];
    const previewDuty = track.kind === "pulse" ? (track.steps[target.stepIndex]?.duty ?? 0.5) : 0.5;

    engine.previewNote(
      target.trackId,
      note,
      getStepDurationMs(song) * Math.max(step?.length ?? 1, 1),
      previewDuty,
      step?.volume ?? track.volume,
    );
    return;
  }

  const sampleId = target.sampleId ?? getDefaultSampleTrigger(song.samples, defaultSampleId).sampleId;

  if (sampleId !== null) {
    previewSampleAtNote(engine, song, sampleId, note);
  }
}

export function previewSongStep(engine: AudioEngine, song: SongDocument, trackId: TrackId, stepIndex: number) {
  const track = song.tracks[trackId];
  const stepDurationMs = getStepDurationMs(song);

  switch (track.kind) {
    case "pulse":
    case "triangle": {
      const melodicState = getMelodicStepState(track, stepIndex);

      if (melodicState.kind === "rest") {
        return;
      }

      const sourceIndex = melodicState.kind === "hold" ? melodicState.startIndex : stepIndex;
      const duty = track.kind === "pulse" ? (track.steps[sourceIndex]?.duty ?? 0.5) : 0.5;

      engine.previewNote(
        track.id,
        melodicState.note,
        Math.max(stepDurationMs * melodicState.length, stepDurationMs),
        duty,
        track.steps[sourceIndex]?.volume ?? 0.25,
      );
      return;
    }
    case "noise": {
      const step = track.steps[stepIndex];

      if (step.enabled) {
        engine.previewNoiseConfig(step.mode, step.periodIndex);
      }

      return;
    }
    case "sample": {
      const step = track.steps[stepIndex];

      if (!step.enabled || step.sampleId === null) {
        return;
      }

      if (song.meta.engineMode === "authentic") {
        engine.previewSampleTrigger(step.sampleId, step.playbackRate);
        return;
      }

      previewSampleAtNote(engine, song, step.sampleId, step.note as NoteValue);
    }
  }
}
