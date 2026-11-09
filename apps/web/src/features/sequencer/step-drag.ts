import {
  applySongEdit,
  getMelodicStepState,
  getResizedMelodicNote,
  isMelodicTrackId,
  type MelodicTrackId,
  type SongDocument,
  type SongEdit,
  type TrackId,
} from "ochoit-lib";

import type { StepSelection } from "@/features/sequencer/step-selection";

/** Pointer origin and grid cell pitch measured when the drag starts. */
export type GridMetrics = {
  pointerStartX: number;
  pointerStartY: number;
  stepWidth: number;
  stepHeight: number;
  columns: number;
};

type MoveDrag = {
  mode: "move";
  trackId: TrackId;
  metrics: GridMetrics;
  initialSelectedStepIndexes: number[];
  delta: number;
  isActive: boolean;
  isValid: boolean;
};

type ResizeDrag = {
  mode: "resize";
  trackId: MelodicTrackId;
  originStepIndex: number;
  initialLength: number;
  edge: "left" | "right";
  metrics: GridMetrics;
  previewStartStepIndex: number;
  previewLength: number;
  isActive: boolean;
};

export type StepDrag = MoveDrag | ResizeDrag;

const dragActivationDistancePx = 8;

export function startMoveDrag(selection: StepSelection, metrics: GridMetrics): StepDrag {
  return {
    mode: "move",
    trackId: selection.trackId,
    metrics,
    initialSelectedStepIndexes: selection.selectedStepIndexes,
    delta: 0,
    isActive: false,
    isValid: false,
  };
}

/** Null unless a melodic note starts at `stepIndex`. */
export function startResizeDrag(
  song: SongDocument,
  trackId: TrackId,
  stepIndex: number,
  edge: "left" | "right",
  metrics: GridMetrics,
): StepDrag | null {
  if (!isMelodicTrackId(trackId)) {
    return null;
  }

  const stepState = getMelodicStepState(song.tracks[trackId], stepIndex);

  if (stepState.kind !== "start") {
    return null;
  }

  return {
    mode: "resize",
    trackId,
    originStepIndex: stepIndex,
    initialLength: stepState.length,
    edge,
    metrics,
    previewStartStepIndex: stepIndex,
    previewLength: stepState.length,
    isActive: false,
  };
}

/** Returns `drag` itself when the pointer has not changed the preview. */
export function updateDrag(
  drag: StepDrag,
  song: SongDocument,
  pointer: { clientX: number; clientY: number },
): StepDrag {
  const deltaX = pointer.clientX - drag.metrics.pointerStartX;
  const deltaY = pointer.clientY - drag.metrics.pointerStartY;
  const hasTravelled = Math.hypot(deltaX, deltaY) >= dragActivationDistancePx;

  if (!drag.isActive && !hasTravelled) {
    return drag;
  }

  const delta = getPointerStepDelta(deltaX, deltaY, drag.metrics);

  if (drag.mode === "move") {
    const isValid =
      delta !== 0 &&
      applySongEdit(song, {
        type: "move-steps",
        trackId: drag.trackId,
        stepIndexes: drag.initialSelectedStepIndexes,
        delta,
      }).status === "applied";

    return drag.isActive && drag.delta === delta && drag.isValid === isValid
      ? drag
      : { ...drag, delta, isActive: true, isValid };
  }

  const initialEndExclusive = drag.originStepIndex + drag.initialLength;
  const requestedStartStepIndex =
    drag.edge === "left" ? Math.min(drag.originStepIndex + delta, initialEndExclusive - 1) : drag.originStepIndex;
  const requestedEndExclusive = drag.edge === "left" ? initialEndExclusive : initialEndExclusive + delta;
  const preview = getResizedMelodicNote(
    song.tracks[drag.trackId],
    drag.originStepIndex,
    requestedStartStepIndex,
    requestedEndExclusive - requestedStartStepIndex,
  );

  if (
    preview === null ||
    (drag.isActive && drag.previewStartStepIndex === preview.stepIndex && drag.previewLength === preview.length)
  ) {
    return drag;
  }

  return { ...drag, previewStartStepIndex: preview.stepIndex, previewLength: preview.length, isActive: true };
}

/** The edit to commit and the selection that follows it, or null when the drag changes nothing. */
export function finishDrag(drag: StepDrag): { edit: SongEdit; selection: StepSelection } | null {
  if (!drag.isActive) {
    return null;
  }

  if (drag.mode === "move") {
    if (!drag.isValid || drag.delta === 0) {
      return null;
    }

    const selectedStepIndexes = drag.initialSelectedStepIndexes.map((stepIndex) => stepIndex + drag.delta);

    return {
      edit: { type: "move-steps", trackId: drag.trackId, stepIndexes: drag.initialSelectedStepIndexes, delta: drag.delta },
      selection: { trackId: drag.trackId, anchorStepIndex: selectedStepIndexes[0], selectedStepIndexes },
    };
  }

  if (drag.previewStartStepIndex === drag.originStepIndex && drag.previewLength === drag.initialLength) {
    return null;
  }

  return {
    edit: {
      type: "resize-note",
      trackId: drag.trackId,
      stepIndex: drag.originStepIndex,
      startStepIndex: drag.previewStartStepIndex,
      length: drag.previewLength,
    },
    selection: {
      trackId: drag.trackId,
      anchorStepIndex: drag.previewStartStepIndex,
      selectedStepIndexes: [drag.previewStartStepIndex],
    },
  };
}

function getPointerStepDelta(deltaX: number, deltaY: number, metrics: GridMetrics) {
  const deltaColumns = Math.round(deltaX / metrics.stepWidth);
  const deltaRows = Math.round(deltaY / metrics.stepHeight);

  return deltaRows * metrics.columns + deltaColumns;
}
