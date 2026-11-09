import { getMelodicArrangementEntries, type NoteValue, type SongDocument, type SongEdit, type Track } from "ochoit-lib";

import type { StepSelection } from "@/features/sequencer/step-selection";

/** The copied steps, as the edit that would place them back where they were copied from. */
export type StepClipboard = Extract<SongEdit, { type: "place-steps" }>;

export function copySteps(song: SongDocument, selection: StepSelection): StepClipboard | null {
  const clipboard = readPlacedSteps(song.tracks[selection.trackId], selection.selectedStepIndexes);

  return clipboard.steps.length === 0 ? null : clipboard;
}

/** Pastes so the first copied step lands on the selection anchor; steps past the loop end are dropped. */
export function pasteSteps(
  song: SongDocument,
  clipboard: StepClipboard,
  selection: StepSelection,
): { edit: StepClipboard; selection: StepSelection } | null {
  if (selection.trackId !== clipboard.trackId) {
    return null;
  }

  const firstCopiedStepIndex = Math.min(...clipboard.steps.map((step) => step.stepIndex));
  const edit = shiftPlacedSteps(
    clipboard,
    selection.anchorStepIndex - firstCopiedStepIndex,
    song.tracks[clipboard.trackId].steps.length,
  );

  if (edit.steps.length === 0) {
    return null;
  }

  return {
    edit,
    selection: {
      trackId: clipboard.trackId,
      anchorStepIndex: selection.anchorStepIndex,
      selectedStepIndexes: edit.steps.map((step) => step.stepIndex),
    },
  };
}

function readPlacedSteps(track: Track, stepIndexes: readonly number[]): StepClipboard {
  switch (track.kind) {
    case "pulse":
    case "triangle":
      return {
        type: "place-steps",
        trackId: track.id,
        steps: getMelodicArrangementEntries(track)
          .filter((entry) => stepIndexes.includes(entry.stepIndex))
          .map((entry) => ({ ...entry, volume: track.steps[entry.stepIndex]?.volume ?? track.volume })),
      };
    case "noise":
      return {
        type: "place-steps",
        trackId: track.id,
        steps: stepIndexes.flatMap((stepIndex) => {
          const step = track.steps[stepIndex];

          return step?.enabled
            ? [{ stepIndex, mode: step.mode, periodIndex: step.periodIndex, volume: step.volume }]
            : [];
        }),
      };
    case "sample":
      return {
        type: "place-steps",
        trackId: track.id,
        steps: stepIndexes.flatMap((stepIndex) => {
          const step = track.steps[stepIndex];

          return step?.enabled && step.sampleId !== null
            ? [
                {
                  stepIndex,
                  sampleId: step.sampleId,
                  note: step.note as NoteValue,
                  playbackRate: step.playbackRate,
                  volume: step.volume,
                },
              ]
            : [];
        }),
      };
  }
}

function shiftPlacedSteps<Placement extends StepClipboard>(
  placement: Placement,
  stepOffset: number,
  loopLength: number,
): Placement {
  return {
    ...placement,
    steps: placement.steps
      .map((step) => ({ ...step, stepIndex: step.stepIndex + stepOffset }))
      .filter((step) => step.stepIndex >= 0 && step.stepIndex < loopLength)
      .sort((left, right) => left.stepIndex - right.stepIndex),
  };
}
