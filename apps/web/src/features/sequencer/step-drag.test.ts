import {
  applySongEdit,
  createEmptySongDocument,
  getMelodicArrangementEntries,
  type SongDocument,
  type SongEdit,
} from "ochoit-lib";
import { describe, expect, it } from "vitest";

import {
  finishDrag,
  startMoveDrag,
  startResizeDrag,
  updateDrag,
  type GridMetrics,
  type StepDrag,
} from "@/features/sequencer/step-drag";

const metrics: GridMetrics = { pointerStartX: 0, pointerStartY: 0, stepWidth: 24, stepHeight: 52, columns: 16 };

function songWith(...edits: SongEdit[]) {
  return edits.reduce((song, edit) => applySongEdit(song, edit).song, createEmptySongDocument());
}

const notes = songWith({
  type: "place-steps",
  trackId: "pulse1",
  steps: [
    { stepIndex: 2, note: "C4", length: 2 },
    { stepIndex: 6, note: "E4", length: 3 },
    { stepIndex: 12, note: "G4", length: 2 },
  ],
});

function noteSpans(song: SongDocument) {
  return getMelodicArrangementEntries(song.tracks.pulse1).map(({ stepIndex, length }) => ({ stepIndex, length }));
}

function resizeTo(
  stepIndex: number,
  edge: "left" | "right",
  pointer: { clientX: number; clientY?: number },
  gridMetrics = metrics,
) {
  const drag = startResizeDrag(notes, "pulse1", stepIndex, edge, gridMetrics);

  if (drag === null) {
    throw new Error("Expected a note to resize");
  }

  return updateDrag(drag, notes, { clientX: pointer.clientX, clientY: pointer.clientY ?? 0 });
}

function previewSpan(drag: StepDrag) {
  if (drag.mode !== "resize") {
    throw new Error("Expected a resize drag");
  }

  return { stepIndex: drag.previewStartStepIndex, length: drag.previewLength };
}

function commit(song: SongDocument, drag: StepDrag) {
  const finished = finishDrag(drag);

  return finished === null ? song : applySongEdit(song, finished.edit).song;
}

describe("step-drag", () => {
  it("previews a resize clamped by the neighbouring notes and the loop end", () => {
    expect(previewSpan(resizeTo(6, "right", { clientX: 200 }))).toEqual({ stepIndex: 6, length: 6 });
    expect(previewSpan(resizeTo(12, "right", { clientX: 200 }))).toEqual({ stepIndex: 12, length: 4 });
    expect(previewSpan(resizeTo(6, "left", { clientX: -150 }))).toEqual({ stepIndex: 4, length: 5 });
    expect(previewSpan(resizeTo(2, "left", { clientX: -150 }))).toEqual({ stepIndex: 0, length: 4 });
  });

  it("keeps at least one step when an edge is dragged past the other edge", () => {
    expect(previewSpan(resizeTo(6, "left", { clientX: 150 }))).toEqual({ stepIndex: 8, length: 1 });
    expect(previewSpan(resizeTo(6, "right", { clientX: -150 }))).toEqual({ stepIndex: 6, length: 1 });
  });

  it("rounds fractional pointer movement to the nearest step and wraps rows by column count", () => {
    expect(previewSpan(resizeTo(6, "right", { clientX: 35.9 }))).toEqual({ stepIndex: 6, length: 4 });
    expect(previewSpan(resizeTo(6, "right", { clientX: 36 }))).toEqual({ stepIndex: 6, length: 5 });
    expect(previewSpan(resizeTo(6, "left", { clientX: -36 }))).toEqual({ stepIndex: 5, length: 4 });
    expect(
      previewSpan(resizeTo(12, "left", { clientX: 0, clientY: -52 }, { ...metrics, columns: 8 })),
    ).toEqual({ stepIndex: 9, length: 5 });
  });

  it("commits exactly the resize it previews", () => {
    for (const stepIndex of [2, 6, 12]) {
      for (const edge of ["left", "right"] as const) {
        for (let clientX = -420; clientX <= 420; clientX += 13.7) {
          const drag = resizeTo(stepIndex, edge, { clientX });
          const expectedSpans = [
            ...noteSpans(notes).filter((span) => span.stepIndex !== stepIndex),
            previewSpan(drag),
          ].sort((left, right) => left.stepIndex - right.stepIndex);

          expect(noteSpans(commit(notes, drag)), `${edge} edge of step ${stepIndex} by ${clientX}px`).toEqual(
            expectedSpans,
          );
        }
      }
    }
  });

  it("only resizes melodic notes", () => {
    expect(startResizeDrag(notes, "pulse1", 7, "right", metrics)).toBeNull();
    expect(startResizeDrag(notes, "noise", 0, "right", metrics)).toBeNull();
  });

  it("waits for the pointer to travel before moving and then moves the whole selection", () => {
    const drag = startMoveDrag({ trackId: "pulse1", anchorStepIndex: 2, selectedStepIndexes: [2, 6] }, metrics);

    expect(updateDrag(drag, notes, { clientX: 5, clientY: 0 })).toBe(drag);
    expect(finishDrag(drag)).toBeNull();

    const moved = updateDrag(drag, notes, { clientX: 26, clientY: 0 });
    const finished = finishDrag(moved);

    expect(moved).toMatchObject({ delta: 1, isActive: true, isValid: true });
    expect(finished?.selection).toEqual({ trackId: "pulse1", anchorStepIndex: 3, selectedStepIndexes: [3, 7] });
    expect(noteSpans(commit(notes, moved))).toEqual([
      { stepIndex: 3, length: 2 },
      { stepIndex: 7, length: 3 },
      { stepIndex: 12, length: 2 },
    ]);
  });

  it("marks a move invalid and commits nothing when notes would collide or leave the loop", () => {
    const drag = startMoveDrag({ trackId: "pulse1", anchorStepIndex: 6, selectedStepIndexes: [6] }, metrics);
    const ontoNextNote = updateDrag(drag, notes, { clientX: 24 * 5, clientY: 0 });
    const pastLoopEnd = updateDrag(drag, notes, { clientX: 0, clientY: 52 });

    expect(ontoNextNote).toMatchObject({ delta: 5, isActive: true, isValid: false });
    expect(pastLoopEnd).toMatchObject({ delta: 16, isActive: true, isValid: false });
    expect(finishDrag(ontoNextNote)).toBeNull();
    expect(finishDrag(pastLoopEnd)).toBeNull();
  });

  it("returns the same drag while the pointer stays within one step", () => {
    const drag = updateDrag(
      startMoveDrag({ trackId: "pulse1", anchorStepIndex: 2, selectedStepIndexes: [2] }, metrics),
      notes,
      { clientX: 30, clientY: 0 },
    );

    expect(updateDrag(drag, notes, { clientX: 32, clientY: 3 })).toBe(drag);
  });
});
