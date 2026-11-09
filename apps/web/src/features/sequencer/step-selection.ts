import { getMelodicStepState, trackOrder, type SongDocument, type Track, type TrackId } from "ochoit-lib";

export type StepSelection = {
  trackId: TrackId;
  anchorStepIndex: number;
  selectedStepIndexes: number[];
};

export type SelectionDirection = "left" | "right" | "up" | "down";

type StepTarget = { trackId: TrackId; stepIndex: number };

/** Shift-click extends the selection to every note or trigger between the anchor and the target on the same track. */
export function clickStep(
  selection: StepSelection | null,
  song: SongDocument,
  { trackId, stepIndex, shiftKey }: StepTarget & { shiftKey: boolean },
): StepSelection {
  const track = song.tracks[trackId];
  const originStepIndex = resolveOriginStepIndex(track, stepIndex);

  if (shiftKey && selection?.trackId === trackId && isEnabledStep(track, originStepIndex)) {
    const firstStepIndex = Math.min(selection.anchorStepIndex, originStepIndex);
    const lastStepIndex = Math.max(selection.anchorStepIndex, originStepIndex);

    return {
      ...selection,
      selectedStepIndexes: track.steps.flatMap((step, index) =>
        step.enabled && firstStepIndex <= index && index <= lastStepIndex ? [index] : [],
      ),
    };
  }

  return { trackId, anchorStepIndex: originStepIndex, selectedStepIndexes: [originStepIndex] };
}

/** The selection a drag carries, or null when the step holds nothing to drag. */
export function grabStep(
  selection: StepSelection | null,
  song: SongDocument,
  { trackId, stepIndex }: StepTarget,
): StepSelection | null {
  const track = song.tracks[trackId];
  const originStepIndex = resolveOriginStepIndex(track, stepIndex);

  if (!isEnabledStep(track, originStepIndex)) {
    return null;
  }

  const selectedStepIndexes =
    selection?.trackId === trackId && selection.selectedStepIndexes.includes(originStepIndex)
      ? selection.selectedStepIndexes
      : [originStepIndex];

  return { trackId, anchorStepIndex: selectedStepIndexes[0] ?? originStepIndex, selectedStepIndexes };
}

export function moveSelection(
  selection: StepSelection,
  song: SongDocument,
  direction: SelectionDirection,
): StepSelection {
  if (direction === "left" || direction === "right") {
    const stepIndex = getAdjacentStepIndex(song.tracks[selection.trackId], selection.anchorStepIndex, direction);

    return { ...selection, anchorStepIndex: stepIndex, selectedStepIndexes: [stepIndex] };
  }

  const trackIndex = trackOrder.indexOf(selection.trackId) + (direction === "up" ? -1 : 1);

  if (trackIndex < 0 || trackIndex >= trackOrder.length) {
    return selection;
  }

  return {
    trackId: trackOrder[trackIndex],
    anchorStepIndex: selection.anchorStepIndex,
    selectedStepIndexes: [selection.anchorStepIndex],
  };
}

function resolveOriginStepIndex(track: Track, stepIndex: number) {
  if (track.kind === "pulse" || track.kind === "triangle") {
    const melodicState = getMelodicStepState(track, stepIndex);
    return melodicState.kind === "hold" ? melodicState.startIndex : stepIndex;
  }

  return stepIndex;
}

function isEnabledStep(track: Track, stepIndex: number) {
  return track.steps[stepIndex]?.enabled ?? false;
}

function getAdjacentStepIndex(track: Track, currentStepIndex: number, direction: "left" | "right") {
  const maxStepIndex = track.steps.length - 1;

  if (track.kind !== "pulse" && track.kind !== "triangle") {
    return direction === "left" ? Math.max(0, currentStepIndex - 1) : Math.min(maxStepIndex, currentStepIndex + 1);
  }

  if (direction === "left") {
    return resolveOriginStepIndex(track, Math.max(0, currentStepIndex - 1));
  }

  const melodicState = getMelodicStepState(track, currentStepIndex);
  const nextStepIndex =
    melodicState.kind === "start"
      ? currentStepIndex + melodicState.length
      : melodicState.kind === "hold"
        ? melodicState.startIndex + melodicState.length
        : currentStepIndex + 1;

  return resolveOriginStepIndex(track, Math.min(maxStepIndex, nextStepIndex));
}
